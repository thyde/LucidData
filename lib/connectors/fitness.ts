// Fitness connector definitions and response normalization.
//
// Connectors map a provider's API response into our fitness vault schemas
// (fitness_activity, fitness_daily). The normalization functions are pure and run
// wherever ingestion happens (a server worker, or the browser for client-side
// fetches), so they are unit-tested in isolation. OAuth client IDs/secrets are read
// from env at call time and never hardcoded here.

export type FitnessProvider = 'strava' | 'fitbit'

export interface ConnectorDef {
  id: FitnessProvider
  label: string
  category: 'fitness'
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
  scopeSeparator: string
  clientIdEnv: string
  clientSecretEnv: string
  // The vault schema type this provider's records normalize into.
  schemaType: 'fitness_activity' | 'fitness_daily'
}

export const FITNESS_CONNECTORS: Record<FitnessProvider, ConnectorDef> = {
  strava: {
    id: 'strava',
    label: 'Strava',
    category: 'fitness',
    authorizeUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    scopes: ['activity:read_all'],
    scopeSeparator: ',',
    clientIdEnv: 'STRAVA_CLIENT_ID',
    clientSecretEnv: 'STRAVA_CLIENT_SECRET',
    schemaType: 'fitness_activity',
  },
  fitbit: {
    id: 'fitbit',
    label: 'Fitbit',
    category: 'fitness',
    authorizeUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    scopes: ['activity', 'heartrate', 'sleep', 'profile'],
    scopeSeparator: ' ',
    clientIdEnv: 'FITBIT_CLIENT_ID',
    clientSecretEnv: 'FITBIT_CLIENT_SECRET',
    schemaType: 'fitness_daily',
  },
}

// Build the provider's OAuth authorize URL for the consent redirect.
export function buildAuthorizeUrl(
  provider: FitnessProvider,
  params: { clientId: string; redirectUri: string; state: string }
): string {
  const def = FITNESS_CONNECTORS[provider]
  const url = new URL(def.authorizeUrl)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', def.scopes.join(def.scopeSeparator))
  url.searchParams.set('state', params.state)
  if (provider === 'strava') url.searchParams.set('approval_prompt', 'auto')
  return url.toString()
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

const STRAVA_SPORT_MAP: Record<string, string> = {
  Run: 'Run',
  TrailRun: 'Run',
  VirtualRun: 'Run',
  Ride: 'Ride',
  MountainBikeRide: 'Ride',
  GravelRide: 'Ride',
  VirtualRide: 'Ride',
  EBikeRide: 'Ride',
  Walk: 'Walk',
  Hike: 'Hike',
  Swim: 'Swim',
  WeightTraining: 'WeightTraining',
  Workout: 'Workout',
  Yoga: 'Yoga',
}

function mapStravaSport(sport: string | undefined): string {
  if (!sport) return 'Other'
  return STRAVA_SPORT_MAP[sport] ?? 'Other'
}

export interface StravaActivity {
  name?: string
  type?: string
  sport_type?: string
  start_date?: string
  distance?: number
  moving_time?: number
  total_elevation_gain?: number
  average_heartrate?: number
  max_heartrate?: number
  calories?: number
  average_speed?: number
}

// Strava SummaryActivity -> a fitness_activity record (metric units).
export function normalizeStravaActivity(a: StravaActivity): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: a.name ?? 'Activity',
    sport_type: mapStravaSport(a.sport_type ?? a.type),
    start_date: (a.start_date ?? '').slice(0, 10),
    source: 'strava',
  }
  if (a.distance != null) out.distance_km = round(a.distance / 1000, 2)
  if (a.moving_time != null) out.duration_min = Math.round(a.moving_time / 60)
  if (a.total_elevation_gain != null) out.elevation_gain_m = round(a.total_elevation_gain, 1)
  if (a.average_heartrate != null) out.average_heartrate = Math.round(a.average_heartrate)
  if (a.max_heartrate != null) out.max_heartrate = Math.round(a.max_heartrate)
  if (a.calories != null) out.calories = Math.round(a.calories)
  if (a.average_speed != null) out.average_speed_kmh = round(a.average_speed * 3.6, 1)
  return out
}

export interface FitbitDailySummary {
  steps?: number
  caloriesOut?: number
  floors?: number
  fairlyActiveMinutes?: number
  veryActiveMinutes?: number
  restingHeartRate?: number
  distances?: { activity: string; distance: number }[]
}

// Fitbit Get Daily Activity Summary `summary` -> a fitness_daily record. The date
// is supplied separately since the summary itself does not carry it.
export function normalizeFitbitDay(
  date: string,
  summary: FitbitDailySummary
): Record<string, unknown> {
  const out: Record<string, unknown> = { date, source: 'fitbit' }
  if (summary.steps != null) out.steps = summary.steps
  const total = summary.distances?.find((d) => d.activity === 'total')
  if (total) out.distance_km = round(total.distance, 2)
  if (summary.caloriesOut != null) out.calories_out = summary.caloriesOut
  if (summary.floors != null) out.floors = summary.floors
  const active = (summary.fairlyActiveMinutes ?? 0) + (summary.veryActiveMinutes ?? 0)
  if (active > 0) out.active_minutes = active
  if (summary.restingHeartRate != null) out.resting_heart_rate = summary.restingHeartRate
  return out
}
