// Server-only helpers for Strava OAuth + sync.
const STRAVA_CLIENT_ID = "235337";
const STRAVA_SCOPES = "read,activity:read_all,profile:read_all";

export function getStravaConfig() {
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientSecret) throw new Error("STRAVA_CLIENT_SECRET não configurado");
  return { clientId: STRAVA_CLIENT_ID, clientSecret };
}

export function getRedirectUri(origin: string) {
  return `${origin}/api/public/strava-callback`;
}

export function buildAuthUrl(params: { origin: string; state: string }) {
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", STRAVA_CLIENT_ID);
  url.searchParams.set("redirect_uri", getRedirectUri(params.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", STRAVA_SCOPES);
  url.searchParams.set("state", params.state);
  return url.toString();
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  expires_in: number;
  token_type: string;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const { clientId, clientSecret } = getStravaConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Strava token exchange falhou [${res.status}]: ${await res.text()}`);
  return (await res.json()) as StravaTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<StravaTokenResponse> {
  const { clientId, clientSecret } = getStravaConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Strava token refresh falhou [${res.status}]: ${await res.text()}`);
  return (await res.json()) as StravaTokenResponse;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string; // ISO
  elapsed_time: number; // seconds
  moving_time: number;
  distance: number; // meters
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number; // only on detailed activity
}

export async function fetchActivities(params: {
  accessToken: string;
  afterUnix: number;
  perPage?: number;
}): Promise<StravaActivity[]> {
  const url = new URL("https://www.strava.com/api/v3/athlete/activities");
  url.searchParams.set("after", String(params.afterUnix));
  url.searchParams.set("per_page", String(params.perPage ?? 50));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  if (!res.ok) throw new Error(`Strava activities falhou [${res.status}]: ${await res.text()}`);
  return (await res.json()) as StravaActivity[];
}
