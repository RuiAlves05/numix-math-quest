-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  total_points INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create questions table
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  options TEXT[] NOT NULL,
  difficulty_level INTEGER NOT NULL CHECK (difficulty_level BETWEEN 1 AND 4),
  category TEXT NOT NULL,
  points INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on questions
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Questions policies (everyone can read questions)
CREATE POLICY "Anyone can view questions"
  ON public.questions FOR SELECT
  TO authenticated
  USING (true);

-- Create user_progress table
CREATE TABLE public.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_level INTEGER DEFAULT 1,
  questions_completed INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  last_activity_date DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on user_progress
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- User progress policies
CREATE POLICY "Users can view their own progress"
  ON public.user_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress"
  ON public.user_progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress"
  ON public.user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create user_answers table
CREATE TABLE public.user_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  points_earned INTEGER DEFAULT 0,
  answered_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on user_answers
ALTER TABLE public.user_answers ENABLE ROW LEVEL SECURITY;

-- User answers policies
CREATE POLICY "Users can view their own answers"
  ON public.user_answers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own answers"
  ON public.user_answers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username, level, total_points, streak_days)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    1,
    0,
    0
  );
  
  INSERT INTO public.user_progress (user_id, current_level, questions_completed, current_streak)
  VALUES (NEW.id, 1, 0, 0);
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at
  BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample questions for levels 1-4
INSERT INTO public.questions (question_text, correct_answer, options, difficulty_level, category, points) VALUES
-- Nível 1 (1º ano - 6-7 anos)
('Quanto é 2 + 3?', '5', ARRAY['3', '4', '5', '6'], 1, 'Adição', 10),
('Quanto é 5 - 2?', '3', ARRAY['2', '3', '4', '5'], 1, 'Subtração', 10),
('Quantos dedos tens nas duas mãos?', '10', ARRAY['8', '9', '10', '11'], 1, 'Contagem', 10),
('Quanto é 1 + 1?', '2', ARRAY['1', '2', '3', '4'], 1, 'Adição', 10),
('Quanto é 4 - 1?', '3', ARRAY['2', '3', '4', '5'], 1, 'Subtração', 10),

-- Nível 2 (2º ano - 7-8 anos)
('Quanto é 12 + 8?', '20', ARRAY['18', '19', '20', '21'], 2, 'Adição', 15),
('Quanto é 15 - 7?', '8', ARRAY['6', '7', '8', '9'], 2, 'Subtração', 15),
('Quanto é 3 × 2?', '6', ARRAY['4', '5', '6', '7'], 2, 'Multiplicação', 15),
('Quantas patas têm 3 gatos?', '12', ARRAY['9', '10', '11', '12'], 2, 'Multiplicação', 15),
('Quanto é 20 - 12?', '8', ARRAY['6', '7', '8', '9'], 2, 'Subtração', 15),

-- Nível 3 (3º ano - 8-9 anos)
('Quanto é 25 + 37?', '62', ARRAY['60', '61', '62', '63'], 3, 'Adição', 20),
('Quanto é 5 × 8?', '40', ARRAY['35', '38', '40', '45'], 3, 'Multiplicação', 20),
('Quanto é 100 - 45?', '55', ARRAY['50', '52', '55', '58'], 3, 'Subtração', 20),
('Quanto é 36 ÷ 6?', '6', ARRAY['4', '5', '6', '7'], 3, 'Divisão', 20),
('Quanto é 7 × 7?', '49', ARRAY['42', '45', '49', '54'], 3, 'Multiplicação', 20),

-- Nível 4 (4º ano - 9-10 anos)
('Quanto é 234 + 567?', '801', ARRAY['791', '801', '811', '821'], 4, 'Adição', 25),
('Quanto é 12 × 15?', '180', ARRAY['165', '170', '175', '180'], 4, 'Multiplicação', 25),
('Quanto é 144 ÷ 12?', '12', ARRAY['10', '11', '12', '13'], 4, 'Divisão', 25),
('Quanto é 500 - 237?', '263', ARRAY['253', '258', '263', '268'], 4, 'Subtração', 25),
('Quanto é 25 × 4?', '100', ARRAY['90', '95', '100', '105'], 4, 'Multiplicação', 25);