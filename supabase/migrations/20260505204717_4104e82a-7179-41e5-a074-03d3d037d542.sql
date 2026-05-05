CREATE UNIQUE INDEX IF NOT EXISTS cardio_activities_user_source_external_idx
  ON public.cardio_activities (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS integrations_user_provider_idx
  ON public.integrations (user_id, provider);