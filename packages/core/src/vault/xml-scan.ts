/**
 * LD-210 streaming XML tag scanner.
 *
 * Finds the opening and closing tags of chosen elements in XML that arrives in
 * pieces, without building a document. A health export's XML can be several
 * gigabytes, which no browser can hold as a DOM, and the records worth reading
 * are flat elements whose attributes carry everything, so scanning is enough.
 *
 * Safe only on machine-written XML with a fixed element shape, such as Apple
 * Health's export. It ignores text, comments, and processing instructions, and
 * does not check that the document is well formed.
 */

export interface ScannedTag {
  name: string
  /** True for `</Name>`. */
  closing: boolean
  /** True for `<Name ... />`. */
  selfClosing: boolean
  attributes: Record<string, string>
}

/** The longest a tag can grow while incomplete before the file is treated as malformed. */
const MAX_PENDING = 4 * 1024 * 1024

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Pull attributes out of a tag. Handles both quote styles and decodes the XML entities. */
export function readAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    attributes[match[1]] = decodeEntities(match[2] ?? match[3] ?? '')
  }
  return attributes
}

export function decodeEntities(value: string): string {
  return value.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-fA-F]+);/g, (entity, code: string) => {
    switch (code) {
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'quot':
        return '"'
      case 'apos':
        return "'"
      case 'amp':
        return '&'
      default: {
        const point = code.startsWith('#x') ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : entity
      }
    }
  })
}

/**
 * Yield every tag named in `names`, in document order, from text that arrives
 * in chunks split anywhere, including inside a tag or a quoted value.
 */
export async function* scanTags(
  chunks: AsyncIterable<string> | Iterable<string>,
  names: readonly string[]
): AsyncGenerator<ScannedTag> {
  const alternatives = names.map(escapeName).join('|')
  // Quoted values are matched whole, so a '>' inside one does not end the tag.
  const tag = new RegExp(`<(\\/?)(${alternatives})(?=[\\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>`, 'g')
  const start = new RegExp(`<\\/?(?:${alternatives})(?=[\\s/>]|$)`)
  const keepWhenIdle = Math.max(...names.map((name) => name.length)) + 2

  let buffer = ''
  for await (const chunk of chunks) {
    buffer += chunk
    let consumed = 0
    tag.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = tag.exec(buffer)) !== null) {
      const body = match[3]
      yield {
        name: match[2],
        closing: match[1] === '/',
        selfClosing: body.trimEnd().endsWith('/'),
        attributes: match[1] === '/' ? {} : readAttributes(body),
      }
      consumed = match.index + match[0].length
    }

    // Keep a tag that has started but not finished, or else just enough to
    // recognise a name split across two chunks.
    const rest = buffer.slice(consumed)
    const pending = rest.search(start)
    buffer = pending >= 0 ? rest.slice(pending) : rest.slice(-keepWhenIdle)
    if (buffer.length > MAX_PENDING) {
      throw new Error('This file is not well-formed XML: a tag never ends.')
    }
  }
}

/** Turn a ReadableStream of text, such as a File's, into chunks the scanner reads. */
export async function* streamText(stream: ReadableStream<string>): AsyncGenerator<string> {
  const reader = stream.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      yield value
    }
  } finally {
    reader.releaseLock()
  }
}
