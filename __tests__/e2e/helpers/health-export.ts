import { deflateRawSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * A zip of deflated files, laid out as common tools write one: local headers,
 * then the central directory, then its end record. Enough for a test to build
 * an export with today's dates instead of shipping one that goes stale.
 */
export function zip(files: { name: string; content: string | Uint8Array }[]): Buffer {
  const parts: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const data = typeof file.content === 'string' ? Buffer.from(file.content, 'utf8') : Buffer.from(file.content)
    const packed = deflateRawSync(data)
    const name = Buffer.from(file.name, 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // names are UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0x21, 12) // 1 January 1980
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    parts.push(local, name, packed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    directory.push(central, name)

    offset += local.length + name.length + packed.length
  }
  const size = directory.reduce((total, part) => total + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(size, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...directory, end])
}

const pad = (value: number) => String(value).padStart(2, '0')

/** A UTC date as Apple Health writes it: `2026-09-14 06:30:00 +0000`. */
function appleTime(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * An Apple Health `export.zip` holding a year of days up to yesterday: steps,
 * active energy, resting heart rate, and a night of sleep each day, a run
 * every other day, and a weigh-in each week. About 1,330 vault entries once read.
 */
export function appleHealthYear(now = new Date()): { buffer: Buffer; days: number } {
  return appleHealthDays(365, now)
}

/** The same export over any number of days up to yesterday, for a test that needs only a few. */
export function appleHealthDays(days: number, now = new Date()): { buffer: Buffer; days: number } {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const lines: string[] = []
  for (let back = days; back >= 1; back--) {
    const day = midnight - back * DAY_MS
    const at = (hours: number, minutes = 0) => appleTime(new Date(day + hours * 3600000 + minutes * 60000))
    const quantity = (type: string, unit: string, value: number | string, start: string, end = start) =>
      `<Record type="HKQuantityTypeIdentifier${type}" sourceName="Watch" sourceVersion="11.0" unit="${unit}" creationDate="${end}" startDate="${start}" endDate="${end}" value="${value}"/>`
    lines.push(quantity('StepCount', 'count', 6000 + ((back * 37) % 4000), at(9), at(18)))
    lines.push(quantity('ActiveEnergyBurned', 'kcal', 300 + ((back * 13) % 400), at(9), at(18)))
    lines.push(quantity('RestingHeartRate', 'count/min', 52 + (back % 9), at(6)))
    if (back % 7 === 0) lines.push(quantity('BodyMass', 'kg', (72 + ((back % 20) - 10) / 10).toFixed(1), at(7)))
    lines.push(
      `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" sourceVersion="11.0" creationDate="${at(6, 30)}" startDate="${at(-1)}" endDate="${at(6, 30)}" value="HKCategoryValueSleepAnalysisAsleepCore"/>`
    )
    if (back % 2 === 0) {
      lines.push(
        `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" sourceName="Watch" sourceVersion="11.0" creationDate="${at(18, 31)}" startDate="${at(18)}" endDate="${at(18, 30)}"></Workout>`
      )
    }
  }
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<HealthData locale="en_US">',
    ` <ExportDate value="${appleTime(now)}"/>`,
    ' <Me HKCharacteristicTypeIdentifierDateOfBirth="" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexNotSet"/>',
    ...lines.map((line) => ` ${line}`),
    '</HealthData>',
  ].join('\n')
  return { buffer: zip([{ name: 'apple_health_export/export.xml', content: xml }]), days }
}
