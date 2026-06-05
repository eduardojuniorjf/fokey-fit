// Server-only helpers for Google Fit OAuth + sync.
// Never import from client code.

const GOOGLE_FIT_SCOPES = [
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.body.read",
  "https://www.googleapis.com/auth/fitness.location.read",
].join(" ");

export function getGoogleFitConfig() {
  const clientId = process.env.GOOGLE_FIT_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google Fit credentials are not configured");
  }
  return { clientId, clientSecret };
}

export function getRedirectUri(origin: string) {
  return `${origin}/api/public/google-fit-callback`;
}

export function buildAuthUrl(params: {
  origin: string;
  state: string;
}) {
  const { clientId } = getGoogleFitConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getRedirectUri(params.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_FIT_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForToken(params: {
  code: string;
  origin: string;
}): Promise<TokenResponse> {
  const { clientId, clientSecret } = getGoogleFitConfig();
  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getRedirectUri(params.origin),
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed [${res.status}]: ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getGoogleFitConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed [${res.status}]: ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

// --- Fitness API queries ----------------------------------------------------

interface AggregateRequest {
  aggregateBy: Array<{ dataTypeName: string; dataSourceId?: string }>;
  bucketByTime: { durationMillis: number };
  startTimeMillis: number;
  endTimeMillis: number;
}

async function fitnessAggregate(accessToken: string, body: AggregateRequest) {
  const res = await fetch(
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fitness API aggregate failed [${res.status}]: ${text}`);
  }
  return await res.json();
}

export interface DailyFitnessSummary {
  date: string; // YYYY-MM-DD
  steps: number;
  cardioPoints: number;
  activeMinutes: number;
  energyKcal: number;
  distanceKm: number;
}

export interface WeightSample {
  recordedAt: string; // YYYY-MM-DD
  weightKg: number;
}

export interface FitnessSession {
  externalId: string;
  name: string;
  activityType: string;
  startTime: string;
  durationMinutes: number;
  cardioPoints: number;
  calories: number | null;
  distanceKm: number | null;
  steps: number | null;
  avgHeartRate: number | null;
}

// Google Fit activity type IDs → our internal values
// https://developers.google.com/fit/rest/v1/reference/activity-types
const ACTIVITY_TYPE_MAP: Record<number, string> = {
  1: "cycling",
  7: "walking",
  8: "running",
  56: "running",
  57: "running",
  58: "running",
  82: "swimming",
  84: "swimming",
  88: "swimming",
  116: "tennis",
  119: "treadmill",
  173: "treadmill",
};

function mapActivityType(googleType: number | undefined): string {
  if (googleType == null) return "other";
  return ACTIVITY_TYPE_MAP[googleType] ?? "other";
}


const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-date label (YYYY-MM-DD) for a timestamp, shifted by user's tz offset (minutes east of UTC). */
function localDateLabel(ts: number, tzOffsetMinutes: number) {
  return new Date(ts + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Returns ms timestamp of local midnight for a given local date (year/month/day). */
function localMidnightUtcMs(year: number, month: number, day: number, tzOffsetMinutes: number) {
  return Date.UTC(year, month, day) - tzOffsetMinutes * 60_000;
}

/** Computes bucket window aligned to user's local midnight, ending at now so today's partial totals stay fresh. */
function computeWindow(days: number, tzOffsetMinutes: number) {
  const nowLocal = new Date(Date.now() + tzOffsetMinutes * 60_000);
  const y = nowLocal.getUTCFullYear();
  const m = nowLocal.getUTCMonth();
  const d = nowLocal.getUTCDate();
  const end = Date.now();
  const start = localMidnightUtcMs(y, m, d - days + 1, tzOffsetMinutes);
  return { start, end };
}

function sumPoints(points: any[] | undefined, key: "intVal" | "fpVal"): number {
  if (!points) return 0;
  let total = 0;
  for (const p of points) {
    for (const v of p.value ?? []) {
      const val = v[key];
      if (typeof val === "number") total += val;
    }
  }
  return total;
}

export async function fetchDailySummaries(params: {
  accessToken: string;
  days: number;
  tzOffsetMinutes?: number;
}): Promise<DailyFitnessSummary[]> {
  const tz = params.tzOffsetMinutes ?? 0;
  const { start, end } = computeWindow(params.days, tz);

  // Cada métrica é uma chamada isolada: se um dataSource não estiver
  // disponível para o usuário (403), as outras continuam funcionando.
  const safeBuckets = async (
    label: string,
    aggregateBy: Array<{ dataTypeName: string; dataSourceId?: string }>,
  ): Promise<any[]> => {
    try {
      const res = await fitnessAggregate(params.accessToken, {
        aggregateBy,
        bucketByTime: { durationMillis: DAY_MS },
        startTimeMillis: start,
        endTimeMillis: end,
      });
      return (res.bucket ?? []) as any[];
    } catch (err) {
      console.warn(`[google-fit] daily metric "${label}" failed:`, err);
      return [];
    }
  };

  const [
    stepsMergedBuckets,
    stepsEstBuckets,
    stepsAnyBuckets,
    cardioMergedBuckets,
    cardioAnyBuckets,
    activeBuckets,
    calMergedBuckets,
    calFromActBuckets,
    calAnyBuckets,
    distBuckets,
  ] = await Promise.all([
    safeBuckets("steps_merged", [{
      dataTypeName: "com.google.step_count.delta",
      dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas",
    }]),
    safeBuckets("steps_estimated", [{
      dataTypeName: "com.google.step_count.delta",
      dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
    }]),
    safeBuckets("steps_any", [{ dataTypeName: "com.google.step_count.delta" }]),
    safeBuckets("cardio_merged", [{
      dataTypeName: "com.google.heart_minutes",
      dataSourceId: "derived:com.google.heart_minutes:com.google.android.gms:merge_heart_minutes",
    }]),
    safeBuckets("cardio_any", [{ dataTypeName: "com.google.heart_minutes" }]),
    safeBuckets("active_minutes", [{
      dataTypeName: "com.google.active_minutes",
      dataSourceId: "derived:com.google.active_minutes:com.google.android.gms:merge_active_minutes",
    }]),
    safeBuckets("cal_merged", [{
      dataTypeName: "com.google.calories.expended",
      dataSourceId: "derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended",
    }]),
    safeBuckets("cal_from_activities", [{
      dataTypeName: "com.google.calories.expended",
      dataSourceId: "derived:com.google.calories.expended:com.google.android.gms:from_activities",
    }]),
    safeBuckets("cal_any", [{ dataTypeName: "com.google.calories.expended" }]),
    safeBuckets("distance_merged", [{
      dataTypeName: "com.google.distance.delta",
      dataSourceId: "derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta",
    }]),
  ]);

  // Indexa por data local para mesclar com Math.max
  const sumBucket = (b: any, key: "intVal" | "fpVal") =>
    ((b?.dataset ?? []) as any[]).reduce((total, dataset) => total + sumPoints(dataset?.point, key), 0);

  const dates = new Map<string, DailyFitnessSummary>();
  const ensure = (b: any): DailyFitnessSummary => {
    const date = localDateLabel(Number(b.startTimeMillis), tz);
    let entry = dates.get(date);
    if (!entry) {
      entry = { date, steps: 0, cardioPoints: 0, activeMinutes: 0, energyKcal: 0, distanceKm: 0 };
      dates.set(date, entry);
    }
    return entry;
  };

  for (const b of stepsMergedBuckets) ensure(b).steps = Math.max(ensure(b).steps, Math.round(sumBucket(b, "intVal")));
  for (const b of stepsEstBuckets) ensure(b).steps = Math.max(ensure(b).steps, Math.round(sumBucket(b, "intVal")));
  for (const b of stepsAnyBuckets) ensure(b).steps = Math.max(ensure(b).steps, Math.round(sumBucket(b, "intVal")));
  for (const b of cardioMergedBuckets) ensure(b).cardioPoints = Math.max(ensure(b).cardioPoints, Math.round(sumBucket(b, "fpVal")));
  for (const b of cardioAnyBuckets) ensure(b).cardioPoints = Math.max(ensure(b).cardioPoints, Math.round(sumBucket(b, "fpVal")));
  for (const b of activeBuckets) ensure(b).activeMinutes = Math.round(sumBucket(b, "intVal"));
  for (const b of calMergedBuckets) ensure(b).energyKcal = Math.max(ensure(b).energyKcal, Math.round(sumBucket(b, "fpVal")));
  for (const b of calFromActBuckets) ensure(b).energyKcal = Math.max(ensure(b).energyKcal, Math.round(sumBucket(b, "fpVal")));
  for (const b of calAnyBuckets) ensure(b).energyKcal = Math.max(ensure(b).energyKcal, Math.round(sumBucket(b, "fpVal")));
  for (const b of distBuckets) ensure(b).distanceKm = Math.max(ensure(b).distanceKm, Number((sumBucket(b, "fpVal") / 1000).toFixed(2)));

  return Array.from(dates.values()).sort((a, b) => a.date.localeCompare(b.date));
}



export async function fetchWeightSamples(params: {
  accessToken: string;
  days: number;
  tzOffsetMinutes?: number;
}): Promise<WeightSample[]> {
  const tz = params.tzOffsetMinutes ?? 0;
  const { start, end } = computeWindow(params.days, tz);

  const result = await fitnessAggregate(params.accessToken, {
    aggregateBy: [{ dataTypeName: "com.google.weight" }],
    bucketByTime: { durationMillis: DAY_MS },
    startTimeMillis: start,
    endTimeMillis: end,
  });

  const samples: WeightSample[] = [];
  for (const b of (result.bucket ?? []) as any[]) {
    const point = b.dataset?.[0]?.point ?? [];
    let sum = 0;
    let count = 0;
    for (const p of point) {
      for (const v of p.value ?? []) {
        if (typeof v.fpVal === "number") {
          sum += v.fpVal;
          count++;
        }
      }
    }
    if (count > 0) {
      samples.push({
        recordedAt: localDateLabel(Number(b.startTimeMillis), tz),
        weightKg: Number((sum / count).toFixed(2)),
      });
    }
  }
  return samples;
}

// --- Sessions (individual workouts) ----------------------------------------

/** Aggregates calories/distance/steps/HR/cardio for a specific session window.
 *  Uses Fit "merge_*" derived streams so workouts logged via Health Connect
 *  (Mi Fitness, Xiaomi Wear, etc.) are included — the generic aggregate
 *  without a dataSourceId misses Health Connect data. */
async function fetchSessionMetrics(
  accessToken: string,
  startMs: number,
  endMs: number,
) {
  const durationMs = Math.max(endMs - startMs, 1);

  // Cada métrica é uma chamada isolada — se um dataSource não estiver
  // habilitado para o usuário (ex.: from_activities → 403), as outras
  // continuam funcionando.
  const safeAggregate = async (
    label: string,
    aggregateBy: Array<{ dataTypeName: string; dataSourceId?: string }>,
    valueKey: "intVal" | "fpVal",
  ): Promise<{ total: number; points: any[] }> => {
    try {
      const res = await fitnessAggregate(accessToken, {
        aggregateBy,
        bucketByTime: { durationMillis: durationMs },
        startTimeMillis: startMs,
        endTimeMillis: endMs,
      });
      const bucket = (res.bucket ?? [])[0];
      const ds = (bucket?.dataset ?? []) as any[];
      let total = 0;
      const points: any[] = [];
      for (const d of ds) {
        for (const p of d.point ?? []) {
          points.push(p);
          for (const v of p.value ?? []) {
            const val = v[valueKey];
            if (typeof val === "number") total += val;
          }
        }
      }
      return { total, points };
    } catch (err) {
      console.warn(`[google-fit] session metric "${label}" failed:`, err);
      return { total: 0, points: [] };
    }
  };

  // Calorias: tenta merged, depois from_activities, depois qualquer fonte
  const [calMerged, calFromAct, calAny] = await Promise.all([
    safeAggregate("cal_merged", [{
      dataTypeName: "com.google.calories.expended",
      dataSourceId: "derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended",
    }], "fpVal"),
    safeAggregate("cal_from_activities", [{
      dataTypeName: "com.google.calories.expended",
      dataSourceId: "derived:com.google.calories.expended:com.google.android.gms:from_activities",
    }], "fpVal"),
    safeAggregate("cal_any", [{ dataTypeName: "com.google.calories.expended" }], "fpVal"),
  ]);
  const calories = Math.round(Math.max(calMerged.total, calFromAct.total, calAny.total));

  const [distMerged, distAny] = await Promise.all([
    safeAggregate("dist_merged", [{
      dataTypeName: "com.google.distance.delta",
      dataSourceId: "derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta",
    }], "fpVal"),
    safeAggregate("dist_any", [{ dataTypeName: "com.google.distance.delta" }], "fpVal"),
  ]);
  const distanceM = Math.max(distMerged.total, distAny.total);

  const [stepsMerged, stepsAny] = await Promise.all([
    safeAggregate("steps_merged", [{
      dataTypeName: "com.google.step_count.delta",
      dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas",
    }], "intVal"),
    safeAggregate("steps_any", [{ dataTypeName: "com.google.step_count.delta" }], "intVal"),
  ]);
  const steps = Math.round(Math.max(stepsMerged.total, stepsAny.total));

  const [cardioMerged, cardioAny] = await Promise.all([
    safeAggregate("cardio_merged", [{
      dataTypeName: "com.google.heart_minutes",
      dataSourceId: "derived:com.google.heart_minutes:com.google.android.gms:merge_heart_minutes",
    }], "fpVal"),
    safeAggregate("cardio_any", [{ dataTypeName: "com.google.heart_minutes" }], "fpVal"),
  ]);
  const cardioPoints = Math.round(Math.max(cardioMerged.total, cardioAny.total));

  const hr = await safeAggregate(
    "heart_rate",
    [{ dataTypeName: "com.google.heart_rate.bpm" }],
    "fpVal",
  );
  let hrSum = 0;
  let hrCount = 0;
  for (const p of hr.points) {
    for (const v of p.value ?? []) {
      if (typeof v.fpVal === "number") {
        hrSum += v.fpVal;
        hrCount++;
      }
    }
  }
  const avgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : null;

  return {
    cardioPoints,
    calories: calories > 0 ? calories : null,
    distanceKm: distanceM > 0 ? Number((distanceM / 1000).toFixed(2)) : null,
    steps: steps > 0 ? steps : null,
    avgHeartRate: avgHr,
  };
}




/** Fetches Google Fit workout sessions within the last N days. */
export async function fetchSessions(params: {
  accessToken: string;
  days: number;
  tzOffsetMinutes?: number;
}): Promise<FitnessSession[]> {
  const tz = params.tzOffsetMinutes ?? 0;
  const { start, end } = computeWindow(params.days, tz);

  const url = new URL("https://www.googleapis.com/fitness/v1/users/me/sessions");
  url.searchParams.set("startTime", new Date(start).toISOString());
  url.searchParams.set("endTime", new Date(end).toISOString());

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fitness API sessions failed [${res.status}]: ${text}`);
  }
  const body = (await res.json()) as { session?: any[] };
  const rawSessions = body.session ?? [];

  const out: FitnessSession[] = [];
  for (const s of rawSessions) {
    const startMs = Number(s.startTimeMillis);
    const endMs = Number(s.endTimeMillis);
    if (!startMs || !endMs || endMs <= startMs) continue;

    const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
    let metrics = {
      cardioPoints: 0,
      calories: null as number | null,
      distanceKm: null as number | null,
      steps: null as number | null,
      avgHeartRate: null as number | null,
    };
    try {
      metrics = await fetchSessionMetrics(params.accessToken, startMs, endMs);
    } catch (err) {
      console.warn("[google-fit] session metrics failed", s.id, err);
    }

    out.push({
      externalId: String(s.id ?? `${startMs}-${endMs}`),
      name: s.name ?? s.description ?? "Treino",
      activityType: mapActivityType(s.activityType),
      startTime: new Date(startMs).toISOString(),
      durationMinutes,
      ...metrics,
    });
  }
  return out;
}
