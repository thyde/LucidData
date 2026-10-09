import { describe, expect, it } from 'vitest'
import { createAuditHash } from '@/lib/crypto/hashing'
import { SEAL_EVENT, sealedEnds, verifyAuditChain } from '@/lib/services/audit.service'

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

/** An entry linked to `previous`, hashed as the audit service hashes one. */
function linked(previous: string | null, action: string, eventType = 'data_accessed', second = 0): Link {
  const timestamp = new Date(Date.UTC(2026, 9, 9, 6, 0, second))
  return {
    user_id: 'user-1',
    event_type: eventType,
    action,
    timestamp: timestamp.toISOString(),
    previous_hash: previous,
    current_hash: createAuditHash(previous, { userId: 'user-1', eventType, action, timestamp }),
  }
}

/** A log that branched before 2026-10-09, sealed the way the migration seals one. */
function sealedLog(): { links: Link[]; branchEnd: Link; seal: Link } {
  const base = chain(3)
  const branchEnd = linked(base[1].current_hash, 'A second entry after the same one', 'data_accessed', 1)
  const seal = linked(base[2].current_hash, `Sealed 1 earlier branch end of this log: ${branchEnd.current_hash}`, SEAL_EVENT, 2)
  return { links: [...base, branchEnd, seal], branchEnd, seal }
}

describe('verifyAuditChain with the head and sealed ends', () => {
  it('accepts a sealed log whose head is the seal', () => {
    const { links, seal } = sealedLog()
    expect(verifyAuditChain(links, seal.current_hash)).toBe(true)
  })

  it('fails when the end of an old branch is removed, because the seal names it', () => {
    const { links, branchEnd, seal } = sealedLog()
    const without = links.filter((link) => link !== branchEnd)
    expect(verifyAuditChain(without, seal.current_hash)).toBe(false)
    // Without the head it is the seal alone that catches it.
    expect(verifyAuditChain(without)).toBe(false)
  })

  it('fails when the newest entry is removed, because the head names it', () => {
    const links = chain(5)
    expect(verifyAuditChain(links.slice(0, 4), links[4].current_hash)).toBe(false)
    expect(verifyAuditChain(links, links[4].current_hash)).toBe(true)
  })

  it('fails on an end that is neither the head nor sealed, such as a branch planted later', () => {
    const links = chain(4)
    const planted = linked(links[1].current_hash, 'An entry nobody appended', 'data_accessed', 9)
    expect(verifyAuditChain([...links, planted], links[3].current_hash)).toBe(false)
  })

  it('accepts entries appended after the head was read', () => {
    const links = chain(4)
    const later = linked(links[3].current_hash, 'Appended while the log was read', 'data_accessed', 5)
    const latest = linked(later.current_hash, 'And another', 'data_accessed', 6)
    expect(verifyAuditChain([...links, later, latest], links[3].current_hash)).toBe(true)
  })

  it('fails on a seal whose action lists nothing it can name', () => {
    const links = chain(2)
    const seal = linked(links[1].current_hash, 'Sealed the log', SEAL_EVENT, 3)
    expect(verifyAuditChain([...links, seal], seal.current_hash)).toBe(false)
  })

  it('treats a log without a head as intact only when it is empty', () => {
    expect(verifyAuditChain([], null)).toBe(true)
    expect(verifyAuditChain(chain(2), null)).toBe(false)
  })

  it('reads the ends a seal lists', () => {
    expect(sealedEnds('Sealed 2 earlier branch ends of this log: aa, bb')).toEqual(['aa', 'bb'])
    expect(sealedEnds('Sealed 1 earlier branch end of this log: aa')).toEqual(['aa'])
    expect(sealedEnds('Read entry 4')).toBeNull()
  })
})
