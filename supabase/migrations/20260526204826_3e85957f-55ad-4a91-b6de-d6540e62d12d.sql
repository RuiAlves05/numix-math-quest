ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0;

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
  _coins_earned integer;
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
      'new_level_unlocked', false,
      'coins_earned', 0
    );
  END IF;

  -- Calcular moedas: 1 moeda por cada 10 pontos
  _coins_earned := FLOOR(_total_points / 10);

  INSERT INTO public.user_level_stats (user_id, level)
  VALUES (_uid, _session.level)
  ON CONFLICT (user_id, level) DO NOTHING;

  SELECT COALESCE(best_streak, 0) INTO _current_db_best
  FROM public.user_level_stats
  WHERE user_id = _uid AND level = _session.level;

  _new_best_streak := GREATEST(_current_db_best, _best_streak_in_session);

  UPDATE public.user_level_stats
  SET
    points          = points + _total_points,
    correct_answers = correct_answers + _correct_count,
    total_answers   = total_answers + _total_count,
    current_streak  = _final_streak,
    best_streak     = _new_best_streak,
    updated_at      = now()
  WHERE user_id = _uid AND level = _session.level;

  -- Atualizar profiles: pontos, nível e moedas
  UPDATE public.profiles
  SET
    total_points = COALESCE(total_points, 0) + _total_points,
    level        = GREATEST(COALESCE(level, 1), _session.level),
    coins        = COALESCE(coins, 0) + _coins_earned,
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
    'new_level_unlocked', _new_level_unlocked,
    'coins_earned', _coins_earned
  );
END;
$$;