-- Add nutrition fields to weight_entries
ALTER TABLE public.weight_entries
  ADD COLUMN IF NOT EXISTS calories_burned numeric,
  ADD COLUMN IF NOT EXISTS calories_consumed numeric,
  ADD COLUMN IF NOT EXISTS water_liters numeric;

-- Goals table
CREATE TABLE IF NOT EXISTS public.weight_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  start_weight_kg numeric NOT NULL,
  height_cm numeric NOT NULL,
  target_weight_kg numeric NOT NULL,
  target_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weight_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own weight goals"
  ON public.weight_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own weight goals"
  ON public.weight_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own weight goals"
  ON public.weight_goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own weight goals"
  ON public.weight_goals FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_weight_goals_updated_at
  BEFORE UPDATE ON public.weight_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_weight_goals_user_active
  ON public.weight_goals(user_id, active);