-- Fix profiles: restrict public read access
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Add owner-scoped SELECT policy on oauth_states
CREATE POLICY "Users can view their own oauth states"
ON public.oauth_states FOR SELECT
TO authenticated
USING (auth.uid() = user_id);