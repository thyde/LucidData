import { describe, expect, it } from 'vitest'
import { createAuditHash } from '@/lib/crypto/hashing'
import { verifyAuditChain } from '@/lib/services/audit.service'

type Link = Parameters<typeof verifyAuditChain>[0][number]

/** A real chain, built the way createAuditEntry builds one. */
function chain(length: number, timestampOf = (index: number) => new Date(Date.UTC(2026, 9, 8, 12, 0, index))): Link[] {
  const links: Link[] = []
  let previous: string | null = null
  for (let index = 0; index < length; index++) {
    const timestamp = timestampOf(index)
    const entry = { userId: 'user-1', eventType: 'data_accessed', action: `Read entry ${index}`, timestamp }
    const current = createAuditHash(previous, entry)
    links.push({
      user_id: 'user-1',
      event_type: entry.eventType,
      action: entry.action,
      timestamp: timestamp.toISOString(),
      previous_hash: previous,
      current_hash: current,
    })
    previous = current
  }
  return links
}

describe('verifyAuditChain', () => {
  it('verifies a whole chain, in any order it arrives', () => {
    const links = chain(250)
    expect(verifyAuditChain(links)).toBe(true)
    expect(verifyAuditChain([...links].reverse())).toBe(true)
    expect(verifyAuditChain([...links].sort((a, b) => a.current_hash.localeCompare(b.current_hash)))).toBe(true)
  })

  it('follows the links when events share a millisecond', () => {
    const sameInstant = chain(5, () => new Date(Date.UTC(2026, 9, 8, 12, 0, 0)))
    expect(verifyAuditChain(sameInstant)).toBe(true)
  })

  it('treats an empty log as intact', () => {
    expect(verifyAuditChain([])).toBe(true)
  })

  it('fails when an entry is changed', () => {
    const links = chain(10)
    links[4] = { ...links[4], action: 'Read nothing at all' }
    expect(verifyAuditChain(links)).toBe(false)
  })

  it('fails when an entry is removed from the middle', () => {
    const links = chain(10)
    expect(verifyAuditChain([...links.slice(0, 4), ...links.slice(5)])).toBe(false)
  })

  it('fails on only the latest part of a chain, so callers must check all of it', () => {
    expect(verifyAuditChain(chain(150).slice(50))).toBe(false)
  })

  it('accepts two entries after the same one, as two requests appending at once produce', () => {
    const links = chain(3)
    const branch = { ...links[2], action: 'A second entry after the same one' }
    branch.current_hash = createAuditHash(links[1].current_hash, {
      userId: branch.user_id,
      eventType: branch.event_type,
      action: branch.action,
      timestamp: new Date(branch.timestamp),
    })
    expect(verifyAuditChain([...links, branch])).toBe(true)
  })

  it('accepts a second chain begun by a writer that could not see the latest entry', () => {
    // Before 2026-10-09 a scheduled job wrote without the person's session, saw
    // no earlier entry, and started over. The entries themselves are intact.
    const first = chain(3)
    const second = chain(2, (index) => new Date(Date.UTC(2026, 9, 9, 3, 0, index))).map((link) => ({
      ...link,
      event_type: 'consent_expired',
    }))
    const rehashed = second.reduce<Link[]>((links, link) => {
      const previous = links.length ? links[links.length - 1].current_hash : null
      const current = createAuditHash(previous, {
        userId: link.user_id,
        eventType: link.event_type,
        action: link.action,
        timestamp: new Date(link.timestamp),
      })
      return [...links, { ...link, previous_hash: previous, current_hash: current }]
    }, [])
    expect(verifyAuditChain([...first, ...rehashed])).toBe(true)
  })

  it('fails when an entry points at one that was never recorded', () => {
    const links = chain(4)
    const forged = { ...links[3], previous_hash: 'f'.repeat(64) }
    forged.current_hash = createAuditHash(forged.previous_hash, {
      userId: forged.user_id,
      eventType: forged.event_type,
      action: forged.action,
      timestamp: new Date(forged.timestamp),
    })
    expect(verifyAuditChain([...links.slice(0, 3), forged])).toBe(false)
  })

  it('fails when an entry is reordered by rewriting its link', () => {
    const links = chain(4)
    const [first, second] = links
    const swapped = [{ ...second, previous_hash: null }, { ...first, previous_hash: second.current_hash }, ...links.slice(2)]
    expect(verifyAuditChain(swapped)).toBe(false)
  })
})
