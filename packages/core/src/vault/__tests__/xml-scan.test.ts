import { describe, expect, it } from 'vitest'
import { decodeEntities, readAttributes, scanTags, type ScannedTag } from '../xml-scan'

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary)*)>
<!ATTLIST Record type CDATA #REQUIRED>
]>
<HealthData locale="en_US">
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Sam&apos;s Scale" unit="kg" value="72.4" startDate="2026-10-07 07:00:00 -0700"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" device="&lt;&lt;HKDevice: 0x1&gt;, name:Apple Watch&gt;" value="HKCategoryValueSleepAnalysisAsleepDeep" startDate="2026-10-07 01:00:00 -0700" endDate="2026-10-07 02:00:00 -0700">
  <MetadataEntry key="HKTimeZone" value="America/Los_Angeles"/>
 </Record>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" note='says "go" > stop' startDate="2026-10-07 18:00:00 -0700">
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="5.1" unit="km"/>
 </Workout>
</HealthData>
`

const NAMES = ['Record', 'Workout', 'WorkoutStatistics']

async function collect(chunks: string[], names = NAMES): Promise<ScannedTag[]> {
  const tags: ScannedTag[] = []
  for await (const tag of scanTags(chunks, names)) tags.push(tag)
  return tags
}

describe('scanTags', () => {
  it('finds opening, self-closing, and closing tags in order', async () => {
    const tags = await collect([SAMPLE])

    expect(tags.map((tag) => `${tag.closing ? '/' : ''}${tag.name}${tag.selfClosing ? '/' : ''}`)).toEqual([
      'Record/',
      'Record',
      '/Record',
      'Workout',
      'WorkoutStatistics/',
      '/Workout',
    ])
  })

  it('decodes attributes, including quoted values that hold quotes and angle brackets', async () => {
    const [scale, sleep, , run, distance] = await collect([SAMPLE])

    expect(scale.attributes).toMatchObject({ sourceName: "Sam's Scale", unit: 'kg', value: '72.4' })
    expect(sleep.attributes.device).toBe('<<HKDevice: 0x1>, name:Apple Watch>')
    expect(run.attributes.note).toBe('says "go" > stop')
    expect(run.attributes.workoutActivityType).toBe('HKWorkoutActivityTypeRunning')
    expect(distance.attributes).toMatchObject({ sum: '5.1', unit: 'km' })
  })

  it('reads the same tags however the text is split', async () => {
    const whole = await collect([SAMPLE])
    for (let cut = 1; cut < SAMPLE.length; cut++) {
      const split = await collect([SAMPLE.slice(0, cut), SAMPLE.slice(cut)])
      expect(split, `split at ${cut}`).toEqual(whole)
    }
  })

  it('reads the same tags from many small pieces', async () => {
    const whole = await collect([SAMPLE])
    for (const size of [1, 2, 3, 7, 64]) {
      const pieces: string[] = []
      for (let at = 0; at < SAMPLE.length; at += size) pieces.push(SAMPLE.slice(at, at + size))
      expect(await collect(pieces), `pieces of ${size}`).toEqual(whole)
    }
  })

  it('ignores declarations and elements it was not asked for', async () => {
    const tags = await collect([SAMPLE], ['Record'])
    expect(tags.map((tag) => tag.name)).toEqual(['Record', 'Record', 'Record'])
  })

  it('gives up on a tag that never ends', async () => {
    const endless = ['<Record value="', 'x'.repeat(5 * 1024 * 1024)]
    await expect(collect(endless)).rejects.toThrow('a tag never ends')
  })
})

describe('attribute helpers', () => {
  it('decode named and numeric entities and leave unknown ones alone', () => {
    expect(decodeEntities('&lt;&amp;&gt; &#233; &#x2764; &bogus;')).toBe('<&> é ❤ &bogus;')
    expect(readAttributes(` a="1" b='two' c = "3"`)).toEqual({ a: '1', b: 'two', c: '3' })
  })
})
