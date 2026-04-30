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

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
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
}): Promise<DailyFitnessSummary[]> {
  const end = Date.now();
  const start = end - params.days * DAY_MS;

  const result = await fitnessAggregate(params.accessToken, {
    aggregateBy: [
      { dataTypeName: "com.google.step_count.delta" },
      { dataTypeName: "com.google.heart_minutes" },
      { dataTypeName: "com.google.active_minutes" },
      { dataTypeName: "com.google.calories.expended" },
      { dataTypeName: "com.google.distance.delta" },
    ],
    bucketByTime: { durationMillis: DAY_MS },
    startTimeMillis: start,
    endTimeMillis: end,
  });

  const buckets = (result.bucket ?? []) as any[];
  return buckets.map((b) => {
    const ds = b.dataset ?? [];
    const find = (type: string) =>
      ds.find((d: any) => d.dataSourceId?.includes(type))?.point;
    return {
      date: isoDate(Number(b.startTimeMillis)),
      steps: Math.round(sumPoints(find("step_count"), "intVal")),
      cardioPoints: Math.round(sumPoints(find("heart_minutes"), "fpVal")),
      activeMinutes: Math.round(sumPoints(find("active_minutes"), "intVal")),
      energyKcal: Math.round(sumPoints(find("calories"), "fpVal")),
      distanceKm: Number((sumPoints(find("distance"), "fpVal") / 1000).toFixed(2)),
    };
  });
}

export async function fetchWeightSamples(params: {
  accessToken: string;
  days: number;
}): Promise<WeightSample[]> {
  const end = Date.now();
  const start = end - params.days * DAY_MS;

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
        recordedAt: isoDate(Number(b.startTimeMillis)),
        weightKg: Number((sum / count).toFixed(2)),
      });
    }
  }
  return samples;
}
