import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrescriptionStore } from '../../lib/store/prescription-store'
import { gazeTracker } from '../../lib/eyetracking/webgazer'
import type { EyePrescription, EyeSide } from '../../lib/types/prescription'

const C = {
  bgPanel: 'rgba(9,13,36,0.97)',
  bgCard: '#0F1635',
  border: 'rgba(75,94,191,0.18)',
  borderAct: 'rgba(75,138,240,0.5)',
  accent: '#4B8AF0',
  grad: 'linear-gradient(135deg,#7B5CF0 0%,#4B8AF0 100%)',
  textPri: '#E8EDF8',
  textSec: '#7A95B8',
  textTert: '#3D5275',
  textMono: '#8BA0C0',
  green: '#34D399',
  greenBg: 'rgba(52,211,153,0.12)',
  amber: '#FBBF24',
  amberBg: 'rgba(251,191,36,0.12)',
  track: '#162045',
} as const

const FF = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
const FM = "'JetBrains Mono', 'Fira Code', monospace"

function fmtDiop(d: number): string {
  return `${d >= 0 ? '+' : '-'}${Math.abs(d).toFixed(2)}`
}

function fmtRxShort(rx: EyePrescription): string {
  const sphere = fmtDiop(rx.sphere)
  if (!rx.cylinder || rx.cylinder === 0) return `${sphere} DS`
  return `${sphere} / ${fmtDiop(rx.cylinder)} x ${rx.axis ?? 0}`
}

function Divider() {
  return <div style={{ height: 1, background: C.border, flexShrink: 0 }} />
}

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...style }}>
      {children}
    </div>
  )
}

function BigToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={on}
      aria-label="Toggle correction"
      style={{
        width: 56,
        height: 32,
        borderRadius: 32,
        background: on ? C.grad : '#1A2652',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
        padding: 0,
        boxShadow: on ? '0 0 16px rgba(75,138,240,0.4)' : 'none',
        transition: 'background 0.15s, box-shadow 0.15s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 4,
          left: on ? 28 : 4,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
          transition: 'left 0.18s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      />
    </button>
  )
}

function Seg<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 4, width: '100%' }}>
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === option}
          key={option}
          onClick={() => onChange(option)}
          style={{
            flex: 1,
            minHeight: 36,
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: FF,
            fontSize: 13,
            fontWeight: value === option ? 600 : 400,
            border: `1px solid ${value === option ? C.borderAct : C.border}`,
            background: value === option ? 'rgba(75,138,240,0.16)' : 'transparent',
            color: value === option ? C.textPri : C.textSec,
            outline: 'none',
            transition: 'all 0.12s',
            padding: '0 10px',
          }}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step?: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  const bg = `linear-gradient(to right,${C.accent} 0%,${C.accent} ${pct}%,${C.track} ${pct}%,${C.track} 100%)`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Row>
        <span style={{ fontFamily: FF, fontSize: 14, color: C.textSec }}>{label}</span>
        <span style={{ fontFamily: FM, fontSize: 14, color: C.textPri, fontWeight: 600 }}>{format(value)}</span>
      </Row>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="refract-range"
        style={{
          WebkitAppearance: 'none',
          appearance: 'none',
          width: '100%',
          height: 4,
          borderRadius: 9999,
          background: bg,
          border: 'none',
          outline: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      />
      {hint && (
        <span style={{ fontFamily: FF, fontSize: 12, color: C.textTert, lineHeight: 1.5 }}>{hint}</span>
      )}
    </div>
  )
}

type PsfView = 'psf' | 'correction'

function PsfVisualizer({
  psfData,
  correctionData,
  kernelSize,
}: {
  psfData: number[] | null
  correctionData: number[] | null
  kernelSize: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<PsfView>('psf')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const data = view === 'psf' ? psfData : correctionData
    if (!data || kernelSize === 0) {
      ctx.clearRect(0, 0, 100, 100)
      ctx.fillStyle = C.bgCard
      ctx.fillRect(0, 0, 100, 100)
      ctx.fillStyle = C.textTert
      ctx.font = '11px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('No data', 50, 54)
      return
    }

    const imageData = ctx.createImageData(kernelSize, kernelSize)
    let minValue = Infinity
    let maxValue = -Infinity
    for (const value of data) {
      minValue = Math.min(minValue, value)
      maxValue = Math.max(maxValue, value)
    }
    const range = maxValue - minValue || 1

    for (let i = 0; i < data.length; i++) {
      const brightness = Math.round(((data[i] - minValue) / range) * 255)
      imageData.data[i * 4] = Math.round(brightness * 0.4)
      imageData.data[i * 4 + 1] = Math.round(brightness * 0.6)
      imageData.data[i * 4 + 2] = brightness
      imageData.data[i * 4 + 3] = 255
    }

    const temp = document.createElement('canvas')
    temp.width = kernelSize
    temp.height = kernelSize
    temp.getContext('2d')!.putImageData(imageData, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(temp, 0, 0, 100, 100)
  }, [psfData, correctionData, view, kernelSize])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Row>
        <span style={{ fontFamily: FF, fontSize: 12, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textTert }}>
          Optical model
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['psf', 'correction'] as PsfView[]).map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setView(item)}
              style={{
                padding: '2px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: FF,
                fontSize: 12,
                background: view === item ? 'rgba(75,138,240,0.14)' : 'transparent',
                border: `1px solid ${view === item ? C.borderAct : C.border}`,
                color: view === item ? C.textPri : C.textTert,
                outline: 'none',
              }}
            >
              {item === 'psf' ? 'Modeled blur' : 'Correction'}
            </button>
          ))}
        </div>
      </Row>
      <div style={{ display: 'flex', justifyContent: 'center', background: C.bgCard, borderRadius: 10, border: `1px solid ${C.border}`, padding: 10 }}>
        <canvas ref={canvasRef} width={100} height={100} style={{ borderRadius: 4, imageRendering: 'pixelated' }} />
      </div>
    </div>
  )
}

export function CorrectionControls() {
  const navigate = useNavigate()
  const {
    prescription,
    correctionEnabled,
    correctionStrength,
    activeEye,
    fovealRadius,
    trackingMode,
    eyeTrackingCalibrated,
    isOverlayActive,
    psfCache,
    correctionKernelCache,
    toggleCorrection,
    setCorrectionStrength,
    setActiveEye,
    setFovealRadius,
    setTrackingMode,
  } = usePrescriptionStore()

  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    if (trackingMode === 'eye') {
      gazeTracker.initialize().catch(() => setTrackingMode('cursor'))
    } else {
      gazeTracker.pauseTracking()
    }
  }, [trackingMode, setTrackingMode])

  const selectedPsf = psfCache[activeEye]
  const selectedCorrection = correctionKernelCache[activeEye]
  const selectedRx = prescription?.[activeEye]
  const profileOptions: readonly EyeSide[] = ['OD', 'OS']

  return (
    <div
      className="correction-controls"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: '22px',
        background: C.bgPanel,
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        borderRadius: 18,
        border: `1px solid ${C.border}`,
        fontFamily: FF,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isOverlayActive && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,#34D399 30%,#34D399 70%,transparent)', opacity: 0.8 }} />
      )}

      <Row>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.textPri }}>refract</span>
        {isOverlayActive ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.green, background: C.greenBg, borderRadius: 5, padding: '3px 8px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
            Active
          </span>
        ) : (
          <span style={{ fontFamily: FM, fontSize: 11, color: C.textTert }}>Cmd/Ctrl Shift V</span>
        )}
      </Row>

      <Divider />

      <Row>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.textPri, marginBottom: 3 }}>Correction</div>
          <div style={{ fontSize: 13, color: C.textTert }}>{correctionEnabled ? 'Live overlay enabled' : 'Overlay ready'}</div>
        </div>
        <BigToggle on={correctionEnabled} onChange={toggleCorrection} />
      </Row>

      <Slider
        label="Strength"
        value={Math.round(correctionStrength * 100)}
        min={0}
        max={100}
        format={(value) => `${value}%`}
        onChange={(value) => setCorrectionStrength(value / 100)}
        hint="Blended once in the WebGL shader, so the slider does not leave stale kernel state."
      />

      <Divider />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 14, color: C.textSec }}>Active optical profile</span>
        <Seg label="Active optical profile" options={profileOptions} value={activeEye} onChange={setActiveEye} />
        <span style={{ fontSize: 12, color: C.textTert, lineHeight: 1.55 }}>
          The current screen-level prototype applies one eye profile at a time.
        </span>
        {selectedRx && (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: FM, fontSize: 13, color: C.textMono }}>{activeEye} {fmtRxShort(selectedRx)}</span>
            <button type="button" onClick={() => navigate('/prescription')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontFamily: FF, fontSize: 13, padding: 0 }}>
              Edit
            </button>
          </div>
        )}
      </div>

      <Divider />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span style={{ fontSize: 14, color: C.textSec }}>Tracking source</span>
        <Seg
          label="Tracking source"
          options={['Cursor', 'Eye tracking'] as const}
          value={trackingMode === 'cursor' ? 'Cursor' : 'Eye tracking'}
          onChange={(value) => setTrackingMode(value === 'Cursor' ? 'cursor' : 'eye')}
        />
        {trackingMode === 'cursor' ? (
          <span style={{ fontSize: 12, color: C.textTert, lineHeight: 1.55 }}>
            Camera-free mode follows the system pointer and is the default.
          </span>
        ) : (
          <Row>
            <span style={{ fontSize: 12, color: eyeTrackingCalibrated ? C.green : C.amber, background: eyeTrackingCalibrated ? C.greenBg : C.amberBg, borderRadius: 5, padding: '3px 8px' }}>
              {eyeTrackingCalibrated ? 'Calibrated' : 'Calibration needed'}
            </span>
            <button type="button" onClick={() => navigate('/calibration')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontFamily: FF, fontSize: 13, padding: 0 }}>
              Calibrate
            </button>
          </Row>
        )}
      </div>

      <Slider
        label="Focal region"
        hint="Radius of full correction before the shader fades smoothly into the untouched desktop."
        value={fovealRadius}
        min={50}
        max={300}
        step={5}
        format={(value) => `${value} px`}
        onChange={setFovealRadius}
      />

      <Divider />

      <button
        type="button"
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen((open) => !open)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.textSec, fontFamily: FF, fontSize: 14 }}
      >
        <span>Model details</span>
        <span aria-hidden="true" style={{ transform: detailsOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>⌄</span>
      </button>

      {detailsOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PsfVisualizer
            psfData={selectedPsf?.kernelData ?? null}
            correctionData={selectedCorrection?.kernelData ?? null}
            kernelSize={selectedPsf?.size ?? 0}
          />

          <div style={{ display: 'grid', gap: 8, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
            <Row>
              <span style={{ fontSize: 12, color: C.textTert }}>Live model</span>
              <span style={{ fontSize: 12, color: C.textPri }}>Gaussian PSF + unsharp</span>
            </Row>
            <Row>
              <span style={{ fontSize: 12, color: C.textTert }}>Kernel</span>
              <span style={{ fontFamily: FM, fontSize: 12, color: C.textMono }}>{selectedCorrection ? `${selectedCorrection.size} x ${selectedCorrection.size}` : 'Not computed'}</span>
            </Row>
            <p style={{ margin: 0, fontSize: 12, color: C.textTert, lineHeight: 1.55 }}>
              Wiener deconvolution remains a separate experiment in the codebase and is not presented here as an active runtime control.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
