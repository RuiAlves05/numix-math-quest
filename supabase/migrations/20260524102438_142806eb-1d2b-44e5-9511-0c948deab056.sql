-- Migration: questions schema upgrade + random quiz RPC

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS school_year integer,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS difficulty text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS explanation text;

UPDATE public.questions SET school_year = difficulty_level WHERE school_year IS NULL;
UPDATE public.questions SET topic = category WHERE topic IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_level_active ON public.questions(difficulty_level, is_active);

CREATE OR REPLACE FUNCTION public.get_random_quiz_questions(_level integer)
RETURNS TABLE(
  id uuid,
  question_text text,
  options text[],
  difficulty_level integer,
  school_year integer,
  topic text,
  difficulty text,
  category text,
  points integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _limit := CASE WHEN _level = 1 THEN 5 ELSE 10 END;
  RETURN QUERY
  SELECT q.id, q.question_text, q.options, q.difficulty_level, q.school_year,
         q.topic, q.difficulty, q.category, q.points
  FROM public.questions q
  WHERE q.difficulty_level = _level
    AND q.is_active = true
  ORDER BY random()
  LIMIT _limit;
END $$;