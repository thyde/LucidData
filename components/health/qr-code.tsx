'use client'

import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/** The blank border a scanner needs around a code, in modules. */
const QUIET_ZONE = 4

/**
 * A QR code drawn as one SVG path, so it scales without blurring and prints
 * cleanly. Medium error correction survives a scuffed screen or a glare spot.
 */
export function QrCode({ value, label, size = 192 }: { value: string; label: string; size?: number }) {
  const { extent, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const count = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`
      }
    }
    return { extent: count + QUIET_ZONE * 2, path: d }
  }, [value])

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${extent} ${extent}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      data-testid="share-qr"
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
