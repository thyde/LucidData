import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const runScheduledJobs = vi.fn()

vi.mock('@/lib/services/scheduled-jobs.service', () => ({
  runScheduledJobs: (...a: unknown[]) => runScheduledJobs(...a),
  isJobName: (value: string) =>
    ['payout_retries', 'consent_expiry', 'share_expiry'].includes(value),
}))

const { GET, POST } = await import('@/app/api/cron/route')

const SECRET = 'test-cron-secret'

function request(headers: Record<string, string> = {}, url = 'http://localhost/api/cron') {
  return new Request(url, { headers }) as unknown as Parameters<typeof GET>[0]
}

describe('/api/cron', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env.CRON_SECRET
    process.env.CRON_SECRET = SECRET
    runScheduledJobs.mockReset().mockResolvedValue([
      { job: 'payout_retries', processed: 0, failed: 0 },
    ])
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = saved
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await POST(request())
    expect(res.status).toBe(401)
    expect(runScheduledJobs).not.toHaveBeenCalled()
  })

  it('rejects a wrong secret', async () => {
    const res = await POST(request({ authorization: 'Bearer nope-wrong-secret!' }))
    expect(res.status).toBe(401)
    expect(runScheduledJobs).not.toHaveBeenCalled()
  })

  it('rejects every request when no secret is configured', async () => {
    delete process.env.CRON_SECRET
    const res = await POST(request({ authorization: 'Bearer anything' }))
    expect(res.status).toBe(401)
    expect(runScheduledJobs).not.toHaveBeenCalled()
  })

  it('runs every job for an authorized request', async () => {
    const res = await POST(request({ authorization: `Bearer ${SECRET}` }))
    expect(res.status).toBe(200)
    expect(runScheduledJobs).toHaveBeenCalledWith(undefined)
  })

  it('accepts GET so a platform cron can trigger it', async () => {
    const res = await GET(request({ authorization: `Bearer ${SECRET}` }))
    expect(res.status).toBe(200)
  })

  it('rejects an unknown job name', async () => {
    const res = await POST(
      request({ authorization: `Bearer ${SECRET}` }, 'http://localhost/api/cron?job=drop_tables')
    )
    expect(res.status).toBe(400)
    expect(runScheduledJobs).not.toHaveBeenCalled()
  })

  it('runs only the named job', async () => {
    const res = await POST(
      request({ authorization: `Bearer ${SECRET}` }, 'http://localhost/api/cron?job=share_expiry')
    )
    expect(res.status).toBe(200)
    expect(runScheduledJobs).toHaveBeenCalledWith('share_expiry')
  })
})
