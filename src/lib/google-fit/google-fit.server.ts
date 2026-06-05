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

/** Computes bucket window aligned to user's local midnight, ending at next local midnight. */
function computeWindow(days: number, tzOffsetMinutes: number) {
  const nowLocal = new Date(Date.now() + tzOffsetMinutes * 60_000);
  const y = nowLocal.getUTCFullYear();
  const m = nowLocal.getUTCMonth();
  const d = nowLocal.getUTCDate();
  // end = next local midnight (so today's partial day is included)
  const end = localMidnightUtcMs(y, m, d + 1, tzOffsetMinutes);
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

  // We want the SAME numbers the Google Fit "home" screen shows:
  //  - steps: estimated_steps (phone) merged w/ all-sources (watch/Health Connect)
  //  - calories: "from_activities" only — excludes BMR/basal (~5.700 kcal/dia)
  //  - cardio points: merge_heart_minutes — includes Health Connect / wearables
  //  - active minutes: merge_active_minutes (Move Minutes on the Fit UI)
  //  - distance: merge_distance_delta
  const aggregateBy = [
    {
      dataTypeName: "com.google.step_count.delta",
      dataSourceId:
        "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
    },
    { dataTypeName: "com.google.step_count.delta" },
    {
      dataTypeName: "com.google.heart_minutes",
      dataSourceId:
        "derived:com.google.heart_minutes:com.google.android.gms:merge_heart_minutes",
    },
    { dataTypeName: "com.google.heart_minutes" }, // fallback (any source)
    {
      dataTypeName: "com.google.active_minutes",
      dataSourceId:
        "derived:com.google.active_minutes:com.google.android.gms:merge_active_minutes",
    },
    {
      dataTypeName: "com.google.calories.expended",
      dataSourceId:
        "derived:com.google.calories.expended:com.google.android.gms:from_activities",
    },
    {
      dataTypeName: "com.google.distance.delta",
      dataSourceId:
        "derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta",
    },
  ];

  const result = await fitnessAggregate(params.accessToken, {
    aggregateBy,
    bucketByTime: { durationMillis: DAY_MS },
    startTimeMillis: start,
    endTimeMillis: end,
  });

  // Debug log: helps diagnose why totals differ from the Fit app.
  try {
    const today = (result.bucket ?? [])[(result.bucket ?? []).length - 1];
    console.log(
      "[google-fit] last bucket datasets summary:",
      JSON.stringify(
        (today?.dataset ?? []).map((d: any) => ({
          dsid: d.dataSourceIds,
          points: d.point?.length ?? 0,
        }))
      )
    );
  } catch {}

  const buckets = (result.bucket ?? []) as any[];
  return buckets.map((b) => {
    const ds = (b.dataset ?? []) as any[];
    const pointsAt = (i: number) => ds[i]?.point;
    const estimatedSteps = Math.round(sumPoints(pointsAt(0), "intVal"));
    const allSourceSteps = Math.round(sumPoints(pointsAt(1), "intVal"));
    const cardioMerged = Math.round(sumPoints(pointsAt(2), "fpVal"));
    const cardioAny = Math.round(sumPoints(pointsAt(3), "fpVal"));
    return {
      date: localDateLabel(Number(b.startTimeMillis), tz),
      steps: Math.max(estimatedSteps, allSourceSteps),
      cardioPoints: Math.max(cardioMerged, cardioAny),
      activeMinutes: Math.round(sumPoints(pointsAt(4), "intVal")),
      energyKcal: Math.round(sumPoints(pointsAt(5), "fpVal")),
      distanceKm: Number((sumPoints(pointsAt(6), "fpVal") / 1000).toFixed(2)),
    };
  });
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
  const result = await fitnessAggregate(accessToken, {
    aggregateBy: [
      // 0: calories merged from all sources (inclui Health Connect / Mi Fitness)
      {
        dataTypeName: "com.google.calories.expended",
        dataSourceId:
          "derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended",
      },
      // 1: calories from_activities (exclui BMR)
      {
        dataTypeName: "com.google.calories.expended",
        dataSourceId:
          "derived:com.google.calories.expended:com.google.android.gms:from_activities",
      },
      // 2: calories any source (fallback)
      { dataTypeName: "com.google.calories.expended" },
      // 3: distance merged
      {
        dataTypeName: "com.google.distance.delta",
        dataSourceId:
          "derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta",
      },
      // 4: distance any source
      { dataTypeName: "com.google.distance.delta" },
      // 5: steps merged
      {
        dataTypeName: "com.google.step_count.delta",
        dataSourceId:
          "derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas",
      },
      // 6: steps any source
      { dataTypeName: "com.google.step_count.delta" },
      // 7: heart rate
      { dataTypeName: "com.google.heart_rate.bpm" },
      // 8: cardio points merged
      {
        dataTypeName: "com.google.heart_minutes",
        dataSourceId:
          "derived:com.google.heart_minutes:com.google.android.gms:merge_heart_minutes",
      },
      // 9: cardio any source
      { dataTypeName: "com.google.heart_minutes" },
    ],
    bucketByTime: { durationMillis: durationMs },
    startTimeMillis: startMs,
    endTimeMillis: endMs,
  });

  const bucket = (result.bucket ?? [])[0];
  const ds = (bucket?.dataset ?? []) as any[];
  const pointsAt = (i: number) => ds[i]?.point;

  try {
    console.log(
      "[google-fit] session datasets:",
      JSON.stringify(
        (bucket?.dataset ?? []).map((d: any) => ({
          dsid: d.dataSourceIds,
          points: d.point?.length ?? 0,
        }))
      )
    );
  } catch {}

  const calMerged = Math.round(sumPoints(pointsAt(0), "fpVal"));
  const calFromActivities = Math.round(sumPoints(pointsAt(1), "fpVal"));
  const calAnySource = Math.round(sumPoints(pointsAt(2), "fpVal"));
  const calories = Math.max(calMerged, calFromActivities, calAnySource);
  const distMerged = sumPoints(pointsAt(3), "fpVal");
  const distAny = sumPoints(pointsAt(4), "fpVal");
  const distanceM = Math.max(distMerged, distAny);
  const stepsMerged = Math.round(sumPoints(pointsAt(5), "intVal"));
  const stepsAny = Math.round(sumPoints(pointsAt(6), "intVal"));
  const steps = Math.max(stepsMerged, stepsAny);
  const cardioMerged = Math.round(sumPoints(pointsAt(8), "fpVal"));
  const cardioAny = Math.round(sumPoints(pointsAt(9), "fpVal"));
  const cardioPoints = Math.max(cardioMerged, cardioAny);

  // Average HR across all heart_rate points in the window
  let hrSum = 0;
  let hrCount = 0;
  for (const p of pointsAt(7) ?? []) {
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
