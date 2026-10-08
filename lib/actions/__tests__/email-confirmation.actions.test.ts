import { describe, it, expect, beforeEach, vi } from 'vitest'

const confirmEmailAddress = vi.fn()
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`)
})

vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))
vi.mock('@/lib/services/email-confirmation.service', () => ({
  confirmEmailAddress: (...args: unknown[]) => confirmEmailAddress(...args),
}))

const { confirmEmailAction } = await import('@/lib/actions/email-confirmation.actions')

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('confirmEmailAction', () => {
  it('confirms and sends the person to sign in', async () => {
    confirmEmailAddress.mockResolvedValue(true)
    await expect(confirmEmailAction(form({ token_hash: 'abc', type: 'email' }))).rejects.toThrow(
      'REDIRECT:/login?confirmed=1'
    )
    expect(confirmEmailAddress).toHaveBeenCalledWith('abc', 'email')
  })

  it('says so on the sign-in page when the link no longer works', async () => {
    confirmEmailAddress.mockResolvedValue(false)
    await expect(confirmEmailAction(form({ token_hash: 'abc', type: 'signup' }))).rejects.toThrow(
      'REDIRECT:/login?confirmed=invalid'
    )
  })

  it('never passes a sign-in token type through', async () => {
    await expect(
      confirmEmailAction(form({ token_hash: 'abc', type: 'recovery' }))
    ).rejects.toThrow('REDIRECT:/login?confirmed=invalid')
    expect(confirmEmailAddress).not.toHaveBeenCalled()
  })

  it('refuses a form with no token', async () => {
    await expect(confirmEmailAction(form({ type: 'email' }))).rejects.toThrow(
      'REDIRECT:/login?confirmed=invalid'
    )
    expect(confirmEmailAddress).not.toHaveBeenCalled()
  })
})
