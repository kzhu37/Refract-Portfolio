const BASE_WIDTH = 1200
const BASE_HEIGHT = 675

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function drawDetailPlate(ctx: CanvasRenderingContext2D): void {
  const cx = 960
  const cy = 222

  ctx.fillStyle = '#0a1028'
  roundedRect(ctx, 770, 82, 390, 290, 18)
  ctx.fill()

  const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 142)
  glow.addColorStop(0, 'rgba(123,92,240,0.34)')
  glow.addColorStop(0.45, 'rgba(75,138,240,0.13)')
  glow.addColorStop(1, 'rgba(7,11,30,0)')
  ctx.fillStyle = glow
  ctx.fillRect(790, 96, 340, 248)

  ctx.save()
  ctx.translate(cx, cy)
  for (let i = 0; i < 36; i += 1) {
    const angle = (i / 36) * Math.PI * 2
    const inner = 24 + (i % 3) * 7
    const outer = 106 + (i % 4) * 7
    line(
      ctx,
      Math.cos(angle) * inner,
      Math.sin(angle) * inner,
      Math.cos(angle) * outer,
      Math.sin(angle) * outer,
      i % 6 === 0 ? '#8cb7ff' : 'rgba(103,148,224,0.48)',
      i % 6 === 0 ? 1.4 : 0.7,
    )
  }
  for (const radius of [28, 54, 82, 112]) {
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.strokeStyle = radius === 82 ? 'rgba(123,92,240,0.7)' : 'rgba(139,173,200,0.35)'
    ctx.lineWidth = radius === 82 ? 1.4 : 0.75
    ctx.stroke()
  }
  ctx.fillStyle = '#eaf2ff'
  ctx.beginPath()
  ctx.arc(0, 0, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = '#8badc8'
  ctx.font = '500 11px Inter, Arial, sans-serif'
  ctx.fillText('DIRECTIONAL DETAIL PLATE', 794, 112)
  ctx.fillStyle = '#f8fbff'
  ctx.font = '600 15px Inter, Arial, sans-serif'
  ctx.fillText('High-frequency edges', 794, 340)
  ctx.fillStyle = '#7891b2'
  ctx.font = '400 11px Inter, Arial, sans-serif'
  ctx.fillText('Move the focal region across the fine lines.', 794, 358)
}

function drawVectorLandscape(ctx: CanvasRenderingContext2D): void {
  const x = 48
  const y = 412
  const width = 700
  const height = 215

  ctx.save()
  roundedRect(ctx, x, y, width, height, 16)
  ctx.clip()

  const sky = ctx.createLinearGradient(0, y, 0, y + height)
  sky.addColorStop(0, '#d9e9ff')
  sky.addColorStop(0.54, '#edf4ff')
  sky.addColorStop(1, '#cbdaf1')
  ctx.fillStyle = sky
  ctx.fillRect(x, y, width, height)

  ctx.fillStyle = '#f8fbff'
  ctx.beginPath()
  ctx.arc(x + 570, y + 58, 25, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(75,138,240,0.45)'
  ctx.lineWidth = 1
  for (let r = 34; r <= 62; r += 9) {
    ctx.beginPath()
    ctx.arc(x + 570, y + 58, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.fillStyle = '#607da8'
  ctx.beginPath()
  ctx.moveTo(x, y + 172)
  ctx.lineTo(x + 150, y + 78)
  ctx.lineTo(x + 273, y + 171)
  ctx.lineTo(x + 400, y + 62)
  ctx.lineTo(x + 545, y + 171)
  ctx.lineTo(x + 700, y + 96)
  ctx.lineTo(x + width, y + height)
  ctx.lineTo(x, y + height)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#0f2447'
  ctx.beginPath()
  ctx.moveTo(x, y + 198)
  ctx.lineTo(x + 184, y + 121)
  ctx.lineTo(x + 340, y + 195)
  ctx.lineTo(x + 506, y + 116)
  ctx.lineTo(x + 700, y + 190)
  ctx.lineTo(x + width, y + height)
  ctx.lineTo(x, y + height)
  ctx.closePath()
  ctx.fill()

  for (let i = 0; i < 13; i += 1) {
    const yy = y + 139 + i * 6.2
    ctx.beginPath()
    ctx.moveTo(x, yy)
    ctx.bezierCurveTo(x + 150, yy - 13, x + 350, yy + 11, x + width, yy - 3)
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(223,237,255,0.7)' : 'rgba(170,197,232,0.47)'
    ctx.lineWidth = i % 3 === 0 ? 1.2 : 0.65
    ctx.stroke()
  }

  ctx.restore()
  ctx.strokeStyle = '#9bb3d2'
  ctx.lineWidth = 1
  roundedRect(ctx, x, y, width, height, 16)
  ctx.stroke()
}

/**
 * Draws original, license-free Canvas 2D material with text, fine patterns,
 * high-contrast edges, and a vector image. The browser adapter uploads this
 * page-owned canvas to Refract's existing WebGL correction renderer.
 */
export function drawDemoScene(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')

  const sx = canvas.width / BASE_WIDTH
  const sy = canvas.height / BASE_HEIGHT
  ctx.setTransform(sx, 0, 0, sy, 0, 0)
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT)

  ctx.fillStyle = '#f6f9ff'
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT)

  ctx.fillStyle = '#eef4fd'
  ctx.fillRect(0, 0, BASE_WIDTH, 62)
  line(ctx, 0, 62, BASE_WIDTH, 62, '#ccd9ea')
  ctx.fillStyle = '#132746'
  ctx.font = '700 17px Inter, Arial, sans-serif'
  ctx.fillText('REFRACT / DETAIL WORKSPACE', 42, 38)
  ctx.fillStyle = '#577497'
  ctx.font = '500 11px JetBrains Mono, monospace'
  ctx.fillText('PAGE-OWNED CANVAS · LIVE WEBGL2 PASS', 832, 37)

  ctx.fillStyle = '#0f2447'
  ctx.font = '700 34px Inter, Arial, sans-serif'
  ctx.fillText('Precision begins at the edge.', 48, 112)
  ctx.fillStyle = '#476485'
  ctx.font = '400 15px Inter, Arial, sans-serif'
  ctx.fillText('A useful correction pipeline must preserve detail, colour, and brightness', 48, 142)
  ctx.fillText('while remaining localized, reversible, and responsive to attention.', 48, 164)

  ctx.fillStyle = '#ffffff'
  roundedRect(ctx, 48, 190, 330, 194, 14)
  ctx.fill()
  ctx.strokeStyle = '#cbd8ea'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = '#294567'
  ctx.font = '600 12px Inter, Arial, sans-serif'
  ctx.fillText('FINE TEXT SAMPLE', 68, 218)
  ctx.fillStyle = '#162b49'
  ctx.font = '600 17px Inter, Arial, sans-serif'
  ctx.fillText('Readable systems expose their tradeoffs.', 68, 249)
  ctx.fillStyle = '#405d7f'
  ctx.font = '400 12px Inter, Arial, sans-serif'
  const bodyLines = [
    'A stronger filter may emphasize small structure,',
    'but it can also create ringing or reduce comfort.',
    'Refract separates luminance from chroma, fades the',
    'focal boundary, and protects minimum brightness.',
  ]
  bodyLines.forEach((text, index) => ctx.fillText(text, 68, 278 + index * 20))
  ctx.fillStyle = '#617d9e'
  ctx.font = '400 9px JetBrains Mono, monospace'
  ctx.fillText('MICRO TYPE 09PX  •  ENERGY-NORMALIZED KERNEL  •  FRAME 01', 68, 365)

  ctx.fillStyle = '#0a1028'
  roundedRect(ctx, 398, 190, 350, 194, 14)
  ctx.fill()
  ctx.fillStyle = '#90a9ca'
  ctx.font = '600 11px JetBrains Mono, monospace'
  ctx.fillText('ACTIVE OPTICS PATH', 420, 216)
  ctx.fillStyle = '#f0f5ff'
  ctx.font = '500 13px JetBrains Mono, monospace'
  ctx.fillText('PSF(x,y) = exp(-½ · rᵀΣ⁻¹r)', 420, 248)
  ctx.fillStyle = '#8badc8'
  ctx.fillText('base kernel = 2I - PSF', 420, 276)
  ctx.fillText('browser showcase gain = 7x', 420, 304)
  line(ctx, 420, 324, 716, 324, 'rgba(75,138,240,0.42)')
  for (let i = 0; i < 29; i += 1) {
    const h = 4 + Math.abs(Math.sin(i * 0.82)) * 22
    const xx = 421 + i * 10.1
    line(ctx, xx, 356 - h, xx, 356 + h * 0.22, i === 14 ? '#ffffff' : '#4b8af0', i === 14 ? 2 : 0.8)
  }
  ctx.fillStyle = '#6f89ad'
  ctx.font = '400 9px JetBrains Mono, monospace'
  ctx.fillText('NORMALIZED UNSHARP CORRECTION KERNEL', 420, 372)

  drawDetailPlate(ctx)
  drawVectorLandscape(ctx)

  ctx.fillStyle = '#ffffff'
  roundedRect(ctx, 770, 392, 390, 235, 16)
  ctx.fill()
  ctx.strokeStyle = '#cbd8ea'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = '#294567'
  ctx.font = '600 12px Inter, Arial, sans-serif'
  ctx.fillText('EDGE / LINE RESOLUTION', 794, 422)
  for (let group = 0; group < 4; group += 1) {
    const startX = 794 + group * 88
    const spacing = 9 - group * 1.8
    for (let i = 0; i < 10; i += 1) {
      line(ctx, startX + i * spacing, 445, startX + i * spacing, 514, '#152b4b', group === 3 ? 0.65 : 1)
    }
  }
  for (let row = 0; row < 5; row += 1) {
    const yy = 540 + row * 14
    line(ctx, 794, yy, 1134, yy, row % 2 ? '#6f8cad' : '#173151', row === 4 ? 0.6 : 1)
  }
  ctx.fillStyle = '#577497'
  ctx.font = '400 10px JetBrains Mono, monospace'
  ctx.fillText('9px', 794, 526)
  ctx.fillText('7px', 882, 526)
  ctx.fillText('5px', 970, 526)
  ctx.fillText('3px', 1058, 526)
  ctx.fillStyle = '#2b4869'
  ctx.font = '500 11px Inter, Arial, sans-serif'
  ctx.fillText('Fine spacing makes localized edge changes inspectable.', 794, 608)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
}