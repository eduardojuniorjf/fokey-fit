import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildAuthUrl,
  fetchDailySummaries,
  fetchWeightSamples,
  refreshAccessToken,
} from "./google-fit.server";

function getOrigin(): string {
  const req = getRequest();
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

/** Start OAuth: returns the Google consent URL for the current user. */
export const startGoogleFitOAuth = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const origin = getOrigin();

    const state = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("oauth_states").insert({
      state,
      user_id: userId,
      provider: "google_fit",
    });
    if (error) throw new Error(`Failed to create oauth state: ${error.message}`);

    return { url: buildAuthUrl({ origin, state }) };
  });

/** Get current Google Fit connection status for the user. */
export const getGoogleFitStatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("integrations")
      .select("provider, last_synced_at, created_at")
      .eq("provider", "google_fit")
      .maybeSingle();
    return {
      connected: !!data,
      lastSyncedAt: data?.last_synced_at ?? null,
      connectedAt: data?.created_at ?? null,
    };
  });

/** Disconnect Google Fit. */
export const disconnectGoogleFit = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("integrations")
      .delete()
      .eq("provider", "google_fit");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Sync Google Fit data (steps, calories, cardio points, weight). */
export const syncGoogleFit = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // Load integration via admin (we own the row, but admin avoids RLS pitfalls server-side)
    const { data: integ, error: integErr } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "google_fit")
      .maybeSingle();
    if (integErr) throw new Error(integErr.message);
    if (!integ) throw new Error("Google Fit não está conectado");

    // Refresh token if expired
    let accessToken = integ.access_token;
    const expiresAt = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
    if (Date.now() > expiresAt - 60_000) {
      if (!integ.refresh_token) {
        throw new Error("Refresh token ausente — reconecte o Google Fit");
      }
      const refreshed = await refreshAccessToken(integ.refresh_token);
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("integrations")
        .update({
          access_token: accessToken,
          token_expires_at: newExpiry,
        })
        .eq("id", integ.id);
    }

    // Fetch last 7 days of activity + 30 days of weight
    const [daily, weights] = await Promise.all([
      fetchDailySummaries({ accessToken, days: 7 }),
      fetchWeightSamples({ accessToken, days: 30 }),
    ]);

    // Upsert daily activity
    let activityCount = 0;
    for (const d of daily) {
      if (d.steps === 0 && d.energyKcal === 0 && d.activeMinutes === 0) continue;
      const { error } = await supabaseAdmin
        .from("daily_activity")
        .upsert(
          {
            user_id: userId,
            recorded_for: d.date,
            steps: d.steps,
            cardio_points: d.cardioPoints,
            active_minutes: d.activeMinutes,
            energy_kcal: d.energyKcal,
            distance_km: d.distanceKm,
            source: "google_fit",
          },
          { onConflict: "user_id,recorded_for" }
        );
      if (!error) activityCount++;
    }

    // Insert weight entries (ignore duplicates by date+source)
    let weightCount = 0;
    for (const w of weights) {
      const { data: existing } = await supabaseAdmin
        .from("weight_entries")
        .select("id")
        .eq("user_id", userId)
        .eq("recorded_at", w.recordedAt)
        .eq("source", "google_fit")
        .maybeSingle();
      if (existing) continue;
      const { error } = await supabaseAdmin.from("weight_entries").insert({
        user_id: userId,
        recorded_at: w.recordedAt,
        weight_kg: w.weightKg,
        source: "google_fit",
      });
      if (!error) weightCount++;
    }

    await supabaseAdmin
      .from("integrations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", integ.id);

    return { activityCount, weightCount };
  });
