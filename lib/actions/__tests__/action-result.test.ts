import { describe, it, expect } from 'vitest'
import {
  UserFacingError,
  actionFailure,
  guarded,
  isActionFailure,
} from '../action-result'
import { unwrap } from '../unwrap'

describe('what crosses the action boundary', () => {
  it('returns a user-facing error rather than throwing it', async () => {
    // Thrown, this message becomes framework boilerplate in production.
    // Returned, it arrives intact.
    const result = await guarded(async () => {
      throw new UserFacingError('You have already contributed that entry to this pool')
    })

    expect(isActionFailure(result)).toBe(true)
    expect((result as { message: string }).message).toBe(
      'You have already contributed that entry to this pool'
    )
  })

  it('carries a code when one is given', async () => {
    const result = await guarded(async () => {
      throw new UserFacingError('Too many for today', 'velocity')
    })

    expect(result).toMatchObject({ code: 'velocity' })
  })

  it('passes a successful value straight through', async () => {
    expect(await guarded(async () => ({ id: 'abc' }))).toEqual({ id: 'abc' })
  })
})

describe('what must not cross the action boundary', () => {
  // The sanitization this works around exists for a reason. Anything not
  // deliberately written for a reader has to keep throwing, so it keeps being
  // sanitized and stays in the server logs.

  it('rethrows an ordinary error untouched', async () => {
    await expect(
      guarded(async () => {
        throw new Error('relation "vault_data" does not exist')
      })
    ).rejects.toThrow('relation "vault_data" does not exist')
  })

  it('rethrows a configuration error', async () => {
    await expect(
      guarded(async () => {
        throw new Error('CONNECTOR_TOKEN_SECRET must be a base64-encoded 32-byte key')
      })
    ).rejects.toThrow(/CONNECTOR_TOKEN_SECRET/)
  })

  it('rethrows a thrown non-error', async () => {
    await expect(
      guarded(async () => {
        throw 'a bare string'
      })
    ).rejects.toBe('a bare string')
  })

  it('does not treat a subclass of Error as user-facing by accident', async () => {
    class DatabaseError extends Error {}

    await expect(
      guarded(async () => {
        throw new DatabaseError('constraint violated on users_email_key')
      })
    ).rejects.toThrow(/users_email_key/)
  })
})

describe('recognising a failure', () => {
  it('recognises one it made', () => {
    expect(isActionFailure(actionFailure('nope'))).toBe(true)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'nope'],
    ['a number', 42],
    ['an array', []],
    ['an ordinary object', { message: 'nope' }],
    ['a lookalike without the marker', { __lucidActionFailure: 'yes', message: 'nope' }],
  ])('does not mistake %s for a failure', (_label, value) => {
    expect(isActionFailure(value)).toBe(false)
  })
})

describe('unwrap', () => {
  it('throws an ordinary Error carrying the message, so existing handlers work', async () => {
    // Every component already does `error instanceof Error ? error.message`.
    // That code was correct; the message was lost in transit rather than in the
    // handler, so unwrap has to produce exactly what those handlers expect.
    const failing = Promise.resolve(actionFailure('This pool pays less than your minimum'))

    await expect(unwrap(failing)).rejects.toThrow('This pool pays less than your minimum')
    await expect(unwrap(failing)).rejects.toBeInstanceOf(Error)
  })

  it('returns the value when there is no failure', async () => {
    expect(await unwrap(Promise.resolve({ ok: 1 }))).toEqual({ ok: 1 })
  })

  it('lets a genuinely thrown error through unchanged', async () => {
    await expect(unwrap(Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  it('round-trips a failure from guarded back into a throw', async () => {
    // The full path: service raises, action returns, client throws.
    const action = () =>
      guarded(async () => {
        throw new UserFacingError('You already have an open request of this type')
      })

    await expect(unwrap(action())).rejects.toThrow(
      'You already have an open request of this type'
    )
  })
})
