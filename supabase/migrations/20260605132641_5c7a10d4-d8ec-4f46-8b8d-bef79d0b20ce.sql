ALTER TABLE public.cardio_activities
  ADD COLUMN IF NOT EXISTS cardio_points integer CHECK (cardio_points IS NULL OR cardio_points >= 0);