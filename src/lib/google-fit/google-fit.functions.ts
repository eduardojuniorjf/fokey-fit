import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildAuthUrl,
  fetchDailySummaries,
  fetchSessions,
  fetchWeightSamples,
  refreshAccessToken,
} from "./google-fit.server";


function getOrigin(): string {
  const req = getRequest();
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function localDateFromIso(iso: string, tzOffsetMinutes: number) {
  return new Date(new Date(iso).getTime() + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
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
  .inputValidator((data?: { tzOffsetMinutes?: number }) => data ?? {})
  .handler(async ({ context, data }) => {
    const { userId } = context;
    // Default to Brazil (UTC-3) if client did not provide an offset.
    // JS getTimezoneOffset() returns minutes WEST of UTC, so we negate to get east.
    const tzOffsetMinutes =
      typeof data.tzOffsetMinutes === "number" ? data.tzOffsetMinutes : -180;

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

    // Fetch last 7 days of activity + 30 days of weight + sessions, aligned to user's local timezone.
    // Activity is the primary dashboard feed, so optional Google Fit endpoints must not abort the whole sync.
    const [dailyResult, weightsResult, sessionsResult] = await Promise.allSettled([
      fetchDailySummaries({ accessToken, days: 7, tzOffsetMinutes }),
      fetchWeightSamples({ accessToken, days: 30, tzOffsetMinutes }),
      fetchSessions({ accessToken, days: 7, tzOffsetMinutes }),
    ]);
    const daily = dailyResult.status === "fulfilled" ? dailyResult.value : [];
    const weights = weightsResult.status === "fulfilled" ? weightsResult.value : [];
    const sessions = sessionsResult.status === "fulfilled" ? sessionsResult.value : [];
    if (dailyResult.status === "rejected") console.warn("[google-fit] daily sync failed:", dailyResult.reason);
    if (weightsResult.status === "rejected") console.warn("[google-fit] weight sync failed:", weightsResult.reason);
    if (sessionsResult.status === "rejected") console.warn("[google-fit] session sync failed:", sessionsResult.reason);


    const sessionTotalsByDate = new Map<
      string,
      { steps: number; cardioPoints: number; activeMinutes: number; energyKcal: number; distanceKm: number }
    >();
    for (const s of sessions) {
      const date = localDateFromIso(s.startTime, tzOffsetMinutes);
      const current = sessionTotalsByDate.get(date) ?? {
        steps: 0,
        cardioPoints: 0,
        activeMinutes: 0,
        energyKcal: 0,
        distanceKm: 0,
      };
      current.steps += s.steps ?? 0;
      current.cardioPoints += s.cardioPoints ?? 0;
      current.activeMinutes += s.durationMinutes;
      current.energyKcal += s.calories ?? 0;
      current.distanceKm += s.distanceKm ?? 0;
      sessionTotalsByDate.set(date, current);
    }

    const dailyByDate = new Map(daily.map((d) => [d.date, { ...d }]));
    for (const [date, totals] of sessionTotalsByDate) {
      const row = dailyByDate.get(date) ?? {
        date,
        steps: 0,
        cardioPoints: 0,
        activeMinutes: 0,
        energyKcal: 0,
        distanceKm: 0,
      };
      row.steps = Math.max(row.steps, Math.round(totals.steps));
      row.cardioPoints = Math.max(row.cardioPoints, Math.round(totals.cardioPoints));
      row.activeMinutes = Math.max(row.activeMinutes, Math.round(totals.activeMinutes));
      row.energyKcal = Math.max(row.energyKcal, Math.round(totals.energyKcal));
      row.distanceKm = Math.max(row.distanceKm, Number(totals.distanceKm.toFixed(2)));
      dailyByDate.set(date, row);
    }

    // Upsert daily activity, including individual workout sessions so the dashboard is fed by imports.
    let activityCount = 0;
    for (const d of dailyByDate.values()) {
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

    // Upsert individual workout sessions into cardio_activities (dedup by external_id)
    let sessionCount = 0;
    for (const s of sessions) {
      const { data: existing } = await supabaseAdmin
        .from("cardio_activities")
        .select("id")
        .eq("user_id", userId)
        .eq("source", "google_fit")
        .eq("external_id", s.externalId)
        .maybeSingle();
      const payload = {
        user_id: userId,
        activity_type: s.activityType,
        performed_at: s.startTime,
        duration_minutes: s.durationMinutes,
        distance_km: s.distanceKm,
        calories: s.calories,
        avg_heart_rate: s.avgHeartRate,
        steps: s.steps,
        cardio_points: s.cardioPoints || null,
        notes: s.name,
        source: "google_fit",
        external_id: s.externalId,
      };

      const { error } = existing
        ? await supabaseAdmin.from("cardio_activities").update(payload).eq("id", existing.id)
        : await supabaseAdmin.from("cardio_activities").insert(payload);
      if (!error) sessionCount++;
    }

    await supabaseAdmin
      .from("integrations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", integ.id);

    return { activityCount, weightCount, sessionCount };
  });

