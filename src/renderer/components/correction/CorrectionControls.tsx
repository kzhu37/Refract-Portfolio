import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrescriptionStore } from '../../lib/store/prescription-store'
import { gazeTracker } from '../../lib/eyetracking/webgazer'
import type { EyePrescription, EyeSide } from '../../lib/types/prescription'

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bgPanel:   'rgba(9,13,36,0.97)',
  bgCard:    '#0F1635',
  bgInput:   '#0A1028',
  border:    'rgba(75,94,191,0.18)',
  borderHov: 'rgba(75,138,240,0.28)',
  borderAct: 'rgba(75,138,240,0.5)',
  accent:    '#4B8AF0',
  grad:      'linear-gradient(135deg,#7B5CF0 0%,#4B8AF0 100%)',
  textPri:   '#E8EDF8',
  textSec:   '#7A95B8',
  textTert:  '#3D5275',
  textMono:  '#8BA0C0',
  green:     '#34D399',
  greenBg:   'rgba(52,211,153,0.12)',
  amber:     '#FBBF24',
  amberBg:   'rgba(251,191,36,0.12)',
  track:     '#162045',
} as const

const FF = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
const FM = "'JetBrains Mono', 'Fira Code', monospace"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDiop(d: number): string {
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`
}

function fmtRxShort(rx: EyePrescription): string {
  const s = fmtDiop(rx.sphere)
  if (!rx.cylinder || rx.cylinder === 0) return `${s} DS`
  return `${s} / ${fmtDiop(rx.cylinder)} × ${rx.axis ?? 0}`
}

// ─── Primitives ───────────────────────────────────────────────────────────────

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

// ─── Master toggle — big, prominent ──────────────────────────────────────────

function BigToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={on}
      aria-label="Toggle correction"
      style={{
        width: 56, height: 32, borderRadius: 32,
        background: on ? C.grad : '#1A2652',
        border: 'none', cursor: 'pointer', position: 'relative',
        flexShrink: 0, padding: 0,
        boxShadow: on ? '0 0 16px rgba(75,138,240,0.4)' : 'none',
        transition: 'background 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 4, left: on ? 28 : 4,
        width: 24, height: 24, borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        transition: 'left 0.18s cubic-bezier(0.34,1.56,0.64,1)',
      }} />
    </button>
  )
}

// ─── Small toggle ─────────────────────────────────────────────────────────────

function SmToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={on}
      aria-label="Toggle gaze indicator"
      style={{
        width: 36, height: 22, borderRadius: 22,
        background: on ? C.grad : '#1A2652',
        border: 'none', cursor: 'pointer', position: 'relative',
        flexShrink: 0, padding: 0,
        boxShadow: on ? '0 0 8px rgba(75,138,240,0.35)' : 'none',
        transition: 'background 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3, left: on ? 17 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        transition: 'left 0.18s cubic-bezier(0.34,1.56,0.64,1)',
      }} />
    </button>
  )
}

// ─── Segmented control ────────────────────────────────────────────────────────

function Seg<T extends string>({ label, options, value, onChange }: {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 4, width: '100%' }}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === o}
          key={o}
          onClick={() => onChange(o)}
          style={{
            flex: 1, height: 36, borderRadius: 8, cursor: 'pointer',
            fontFamily: FF, fontSize: 13, fontWeight: value === o ? 600 : 400,
            border: `1px solid ${value === o ? C.borderAct : C.border}`,
            background: value === o ? 'rgba(75,138,240,0.16)' : 'transparent',
            color: value === o ? C.textPri : C.textSec,
            outline: 'none', transition: 'all 0.12s',
          }}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

// ─── Slider ───────────────────────────────────────────────────────────────────

function Slider({ label, hint, value, min, max, step = 1, format, onChange }: {
  label: string; hint?: string; value: number; min: number; max: number
  step?: number; format: (v: number) => string; onChange: (v: number) => void
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
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="refract-range"
        style={{
          WebkitAppearance: 'none', appearance: 'none',
          width: '100%', height: 4, borderRadius: 9999,
          background: bg, border: 'none', outline: 'none', cursor: 'pointer', padding: 0,
        }}
      />
      {hint && (
        <span style={{ fontFamily: FF, fontSize: 12, color: C.textTert, lineHeight: 1.5 }}>{hint}</span>
      )}
    </div>
  )
}

// ─── PSF Visualizer ───────────────────────────────────────────────────────────

type PsfView = 'psf' | 'correction'

function PsfVisualizer({ psfData, correctionData, kernelSize }: {
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
    let minV = Infinity, maxV = -Infinity
    for (const v of data) { if (v < minV) minV = v; if (v > maxV) maxV = v }
    const range = maxV - minV || 1
    for (let i = 0; i < data.length; i++) {
      const b = Math.round(((data[i] - minV) / range) * 255)
      imageData.data[i*4]   = Math.round(b * 0.4)
      imageData.data[i*4+1] = Math.round(b * 0.6)
      imageData.data[i*4+2] = b
      imageData.data[i*4+3] = 255
    }
    const tmp = document.createElement('canvas')
    tmp.width = kernelSize; tmp.height = kernelSize
    tmp.getContext('2d')!.putImageData(imageData, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tmp, 0, 0, 100, 100)
  }, [psfData, correctionData, view, kernelSize])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Row>
        <span style={{ fontFamily: FF, fontSize: 12, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: C.textTert }}>
          PSF Visualizer
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['psf', 'correction'] as PsfView[]).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '2px 10px', borderRadius: 6, cursor: 'pointer',
              fontFamily: FF, fontSize: 12,
              background: view === v ? 'rgba(75,138,240,0.14)' : 'transparent',
              border: `1px solid ${view === v ? C.borderAct : C.border}`,
              color: view === v ? C.textPri : C.textTert,
              outline: 'none', transition: 'all 0.12s',
            }}>
              {v === 'psf' ? "Eye's blur" : 'Correction'}
            </button>
          ))}
        </div>
      </Row>
      <div style={{
        display: 'flex', justifyContent: 'center',
        background: C.bgCard, borderRadius: 10,
        border: `1px solid ${C.border}`, padding: 10,
      }}>
        <canvas ref={canvasRef} width={100} height={100}
          style={{ borderRadius: 4, imageRendering: 'pixelated' }} />
      </div>
    </div>
  )
}

// ─── Advanced panel (shown when dropdown is open) ─────────────────────────────

function AdvancedPanel({
  mode, setMode,
  foveal, setFoveal,
  trackingMode,
  eyeTrackingCalibrated,
  cameras, selectedCamera, setSelectedCamera,
  psfKernel, corrKernel,
  kernelSz,
  advMethod, setAdvMethod,
  showGaze, setShowGaze,
  nsrOverride, setNsrOverride,
  advKernel, setAdvKernel,
  navigate,
  rxOD, rxOS,
}: {
  mode: 'Correct' | 'Simulate' | 'Compare'
  setMode: (m: 'Correct' | 'Simulate' | 'Compare') => void
  foveal: number
  setFoveal: (v: number) => void
  trackingMode: 'cursor' | 'eye'
  eyeTrackingCalibrated: boolean
  cameras: MediaDeviceInfo[]
  selectedCamera: string
  setSelectedCamera: (id: string) => void
  psfKernel: { kernelData: number[]; size: number } | null | undefined
  corrKernel: { kernelData: number[]; size: number } | null | undefined
  kernelSz: number
  advMethod: 'unsharp' | 'wiener'
  setAdvMethod: (m: 'unsharp' | 'wiener') => void
  showGaze: boolean
  setShowGaze: (v: boolean) => void
  nsrOverride: number
  setNsrOverride: (v: number) => void
  advKernel: 7 | 9 | 11 | 15
  setAdvKernel: (v: 7 | 9 | 11 | 15) => void
  navigate: (path: string) => void
  rxOD: EyePrescription | undefined
  rxOS: EyePrescription | undefined
}) {
  const store = usePrescriptionStore.getState()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 4 }}>

      {/* Mode */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontFamily: FF, fontSize: 13, color: C.textSec }}>Mode</span>
        <Seg
          label="Correction mode"
          options={['Correct', 'Simulate', 'Compare'] as const}
          value={mode}
          onChange={setMode}
        />
        <span style={{ fontFamily: FF, fontSize: 12, color: C.textTert, lineHeight: 1.5 }}>
          {mode === 'Correct' && 'Apply correction to your screen.'}
          {mode === 'Simulate' && 'Show how your uncorrected vision looks.'}
          {mode === 'Compare' && 'Split screen to compare both views.'}
        </span>
      </div>

      <Divider />

      {/* Foveal zone */}
      <Slider
        label="Zone size"
        hint="How large the correction bubble around your gaze is"
        value={foveal}
        min={50} max={300}
        format={(v) => `${v} px`}
        onChange={(v) => {
          setFoveal(v)
          usePrescriptionStore.setState({ fovealRadius: v })
        }}
      />

      <Divider />

      {/* Tracking */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontFamily: FF, fontSize: 12, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: C.textTert }}>
          Tracking
        </span>
        <Seg
          label="Tracking source"
          options={['Cursor', 'Eye tracking'] as const}
          value={trackingMode === 'cursor' ? 'Cursor' : 'Eye tracking'}
          onChange={(v) => store.setTrackingMode(v === 'Cursor' ? 'cursor' : 'eye')}
        />

        {trackingMode === 'eye' ? (
          <>
            <Row>
              <span style={{ fontFamily: FF, fontSize: 13, color: C.textSec }}>Calibration</span>
              <span style={{
                fontSize: 12, borderRadius: 4, padding: '2px 8px', fontFamily: FF,
                background: eyeTrackingCalibrated ? C.greenBg : C.amberBg,
                color: eyeTrackingCalibrated ? C.green : C.amber,
              }}>
                {eyeTrackingCalibrated ? 'Calibrated ✓' : 'Not calibrated'}
              </span>
            </Row>
            <button
              onClick={() => navigate('/calibration')}
              style={{
                alignSelf: 'flex-end', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: C.accent, padding: 0, outline: 'none', fontFamily: FF,
              }}
            >
              Recalibrate →
            </button>
            {cameras.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontFamily: FF, fontSize: 13, color: C.textSec }}>Camera</span>
                <select
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                  style={{
                    background: C.bgInput, border: `1px solid ${C.border}`,
                    borderRadius: 8, color: C.textPri,
                    fontFamily: FF, fontSize: 13,
                    padding: '7px 10px', outline: 'none', cursor: 'pointer', width: '100%',
                  }}
                >
                  {cameras.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera ${cameras.indexOf(cam) + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        ) : (
          <span style={{ fontFamily: FF, fontSize: 12, color: C.textTert, lineHeight: 1.6, fontStyle: 'italic' }}>
            The correction bubble follows your mouse cursor, so no camera is needed.
          </span>
        )}
      </div>

      <Divider />

      {/* PSF Visualizer */}
      <PsfVisualizer
        psfData={psfKernel?.kernelData ?? null}
        correctionData={corrKernel?.kernelData ?? null}
        kernelSize={psfKernel?.size ?? kernelSz}
      />

      <Divider />

      {/* Algorithm settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ fontFamily: FF, fontSize: 12, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: C.textTert }}>
          Algorithm
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: FF, fontSize: 13, color: C.textSec }}>Method</span>
          <Seg
            label="Correction method"
            options={['Unsharp', 'Wiener'] as const}
            value={advMethod === 'unsharp' ? 'Unsharp' : 'Wiener'}
            onChange={(v) => setAdvMethod(v === 'Unsharp' ? 'unsharp' : 'wiener')}
          />
        </div>

        <Row>
          <span style={{ fontFamily: FF, fontSize: 13, color: C.textSec }}>Show gaze indicator</span>
          <SmToggle on={showGaze} onChange={() => setShowGaze(!showGaze)} />
        </Row>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: FF, fontSize: 13, color: C.textSec }}>NSR override</span>
          <input
            type="number" min={0.01} max={0.2} step={0.01} value={nsrOverride}
            onChange={(e) => setNsrOverride(Number(e.target.value))}
            style={{
              width: '100%', padding: '7px 10px',
              background: C.bgInput, border: `1px solid ${C.border}`,
              borderRadius: 8, color: C.textPri,
              fontFamily: FM, fontSize: 13,
              outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.borderAct }}
            onBlur={(e) => { e.currentTarget.style.borderColor = C.border }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: FF, fontSize: 13, color: C.textSec }}>Kernel size</span>
          <Seg
            label="Kernel size"
            options={[7, 9, 11, 15].map((n) => `${n}×${n}`) as unknown as readonly string[]}
            value={`${advKernel}×${advKernel}`}
            onChange={(v) => setAdvKernel(parseInt(v) as 7 | 9 | 11 | 15)}
          />
        </div>
      </div>

      {/* Prescription details */}
      {(rxOD || rxOS) && (
        <>
          <Divider />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontFamily: FF, fontSize: 12, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: C.textTert }}>
              Prescription
            </span>
            {rxOD && (
              <span style={{ fontFamily: FM, fontSize: 12, color: C.textMono, lineHeight: 1.7 }}>
                OD{'  '}{fmtRxShort(rxOD)}
              </span>
            )}
            {rxOS && (
              <span style={{ fontFamily: FM, fontSize: 12, color: C.textMono, lineHeight: 1.7 }}>
                OS{'  '}{fmtRxShort(rxOS)}
              </span>
            )}
          </div>
        </>
      )}

    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CorrectionControls() {
  const navigate = useNavigate()
  const {
    prescription,
    correctionEnabled,
    correctionMode,
    correctionStrength,
    activeEye,
    fovealRadius,
    trackingMode,
    eyeTrackingCalibrated,
    isOverlayActive,
    psfCache,
    correctionKernelCache,
  } = usePrescriptionStore()

  const [advOpen, setAdvOpen] = useState(false)

  // Eye selector
  const [eyeSel, setEyeSel] = useState<'OD' | 'OS' | 'Both'>(
    activeEye === 'both' ? 'Both' : (activeEye as 'OD' | 'OS')
  )

  // Mode
  const [mode, setMode] = useState<'Correct' | 'Simulate' | 'Compare'>(
    correctionMode === 'simulation' ? 'Simulate' : 'Correct'
  )

  // Foveal radius
  const [foveal, setFoveal] = useState(fovealRadius)

  // Camera
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [selectedCamera, setSelectedCamera] = useState('')

  // Advanced algorithm settings
  const [advMethod, setAdvMethod] = useState<'unsharp' | 'wiener'>('unsharp')
  const [showGaze, setShowGaze] = useState(false)
  const [nsrOverride, setNsrOverride] = useState(0.05)
  const [advKernel, setAdvKernel] = useState<7 | 9 | 11 | 15>(9)

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devs) => {
      const vids = devs.filter((d) => d.kind === 'videoinput')
      setCameras(vids)
      if (vids.length > 0) setSelectedCamera(vids[0].deviceId)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (trackingMode === 'eye') {
      gazeTracker.initialize().catch(() => {
        usePrescriptionStore.getState().setTrackingMode('cursor')
      })
    } else {
      gazeTracker.pauseTracking()
    }
  }, [trackingMode])

  const activeEyeSide: EyeSide = eyeSel === 'OS' ? 'OS' : 'OD'
  const psfKernel = psfCache[activeEyeSide]
  const corrKernel = correctionKernelCache[activeEyeSide]
  const rxOD = prescription?.OD
  const rxOS = prescription?.OS

  return (
    <div className="correction-controls" style={{
      display: 'flex', flexDirection: 'column', gap: 18,
      padding: '22px 22px',
      background: C.bgPanel,
      backdropFilter: 'blur(32px)',
      WebkitBackdropFilter: 'blur(32px)',
      borderRadius: 18,
      border: `1px solid ${C.border}`,
      fontFamily: FF,
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Active indicator bar */}
      {isOverlayActive && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg,transparent,#34D399 30%,#34D399 70%,transparent)',
          opacity: 0.8,
        }} />
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.textPri, letterSpacing: '-0.01em' }}>
          refract
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isOverlayActive && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, color: C.green,
              background: C.greenBg, borderRadius: 5,
              padding: '3px 8px', fontFamily: FF,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
              Active
            </span>
          )}
          <span style={{ fontFamily: FM, fontSize: 11, color: C.textTert, letterSpacing: '0.04em' }}>⌘⇧V</span>
        </div>
      </div>

      <Divider />

      {/* ── Correction toggle — main control ── */}
      <div>
        <Row style={{ marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.textPri, marginBottom: 3 }}>
              Correction
            </div>
            <div style={{ fontSize: 13, color: C.textTert }}>
              {correctionEnabled ? 'Screen is being corrected' : 'Correction is off'}
            </div>
          </div>
          <BigToggle
            on={correctionEnabled}
            onChange={() => usePrescriptionStore.getState().toggleCorrection()}
          />
        </Row>
      </div>

      {/* ── Strength ── */}
      <Slider
        label="Strength"
        value={Math.round(correctionStrength * 100)}
        min={0} max={100}
        format={(v) => `${v}%`}
        onChange={(v) => usePrescriptionStore.getState().setCorrectionStrength(v / 100)}
      />

      {/* ── Eye selector ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 14, color: C.textSec }}>Eye</span>
        <Seg
          label="Eye selection"
          options={['OD', 'OS', 'Both'] as const}
          value={eyeSel}
          onChange={(v) => setEyeSel(v)}
        />
        <span style={{ fontSize: 13, color: C.textTert }}>
          {eyeSel === 'OD' && 'Correcting right eye only'}
          {eyeSel === 'OS' && 'Correcting left eye only'}
          {eyeSel === 'Both' && 'Correcting both eyes'}
        </span>
      </div>

      {/* ── Compact prescription + edit link ── */}
      {prescription ? (
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '12px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {rxOD && (
              <span style={{ fontFamily: FM, fontSize: 13, color: C.textMono }}>
                OD  {fmtRxShort(rxOD)}
              </span>
            )}
            {rxOS && (
              <span style={{ fontFamily: FM, fontSize: 13, color: C.textMono }}>
                OS  {fmtRxShort(rxOS)}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/prescription')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', outline: 'none',
              fontSize: 13, color: C.accent, padding: 0, flexShrink: 0, fontFamily: FF,
            }}
          >
            Edit →
          </button>
        </div>
      ) : (
        <button
          onClick={() => navigate('/exam')}
          style={{
            width: '100%', height: 38, borderRadius: 10,
            background: 'rgba(75,138,240,0.1)', border: `1px solid rgba(75,138,240,0.25)`,
            color: C.accent, cursor: 'pointer', outline: 'none',
            fontFamily: FF, fontSize: 13, fontWeight: 500,
            transition: 'all 0.12s',
          }}
        >
          Set up prescription →
        </button>
      )}

      <Divider />

      {/* ── Advanced toggle ── */}
      <button
        onClick={() => setAdvOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, outline: 'none',
        }}
      >
        <span style={{
          fontSize: 14, fontWeight: 500, color: C.textSec,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 4h10M4 7h6M6 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Advanced
        </span>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{
            color: C.textTert,
            transform: advOpen ? 'rotate(180deg)' : undefined,
            transition: 'transform 0.2s ease',
          }}
        >
          <path d="M3 5.5L8 10.5L13 5.5" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Advanced panel ── */}
      {advOpen && (
        <AdvancedPanel
          mode={mode} setMode={setMode}
          foveal={foveal} setFoveal={setFoveal}
          trackingMode={trackingMode}
          eyeTrackingCalibrated={eyeTrackingCalibrated}
          cameras={cameras}
          selectedCamera={selectedCamera}
          setSelectedCamera={setSelectedCamera}
          psfKernel={psfKernel}
          corrKernel={corrKernel}
          kernelSz={advKernel}
          advMethod={advMethod} setAdvMethod={setAdvMethod}
          showGaze={showGaze} setShowGaze={setShowGaze}
          nsrOverride={nsrOverride} setNsrOverride={setNsrOverride}
          advKernel={advKernel} setAdvKernel={setAdvKernel}
          navigate={navigate}
          rxOD={rxOD}
          rxOS={rxOS}
        />
      )}

    </div>
  )
}
