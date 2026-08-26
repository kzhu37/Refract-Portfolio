import { useEffect, useRef } from 'react'

// -- Gabor patch renderer -------------------------------------------------------

function drawGabor(canvas: HTMLCanvasElement, frequencyCpd: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: W, height: H } = canvas
  const cx = W / 2, cy = H / 2
  const sigma = W * 0.22
  const pixelsPerCycle = W / (frequencyCpd * 2)
  const imageData = ctx.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy
      const r2 = dx * dx + dy * dy
      const gaussian = Math.exp(-r2 / (2 * sigma * sigma))
      const inCircle = Math.sqrt(r2) < W * 0.45
      const grating = inCircle ? Math.sin((2 * Math.PI * dx) / pixelsPerCycle) : 0
      const value = (gaussian * grating + 1) * 0.5
      const gray = Math.round(value * 255)
      const i = (y * W + x) * 4
      imageData.data[i]     = gray
      imageData.data[i + 1] = gray
      imageData.data[i + 2] = gray
      imageData.data[i + 3] = inCircle ? 255 : 0
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

// -- Step dots (mirrored from SnellenChart) ------------------------------------

function StepDots({ total = 5, active = 0 }: { total?: number; active?: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="rounded-full flex-shrink-0 transition-all duration-150"
          style={{
            width:      i === active ? 6 : 4,
            height:     i === active ? 6 : 4,
            background: i === active
              ? 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)'
              : '#253580',
          }}
        />
      ))}
    </div>
  )
}

// -- ContrastCheck -------------------------------------------------------------

export interface ContrastCheckProps {
  onContinue: () => void
}

export function ContrastCheck({ onContinue }: ContrastCheckProps) {
  const canvasARef = useRef<HTMLCanvasElement>(null)
  const canvasBRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasARef.current) drawGabor(canvasARef.current, 4)
    if (canvasBRef.current) drawGabor(canvasBRef.current, 8)
  }, [])

  return (
    <div
      className="w-full h-full flex flex-col bg-bg-primary"
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      {/* Header */}
      <header className="h-12 flex-shrink-0 bg-bg-base border-b border-border-subtle flex items-center px-8">
        <span className="text-caption text-text-tertiary font-primary" style={{ marginRight: 40 }}>
          refract
        </span>
        <div className="flex-1 flex items-center justify-center">
          <StepDots total={5} active={2} />
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8">

        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-heading-xl text-text-primary">Contrast check</h2>
          <p className="text-body-sm text-text-secondary" style={{ maxWidth: 340 }}>
            Which of these patterns can you see more clearly?
          </p>
        </div>

        {/* Side-by-side patches */}
        <div className="flex items-end gap-12">
          <div className="flex flex-col items-center gap-3">
            <canvas
              ref={canvasARef}
              width={160}
              height={160}
              className="rounded-full"
              style={{ background: '#000' }}
            />
            <span className="text-caption font-mono text-text-tertiary">A</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <canvas
              ref={canvasBRef}
              width={160}
              height={160}
              className="rounded-full"
              style={{ background: '#000' }}
            />
            <span className="text-caption font-mono text-text-tertiary">B</span>
          </div>
        </div>

        {/* Response buttons - all lead to onContinue, result not scored */}
        <div className="flex gap-3">
          <button
            onClick={onContinue}
            className="h-9 px-5 rounded-btn text-body-sm font-medium text-text-primary bg-bg-elevated border border-border-default cursor-pointer outline-none transition-all duration-100 hover:border-border-brand"
          >
            A is clearer
          </button>
          <button
            onClick={onContinue}
            className="h-9 px-5 rounded-btn text-body-sm font-medium text-text-secondary bg-transparent border border-border-subtle cursor-pointer outline-none transition-all duration-100 hover:border-border-default"
          >
            Same
          </button>
          <button
            onClick={onContinue}
            className="h-9 px-5 rounded-btn text-body-sm font-medium text-text-primary bg-bg-elevated border border-border-default cursor-pointer outline-none transition-all duration-100 hover:border-border-brand"
          >
            B is clearer
          </button>
        </div>

      </div>

      {/* Footer */}
      <footer className="h-12 flex-shrink-0 bg-bg-base border-t border-border-subtle" />
    </div>
  )
}

export default ContrastCheck
