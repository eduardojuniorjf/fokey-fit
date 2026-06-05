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

  // For STEPS specifically, use the "estimated_steps" derived stream — this is
  // the same source the Google Fit Android app uses and accounts for raw sensor
  // data + adjustments. For everything else, omit dataSourceId so Google
  // aggregates across ALL connected sources (phone, watch, third-party apps).
  const aggregateBy = [
    {
      dataTypeName: "com.google.step_count.delta",
      dataSourceId:
        "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
    },
    { dataTypeName: "com.google.heart_minutes" },
    { dataTypeName: "com.google.active_minutes" },
    { dataTypeName: "com.google.calories.expended" },
    { dataTypeName: "com.google.distance.delta" },
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
    // Datasets are returned in the same order as aggregateBy.
    const pointsAt = (i: number) => ds[i]?.point;
    return {
      date: localDateLabel(Number(b.startTimeMillis), tz),
      steps: Math.round(sumPoints(pointsAt(0), "intVal")),
      cardioPoints: Math.round(sumPoints(pointsAt(1), "fpVal")),
      activeMinutes: Math.round(sumPoints(pointsAt(2), "intVal")),
      energyKcal: Math.round(sumPoints(pointsAt(3), "fpVal")),
      distanceKm: Number((sumPoints(pointsAt(4), "fpVal") / 1000).toFixed(2)),
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
