import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { FaceMesh, Results as FaceMeshResults } from '@mediapipe/face_mesh'
import styles from './DistanceCalibration.module.css'

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface DistanceCalibrationProps {
  onComplete: (data: { pixelsPerMm: number; viewingDistanceCm: number }) => void
  onSkip?: () => void
}

// ---------------------------------------------------------------------------
// Step state (useReducer)
// ---------------------------------------------------------------------------

type CalibStep = 'distance_selection' | 'card_calibration' | 'camera_distance'

type StepAction =
  | { type: 'GO_CARD' }
  | { type: 'GO_CAMERA' }
  | { type: 'GO_DISTANCE' }

function stepReducer(_: CalibStep, action: StepAction): CalibStep {
  switch (action.type) {
    case 'GO_CARD':     return 'card_calibration'
    case 'GO_CAMERA':   return 'camera_distance'
    case 'GO_DISTANCE': return 'distance_selection'
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIST_MIN     = 30
const DIST_MAX     = 90
const DIST_DEFAULT = 60
const BASELINE_DPI = 96

// Outer eye-corner to outer eye-corner average (mm).
const OUTER_IPD_MM = 90
// Typical built-in / USB webcam horizontal FOV.
const CAMERA_HFOV_DEG = 70

// Credit-card physical dimensions (ISO/IEC 7810 ID-1), mm.
const CARD_W_MM = 85.6
const CARD_H_MM = 53.98

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ppmFromScale(scaleFactor = window.devicePixelRatio): number {
  return (BASELINE_DPI * scaleFactor) / 25.4
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// ---------------------------------------------------------------------------
// Icons (inline SVG - no CDN dep in Electron renderer)
// ---------------------------------------------------------------------------

function IconCamera({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      width={16} height={16} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      className={className ?? 'text-text-tertiary'}
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function IconArrowLeft(): JSX.Element {
  return (
    <svg
      width={14} height={14} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// StepDots
// ---------------------------------------------------------------------------

function StepDots({ total = 5, active = 0 }: { total?: number; active?: number }): JSX.Element {
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

// ---------------------------------------------------------------------------
// ToggleSwitch
// ---------------------------------------------------------------------------

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex-shrink-0 relative rounded-full border-none p-0 outline-none transition-all"
      style={{
        width:      40,
        height:     24,
        background: checked
          ? 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)'
          : '#1E2D60',
        cursor:     disabled ? 'not-allowed' : 'pointer',
        opacity:    disabled ? 0.45 : 1,
        transition: 'background 0.18s ease',
      }}
    >
      <span
        className="absolute rounded-full bg-white"
        style={{
          top:        3,
          left:       checked ? 19 : 3,
          width:      18,
          height:     18,
          boxShadow:  '0 1px 3px rgba(0,0,0,0.35)',
          transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// DistanceSlider
// ---------------------------------------------------------------------------

function DistanceSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}): JSX.Element {
  const pct      = ((value - DIST_MIN) / (DIST_MAX - DIST_MIN)) * 100
  const trackBg  = `linear-gradient(to right, #4B8AF0 0%, #4B8AF0 ${pct}%, #162045 ${pct}%, #162045 100%)`

  return (
    <div className="w-full">
      <input
        type="range"
        className={styles.slider}
        min={DIST_MIN}
        max={DIST_MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: trackBg }}
      />
      <div className="flex justify-between mt-2">
        <span className="text-caption text-text-tertiary font-primary">30 cm</span>
        <span className="text-caption text-text-tertiary font-primary">90 cm</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CameraPreview
// ---------------------------------------------------------------------------

function CameraPreview({
  videoRef,
  detectedCm,
  status,
}: {
  videoRef: React.RefObject<HTMLVideoElement>
  detectedCm: number | null
  status: 'loading' | 'detecting' | 'error'
}): JSX.Element {
  const dotColor =
    status === 'error'     ? 'bg-color-danger'   :
    status === 'loading'   ? 'bg-text-tertiary'  :
    /* detecting */          'bg-color-success'

  const label =
    status === 'error'     ? 'Camera unavailable' :
    status === 'loading'   ? 'Starting camera…'   :
    detectedCm !== null    ? `Detected: ${detectedCm} cm` :
    /* no face */            'No face detected'

  return (
    <div className="w-full mt-5 rounded-card overflow-hidden bg-bg-elevated border border-border-subtle relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full block object-cover"
        style={{ height: 140, transform: 'scaleX(-1)' }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-3 py-1.5"
        style={{ background: 'rgba(7,11,30,0.78)' }}
      >
        <div
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`}
          style={status === 'detecting' ? { boxShadow: '0 0 6px rgba(52,211,153,0.6)' } : undefined}
        />
        <span className="text-caption text-text-secondary font-primary">{label}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CardCalibration - drag-to-resize credit card
// ---------------------------------------------------------------------------

function CardCalibration({
  onConfirm,
  onBack,
}: {
  onConfirm: (pixelsPerMm: number) => void
  onBack: () => void
}): JSX.Element {
  // Start at a sensible default pixel size for a credit card at ~96 DPI.
  const defaultW = Math.round(CARD_W_MM * ppmFromScale())
  const defaultH = Math.round(CARD_H_MM * ppmFromScale())

  const [cardW, setCardW] = useState(defaultW)
  const [cardH, setCardH] = useState(defaultH)
  const dragOrigin = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  function onMouseDown(e: React.MouseEvent): void {
    e.preventDefault()
    dragOrigin.current = { x: e.clientX, y: e.clientY, w: cardW, h: cardH }

    function onMove(mv: MouseEvent): void {
      if (!dragOrigin.current) return
      const newW = Math.max(80, dragOrigin.current.w + (mv.clientX - dragOrigin.current.x))
      const newH = Math.max(50, dragOrigin.current.h + (mv.clientY - dragOrigin.current.y))
      setCardW(Math.round(newW))
      setCardH(Math.round(newH))
    }

    function onUp(): void {
      dragOrigin.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const derivedPpm = cardW / CARD_W_MM

  return (
    <div className="w-full flex flex-col items-center gap-6">
      {/* Back link */}
      <button
        onClick={onBack}
        className="self-start flex items-center gap-1.5 text-caption text-text-tertiary hover:text-text-secondary transition-colors"
      >
        <IconArrowLeft />
        Back
      </button>

      <h2 className="text-heading-xl text-text-primary text-center">
        Match this to a credit card
      </h2>
      <p className="text-body-sm text-text-secondary text-center">
        Drag the corner to resize the rectangle until it matches a physical credit card exactly.
      </p>

      {/* Drag target */}
      <div className="relative" style={{ width: cardW, height: cardH }}>
        <div
          className="w-full h-full rounded-card border-2 border-dashed border-border-strong flex items-center justify-center select-none"
        >
          <span className="text-caption text-text-tertiary text-center px-3">
            Drag to match a credit card
          </span>
        </div>

        {/* Drag handle - bottom-right corner */}
        <div
          onMouseDown={onMouseDown}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-1"
        >
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
            <path d="M2 9L9 2M5 9L9 5M9 9" stroke="#4B8AF0" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Live PPI readout */}
      <p className="text-caption text-text-tertiary font-primary">
        Detected:{' '}
        <span className="font-mono text-text-secondary">
          {Math.round(derivedPpm * 25.4)} PPI
        </span>
        {' '}·{' '}
        <span className="font-mono text-text-secondary">
          {derivedPpm.toFixed(2)} px/mm
        </span>
      </p>

      <button
        onClick={() => onConfirm(derivedPpm)}
        className="h-8 px-4 rounded-btn text-body-sm font-semibold text-text-on-brand bg-brand-gradient shadow-glow-brand border-none cursor-pointer font-primary"
      >
        Use this measurement
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Camera / FaceMesh hook
// ---------------------------------------------------------------------------

interface CameraHook {
  videoRef:    React.RefObject<HTMLVideoElement>
  detectedCm:  number | null
  status:      'loading' | 'detecting' | 'error'
}

function useFaceDistance(enabled: boolean, onDetect: (cm: number) => void): CameraHook {
  const videoRef     = useRef<HTMLVideoElement>(null)
  const faceMeshRef  = useRef<FaceMesh | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const rafRef       = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)

  const [status,     setStatus]     = useState<'loading' | 'detecting' | 'error'>('loading')
  const [detectedCm, setDetectedCm] = useState<number | null>(null)

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    faceMeshRef.current?.close()
    faceMeshRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setDetectedCm(null)
  }, [])

  useEffect(() => {
    if (!enabled) { stopCamera(); return }

    let cancelled = false
    setStatus('loading')

    async function start(): Promise<void> {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        })
        if (cancelled) { ms.getTracks().forEach((t) => t.stop()); return }

        streamRef.current = ms
        if (videoRef.current) {
          videoRef.current.srcObject = ms
          await videoRef.current.play()
        }

        const { FaceMesh: FM } = await import('@mediapipe/face_mesh')
        if (cancelled) return

        const fm = new FM({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
        }) as FaceMesh

        fm.setOptions({
          maxNumFaces: 1,
          refineLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence:  0.5,
        })

        fm.onResults((results: FaceMeshResults) => {
          if (!results.multiFaceLandmarks?.length) { setDetectedCm(null); return }
          const lm = results.multiFaceLandmarks[0]

          // Outer eye corners: 33 (L) and 263 (R), normalised coords.
          const eyeDistNorm = Math.hypot(lm[263].x - lm[33].x, lm[263].y - lm[33].y)
          const videoW = videoRef.current?.videoWidth ?? 640
          const eyePx  = eyeDistNorm * videoW
          if (eyePx < 1) return

          const fovRad    = (CAMERA_HFOV_DEG * Math.PI) / 180
          const focalPx   = videoW / (2 * Math.tan(fovRad / 2))
          const distanceCm = clamp(
            Math.round((focalPx * OUTER_IPD_MM) / eyePx / 10),
            DIST_MIN, DIST_MAX
          )
          setDetectedCm(distanceCm)
          onDetect(distanceCm)
        })

        await fm.initialize()
        if (cancelled) { fm.close(); return }

        faceMeshRef.current = fm
        setStatus('detecting')

        // Throttled to ~5 fps - distance doesn't change quickly.
        function tick(now: number): void {
          if (now - lastFrameRef.current > 200 && videoRef.current && faceMeshRef.current) {
            lastFrameRef.current = now
            faceMeshRef.current.send({ image: videoRef.current }).catch(() => {})
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    start()
    return () => { cancelled = true; stopCamera() }
  }, [enabled, onDetect, stopCamera])

  return { videoRef, detectedCm, status }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DistanceCalibration({
  onComplete,
  onSkip,
}: DistanceCalibrationProps): JSX.Element {
  const [step,     dispatch]    = useReducer(stepReducer, 'distance_selection')
  const [distance, setDistance] = useState(DIST_DEFAULT)
  const [cameraOn, setCameraOn] = useState(false)
  const [pixelsPerMm, setPpm]   = useState<number>(() => ppmFromScale())
  const [detectedPpi, setDetectedPpi] = useState<number | null>(null)

  // Stable callback so useFaceDistance doesn't restart on every render.
  const handleDetected = useCallback((cm: number) => setDistance(cm), [])
  const camera = useFaceDistance(cameraOn, handleDetected)

  // Fetch accurate display info from main process once on mount.
  useEffect(() => {
    window.electronAPI.getDisplayInfo()
      .then(({ scaleFactor }) => {
        const ppm = ppmFromScale(scaleFactor)
        setPpm(ppm)
        setDetectedPpi(Math.round(ppm * 25.4))
      })
      .catch(() => {/* keep devicePixelRatio baseline */})
  }, [])

  function handleComplete(): void {
    onComplete({ pixelsPerMm, viewingDistanceCm: distance })
  }

  // -- card calibration confirmed ------------------------------------------
  function handleCardConfirm(ppm: number): void {
    setPpm(ppm)
    setDetectedPpi(Math.round(ppm * 25.4))
    dispatch({ type: 'GO_DISTANCE' })
  }

  // -- layout --------------------------------------------------------------
  return (
    <div className="w-full h-full flex flex-col bg-bg-primary font-primary">

      {/* Top bar */}
      <header className="h-12 flex-shrink-0 bg-bg-base border-b border-border-subtle flex items-center justify-between px-8">
        <span className="text-caption text-text-tertiary font-primary">refract</span>
        <StepDots total={5} active={0} />
        <span
          role="button"
          tabIndex={0}
          onClick={onSkip}
          onKeyDown={(e) => e.key === 'Enter' && onSkip?.()}
          className="text-caption text-text-tertiary font-primary cursor-pointer hover:text-text-secondary transition-colors select-none"
        >
          Exit
        </span>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center overflow-auto py-6 px-8">

        {/* -- CARD CALIBRATION sub-screen --------------------------- */}
        {step === 'card_calibration' && (
          <CardCalibration
            onConfirm={handleCardConfirm}
            onBack={() => dispatch({ type: 'GO_DISTANCE' })}
          />
        )}

        {/* -- DISTANCE SELECTION (default + camera) ----------------- */}
        {step !== 'card_calibration' && (
          <div className="w-[540px] flex flex-col items-center">

            {/* Heading */}
            <h1 className="text-heading-xl text-text-primary text-center mb-3">
              How far are you sitting?
            </h1>

            {/* Subtitle */}
            <p className="text-body-sm text-text-secondary text-center mb-12">
              We&rsquo;ll use this to size the eye chart correctly.
            </p>

            {/* Readout */}
            <div className="flex items-baseline gap-[7px] mb-4">
              <span
                className="font-primary text-text-primary"
                style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}
              >
                {distance}
              </span>
              <span className="text-heading-lg text-text-tertiary font-primary">cm</span>
            </div>

            {/* Slider */}
            <DistanceSlider value={distance} onChange={setDistance} />

            {/* Detected PPI note */}
            {detectedPpi !== null && (
              <p className="text-caption text-text-tertiary font-primary mt-2 self-end">
                Detected:{' '}
                <span className="font-mono">{detectedPpi} PPI</span>
              </p>
            )}

            {/* Divider + camera toggle */}
            <div className="w-full mt-10">
              <div className="h-px bg-border-subtle mb-5" />

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <IconCamera />
                    <span className="text-body-sm text-text-secondary font-primary">
                      Detect distance via camera
                    </span>
                  </div>
                  <span className="text-caption text-text-tertiary font-primary pl-6">
                    Optional
                  </span>
                </div>
                <ToggleSwitch checked={cameraOn} onChange={setCameraOn} />
              </div>

              {cameraOn && (
                <CameraPreview
                  videoRef={camera.videoRef}
                  detectedCm={camera.detectedCm}
                  status={camera.status}
                />
              )}
            </div>

            {/* Screen-size calibration footnote link */}
            <div className="w-full mt-12">
              <button
                onClick={() => dispatch({ type: 'GO_CARD' })}
                className="text-caption font-primary border-none bg-transparent p-0 cursor-pointer"
                style={{ color: '#4B8AF0' }}
              >
                Need to calibrate screen size instead? &rarr;
              </button>
            </div>

          </div>
        )}
      </main>

      {/* Bottom bar */}
      <footer className="h-12 flex-shrink-0 bg-bg-base border-t border-border-subtle flex items-center justify-between px-8">
        <button
          onClick={onSkip}
          className="text-caption text-text-tertiary font-primary border-none bg-transparent p-0 cursor-pointer hover:text-text-secondary transition-colors"
        >
          Skip
        </button>
        <button
          onClick={handleComplete}
          className="h-8 px-4 rounded-btn text-body-sm font-semibold text-text-on-brand border-none cursor-pointer font-primary shadow-glow-brand"
          style={{ background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)' }}
        >
          Continue &rarr;
        </button>
      </footer>
    </div>
  )
}

export default DistanceCalibration
