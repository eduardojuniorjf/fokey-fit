CREATE TABLE public.dashboard_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  mobile_hidden TEXT[] NOT NULL DEFAULT '{}',
  desktop_hidden TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dashboard prefs"
ON public.dashboard_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own dashboard prefs"
ON public.dashboard_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own dashboard prefs"
ON public.dashboard_preferences FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own dashboard prefs"
ON public.dashboard_preferences FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_dashboard_preferences_updated_at
BEFORE UPDATE ON public.dashboard_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();