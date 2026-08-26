import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EyeSide } from '../../lib/types/prescription'

// --- Types & constants --------------------------------------------------------

const ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165] as const
type ClockAngle = typeof ANGLES[number]

const DIFF_OPTS = ['Slightly', 'Moderately', 'Very'] as const
type Intensity = typeof DIFF_OPTS[number]

const CYLINDER_MAP: Record<Intensity, number> = {
  Slightly:   0.375,
  Moderately: 0.75,
  Very:       1.50,
}

export interface AstigmatismClockProps {
  pixelsPerMm:  number
  eye:          EyeSide
  onComplete:   (result: {
    axis:               number | null
    estimatedCylinder:  number
    confidence:         'low' | 'medium' | 'high'
  }) => void
}

// --- Helpers ------------------------------------------------------------------

function toRad(d: number): number {
  return (d * Math.PI) / 180
}

// Circular mean for axes (values in [0, 180)).
// Doubles angles into [0, 360) to use unit-vector average, then halves back.
function circularMeanAxis(axes: number[]): number {
  if (axes.length === 1) return axes[0]
  const sinSum = axes.reduce((s, a) => s + Math.sin(toRad(a * 2)), 0)
  const cosSum = axes.reduce((s, a) => s + Math.cos(toRad(a * 2)), 0)
  let mean = (Math.atan2(sinSum, cosSum) * 180) / Math.PI / 2
  if (mean < 0) mean += 180
  return Math.round(mean)
}

// --- StepDots -----------------------------------------------------------------

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

// --- ClockDial ----------------------------------------------------------------

function ClockDial({
  sel,
  onToggle,
}: {
  sel: ClockAngle[]
  onToggle: (d: ClockAngle) => void
}) {
  const cx = 220, cy = 220, R = 200
  const lineR  = R * 0.85   // 170 - line endpoints
  const labelR = R * 1.11   // 222 - label positions

  return (
    <div
      style={{
        width: 440, height: 440, flexShrink: 0,
        filter: [
          'drop-shadow(0 12px 40px rgba(0,0,0,0.9))',
          'drop-shadow(0 0 80px rgba(123,92,240,0.08))',
        ].join(' '),
      }}
    >
      <svg width={440} height={440} style={{ overflow: 'visible' }}>
        {/* Outer glow ring */}
        <circle
          cx={cx} cy={cy} r={R + 1}
          fill="none"
          stroke="rgba(75,94,191,0.2)"
          strokeWidth={1}
        />

        {/* Black face */}
        <circle cx={cx} cy={cy} r={R} fill="#000000" stroke="rgba(75,94,191,0.18)" strokeWidth={1} />

        {/* Centre dot */}
        <circle cx={cx} cy={cy} r={2} fill="rgba(255,255,255,0.2)" />

        {/* Meridian lines - full-diameter, each angle and its 180° opposite */}
        {ANGLES.map(deg => {
          const isOn = sel.includes(deg)
          const rad  = toRad(deg)
          const x1   = cx + lineR * Math.cos(rad)
          const y1   = cy - lineR * Math.sin(rad)
          const x2   = cx - lineR * Math.cos(rad)
          const y2   = cy + lineR * Math.sin(rad)
          return (
            <g key={deg} style={{ cursor: 'pointer' }} onClick={() => onToggle(deg)}>
              {/* Visible line */}
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={isOn ? 'rgba(255,255,255,1.0)' : 'rgba(255,255,255,0.55)'}
                strokeWidth={isOn ? 2.5 : 1.5}
                strokeLinecap="round"
              />
              {/* Invisible wide hit area */}
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={22} />
              {/* Endpoint dots when selected */}
              {isOn && (
                <>
                  <circle cx={x1} cy={y1} r={3.5} fill="#FFFFFF" />
                  <circle cx={x2} cy={y2} r={3.5} fill="#FFFFFF" />
                </>
              )}
            </g>
          )
        })}

        {/* Angle labels - both ends of each diameter */}
        {ANGLES.map(deg => {
          const rad  = toRad(deg)
          const isOn = sel.includes(deg)
          const fill = isOn ? '#8BADC8' : '#4E6B8F'
          const fw   = isOn ? 500 : 400
          const lx1  = cx + labelR * Math.cos(rad)
          const ly1  = cy - labelR * Math.sin(rad)
          const lx2  = cx - labelR * Math.cos(rad)
          const ly2  = cy + labelR * Math.sin(rad)
          return (
            <g key={`lbl-${deg}`} style={{ pointerEvents: 'none' }}>
              <text
                x={lx1} y={ly1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fill={fill}
                fontFamily="Inter, sans-serif" fontWeight={fw}
              >
                {deg}°
              </text>
              <text
                x={lx2} y={ly2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fill={fill}
                fontFamily="Inter, sans-serif" fontWeight={fw}
              >
                {deg}°
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// --- AngleChips ---------------------------------------------------------------

function AngleChips({
  sel,
  onToggle,
}: {
  sel: ClockAngle[]
  onToggle: (d: ClockAngle) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {ANGLES.map(deg => {
        const on = sel.includes(deg)
        return (
          <button
            key={deg}
            onClick={() => onToggle(deg)}
            className="rounded-full border cursor-pointer outline-none transition-all duration-100 font-mono"
            style={{
              width:      56,
              height:     32,
              background: on ? 'rgba(75,138,240,0.12)' : 'transparent',
              border:     `1px solid ${on ? '#4B8AF0' : 'rgba(75,94,191,0.18)'}`,
              fontSize:   12,
              fontWeight: on ? 500 : 400,
              color:      on ? '#FFFFFF' : '#8BADC8',
              letterSpacing: '0.01em',
            }}
          >
            {deg}°
          </button>
        )
      })}
    </div>
  )
}

// --- IntensityChips -----------------------------------------------------------

function IntensityChips({
  value,
  onChange,
}: {
  value: Intensity
  onChange: (v: Intensity) => void
}) {
  return (
    <div className="flex flex-col gap-2.5 w-full">
      <span className="text-body-sm text-text-tertiary">How different?</span>
      <div className="flex gap-2">
        {DIFF_OPTS.map(opt => {
          const on = value === opt
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className="rounded-full border cursor-pointer outline-none transition-all duration-100 font-primary"
              style={{
                padding:    '0 20px',
                height:     32,
                background: on ? 'rgba(75,138,240,0.12)' : 'transparent',
                border:     `1px solid ${on ? '#4B8AF0' : 'rgba(75,94,191,0.18)'}`,
                fontSize:   13,
                fontWeight: on ? 500 : 400,
                color:      on ? '#FFFFFF' : '#8BADC8',
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// --- Main component -----------------------------------------------------------

export function AstigmatismClock({
  pixelsPerMm: _pixelsPerMm,
  eye,
  onComplete,
}: AstigmatismClockProps): JSX.Element {
  const navigate   = useNavigate()
  const [sel, setSel]           = useState<ClockAngle[]>([])
  const [intensity, setIntensity] = useState<Intensity>('Moderately')

  const eyeLabel = eye === 'OD' ? 'Right' : 'Left'
  const coverSide = eye === 'OD' ? 'LEFT' : 'RIGHT'

  function toggleAngle(deg: ClockAngle): void {
    setSel(prev =>
      prev.includes(deg)
        ? prev.filter(d => d !== deg)
        : prev.length < 3 ? [...prev, deg] : prev
    )
  }

  function handleSkip(): void {
    onComplete({ axis: null, estimatedCylinder: 0, confidence: 'low' })
  }

  function handleContinue(): void {
    if (sel.length === 0) return
    const axes      = sel.map(d => (d + 90) % 180)
    const axis      = circularMeanAxis(axes)
    const cylinder  = CYLINDER_MAP[intensity]
    const confidence = sel.length === 1 ? 'low' : sel.length === 2 ? 'medium' : 'high'
    onComplete({ axis, estimatedCylinder: cylinder, confidence })
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
      <main
        className="flex-1 flex items-center justify-center overflow-y-auto"
        style={{ padding: '20px 0 8px' }}
      >
        <div
          className="flex flex-col items-center font-primary"
          style={{ width: 680, maxWidth: 680 }}
        >
          {/* Heading */}
          <h1 className="text-heading-xl text-text-primary text-center" style={{ marginBottom: 8 }}>
            Which lines appear darkest?
          </h1>
          <p className="text-body-sm text-text-secondary text-center" style={{ marginBottom: 28 }}>
            Tap up to three. If they all look equal, tap&nbsp;'No difference'.
          </p>

          {/* Clock dial */}
          <ClockDial sel={sel} onToggle={toggleAngle} />

          {/* Angle chips */}
          <div style={{ marginTop: 20, width: '100%' }}>
            <AngleChips sel={sel} onToggle={toggleAngle} />
          </div>

          {/* Selection count */}
          <div
            className="text-caption text-text-tertiary"
            style={{ marginTop: 10, letterSpacing: '0.01em' }}
          >
            {sel.length === 0 ? 'None selected' : `${sel.length} selected`}
          </div>

          {/* Intensity - shown after ≥1 selection */}
          {sel.length > 0 && (
            <div style={{ marginTop: 14, width: '100%' }}>
              <IntensityChips value={intensity} onChange={setIntensity} />
            </div>
          )}
        </div>
      </main>

      {/* Bottom area: footer bar + "No difference" strip */}
      <div className="flex-shrink-0">
        <footer className="h-12 bg-bg-base border-t border-border-subtle flex items-center px-8 relative">
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
            disabled={sel.length === 0}
            className="ml-auto h-8 px-4 rounded-btn text-body-sm font-semibold text-text-on-brand border-none cursor-pointer outline-none shadow-glow-brand disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            style={{ background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)' }}
          >
            Continue →
          </button>
        </footer>

        {/* "No difference" footnote strip */}
        <div
          className="bg-bg-base flex items-center justify-center"
          style={{ height: 30 }}
        >
          <button
            onClick={handleSkip}
            className="text-caption text-text-tertiary font-primary bg-transparent border-none cursor-pointer p-0 hover:text-text-secondary transition-colors"
            style={{ borderBottom: '1px solid rgba(78,107,143,0.3)', lineHeight: 1.4 }}
          >
            Choose 'No difference' to skip astigmatism
          </button>
        </div>
      </div>
    </div>
  )
}

export default AstigmatismClock
