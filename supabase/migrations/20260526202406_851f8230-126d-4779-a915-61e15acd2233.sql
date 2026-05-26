
CREATE TABLE public.quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level BETWEEN 1 AND 4),
  max_level integer NOT NULL CHECK (max_level BETWEEN 1 AND 4),
  starting_streak integer NOT NULL DEFAULT 0,
  base_points integer NOT NULL DEFAULT 40,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_quiz_sessions_user ON public.quiz_sessions(user_id, status);

GRANT SELECT ON public.quiz_sessions TO authenticated;
GRANT ALL ON public.quiz_sessions TO service_role;

ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qs_select_own" ON public.quiz_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.quiz_session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_answer text NOT NULL,
  is_correct boolean NOT NULL,
  base_points integer NOT NULL,
  multiplier numeric NOT NULL,
  points_earned integer NOT NULL,
  running_streak integer NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qsa_session ON public.quiz_session_answers(session_id, answered_at);

GRANT SELECT ON public.quiz_session_answers TO authenticated;
GRANT ALL ON public.quiz_session_answers TO service_role;

ALTER TABLE public.quiz_session_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qsa_select_own" ON public.quiz_session_answers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quiz_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.start_quiz_session(_level integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _progress record;
  _max_level integer;
  _unlocked_level integer;
  _starting_streak integer;
  _base_points integer;
  _session_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _progress FROM public.user_progress WHERE user_id = _uid;

  IF NOT FOUND THEN
    _unlocked_level := 1;
  ELSE
    _unlocked_level := LEAST(
      FLOOR(COALESCE(_progress.questions_completed, 0) / 10)::integer + 1,
      4
    );
    _unlocked_level := GREATEST(_unlocked_level, COALESCE(_progress.current_level, 1));
  END IF;

  _max_level := _unlocked_level;

  IF _level < 1 OR _level > 4 THEN
    RAISE EXCEPTION 'Invalid level';
  END IF;
  IF _level > _max_level THEN
    RAISE EXCEPTION 'Level not unlocked';
  END IF;

  _base_points := 40 - (_max_level - _level) * 10;

  SELECT COALESCE(current_streak, 0) INTO _starting_streak
  FROM public.user_level_stats
  WHERE user_id = _uid AND level = _level;

  IF NOT FOUND THEN
    _starting_streak := 0;
  END IF;

  INSERT INTO public.quiz_sessions (user_id, level, max_level, starting_streak, base_points)
  VALUES (_uid, _level, _max_level, _starting_streak, _base_points)
  RETURNING id INTO _session_id;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'base_points', _base_points,
    'starting_streak', _starting_streak,
    'max_level', _max_level
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_session_answer(
  _session_id uuid,
  _question_id uuid,
  _user_answer text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _session record;
  _q record;
  _is_correct boolean;
  _last_streak integer;
  _running_streak integer;
  _multiplier numeric;
  _points_earned integer;
  _best_streak integer;
  _topic text;
  _error_type text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _session FROM public.quiz_sessions
  WHERE id = _session_id AND user_id = _uid AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found or already completed'; END IF;

  SELECT * INTO _q FROM public.questions WHERE id = _question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;

  IF _q.difficulty_level <> _session.level THEN
    RAISE EXCEPTION 'Question does not belong to session level';
  END IF;

  _is_correct := (_user_answer = _q.correct_answer);

  SELECT COALESCE(running_streak, _session.starting_streak) INTO _last_streak
  FROM public.quiz_session_answers
  WHERE session_id = _session_id
  ORDER BY answered_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    _last_streak := _session.starting_streak;
  END IF;

  IF _is_correct THEN
    _running_streak := _last_streak + 1;
  ELSE
    _running_streak := 0;
  END IF;

  _multiplier := CASE
    WHEN _running_streak >= 20 THEN 2.0
    WHEN _running_streak >= 15 THEN 1.8
    WHEN _running_streak >= 10 THEN 1.5
    WHEN _running_streak >= 5  THEN 1.3
    ELSE 1.0
  END;

  IF _is_correct THEN
    _points_earned := ROUND(_session.base_points * _multiplier)::integer;
  ELSE
    _points_earned := 0;
    _multiplier := 1.0;
  END IF;

  INSERT INTO public.quiz_session_answers (
    session_id, question_id, user_answer, is_correct,
    base_points, multiplier, points_earned, running_streak
  ) VALUES (
    _session_id, _question_id, _user_answer, _is_correct,
    _session.base_points, _multiplier, _points_earned, _running_streak
  );

  INSERT INTO public.user_answers (
    user_id, question_id, user_answer, is_correct, points_earned,
    level, base_points, multiplier, streak_after_answer
  ) VALUES (
    _uid, _question_id, _user_answer, _is_correct, _points_earned,
    _q.difficulty_level, _session.base_points, _multiplier, _running_streak
  );

  IF NOT _is_correct THEN
    _topic := COALESCE(NULLIF(_q.topic, ''), _q.category);
    _error_type := CASE
      WHEN _topic ILIKE '%cont%' OR _topic ILIKE '%count%' THEN 'counting'
      WHEN _topic ILIKE '%adi%' OR _topic ILIKE '%soma%' OR _topic ILIKE '%add%' THEN 'addition'
      WHEN _topic ILIKE '%subt%' OR _topic ILIKE '%menos%' THEN 'subtraction'
      WHEN _topic ILIKE '%multip%' OR _topic ILIKE '%tabuada%' THEN 'multiplication'
      WHEN _topic ILIKE '%divis%' THEN 'division'
      WHEN _topic ILIKE '%fra%' OR _topic ILIKE '%fract%' THEN 'fractions'
      WHEN _topic ILIKE '%geo%' OR _topic ILIKE '%forma%' OR _topic ILIKE '%per%metro%' OR _topic ILIKE '%area%' THEN 'geometry'
      WHEN _topic ILIKE '%medid%' OR _topic ILIKE '%conver%' THEN 'measurement'
      WHEN _topic ILIKE '%problem%' THEN 'word_problem'
      WHEN _topic ILIKE '%tempo%' OR _topic ILIKE '%hora%' OR _topic ILIKE '%calend%' THEN 'time'
      WHEN _topic ILIKE '%dinheiro%' OR _topic ILIKE '%money%' THEN 'money'
      WHEN _topic ILIKE '%padr%' OR _topic ILIKE '%sequ%' THEN 'patterns'
      WHEN _topic ILIKE '%decim%' THEN 'decimals'
      WHEN _topic ILIKE '%compar%' THEN 'comparison'
      ELSE COALESCE(_topic, 'general')
    END;
    PERFORM public.upsert_tutor_error_memory(
      _uid, _error_type, _q.difficulty_level,
      COALESCE(NULLIF(_q.topic, ''), _q.category), _q.category
    );
  END IF;

  SELECT COALESCE(best_streak, 0) INTO _best_streak
  FROM public.user_level_stats
  WHERE user_id = _uid AND level = _session.level;

  _best_streak := GREATEST(
    COALESCE(_best_streak, 0),
    (SELECT COALESCE(MAX(running_streak), 0) FROM public.quiz_session_answers WHERE session_id = _session_id)
  );

  RETURN jsonb_build_object(
    'correct', _is_correct,
    'correct_answer', _q.correct_answer,
    'explanation', _q.explanation,
    'points_earned', _points_earned,
    'base_points', _session.base_points,
    'multiplier', _multiplier,
    'current_streak', _running_streak,
    'best_streak', _best_streak,
    'level', _q.difficulty_level,
    'topic', COALESCE(NULLIF(_q.topic, ''), _q.category)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_quiz_session(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _session record;
  _total_points integer;
  _correct_count integer;
  _total_count integer;
  _final_streak integer;
  _best_streak_in_session integer;
  _current_db_best integer;
  _new_best_streak integer;
  _derived_level integer;
  _new_level_unlocked boolean := false;
  _old_completed integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _session FROM public.quiz_sessions
  WHERE id = _session_id AND user_id = _uid AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found or already completed'; END IF;

  SELECT
    COALESCE(SUM(points_earned), 0),
    COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END), 0),
    COUNT(*)::integer,
    COALESCE((SELECT running_streak FROM public.quiz_session_answers
               WHERE session_id = _session_id
               ORDER BY answered_at DESC LIMIT 1), 0),
    COALESCE(MAX(running_streak), 0)
  INTO _total_points, _correct_count, _total_count, _final_streak, _best_streak_in_session
  FROM public.quiz_session_answers
  WHERE session_id = _session_id;

  UPDATE public.quiz_sessions
  SET status = 'completed', completed_at = now()
  WHERE id = _session_id;

  IF _total_count = 0 THEN
    RETURN jsonb_build_object(
      'total_points_earned', 0,
      'correct_answers', 0,
      'total_answers', 0,
      'final_streak', 0,
      'new_level_unlocked', false
    );
  END IF;

  INSERT INTO public.user_level_stats (user_id, level)
  VALUES (_uid, _session.level)
  ON CONFLICT (user_id, level) DO NOTHING;

  SELECT COALESCE(best_streak, 0) INTO _current_db_best
  FROM public.user_level_stats
  WHERE user_id = _uid AND level = _session.level;

  _new_best_streak := GREATEST(_current_db_best, _best_streak_in_session);

  UPDATE public.user_level_stats
  SET
    points         = points + _total_points,
    correct_answers = correct_answers + _correct_count,
    total_answers  = total_answers + _total_count,
    current_streak = _final_streak,
    best_streak    = _new_best_streak,
    updated_at     = now()
  WHERE user_id = _uid AND level = _session.level;

  UPDATE public.profiles
  SET
    total_points = COALESCE(total_points, 0) + _total_points,
    level        = GREATEST(COALESCE(level, 1), _session.level),
    updated_at   = now()
  WHERE user_id = _uid;

  SELECT COALESCE(questions_completed, 0) INTO _old_completed
  FROM public.user_progress WHERE user_id = _uid;

  UPDATE public.user_progress
  SET
    questions_completed = COALESCE(questions_completed, 0) + _correct_count,
    last_activity_date  = CURRENT_DATE,
    updated_at          = now()
  WHERE user_id = _uid;

  _derived_level := LEAST(
    FLOOR((_old_completed + _correct_count) / 10)::integer + 1,
    4
  );
  IF _derived_level > LEAST(FLOOR(_old_completed / 10)::integer + 1, 4) THEN
    _new_level_unlocked := true;
    UPDATE public.user_progress
    SET current_level = GREATEST(COALESCE(current_level, 1), _derived_level)
    WHERE user_id = _uid;
    UPDATE public.profiles
    SET level = GREATEST(COALESCE(level, 1), _derived_level)
    WHERE user_id = _uid;
  END IF;

  RETURN jsonb_build_object(
    'total_points_earned', _total_points,
    'correct_answers', _correct_count,
    'total_answers', _total_count,
    'final_streak', _final_streak,
    'new_level_unlocked', _new_level_unlocked
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_quiz_session(integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.start_quiz_session(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_session_answer(uuid, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_session_answer(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_quiz_session(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.complete_quiz_session(uuid) TO authenticated;
