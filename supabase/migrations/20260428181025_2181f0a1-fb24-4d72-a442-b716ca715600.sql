-- =====================================================
-- WEIGHT ENTRIES (registros de peso)
-- =====================================================
CREATE TABLE public.weight_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  weight_kg NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_weight_entries_user_date ON public.weight_entries(user_id, recorded_at DESC);

ALTER TABLE public.weight_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own weight entries"
  ON public.weight_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own weight entries"
  ON public.weight_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own weight entries"
  ON public.weight_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own weight entries"
  ON public.weight_entries FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_weight_entries_updated_at
  BEFORE UPDATE ON public.weight_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- BODY MEASUREMENTS (medidas corporais)
-- =====================================================
CREATE TABLE public.body_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  waist_cm NUMERIC(5,2),
  hip_cm NUMERIC(5,2),
  chest_cm NUMERIC(5,2),
  arm_cm NUMERIC(5,2),
  thigh_cm NUMERIC(5,2),
  body_fat_pct NUMERIC(4,2) CHECK (body_fat_pct IS NULL OR (body_fat_pct >= 0 AND body_fat_pct <= 100)),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_body_measurements_user_date ON public.body_measurements(user_id, recorded_at DESC);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own body measurements"
  ON public.body_measurements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own body measurements"
  ON public.body_measurements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own body measurements"
  ON public.body_measurements FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own body measurements"
  ON public.body_measurements FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_body_measurements_updated_at
  BEFORE UPDATE ON public.body_measurements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- CARDIO ACTIVITIES (corrida e cardio)
-- =====================================================
CREATE TABLE public.cardio_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'running',
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes NUMERIC(6,2) NOT NULL CHECK (duration_minutes > 0),
  distance_km NUMERIC(6,2) CHECK (distance_km IS NULL OR distance_km >= 0),
  calories INTEGER CHECK (calories IS NULL OR calories >= 0),
  avg_heart_rate INTEGER CHECK (avg_heart_rate IS NULL OR (avg_heart_rate > 0 AND avg_heart_rate < 250)),
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cardio_activities_user_date ON public.cardio_activities(user_id, performed_at DESC);
CREATE UNIQUE INDEX idx_cardio_activities_external ON public.cardio_activities(user_id, source, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.cardio_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cardio activities"
  ON public.cardio_activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own cardio activities"
  ON public.cardio_activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cardio activities"
  ON public.cardio_activities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cardio activities"
  ON public.cardio_activities FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_cardio_activities_updated_at
  BEFORE UPDATE ON public.cardio_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- HABITS (definição de hábitos)
-- =====================================================
CREATE TABLE public.habits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'check',
  color TEXT NOT NULL DEFAULT 'primary',
  daily_target NUMERIC(8,2) NOT NULL DEFAULT 1,
  unit TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_habits_user ON public.habits(user_id, active);

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own habits"
  ON public.habits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own habits"
  ON public.habits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own habits"
  ON public.habits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own habits"
  ON public.habits FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_habits_updated_at
  BEFORE UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- HABIT LOGS (registros diários de hábitos)
-- =====================================================
CREATE TABLE public.habit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  habit_id UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  logged_for DATE NOT NULL DEFAULT CURRENT_DATE,
  value NUMERIC(8,2) NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (habit_id, logged_for)
);

CREATE INDEX idx_habit_logs_user_date ON public.habit_logs(user_id, logged_for DESC);

ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own habit logs"
  ON public.habit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own habit logs"
  ON public.habit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own habit logs"
  ON public.habit_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own habit logs"
  ON public.habit_logs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_habit_logs_updated_at
  BEFORE UPDATE ON public.habit_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();