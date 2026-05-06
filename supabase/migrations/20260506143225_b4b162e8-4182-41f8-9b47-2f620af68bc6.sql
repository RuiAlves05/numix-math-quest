
-- 1. PROFILES additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS show_on_leaderboard boolean NOT NULL DEFAULT true;

-- Public can read minimal info of opted-in profiles for leaderboard
DROP POLICY IF EXISTS "Public leaderboard profiles are viewable" ON public.profiles;
CREATE POLICY "Public leaderboard profiles are viewable"
ON public.profiles FOR SELECT
TO authenticated
USING (show_on_leaderboard = true);

-- 2. USER_ANSWERS audit fields
ALTER TABLE public.user_answers
  ADD COLUMN IF NOT EXISTS level integer,
  ADD COLUMN IF NOT EXISTS base_points integer,
  ADD COLUMN IF NOT EXISTS multiplier numeric,
  ADD COLUMN IF NOT EXISTS streak_after_answer integer;

-- 3. USER_LEVEL_STATS table
CREATE TABLE IF NOT EXISTS public.user_level_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  level integer NOT NULL,
  points integer NOT NULL DEFAULT 0,
  correct_answers integer NOT NULL DEFAULT 0,
  total_answers integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, level)
);

ALTER TABLE public.user_level_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own level stats" ON public.user_level_stats;
CREATE POLICY "Users can view own level stats"
ON public.user_level_stats FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public level stats viewable for opted-in users" ON public.user_level_stats;
CREATE POLICY "Public level stats viewable for opted-in users"
ON public.user_level_stats FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id = user_level_stats.user_id AND p.show_on_leaderboard = true
));

-- updated_at trigger
DROP TRIGGER IF EXISTS update_user_level_stats_updated_at ON public.user_level_stats;
CREATE TRIGGER update_user_level_stats_updated_at
BEFORE UPDATE ON public.user_level_stats
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. submit_answer secure function
CREATE OR REPLACE FUNCTION public.submit_answer(_question_id uuid, _user_answer text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _q record;
  _is_correct boolean;
  _stats record;
  _new_streak integer;
  _multiplier numeric;
  _base_points integer;
  _points_earned integer;
  _best_streak integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _q FROM public.questions WHERE id = _question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;

  _is_correct := (_user_answer = _q.correct_answer);
  _base_points := COALESCE(_q.points, 10);

  -- Get or create level stats row
  INSERT INTO public.user_level_stats (user_id, level)
  VALUES (_uid, _q.difficulty_level)
  ON CONFLICT (user_id, level) DO NOTHING;

  SELECT * INTO _stats FROM public.user_level_stats
  WHERE user_id = _uid AND level = _q.difficulty_level;

  IF _is_correct THEN
    _new_streak := _stats.current_streak + 1;
  ELSE
    _new_streak := 0;
  END IF;

  -- Multiplier based on streak AFTER this answer
  _multiplier := CASE
    WHEN _new_streak >= 20 THEN 2.0
    WHEN _new_streak >= 15 THEN 1.8
    WHEN _new_streak >= 10 THEN 1.5
    WHEN _new_streak >= 5  THEN 1.3
    ELSE 1.0
  END;

  IF _is_correct THEN
    _points_earned := ROUND(_base_points * _multiplier)::int;
  ELSE
    _points_earned := 0;
    _multiplier := 1.0;
  END IF;

  _best_streak := GREATEST(_stats.best_streak, _new_streak);

  UPDATE public.user_level_stats
  SET points = points + _points_earned,
      correct_answers = correct_answers + (CASE WHEN _is_correct THEN 1 ELSE 0 END),
      total_answers = total_answers + 1,
      current_streak = _new_streak,
      best_streak = _best_streak,
      updated_at = now()
  WHERE user_id = _uid AND level = _q.difficulty_level;

  -- Update aggregate profile points + level + activity
  UPDATE public.profiles
  SET total_points = COALESCE(total_points,0) + _points_earned,
      level = GREATEST(COALESCE(level,1), _q.difficulty_level),
      updated_at = now()
  WHERE user_id = _uid;

  -- Mirror to user_progress (keep existing dashboard working)
  UPDATE public.user_progress
  SET questions_completed = COALESCE(questions_completed,0) + (CASE WHEN _is_correct THEN 1 ELSE 0 END),
      current_level = GREATEST(COALESCE(current_level,1), _q.difficulty_level),
      last_activity_date = CURRENT_DATE,
      updated_at = now()
  WHERE user_id = _uid;

  INSERT INTO public.user_answers (
    user_id, question_id, user_answer, is_correct, points_earned,
    level, base_points, multiplier, streak_after_answer
  ) VALUES (
    _uid, _question_id, _user_answer, _is_correct, _points_earned,
    _q.difficulty_level, _base_points, _multiplier, _new_streak
  );

  RETURN jsonb_build_object(
    'correct', _is_correct,
    'correct_answer', _q.correct_answer,
    'points_earned', _points_earned,
    'base_points', _base_points,
    'multiplier', _multiplier,
    'current_streak', _new_streak,
    'best_streak', _best_streak,
    'level', _q.difficulty_level,
    'total_level_points', _stats.points + _points_earned
  );
END;
$$;

-- 5. get_leaderboard function
CREATE OR REPLACE FUNCTION public.get_leaderboard(_level integer, _limit integer DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  points integer,
  best_streak integer,
  correct_answers integer,
  total_answers integer,
  rank bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      s.user_id,
      COALESCE(NULLIF(p.display_name,''), p.username, 'Utilizador') AS display_name,
      p.avatar_url,
      s.points,
      s.best_streak,
      s.correct_answers,
      s.total_answers,
      RANK() OVER (
        ORDER BY s.points DESC, s.best_streak DESC,
        CASE WHEN s.total_answers > 0 THEN s.correct_answers::numeric / s.total_answers ELSE 0 END DESC
      ) AS rank
    FROM public.user_level_stats s
    JOIN public.profiles p ON p.user_id = s.user_id
    WHERE s.level = _level
      AND p.show_on_leaderboard = true
  )
  (SELECT * FROM ranked WHERE rank <= _limit)
  UNION
  (SELECT * FROM ranked WHERE user_id = auth.uid())
  ORDER BY rank;
$$;
