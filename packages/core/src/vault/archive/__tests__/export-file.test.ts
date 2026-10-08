import { Blob as NodeBlob } from 'buffer'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { readHealthExport } from '..'

const FIXTURES = join(__dirname, '..', '..', '__tests__', 'fixtures')
// jsdom's Blob has no arrayBuffer() or stream(), which every browser's has, so the tests use Node's.
const blob = (content: string | Uint8Array) => new NodeBlob([content]) as unknown as Blob
const file = (...path: string[]) => blob(readFileSync(join(FIXTURES, ...path)))

describe('readHealthExport', () => {
  it('reads Apple Health straight from export.zip, ignoring the other files in it', async () => {
    const fractions: number[] = []
    const result = await readHealthExport(file('apple-health', 'apple-health-export.zip'), (fraction) =>
      fractions.push(fraction)
    )

    expect(result?.provider).toBe('apple-health')
    const counts = Object.fromEntries(
      ['fitness_daily', 'vitals_daily', 'body_measurement', 'nutrition_daily', 'sleep_session', 'fitness_activity'].map(
        (type) => [type, result!.records.filter((record) => record.schemaType === type).length]
      )
    )
    expect(counts).toEqual({
      fitness_daily: 3,
      vitals_daily: 3,
      body_measurement: 2,
      nutrition_daily: 1,
      sleep_session: 1,
      fitness_activity: 1,
    })
    expect(result!.records.find((record) => record.schemaType === 'sleep_session')?.data).toMatchObject({
      asleep_min: 420,
      deep_min: 60,
      rem_min: 60,
      light_min: 300,
      awake_min: 15,
      efficiency_pct: 96.6,
    })
    expect(fractions.at(-1)).toBe(1)
  })

  it('reads the same records from the unzipped export.xml', async () => {
    const zipped = await readHealthExport(file('apple-health', 'apple-health-export.zip'))
    const unzipped = await readHealthExport(file('apple-health', 'export.xml'))
    expect(unzipped).toEqual(zipped)
  })

  it('leaves any other file to the ordinary import', async () => {
    expect(await readHealthExport(blob('[{"label":"Not a health export"}]'))).toBeNull()
    expect(await readHealthExport(file('zip', 'basic.zip'))).not.toBeNull()
    expect(await readHealthExport(file('zip', 'unicode-name.zip'))).toBeNull()
  })
})
