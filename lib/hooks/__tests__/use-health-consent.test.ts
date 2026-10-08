import { describe, it, expect, vi } from 'vitest'
import {
  HEALTH_CONSENT_DECLINED_MESSAGE,
  withHealthConsent,
} from '@/lib/hooks/use-health-consent'
import { HEALTH_CONSENT_REQUIRED } from '@/lib/constants/legal'

function refusal(): Error & { code: string } {
  return Object.assign(new Error('consent needed'), { code: HEALTH_CONSENT_REQUIRED })
}

describe('withHealthConsent', () => {
  it('asks once and retries when the server wants consent', async () => {
    const run = vi.fn().mockRejectedValueOnce(refusal()).mockResolvedValueOnce('saved')
    const ask = vi.fn().mockResolvedValue(true)
    await expect(withHealthConsent(run, ask)).resolves.toBe('saved')
    expect(ask).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('stops with a plain explanation when the person declines', async () => {
    const run = vi.fn().mockRejectedValue(refusal())
    await expect(withHealthConsent(run, async () => false)).rejects.toThrow(
      HEALTH_CONSENT_DECLINED_MESSAGE
    )
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('never asks for consent about an unrelated failure', async () => {
    const ask = vi.fn()
    await expect(withHealthConsent(() => Promise.reject(new Error('network')), ask)).rejects.toThrow(
      'network'
    )
    expect(ask).not.toHaveBeenCalled()
  })

  it('does not ask when the write succeeds', async () => {
    const ask = vi.fn()
    await expect(withHealthConsent(async () => 1, ask)).resolves.toBe(1)
    expect(ask).not.toHaveBeenCalled()
  })
})
