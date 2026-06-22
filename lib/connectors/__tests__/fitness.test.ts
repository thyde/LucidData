import { describe, it, expect } from 'vitest'
import {
  FITNESS_CONNECTORS,
  buildAuthorizeUrl,
  normalizeStravaActivity,
  normalizeFitbitDay,
} from '@/lib/connectors/fitness'

describe('FITNESS_CONNECTORS', () => {
  it('defines strava and fitbit with schema targets', () => {
    expect(FITNESS_CONNECTORS.strava.schemaType).toBe('fitness_activity')
    expect(FITNESS_CONNECTORS.fitbit.schemaType).toBe('fitness_daily')
  })
})

describe('buildAuthorizeUrl', () => {
  it('builds a Strava authorize URL with scope and state', () => {
    const url = buildAuthorizeUrl('strava', {
      clientId: '123',
      redirectUri: 'https://app.example.com/cb',
      state: 'xyz',
    })
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://www.strava.com/oauth/authorize')
    expect(u.searchParams.get('client_id')).toBe('123')
    expect(u.searchParams.get('scope')).toBe('activity:read_all')
    expect(u.searchParams.get('redirect_uri')).toBe('https://app.example.com/cb')
    expect(u.searchParams.get('state')).toBe('xyz')
    expect(u.searchParams.get('response_type')).toBe('code')
  })

  it('space-separates Fitbit scopes', () => {
    const url = buildAuthorizeUrl('fitbit', {
      clientId: 'abc',
      redirectUri: 'https://app.example.com/cb',
      state: 's',
    })
    expect(new URL(url).searchParams.get('scope')).toBe('activity heartrate sleep profile')
  })
})

describe('normalizeStravaActivity', () => {
  it('converts units and maps the sport type', () => {
    const out = normalizeStravaActivity({
      name: 'Morning Ride',
      sport_type: 'MountainBikeRide',
      start_date: '2026-06-20T13:05:00Z',
      distance: 24931.4,
      moving_time: 4500,
      total_elevation_gain: 320,
      average_heartrate: 140.3,
      max_heartrate: 178,
      calories: 870.2,
      average_speed: 5.54,
    })
    expect(out).toMatchObject({
      name: 'Morning Ride',
      sport_type: 'Ride',
      start_date: '2026-06-20',
      distance_km: 24.93,
      duration_min: 75,
      elevation_gain_m: 320,
      average_heartrate: 140,
      max_heartrate: 178,
      calories: 870,
      average_speed_kmh: 19.9,
      source: 'strava',
    })
  })

  it('falls back to Other for unknown sports and Activity for a missing name', () => {
    const out = normalizeStravaActivity({ type: 'Kitesurf', start_date: '2026-01-01T00:00:00Z' })
    expect(out.sport_type).toBe('Other')
    expect(out.name).toBe('Activity')
  })
})

describe('normalizeFitbitDay', () => {
  it('maps a daily summary and sums active minutes', () => {
    const out = normalizeFitbitDay('2026-06-20', {
      steps: 8210,
      caloriesOut: 2350,
      floors: 12,
      fairlyActiveMinutes: 20,
      veryActiveMinutes: 35,
      restingHeartRate: 58,
      distances: [
        { activity: 'total', distance: 6.4 },
        { activity: 'veryActive', distance: 2.1 },
      ],
    })
    expect(out).toMatchObject({
      date: '2026-06-20',
      steps: 8210,
      distance_km: 6.4,
      calories_out: 2350,
      floors: 12,
      active_minutes: 55,
      resting_heart_rate: 58,
      source: 'fitbit',
    })
  })
})
