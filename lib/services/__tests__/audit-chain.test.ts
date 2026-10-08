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

  it('fails when the chain branches', () => {
    const links = chain(3)
    const branch = { ...links[2], action: 'A second entry after the same one' }
    branch.current_hash = createAuditHash(links[1].current_hash, {
      userId: branch.user_id,
      eventType: branch.event_type,
      action: branch.action,
      timestamp: new Date(branch.timestamp),
    })
    expect(verifyAuditChain([...links, branch])).toBe(false)
  })

  it('fails when an entry is reordered by rewriting its link', () => {
    const links = chain(4)
    const [first, second] = links
    const swapped = [{ ...second, previous_hash: null }, { ...first, previous_hash: second.current_hash }, ...links.slice(2)]
    expect(verifyAuditChain(swapped)).toBe(false)
  })
})
