import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Call {
  op: 'insert' | 'delete'
  payload?: Record<string, unknown>
  filters: Record<string, [string, unknown]>
}
const calls: Call[] = []
const results = { insert: { id: 'challenge-1' } as unknown, delete: null as unknown }

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== 'passkey_challenges') throw new Error(`Unexpected table ${table}`)
      const call: Call = { op: 'insert', filters: {} }
      calls.push(call)
      const chain = {
        insert(payload: Record<string, unknown>) {
          call.payload = payload
          return chain
        },
        delete() {
          call.op = 'delete'
          return chain
        },
        eq(column: string, value: unknown) {
          call.filters[column] = ['eq', value]
          return chain
        },
        gt(column: string, value: unknown) {
          call.filters[column] = ['gt', value]
          return chain
        },
        lt(column: string, value: unknown) {
          call.filters[column] = ['lt', value]
          return chain
        },
        select: () => chain,
        single: async () => ({ data: results.insert, error: null }),
        maybeSingle: async () => ({ data: results.delete, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: null }).then(resolve),
      }
      return chain
    },
  }),
}))

const {
  consumePasskeyChallenge,
  issuePasskeyChallenge,
  purgeExpiredPasskeyChallenges,
  PASSKEY_CHALLENGE_TTL_SECONDS,
} = await import('@/lib/services/passkey-challenge.service')

const CHALLENGE_ID = '6b0f3f4c-8a59-4a39-9a54-0c2f8d4f1e21'

beforeEach(() => {
  calls.length = 0
  results.delete = null
})

describe('passkey challenges', () => {
  it('records the challenge for one account and ceremony, expiring after the prompt window', async () => {
    const before = Date.now()

    expect(await issuePasskeyChallenge('user-1', 'authentication', 'Y2hhbGxlbmdl')).toBe('challenge-1')

    const { payload } = calls[0]
    expect(payload).toMatchObject({ user_id: 'user-1', purpose: 'authentication', challenge: 'Y2hhbGxlbmdl' })
    const expires = new Date(payload!.expires_at as string).getTime()
    expect(expires).toBeGreaterThanOrEqual(before + PASSKEY_CHALLENGE_TTL_SECONDS * 1000)
    expect(expires).toBeLessThanOrEqual(Date.now() + PASSKEY_CHALLENGE_TTL_SECONDS * 1000)
  })

  it('uses a challenge by deleting it, only for its ceremony and before it expires', async () => {
    results.delete = { challenge: 'Y2hhbGxlbmdl', user_id: 'user-1' }

    expect(await consumePasskeyChallenge(CHALLENGE_ID, 'registration')).toEqual({
      challenge: 'Y2hhbGxlbmdl',
      userId: 'user-1',
    })

    const [call] = calls
    expect(call.op).toBe('delete')
    expect(call.filters.id).toEqual(['eq', CHALLENGE_ID])
    expect(call.filters.purpose).toEqual(['eq', 'registration'])
    expect(call.filters.expires_at[0]).toBe('gt')
    expect(Math.abs(new Date(call.filters.expires_at[1] as string).getTime() - Date.now())).toBeLessThan(5000)
  })

  it('reports a challenge that is gone, used, or expired', async () => {
    expect(await consumePasskeyChallenge(CHALLENGE_ID, 'authentication')).toBeNull()
  })

  it('does not look up a cookie value that is not a challenge id', async () => {
    expect(await consumePasskeyChallenge('Y2hhbGxlbmdl', 'authentication')).toBeNull()
    expect(calls).toEqual([])
  })

  it('purges only challenges past their expiry', async () => {
    expect(await purgeExpiredPasskeyChallenges()).toBe(2)
    expect(calls[0].op).toBe('delete')
    expect(calls[0].filters.expires_at[0]).toBe('lt')
  })
})
