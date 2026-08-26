import { createPortal } from 'react-dom'
import { useEffect, useReducer } from 'react'
import type { WebGazerController } from '../../lib/eyetracking/webgazer'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CALIB_POINTS: [number, number][] = [
  [10, 10], [50, 10], [90, 10],
  [10, 50], [50, 50], [90, 50],
  [10, 90], [50, 90], [90, 90],
]

// Validation uses positions not in the calibration grid
const VALID_POINTS: [number, number][] = [
  [30, 30], [70, 30], [30, 70], [70, 70],
]

const FIXATION_MS         = 1500
const FLASH_MS            = 300
const VALIDATION_DWELL_MS = 3000
const ARC_R               = 24                                    // px, arc radius
const ARC_CIRC            = +(2 * Math.PI * ARC_R).toFixed(1)    // ≈ 150.8 px

// ---------------------------------------------------------------------------
// State / reducer
// ---------------------------------------------------------------------------

type Phase = 'intro' | 'calibrating' | 'validating' | 'results'

interface State {
  phase:      Phase
  ptIndex:    number    // 0-8, current calibration dot
  ptReady:    boolean   // dot becomes clickable after fixation wait
  ptFlash:    boolean   // green flash on click
  valIndex:   number    // 0-3, current validation target
  valErrors:  number[]  // per-target gaze error in px
  accuracyPx: number    // mean error, set after validation
}

const INITIAL: State = {
  phase: 'intro', ptIndex: 0, ptReady: false, ptFlash: false,
  valIndex: 0, valErrors: [], accuracyPx: 0,
}

type Action =
  | { type: 'START' }
  | { type: 'PT_READY' }
  | { type: 'PT_CLICK' }
  | { type: 'PT_NEXT' }
  | { type: 'VALIDATE_SAMPLE'; error: number }
  | { type: 'RECALIBRATE' }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'START':    return { ...INITIAL, phase: 'calibrating' }
    case 'PT_READY': return { ...s, ptReady: true }
    case 'PT_CLICK': return { ...s, ptFlash: true }
    case 'PT_NEXT': {
      const next = s.ptIndex + 1
      return next >= CALIB_POINTS.length
        ? { ...s, ptFlash: false, phase: 'validating', valIndex: 0, valErrors: [] }
        : { ...s, ptIndex: next, ptReady: false, ptFlash: false }
    }
    case 'VALIDATE_SAMPLE': {
      const errors  = [...s.valErrors, a.error]
      const nextVal = s.valIndex + 1
      if (nextVal >= VALID_POINTS.length) {
        const mean = errors.reduce((sum, e) => sum + e, 0) / errors.length
        return { ...s, valErrors: errors, valIndex: nextVal, phase: 'results', accuracyPx: mean }
      }
      return { ...s, valErrors: errors, valIndex: nextVal }
    }
    case 'RECALIBRATE': return { ...INITIAL, phase: 'calibrating' }
    default:            return s
  }
}

// ---------------------------------------------------------------------------
// CSS keyframes (injected via <style> inside the portal)
// ---------------------------------------------------------------------------

const KEYFRAMES = `
  @keyframes gazePulse {
    0%, 100% { transform: scale(1);   opacity: 0.2; }
    50%       { transform: scale(1.4); opacity: 0.4; }
  }
  @keyframes arcShrink {
    from { stroke-dashoffset: 0; }
    to   { stroke-dashoffset: ${ARC_CIRC}; }
  }
  @keyframes valBlink {
    0%, 100% { opacity: 1;    }
    50%       { opacity: 0.5; }
  }
`

// ---------------------------------------------------------------------------
// CalibDot - single calibration target with pulsing ring + arc countdown
// ---------------------------------------------------------------------------

interface CalibDotProps {
  vpx:     number
  vpy:     number
  ready:   boolean
  flash:   boolean
  onClick: () => void
}

function CalibDot({ vpx, vpy, ready, flash, onClick }: CalibDotProps): JSX.Element {
  return (
    <div
      onClick={ready ? onClick : undefined}
      style={{
        position:      'fixed',
        left:          `${vpx}%`,
        top:           `${vpy}%`,
        transform:     'translate(-50%, -50%)',
        width:         60,
        height:        60,
        zIndex:        10000,
        pointerEvents: ready ? 'auto' : 'none',
        cursor:        ready ? 'crosshair' : 'default',
      }}
    >
      {/* Outer pulsing ring: 40px diameter, rgba(75,138,240,0.2) */}
      <div
        style={{
          position:     'absolute',
          left:         10, top: 10,
          width:        40, height: 40,
          borderRadius: '50%',
          background:   'rgba(75,138,240,0.2)',
          animation:    'gazePulse 1.5s ease-in-out infinite',
        }}
      />

      {/* Arc countdown: shrinks from full circle to nothing over FIXATION_MS */}
      <svg
        width={56}
        height={56}
        style={{ position: 'absolute', left: 2, top: 2, overflow: 'visible' }}
      >
        <circle
          cx={28}
          cy={28}
          r={ARC_R}
          fill="none"
          stroke="rgba(75,138,240,0.6)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={ARC_CIRC}
          transform="rotate(-90 28 28)"
          style={{
            animation:     `arcShrink ${FIXATION_MS}ms linear forwards`,
            strokeDashoffset: 0,
          }}
        />
      </svg>

      {/* Inner dot: 12px, flashes green on click */}
      <div
        style={{
          position:     'absolute',
          left:         24, top: 24,
          width:        12, height: 12,
          borderRadius: '50%',
          background:   flash ? '#34D399' : '#4B8AF0',
          boxShadow:    flash ? '0 0 0 8px rgba(52,211,153,0.25)' : 'none',
          transition:   'background 0.1s ease, box-shadow 0.15s ease',
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ValidationTarget - blinking yellow crosshair for accuracy measurement
// ---------------------------------------------------------------------------

function ValidationTarget({ vpx, vpy }: { vpx: number; vpy: number }): JSX.Element {
  return (
    <div
      style={{
        position:      'fixed',
        left:          `${vpx}%`,
        top:           `${vpy}%`,
        transform:     'translate(-50%, -50%)',
        width:         60,
        height:        60,
        zIndex:        10000,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position:     'absolute',
          left:         10, top: 10,
          width:        40, height: 40,
          borderRadius: '50%',
          border:       '2px solid rgba(251,191,36,0.5)',
          animation:    'valBlink 2s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position:     'absolute',
          left:         24, top: 24,
          width:        12, height: 12,
          borderRadius: '50%',
          background:   '#FBBF24',
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ResultBadge - accuracy rating inside the results card
// ---------------------------------------------------------------------------

function ResultBadge({ accuracyPx }: { accuracyPx: number }): JSX.Element {
  const excellent = accuracyPx < 80
  const good      = accuracyPx < 150

  const label   = excellent ? 'Excellent' : good ? 'Good' : 'Poor'
  const color   = excellent ? '#34D399'   : good ? '#FBBF24' : '#F87171'
  const message = excellent
    ? 'Correction will track your gaze accurately.'
    : good
    ? 'Correction will work but tracking may occasionally drift.'
    : 'Eye tracking is unreliable. Consider recalibrating.'

  return (
    <>
      <p
        className="text-heading-md font-primary"
        style={{ margin: 0, color }}
      >
        {label}
      </p>
      <p
        className="text-heading-xl text-text-primary font-primary"
        style={{ margin: '4px 0 0' }}
      >
        {Math.round(accuracyPx)}px mean error
      </p>
      <p
        className="text-body-sm text-text-secondary font-primary"
        style={{ maxWidth: 360, margin: '12px 0 0' }}
      >
        {message}
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Shared card style
// ---------------------------------------------------------------------------

const CARD_STYLE: React.CSSProperties = {
  width:         480,
  minHeight:     280,
  background:    '#0F1635',
  borderRadius:  20,
  boxShadow:     '0 8px 40px rgba(4,6,20,0.65)',
  padding:       40,
  display:       'flex',
  flexDirection: 'column',
  alignItems:    'flex-start',
}

const SCRIM_STYLE: React.CSSProperties = {
  position:        'fixed',
  inset:           0,
  zIndex:          9999,
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CalibrationOverlayProps {
  onCalibrationComplete: (accuracyPx: number) => void
  onSkip:                () => void
  gazeTracker:           WebGazerController
}

// ---------------------------------------------------------------------------
// CalibrationOverlay
// ---------------------------------------------------------------------------

export function CalibrationOverlay({
  onCalibrationComplete,
  onSkip,
  gazeTracker,
}: CalibrationOverlayProps): JSX.Element {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  // Allow the overlay window to receive mouse events during calibration
  useEffect(() => {
    window.electronAPI.setOverlayInteractive(true)
    return () => { window.electronAPI.setOverlayInteractive(false) }
  }, [])

  // Hide the camera preview as soon as the user leaves the intro screen.
  // The preview is shown by Calibration.tsx on init; during dot-clicking it
  // would render on top of the 90%/90% corner dot and block it.
  useEffect(() => {
    if (state.phase !== 'intro') gazeTracker.setCameraPreview(false)
  }, [state.phase, gazeTracker])

  // Fixation timer - starts fresh each time a new calibration dot appears.
  // Re-runs on ptIndex change so each dot gets its own 1.5s countdown.
  useEffect(() => {
    if (state.phase !== 'calibrating' || state.ptFlash) return
    const t = setTimeout(() => dispatch({ type: 'PT_READY' }), FIXATION_MS)
    return () => clearTimeout(t)
  }, [state.phase, state.ptIndex, state.ptFlash])

  // Advance to next dot (or to validating) after the green flash
  useEffect(() => {
    if (!state.ptFlash) return
    const t = setTimeout(() => dispatch({ type: 'PT_NEXT' }), FLASH_MS)
    return () => clearTimeout(t)
  }, [state.ptFlash])

  // Validation: sample gaze after VALIDATION_DWELL_MS then advance target
  useEffect(() => {
    if (state.phase !== 'validating' || state.valIndex >= VALID_POINTS.length) return

    const [vpx, vpy] = VALID_POINTS[state.valIndex]
    const targetX = window.screenX + (vpx / 100) * window.innerWidth
    const targetY = window.screenY + (vpy / 100) * window.innerHeight

    const t = setTimeout(() => {
      const gaze  = gazeTracker.getLatestGaze()
      const valid = gaze != null && Number.isFinite(gaze.x) && Number.isFinite(gaze.y)
      const error = valid
        ? Math.hypot(gaze!.x - targetX, gaze!.y - targetY)
        : 150  // pessimistic fallback when tracker has no (or invalid) data
      dispatch({ type: 'VALIDATE_SAMPLE', error })
    }, VALIDATION_DWELL_MS)

    return () => clearTimeout(t)
  }, [state.phase, state.valIndex, gazeTracker])

  // -- Event handlers ------------------------------------------------------

  function handleDotClick(): void {
    const [vpx, vpy] = CALIB_POINTS[state.ptIndex]
    // WebGazer trains and predicts in viewport (client) coordinates - the same
    // space its own click listener uses, and the space the controller converts
    // to screen later (by adding window.screenX/Y in onGaze). Record the dot's
    // viewport position, NOT screen coords; mixing the two corrupts the
    // regression and was a source of the unreliable tracking.
    const clientX = (vpx / 100) * window.innerWidth
    const clientY = (vpy / 100) * window.innerHeight
    gazeTracker.recordCalibrationPoint(clientX, clientY)
    dispatch({ type: 'PT_CLICK' })
  }

  // -- Render --------------------------------------------------------------

  const content = (
    <>
      <style>{KEYFRAMES}</style>

      {/* -- INTRO ------------------------------------------------------ */}
      {state.phase === 'intro' && (
        <div style={{ ...SCRIM_STYLE, background: 'rgba(0,0,0,0.8)' }}>
          <div style={CARD_STYLE}>
            <h2 className="text-heading-xl text-text-primary font-primary" style={{ margin: 0 }}>
              Calibrate eye tracking
            </h2>
            <p
              className="text-body-sm text-text-secondary font-primary"
              style={{ maxWidth: 360, margin: '12px 0 0' }}
            >
              9 dots will appear one at a time. Look directly at each dot, then click it.
            </p>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button
                onClick={() => dispatch({ type: 'START' })}
                className="text-body-sm font-semibold text-text-on-brand font-primary"
                style={{
                  height: 36, padding: '0 20px', borderRadius: 8,
                  border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)',
                  boxShadow: '0 0 0 1px rgba(75,138,240,0.4), 0 4px 24px rgba(75,138,240,0.25)',
                }}
              >
                Start calibration →
              </button>
              <button
                onClick={onSkip}
                className="text-body-sm text-text-tertiary font-primary"
                style={{
                  height: 36, padding: '0 16px', borderRadius: 8,
                  border: '1px solid rgba(75,94,191,0.18)',
                  cursor: 'pointer', background: 'transparent',
                }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- CALIBRATING ------------------------------------------------ */}
      {state.phase === 'calibrating' && (
        <>
          {/* Background scrim - fully opaque so the home screen can't bleed through.
              pointer-events: none so the dot above can still receive clicks. */}
          <div
            style={{
              position:      'fixed', inset: 0, zIndex: 9999,
              background:    'rgb(7,11,30)',
              pointerEvents: 'none',
            }}
          />

          {/* Progress counter */}
          <div
            style={{
              position:      'fixed', top: 24, left: '50%',
              transform:     'translateX(-50%)',
              zIndex:        10001, pointerEvents: 'none',
            }}
          >
            <span className="text-caption text-text-tertiary font-primary">
              Point {state.ptIndex + 1} of {CALIB_POINTS.length}
            </span>
          </div>

          {/* key forces remount (and thus animation restart) on each new point */}
          <CalibDot
            key={state.ptIndex}
            vpx={CALIB_POINTS[state.ptIndex][0]}
            vpy={CALIB_POINTS[state.ptIndex][1]}
            ready={state.ptReady}
            flash={state.ptFlash}
            onClick={handleDotClick}
          />
        </>
      )}

      {/* -- VALIDATING ------------------------------------------------- */}
      {state.phase === 'validating' && state.valIndex < VALID_POINTS.length && (
        <>
          <div
            style={{
              position:      'fixed', inset: 0, zIndex: 9999,
              background:    'rgb(7,11,30)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position:      'fixed', top: 24, left: '50%',
              transform:     'translateX(-50%)',
              zIndex:        10001, pointerEvents: 'none',
            }}
          >
            <span className="text-caption text-text-tertiary font-primary">
              Validating… look at the target
            </span>
          </div>

          <ValidationTarget
            key={state.valIndex}
            vpx={VALID_POINTS[state.valIndex][0]}
            vpy={VALID_POINTS[state.valIndex][1]}
          />
        </>
      )}

      {/* -- RESULTS ---------------------------------------------------- */}
      {state.phase === 'results' && (
        <div style={{ ...SCRIM_STYLE, background: 'rgba(0,0,0,0.8)' }}>
          <div style={CARD_STYLE}>
            <ResultBadge accuracyPx={state.accuracyPx} />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button
                onClick={() => onCalibrationComplete(state.accuracyPx)}
                className="text-body-sm font-semibold text-text-on-brand font-primary"
                style={{
                  height: 36, padding: '0 20px', borderRadius: 8,
                  border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)',
                  boxShadow: '0 0 0 1px rgba(75,138,240,0.4), 0 4px 24px rgba(75,138,240,0.25)',
                }}
              >
                Accept →
              </button>
              <button
                onClick={() => dispatch({ type: 'RECALIBRATE' })}
                className="text-body-sm text-text-secondary font-primary"
                style={{
                  height: 36, padding: '0 16px', borderRadius: 8,
                  border: '1px solid rgba(75,94,191,0.18)',
                  cursor: 'pointer', background: 'transparent',
                }}
              >
                Recalibrate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return createPortal(content, document.body)
}

export default CalibrationOverlay
