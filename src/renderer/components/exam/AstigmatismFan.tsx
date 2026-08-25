import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EyeSide } from '../../lib/types/prescription'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AstigmatismFanProps {
  pixelsPerMm:  number
  eye:          EyeSide
  onComplete:   (result: {
    axis:               number | null
    estimatedCylinder:  number
    confidence:         'low' | 'medium' | 'high'
  }) => void
}

// Fan lines at 5° intervals: 0, 5, 10, ..., 175
const FAN_ANGLES = Array.from({ length: 36 }, (_, i) => i * 5)

// Labels shown at the outer arc (every 30°)
const LABEL_ANGLES = [0, 30, 60, 90, 120, 150]

function toRad(d: number): number {
  return (d * Math.PI) / 180
}

// ─── StepDots ─────────────────────────────────────────────────────────────────

function StepDots({ total = 5, active = 0 }: { total?: number; active?: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="rounded-full flex-shrink-0 transition-all duration-150"
          style={{
            width:  i === active ? 6 : 4,
            height: i === active ? 6 : 4,
            background: i === active
              ? 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)'
              : '#253580',
          }}
        />
      ))}
    </div>
  )
}

// ─── FanChart ─────────────────────────────────────────────────────────────────

const FAN_CX  = 280   // SVG horizontal centre
const FAN_OY  = 295   // origin Y (near bottom)
const FAN_R   = 260   // line length
const FAN_ARC = 270   // arc radius for baseline arc
const SVG_W   = 560
const SVG_H   = 310

function FanChart({
  selected,
  onSelect,
}: {
  selected: number | null
  onSelect: (angle: number) => void
}) {
  return (
    <div
      style={{
        width: SVG_W, flexShrink: 0,
        filter: [
          'drop-shadow(0 8px 32px rgba(0,0,0,0.85))',
          'drop-shadow(0 0 60px rgba(123,92,240,0.07))',
        ].join(' '),
      }}
    >
      <svg width={SVG_W} height={SVG_H} style={{ overflow: 'visible' }}>
        {/* Baseline arc */}
        <path
          d={`M ${FAN_CX - FAN_ARC} ${FAN_OY} A ${FAN_ARC} ${FAN_ARC} 0 0 1 ${FAN_CX + FAN_ARC} ${FAN_OY}`}
          fill="none"
          stroke="rgba(75,94,191,0.18)"
          strokeWidth={1}
        />

        {/* Fan lines */}
        {FAN_ANGLES.map(deg => {
          const isOn   = selected === deg
          const rad    = toRad(deg)
          const xEnd   = FAN_CX + FAN_R * Math.cos(rad)
          const yEnd   = FAN_OY - FAN_R * Math.sin(rad)
          return (
            <g key={deg} style={{ cursor: 'pointer' }} onClick={() => onSelect(deg)}>
              {/* Visible line */}
              <line
                x1={FAN_CX} y1={FAN_OY}
                x2={xEnd}   y2={yEnd}
                stroke={isOn ? '#4B8AF0' : 'rgba(255,255,255,0.6)'}
                strokeWidth={isOn ? 2 : 1}
                strokeLinecap="round"
              />
              {/* Wide transparent hit area */}
              <line
                x1={FAN_CX} y1={FAN_OY}
                x2={xEnd}   y2={yEnd}
                stroke="transparent"
                strokeWidth={14}
              />
              {/* Glow dot at outer end when selected */}
              {isOn && (
                <circle cx={xEnd} cy={yEnd} r={4} fill="#4B8AF0" />
              )}
            </g>
          )
        })}

        {/* Angle labels every 30° */}
        {LABEL_ANGLES.map(deg => {
          const rad     = toRad(deg)
          const lblR    = FAN_R + 22
          const lx      = FAN_CX + lblR * Math.cos(rad)
          const ly      = FAN_OY - lblR * Math.sin(rad)
          const isOn    = selected === deg
          return (
            <text
              key={`lbl-${deg}`}
              x={lx} y={ly}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={11}
              fill={isOn ? '#8BADC8' : '#4E6B8F'}
              fontFamily="Inter, sans-serif"
              fontWeight={isOn ? 500 : 400}
              style={{ pointerEvents: 'none' }}
            >
              {deg}°
            </text>
          )
        })}

        {/* Origin dot */}
        <circle cx={FAN_CX} cy={FAN_OY} r={3} fill="rgba(255,255,255,0.25)" />
      </svg>
    </div>
  )
}

// ─── BlurSample ───────────────────────────────────────────────────────────────

function BlurSample({
  direction,
  selected,
  onClick,
  uid,
}: {
  direction: 'horizontal' | 'vertical'
  selected: boolean
  onClick: () => void
  uid: string
}) {
  const filterId = `${uid}-blur-${direction}`
  const stdDev   = direction === 'horizontal' ? '5 0.4' : '0.4 5'
  const label    = direction === 'horizontal' ? 'Horizontal blur' : 'Vertical blur'

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-3 rounded-card border transition-all duration-120 cursor-pointer outline-none font-primary ${
        selected
          ? 'border-border-brand shadow-glow-brand'
          : 'border-border-subtle hover:border-border-default'
      }`}
      style={{
        width:      200,
        padding:    '20px 0 16px',
        background: selected ? 'rgba(75,138,240,0.08)' : '#0F1635',
      }}
    >
      <svg width={160} height={56} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation={stdDev} />
          </filter>
        </defs>
        <text
          x={80} y={32}
          textAnchor="middle" dominantBaseline="middle"
          fill="white"
          fontSize={22}
          fontFamily="Inter, sans-serif"
          letterSpacing="0.07em"
          fontWeight={700}
          filter={`url(#${filterId})`}
        >
          REFRACT
        </text>
      </svg>
      <span
        className="text-caption font-primary"
        style={{ color: selected ? '#FFFFFF' : '#4E6B8F' }}
      >
        {label}
      </span>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AstigmatismFan({
  pixelsPerMm:  _pixelsPerMm,
  eye,
  onComplete,
}: AstigmatismFanProps): JSX.Element {
  const navigate   = useNavigate()
  const uid        = useId()

  const [selectedLine,   setSelectedLine]   = useState<number | null>(null)
  const [blurChoice,     setBlurChoice]     = useState<'horizontal' | 'vertical' | null>(null)

  const eyeLabel  = eye === 'OD' ? 'Right' : 'Left'
  const coverSide = eye === 'OD' ? 'LEFT'  : 'RIGHT'

  const canContinue = selectedLine !== null

  function handleContinue(): void {
    if (selectedLine === null) return

    // Fan line angle is directly the refined axis.
    // Blur choice refines direction: horizontal blur easier → axis is horizontal (0°/180°).
    // For simplicity, trust the fan line as the axis since it's already ±5° precise.
    let axis = selectedLine

    // If the blur comparison was done and the user picked vertical blur as easier,
    // the cylinder blurs horizontally → axis is perpendicular to selected line.
    if (blurChoice === 'vertical') {
      axis = (selectedLine + 90) % 180
    }

    onComplete({
      axis,
      estimatedCylinder: 0, // caller provides cylinder from clock result
      confidence: blurChoice !== null ? 'high' : 'medium',
    })
  }

  return (
    <div className="w-full h-full flex flex-col bg-bg-primary">

      {/* Top bar */}
      <header className="h-12 flex-shrink-0 bg-bg-base border-b border-border-subtle flex items-center px-8">
        <span className="text-caption text-text-tertiary font-primary" style={{ marginRight: 40 }}>
          refract
        </span>
        <div className="flex-1 flex items-center justify-center">
          <StepDots total={5} active={2} />
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-caption text-text-tertiary font-primary bg-transparent border-none cursor-pointer p-0 hover:text-text-secondary transition-colors"
        >
          Exit
        </button>
      </header>

      {/* Cover-eye banner */}
      <div className="h-12 flex-shrink-0 bg-bg-overlay flex items-center justify-center">
        <span className="text-body-sm text-text-primary font-primary" style={{ fontWeight: 500 }}>
          Cover your {coverSide} eye · Testing {eyeLabel} eye
        </span>
      </div>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center overflow-y-auto" style={{ padding: '20px 32px 8px' }}>
        <div className="flex flex-col items-center font-primary" style={{ maxWidth: 640, width: '100%' }}>

          {/* Heading */}
          <h1 className="text-heading-xl text-text-primary text-center" style={{ marginBottom: 8 }}>
            Which single line looks sharpest?
          </h1>
          <p className="text-body-sm text-text-secondary text-center" style={{ marginBottom: 28 }}>
            Tap the line that appears clearest and most in focus.
            {selectedLine !== null && (
              <span className="text-text-tertiary"> ({selectedLine}° selected)</span>
            )}
          </p>

          {/* Fan chart */}
          <FanChart selected={selectedLine} onSelect={setSelectedLine} />

          {/* Blur comparison — shown after line selection */}
          {selectedLine !== null && (
            <div className="flex flex-col items-center w-full" style={{ marginTop: 28 }}>
              <div className="h-px bg-border-subtle w-full" style={{ marginBottom: 24 }} />

              <p className="text-body-sm text-text-secondary text-center" style={{ marginBottom: 18 }}>
                Which appears more readable?
              </p>

              <div className="flex gap-4">
                <BlurSample
                  direction="horizontal"
                  selected={blurChoice === 'horizontal'}
                  onClick={() => setBlurChoice('horizontal')}
                  uid={uid}
                />
                <BlurSample
                  direction="vertical"
                  selected={blurChoice === 'vertical'}
                  onClick={() => setBlurChoice('vertical')}
                  uid={uid}
                />
              </div>

              {blurChoice !== null && (
                <p className="text-caption text-text-tertiary text-center" style={{ marginTop: 12 }}>
                  Refined axis: {blurChoice === 'horizontal' ? selectedLine : (selectedLine + 90) % 180}°
                </p>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Bottom bar */}
      <footer className="h-12 flex-shrink-0 bg-bg-base border-t border-border-subtle flex items-center px-8 relative">
        <button
          onClick={() => navigate('/')}
          className="text-body-sm font-primary bg-transparent border-none cursor-pointer p-0 hover:opacity-80 transition-opacity"
          style={{ color: '#4B8AF0' }}
        >
          ← Back
        </button>

        <span className="absolute left-1/2 -translate-x-1/2 text-caption text-text-tertiary font-primary">
          {eyeLabel} eye · Step 3 of 5
        </span>

        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className="ml-auto h-8 px-4 rounded-btn text-body-sm font-semibold text-text-on-brand border-none cursor-pointer outline-none shadow-glow-brand disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          style={{ background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)' }}
        >
          Confirm →
        </button>
      </footer>
    </div>
  )
}

export default AstigmatismFan
