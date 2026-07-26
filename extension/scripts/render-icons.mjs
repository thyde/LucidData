// Rasterise the extension icon to the sizes a browser store requires.
//
// Run with: node extension/scripts/render-icons.mjs
//
// The PNGs are committed rather than built on demand, because the extension is
// loaded unpacked and zipped for submission without a build step. Re-run this
// after changing icons/icon.svg.

import { readFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(here, '..', 'icons')

// 16 toolbar, 32 Windows, 48 extensions page, 128 store listing and install.
const SIZES = [16, 32, 48, 128]

const source = await readFile(join(iconsDir, 'icon.svg'))
await mkdir(iconsDir, { recursive: true })

for (const size of SIZES) {
  const out = join(iconsDir, `icon-${size}.png`)
  await sharp(source, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(`wrote icon-${size}.png`)
}
