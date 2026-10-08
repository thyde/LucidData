/**
 * Unit conversion for health exports.
 *
 * Exports keep each value in the unit the device or the person chose: a scale
 * in the US writes pounds, one in Europe kilograms. Every value is converted
 * to the unit its LD-209 field names. A unit not listed here is refused rather
 * than guessed at, because a wrong guess is a silent unit mix-up in a health
 * record.
 */

export type Converter = (value: number, unit: string | undefined) => number | null

function scaled(table: Record<string, number>): Converter {
  return (value, unit) => {
    const factor = unit === undefined ? undefined : table[unit]
    return factor === undefined ? null : value * factor
  }
}

/** A value whose unit must be exactly one of these, and is used as it is. */
export function exactly(...units: string[]): Converter {
  return (value, unit) => (unit !== undefined && units.includes(unit) ? value : null)
}

export const toKilograms = scaled({ kg: 1, g: 0.001, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318 })
export const toCentimetres = scaled({ cm: 1, m: 100, mm: 0.1, in: 2.54, ft: 30.48 })
export const toKilometres = scaled({ km: 1, m: 0.001, cm: 0.00001, mi: 1.609344, yd: 0.0009144, ft: 0.0003048 })
export const toKilocalories = scaled({ kcal: 1, Cal: 1, cal: 0.001, kJ: 1 / 4.184, J: 1 / 4184 })
export const toMillilitres = scaled({
  mL: 1,
  ml: 1,
  L: 1000,
  l: 1000,
  dL: 100,
  fl_oz_us: 29.5735295625,
  fl_oz_imp: 28.4130625,
  cup_us: 236.5882365,
})
export const toGrams = scaled({ g: 1, mg: 0.001, mcg: 0.000001, kg: 1000, oz: 28.349523125 })
export const toMilligrams = scaled({ mg: 1, g: 1000, mcg: 0.001 })
export const toMinutes = scaled({ min: 1, s: 1 / 60, sec: 1 / 60, h: 60, hr: 60 })

export const toCelsius: Converter = (value, unit) => {
  if (unit === 'degC') return value
  if (unit === 'degF') return ((value - 32) * 5) / 9
  if (unit === 'K') return value - 273.15
  return null
}

/**
 * Apple writes a percentage as a fraction (0.97 for 97 percent) under the unit
 * `%`. A value above 1 is already a percentage.
 */
export const toPercent: Converter = (value, unit) => {
  if (unit !== '%') return null
  return value <= 1 ? value * 100 : value
}

export function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}
