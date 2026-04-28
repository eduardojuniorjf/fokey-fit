-- Daily activity (one row per user per day)
CREATE TABLE IF NOT EXISTS public.daily_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recorded_for date NOT NULL DEFAULT CURRENT_DATE,
  steps integer NOT NULL DEFAULT 0,
  cardio_points integer NOT NULL DEFAULT 0,
  energy_kcal numeric NOT NULL DEFAULT 0,
  distance_km numeric NOT NULL DEFAULT 0,
  active_minutes integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recorded_for)
);

ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own daily activity"
  ON public.daily_activity FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own daily activity"
  ON public.daily_activity FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own daily activity"
  ON public.daily_activity FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own daily activity"
  ON public.daily_activity FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_daily_activity_updated_at
  BEFORE UPDATE ON public.daily_activity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_daily_activity_user_date
  ON public.daily_activity(user_id, recorded_for DESC);

-- Activity goals (one active row per user)
CREATE TABLE IF NOT EXISTS public.activity_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  daily_steps integer NOT NULL DEFAULT 8000,
  daily_cardio_points integer NOT NULL DEFAULT 7,
  daily_energy_kcal integer NOT NULL DEFAULT 500,
  daily_active_minutes integer NOT NULL DEFAULT 30,
  weekly_cardio_points integer NOT NULL DEFAULT 150,
  weekly_steps integer NOT NULL DEFAULT 56000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own activity goals"
  ON public.activity_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own activity goals"
  ON public.activity_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own activity goals"
  ON public.activity_goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own activity goals"
  ON public.activity_goals FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_activity_goals_updated_at
  BEFORE UPDATE ON public.activity_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();