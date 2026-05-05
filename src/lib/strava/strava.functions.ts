import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildAuthUrl, fetchActivities, refreshAccessToken } from "./strava.server";

function getOrigin(): string {
  const req = getRequest();
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export const startStravaOAuth = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const state = crypto.randomUUID();
    const { error } = await supabaseAdmin
      .from("oauth_states")
      .insert({ state, user_id: userId, provider: "strava" });
    if (error) throw new Error(`Falha ao criar state: ${error.message}`);
    return { url: buildAuthUrl({ origin: getOrigin(), state }) };
  });

export const getStravaStatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("integrations")
      .select("provider, last_synced_at, created_at")
      .eq("provider", "strava")
      .maybeSingle();
    return {
      connected: !!data,
      lastSyncedAt: data?.last_synced_at ?? null,
      connectedAt: data?.created_at ?? null,
    };
  });

export const disconnectStrava = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("integrations").delete().eq("provider", "strava");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ACTIVITY_TYPE_MAP: Record<string, string> = {
  Run: "running",
  TrailRun: "running",
  VirtualRun: "running",
  Ride: "cycling",
  VirtualRide: "cycling",
  EBikeRide: "cycling",
  Swim: "swimming",
  Walk: "walking",
  Hike: "hiking",
  Workout: "workout",
  WeightTraining: "strength",
  Yoga: "yoga",
};

export const syncStrava = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: integ, error: integErr } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "strava")
      .maybeSingle();
    if (integErr) throw new Error(integErr.message);
    if (!integ) throw new Error("Strava não está conectado");

    // Refresh if expired
    let accessToken = integ.access_token;
    const expiresAt = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
    if (Date.now() > expiresAt - 60_000) {
      if (!integ.refresh_token) throw new Error("Refresh token ausente — reconecte o Strava");
      const refreshed = await refreshAccessToken(integ.refresh_token);
      accessToken = refreshed.access_token;
      await supabaseAdmin
        .from("integrations")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
        })
        .eq("id", integ.id);
    }

    // Sync last 30 days
    const afterUnix = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const activities = await fetchActivities({ accessToken, afterUnix, perPage: 100 });

    let count = 0;
    for (const a of activities) {
      const { error } = await supabaseAdmin
        .from("cardio_activities")
        .upsert(
          {
            user_id: userId,
            activity_type: ACTIVITY_TYPE_MAP[a.sport_type] ?? ACTIVITY_TYPE_MAP[a.type] ?? "other",
            performed_at: a.start_date,
            duration_minutes: Number((a.moving_time / 60).toFixed(2)),
            distance_km: a.distance ? Number((a.distance / 1000).toFixed(2)) : null,
            calories: a.calories ? Math.round(a.calories) : null,
            avg_heart_rate: a.average_heartrate ? Math.round(a.average_heartrate) : null,
            source: "strava",
            external_id: String(a.id),
            notes: a.name,
          },
          { onConflict: "user_id,source,external_id" }
        );
      if (!error) count++;
    }

    await supabaseAdmin
      .from("integrations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", integ.id);

    return { activityCount: count };
  });
