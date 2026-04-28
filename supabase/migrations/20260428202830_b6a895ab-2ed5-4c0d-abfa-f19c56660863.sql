-- Remove duplicates if any exist (keep newest)
DELETE FROM public.daily_activity a
USING public.daily_activity b
WHERE a.user_id = b.user_id
  AND a.recorded_for = b.recorded_for
  AND a.created_at < b.created_at;

ALTER TABLE public.daily_activity
  ADD CONSTRAINT daily_activity_user_date_unique UNIQUE (user_id, recorded_for);