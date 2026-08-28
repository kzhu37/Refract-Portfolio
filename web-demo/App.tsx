import {
  Component,
  type ErrorInfo,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CorrectionRenderer } from '../src/overlay/lib/webgl/webgl-utils'
import { computeCorrectionKernel, computePSF } from '../src/renderer/lib/optics/psf'
import type { CorrectionKernel, EyePrescription, PSFKernel } from '../src/renderer/lib/types/prescription'
import { LIVE_CORRECTION_KERNEL_SIZE } from '../src/shared/correction-constants'
import { drawDemoScene } from './demo-scene'

type TrackingMode = 'cursor' | 'eye'
type WebGLStatus = 'initializing' | 'ready' | 'unsupported' | 'error'
type CameraStatus =
  | 'off'
  | 'explaining'
  | 'requesting'
  | 'loading'
  | 'active'
  | 'lost'
  | 'denied'
  | 'unavailable'
  | 'error'

interface DemoSettings {
  sphere: number
  cylinder: number
  axis: number
  strength: number
  radius: number
  viewingDistance: number
}

interface ViewportPoint {
  x: number
  y: number
}

const DEFAULT_SETTINGS: DemoSettings = {
  sphere: -2.25,
  cylinder: -0.75,
  axis: 90,
  strength: 1,
  radius: 132,
  viewingDistance: 60,
}

const PRESETS: Array<{ name: string; short: string; settings: Pick<DemoSettings, 'sphere' | 'cylinder' | 'axis'> }> = [
  { name: 'Mild myopia', short: 'Mild', settings: { sphere: -1.25, cylinder: 0, axis: 90 } },
  { name: 'Detailed default', short: 'Default', settings: { sphere: -2.25, cylinder: -0.75, axis: 90 } },
  { name: 'Directional example', short: 'Directional', settings: { sphere: -1.75, cylinder: -1.25, axis: 35 } },
]

const SCREEN_PPM_96_DPI = 3780
const BLEND_RADIUS_RATIO = 1.2

function BrandMark(): JSX.Element {
  return (
    <svg className="brand-mark" viewBox="0 0 64 52" aria-hidden="true">
      <defs>
        <linearGradient id="refract-gradient" x1="7" y1="4" x2="57" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7b5cf0" />
          <stop offset="1" stopColor="#4b8af0" />
        </linearGradient>
      </defs>
      <path d="M5 45 23 7l13 22-9 16H5Z" fill="url(#refract-gradient)" />
      <path d="m31 45 10-18 18 18H31Z" fill="#4b8af0" opacity=".82" />
      <path d="m23 7 18 20-5 2L23 7Z" fill="#b7cbff" opacity=".72" />
    </svg>
  )
}

function fmtDioptres(value: number): string {
  if (value === 0) return '0.00 D'
  return `${value > 0 ? '+' : '-'}${Math.abs(value).toFixed(2)} D`
}

function RangeControl({
  id,
  label,
  value,
  min,
  max,
  step,
  output,
  disabled = false,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  output: string
  disabled?: boolean
  onChange(value: number): void
}): JSX.Element {
  const progress = ((value - min) / (max - min)) * 100
  return (
    <div className={`range-control${disabled ? ' is-disabled' : ''}`}>
      <div className="range-label-row">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{output}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={output}
        style={{ '--range-progress': `${progress}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

function CorrectionStage({
  enabled,
  compareHeld,
  trackingMode,
  settings,
  kernel,
  gazeViewportRef,
  onStatus,
}: {
  enabled: boolean
  compareHeld: boolean
  trackingMode: TrackingMode
  settings: DemoSettings
  kernel: CorrectionKernel
  gazeViewportRef: MutableRefObject<ViewportPoint | null>
  onStatus(status: WebGLStatus, message?: string): void
}): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null)
  const correctionCanvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CorrectionRenderer | null>(null)
  const textureDirtyRef = useRef(true)
  const kernelDirtyRef = useRef(true)
  const liveRef = useRef({ enabled, compareHeld, trackingMode, settings, kernel })

  useEffect(() => {
    liveRef.current = { enabled, compareHeld, trackingMode, settings, kernel }
    kernelDirtyRef.current = true
  }, [enabled, compareHeld, trackingMode, settings, kernel])

  useEffect(() => {
    const stage = stageRef.current
    const sourceCanvas = sourceCanvasRef.current
    const correctionCanvas = correctionCanvasRef.current
    if (!stage || !sourceCanvas || !correctionCanvas) return

    let disposed = false
    let failed = false
    let animationFrame = 0
    let renderer: CorrectionRenderer | null = null
    const forceFallback = new URLSearchParams(window.location.search).get('webgl') === 'off'

    const handleContextLost = (event: Event): void => {
      event.preventDefault()
      failed = true
      onStatus('error', 'The WebGL context was lost. The original content remains available; reload to try the correction pass again.')
    }

    correctionCanvas.addEventListener('webglcontextlost', handleContextLost)

    const resize = (): void => {
      const rect = stage.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(rect.width * pixelRatio))
      const height = Math.max(1, Math.round(rect.height * pixelRatio))
      if (sourceCanvas.width === width && sourceCanvas.height === height) return
      sourceCanvas.width = width
      sourceCanvas.height = height
      correctionCanvas.width = width
      correctionCanvas.height = height
      drawDemoScene(sourceCanvas)
      textureDirtyRef.current = true
      kernelDirtyRef.current = true
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(stage)
    resize()

    try {
      if (forceFallback) throw new Error('WebGL fallback requested for verification')
      renderer = new CorrectionRenderer(correctionCanvas)
      renderer.init()
      rendererRef.current = renderer
      onStatus('ready')
    } catch (error) {
      const webglAvailable = !forceFallback && Boolean(document.createElement('canvas').getContext('webgl2'))
      failed = true
      onStatus(
        webglAvailable ? 'error' : 'unsupported',
        webglAvailable
          ? 'The correction shader could not initialize. The unprocessed demonstration content is still available.'
          : 'WebGL2 is unavailable in this browser. The unprocessed demonstration content is still available.',
      )
    }

    const frame = (): void => {
      if (disposed) return
      animationFrame = requestAnimationFrame(frame)
      if (!renderer || failed) return

      try {
        const current = liveRef.current
        if (!current.enabled || current.compareHeld) {
          renderer.clear()
          return
        }

        if (textureDirtyRef.current) {
          renderer.uploadImageData(sourceCanvas)
          textureDirtyRef.current = false
        }
        if (kernelDirtyRef.current) {
          renderer.setKernel(new Float32Array(current.kernel.kernelData), current.kernel.size)
          kernelDirtyRef.current = false
        }

        const stageRect = stage.getBoundingClientRect()
        const point = gazeViewportRef.current
        const valid = point && Number.isFinite(point.x) && Number.isFinite(point.y)
        const scaleX = correctionCanvas.width / stageRect.width
        const scaleY = correctionCanvas.height / stageRect.height
        const gazeX = valid ? (point.x - stageRect.left) * scaleX : correctionCanvas.width / 2
        const gazeY = valid ? (point.y - stageRect.top) * scaleY : correctionCanvas.height / 2
        const inBounds = gazeX >= 0 && gazeX <= correctionCanvas.width && gazeY >= 0 && gazeY <= correctionCanvas.height

        renderer.setGazePoint(inBounds ? gazeX : correctionCanvas.width / 2, inBounds ? gazeY : correctionCanvas.height / 2)
        renderer.setEnabled(true)
        renderer.setFovealParams(
          current.settings.radius * scaleX,
          current.settings.radius * scaleX * BLEND_RADIUS_RATIO,
        )
        renderer.setStrength(current.settings.strength)
        renderer.render()
      } catch (error) {
        failed = true
        renderer.clear()
        onStatus('error', 'Rendering paused after an unexpected WebGL error. The original content remains visible.')
      }
    }
    animationFrame = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      correctionCanvas.removeEventListener('webglcontextlost', handleContextLost)
      renderer?.destroy()
      rendererRef.current = null
    }
  }, [gazeViewportRef, onStatus])

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (trackingMode !== 'cursor') return
    gazeViewportRef.current = { x: event.clientX, y: event.clientY }
  }

  return (
    <div
      ref={stageRef}
      className="correction-stage"
      data-testid="correction-stage"
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerMove}
      aria-label="Interactive Refract correction canvas. Move the pointer across the content to move the focal region."
    >
      <canvas ref={sourceCanvasRef} className="source-canvas" aria-hidden="true" />
      <canvas ref={correctionCanvasRef} className="correction-canvas" aria-hidden="true" />
      <div className="stage-corner-label" aria-hidden="true">
        <span className={`status-dot${enabled && !compareHeld ? ' is-active' : ''}`} />
        {compareHeld || !enabled ? 'Original source' : trackingMode === 'eye' ? 'Camera gaze focal region' : 'Cursor focal region'}
      </div>
      <p className="stage-instruction">
        {trackingMode === 'cursor' ? 'Move your pointer across the fine text and line patterns.' : 'Look around the detail workspace; use cursor mode if tracking drifts.'}
      </p>
    </div>
  )
}

export function App(): JSX.Element {
  const [settings, setSettings] = useState<DemoSettings>(DEFAULT_SETTINGS)
  const [enabled, setEnabled] = useState(true)
  const [compareHeld, setCompareHeld] = useState(false)
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('cursor')
  const [webglStatus, setWebglStatus] = useState<WebGLStatus>('initializing')
  const [webglMessage, setWebglMessage] = useState('Initializing the shared WebGL2 correction renderer…')
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('off')
  const gazeViewportRef = useRef<ViewportPoint | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const trackerRef = useRef<{ stop(): void } | null>(null)

  const eyePrescription = useMemo<EyePrescription>(
    () => ({
      sphere: settings.sphere,
      cylinder: settings.cylinder === 0 ? null : settings.cylinder,
      axis: settings.cylinder === 0 ? null : settings.axis,
      add: null,
      pd: 31.5,
    }),
    [settings.sphere, settings.cylinder, settings.axis],
  )

  const psf = useMemo<PSFKernel>(
    () =>
      computePSF(
        eyePrescription,
        {
          viewingDistanceCm: settings.viewingDistance,
          screenPPM: SCREEN_PPM_96_DPI,
          pupilDiameterMm: 4,
          kernelSize: LIVE_CORRECTION_KERNEL_SIZE,
        },
        'OD',
      ),
    [eyePrescription, settings.viewingDistance],
  )

  const correctionKernel = useMemo<CorrectionKernel>(
    () =>
      computeCorrectionKernel(
        psf,
        eyePrescription,
        { strength: settings.strength, method: 'unsharp' },
        settings.viewingDistance,
      ),
    [psf, eyePrescription, settings.strength, settings.viewingDistance],
  )

  const handleWebGLStatus = useCallback((status: WebGLStatus, message?: string): void => {
    setWebglStatus(status)
    if (status === 'ready') setWebglMessage('Shared WebGL2 correction pipeline ready')
    else if (message) setWebglMessage(message)
  }, [])

  const stopCamera = useCallback((nextStatus: CameraStatus = 'off'): void => {
    trackerRef.current?.stop()
    trackerRef.current = null
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setTrackingMode('cursor')
    setCameraStatus(nextStatus)
  }, [])

  useEffect(() => () => stopCamera('off'), [stopCamera])

  const startCamera = async (): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      stopCamera('unavailable')
      return
    }

    setCameraStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      cameraStreamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      setCameraStatus('loading')
      const { IrisGazeTracker } = await import('../src/renderer/lib/eyetracking/iris-gaze')
      const tracker = new IrisGazeTracker()
      trackerRef.current = tracker
      tracker.onGaze = (point) => {
        gazeViewportRef.current = {
          x: point.x - window.screenX,
          y: point.y - window.screenY,
        }
        setCameraStatus((current) => (current === 'lost' ? 'active' : current))
      }
      tracker.onGazeLost = () => setCameraStatus((current) => (current === 'active' ? 'lost' : current))
      await tracker.initialize(videoRef.current)
      tracker.startProcessing()
      setTrackingMode('eye')
      setCameraStatus('active')
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') stopCamera('denied')
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') stopCamera('unavailable')
      else stopCamera('error')
    }
  }

  const applyPreset = (preset: (typeof PRESETS)[number]): void => {
    setSettings((current) => ({ ...current, ...preset.settings }))
    setEnabled(true)
  }

  const resetDemo = (): void => {
    stopCamera('off')
    setSettings(DEFAULT_SETTINGS)
    setEnabled(true)
    setCompareHeld(false)
  }

  const cameraMessage = useMemo(() => {
    switch (cameraStatus) {
      case 'requesting': return 'Waiting for browser camera permission…'
      case 'loading': return 'Loading MediaPipe Face Mesh locally in this page…'
      case 'active': return 'Camera gaze is active. Video stays in this browser tab.'
      case 'lost': return 'Face or iris landmarks are temporarily unavailable. Cursor mode remains ready.'
      case 'denied': return 'Camera access was denied. Nothing else is required; cursor mode remains fully functional.'
      case 'unavailable': return 'No compatible camera is available. Cursor mode remains fully functional.'
      case 'error': return 'Camera gaze could not start. Cursor mode remains fully functional.'
      default: return ''
    }
  }, [cameraStatus])

  const comparisonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      setCompareHeld(true)
    }
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Refract browser demo home">
          <BrandMark />
          <span>Refract</span>
        </a>
        <div className="header-meta">
          <span className="prototype-chip">Interactive prototype</span>
          <a href="https://github.com/kzhu37/Refract-Portfolio" target="_blank" rel="noreferrer">
            View source
            <span aria-hidden="true"> ↗</span>
          </a>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Computational optics · gaze-aware rendering</p>
            <h1 id="hero-title">See Refract’s correction pipeline work in your browser.</h1>
            <p className="hero-description">
              Move across the detail workspace to drive a localized correction region. Prescription values become a directional point-spread function, then Refract’s shared WebGL2 shader applies the active correction kernel in real time. This browser showcase also adds separated luma edge copies so the pre-correction pattern is easier to inspect; that visibility aid is disabled in the Electron desktop renderer.
            </p>
          </div>
          <div className="scope-banner" role="note">
            <span className="scope-icon" aria-hidden="true">i</span>
            <p>
              <strong>Browser demo scope:</strong> Correction is limited to content inside this page. The full desktop prototype captures desktop content and renders through a separate transparent Electron overlay above other applications.
            </p>
          </div>
        </section>

        <section className="demo-shell" aria-labelledby="demo-heading">
          <div className="demo-toolbar">
            <div>
              <p className="section-kicker">Live correction</p>
              <h2 id="demo-heading">Detail workspace</h2>
            </div>
            <div className="toolbar-actions">
              <button
                type="button"
                className={`correction-toggle${enabled ? ' is-on' : ''}`}
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled((current) => !current)}
              >
                <span className="toggle-track" aria-hidden="true"><span /></span>
                Correction {enabled ? 'on' : 'off'}
              </button>
              <button
                type="button"
                className="compare-button"
                onPointerDown={() => setCompareHeld(true)}
                onPointerUp={() => setCompareHeld(false)}
                onPointerCancel={() => setCompareHeld(false)}
                onPointerLeave={() => setCompareHeld(false)}
                onKeyDown={comparisonKeyDown}
                onKeyUp={() => setCompareHeld(false)}
              >
                Hold for original
              </button>
            </div>
          </div>

          <div className="demo-layout">
            <div className="stage-column">
              <CorrectionStage
                enabled={enabled && webglStatus === 'ready'}
                compareHeld={compareHeld}
                trackingMode={trackingMode}
                settings={settings}
                kernel={correctionKernel}
                gazeViewportRef={gazeViewportRef}
                onStatus={handleWebGLStatus}
              />

              <div className={`pipeline-status status-${webglStatus}`} role="status" aria-live="polite" data-render-status={webglStatus}>
                <span className="status-dot" aria-hidden="true" />
                <span>{webglMessage}</span>
                {webglStatus !== 'ready' && <span className="fallback-label">Unprocessed canvas fallback active</span>}
              </div>

              <div className="model-strip" aria-label="Current optics model">
                <div><span>PSF σx</span><strong>{psf.sigmaX.toFixed(2)} px</strong></div>
                <div><span>PSF σy</span><strong>{psf.sigmaY.toFixed(2)} px</strong></div>
                <div><span>Kernel</span><strong>{correctionKernel.size} × {correctionKernel.size}</strong></div>
                <div><span>Model input</span><strong>{settings.viewingDistance} cm · 96-DPI fallback</strong></div>
              </div>
            </div>

            <aside className="control-panel" aria-label="Refract demonstration controls">
              <div className="control-section">
                <div className="control-heading-row">
                  <div>
                    <p className="section-kicker">Quick examples</p>
                    <h3>Prescription preset</h3>
                  </div>
                  <button type="button" className="text-button" onClick={resetDemo}>Reset</button>
                </div>
                <div className="preset-grid" role="group" aria-label="Prescription presets">
                  {PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.name}
                      className={
                        settings.sphere === preset.settings.sphere &&
                        settings.cylinder === preset.settings.cylinder &&
                        settings.axis === preset.settings.axis
                          ? 'is-selected'
                          : ''
                      }
                      onClick={() => applyPreset(preset)}
                    >
                      <span>{preset.short}</span>
                      <small>{fmtDioptres(preset.settings.sphere)}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-section control-ranges">
                <RangeControl id="sphere" label="Sphere" value={settings.sphere} min={-4} max={2} step={0.25} output={fmtDioptres(settings.sphere)} onChange={(sphere) => setSettings((current) => ({ ...current, sphere }))} />
                <RangeControl id="cylinder" label="Cylinder" value={settings.cylinder} min={-2} max={0} step={0.25} output={fmtDioptres(settings.cylinder)} onChange={(cylinder) => setSettings((current) => ({ ...current, cylinder }))} />
                <RangeControl id="axis" label="Axis" value={settings.axis} min={1} max={180} step={1} output={`${settings.axis}°`} disabled={settings.cylinder === 0} onChange={(axis) => setSettings((current) => ({ ...current, axis }))} />
                <RangeControl id="strength" label="Correction strength" value={settings.strength} min={0.15} max={1} step={0.05} output={`${Math.round(settings.strength * 100)}%`} onChange={(strength) => setSettings((current) => ({ ...current, strength }))} />
                <RangeControl id="radius" label="Focal-region size" value={settings.radius} min={70} max={220} step={5} output={`${settings.radius} px`} onChange={(radius) => setSettings((current) => ({ ...current, radius }))} />
              </div>

              <div className="control-section tracking-section">
                <div>
                  <p className="section-kicker">Point of attention</p>
                  <h3>Tracking source</h3>
                </div>
                <div className="segmented-control" role="radiogroup" aria-label="Tracking source">
                  <button type="button" role="radio" aria-checked={trackingMode === 'cursor'} className={trackingMode === 'cursor' ? 'is-selected' : ''} onClick={() => stopCamera('off')}>Cursor</button>
                  <button type="button" role="radio" aria-checked={trackingMode === 'eye'} className={trackingMode === 'eye' ? 'is-selected' : ''} onClick={() => setCameraStatus('explaining')}>Camera gaze <span>optional</span></button>
                </div>

                {cameraStatus === 'explaining' && (
                  <div className="camera-consent" role="note">
                    <strong>Before the browser asks</strong>
                    <p>Camera access lets the existing MediaPipe iris tracker move the focal region. Processing stays in this tab; video is not uploaded, recorded, or saved. Cursor mode remains available if you decline.</p>
                    <div className="camera-actions">
                      <button type="button" className="secondary-button" onClick={() => setCameraStatus('off')}>Not now</button>
                      <button type="button" className="primary-button" onClick={() => void startCamera()}>Continue to camera</button>
                    </div>
                  </div>
                )}

                {cameraMessage && cameraStatus !== 'explaining' && (
                  <div className={`camera-state camera-${cameraStatus}`} role="status" aria-live="polite">
                    <span className="status-dot" aria-hidden="true" />
                    <p>{cameraMessage}</p>
                    {(cameraStatus === 'denied' || cameraStatus === 'unavailable' || cameraStatus === 'error') && (
                      <button type="button" className="text-button" onClick={() => setCameraStatus('explaining')}>Try again</button>
                    )}
                  </div>
                )}

                <video ref={videoRef} className={trackingMode === 'eye' ? 'camera-preview is-visible' : 'camera-preview'} muted playsInline aria-label="Local camera preview" />
                {trackingMode === 'eye' && (
                  <p className="tracking-note">This quick browser mode uses Refract’s eye-relative iris features and Kalman smoothing without the desktop app’s full 3 × 3 gaze calibration.</p>
                )}
              </div>

              <details className="model-details">
                <summary>Physical model input</summary>
                <div className="details-body">
                  <RangeControl id="distance" label="Viewing distance" value={settings.viewingDistance} min={40} max={100} step={5} output={`${settings.viewingDistance} cm`} onChange={(viewingDistance) => setSettings((current) => ({ ...current, viewingDistance }))} />
                  <p>Browsers cannot reliably know a display’s physical pixel density, so this demo uses the desktop model’s documented 96-DPI fallback. The full prototype includes physical screen calibration.</p>
                </div>
              </details>
            </aside>
          </div>
        </section>

        <section className="explanation-section" aria-labelledby="how-heading">
          <div className="section-intro">
            <p className="section-kicker">What is running</p>
            <h2 id="how-heading">The browser reuses the optics and shader, with one explicit visibility aid.</h2>
            <p>The live page imports Refract’s platform-neutral prescription conversion, PSF generation, normalized unsharp kernel, WebGL utilities, and GLSL correction shader from the desktop codebase. The page-scoped canvas additionally enables displaced luma edge copies so the pre-correction pattern is easier to inspect; the Electron overlay leaves that browser-only control at zero.</p>
          </div>
          <ol className="pipeline-cards">
            <li><span>01</span><strong>Model</strong><p>Sphere, cylinder, axis, distance, screen scale, and pupil size become a rotated anisotropic Gaussian PSF.</p></li>
            <li><span>02</span><strong>Correct</strong><p>The active path forms an energy-normalized unsharp kernel and uploads it to the shared WebGL2 renderer.</p></li>
            <li><span>03</span><strong>Localize</strong><p>Cursor or optional iris tracking places a smoothly faded focal region while luma/chroma and brightness safeguards remain active.</p></li>
          </ol>

          <details className="scope-details">
            <summary>Browser demo vs. desktop prototype</summary>
            <div className="scope-comparison">
              <div>
                <span className="comparison-label">Browser demo</span>
                <h3>Page-scoped interaction</h3>
                <ul>
                  <li>Processes only the page-owned demonstration canvas</li>
                  <li>Uses browser WebGL2, cursor events, and optional camera APIs</li>
                  <li>Adds a disclosed edge-separation visibility aid that is disabled on desktop</li>
                  <li>Keeps all values and camera-derived points ephemeral</li>
                </ul>
              </div>
              <div>
                <span className="comparison-label">Desktop prototype</span>
                <h3>Full system integration</h3>
                <ul>
                  <li>Captures arbitrary desktop content through Electron</li>
                  <li>Renders a protected, transparent, click-through overlay above other apps</li>
                  <li>Includes desktop IPC, persistence, shortcuts, tray controls, and full calibration flows</li>
                </ul>
              </div>
            </div>
          </details>
        </section>

        <section className="prototype-note" aria-labelledby="prototype-note-heading">
          <div>
            <p className="section-kicker">Experimental scope</p>
            <h2 id="prototype-note-heading">An engineering prototype, not a medical device.</h2>
          </div>
          <p>Refract’s Gaussian optical model and unsharp correction are pragmatic approximations for engineering exploration. This demo does not diagnose vision, produce a prescription, prove medical effectiveness, or replace glasses, contact lenses, or professional eye care.</p>
        </section>
      </main>

      <footer>
        <a className="brand footer-brand" href="#top"><BrandMark /><span>Refract</span></a>
        <p>Browser-scoped demonstration of the collaborative Refract engineering prototype.</p>
        <a href="https://github.com/kzhu37/Refract-Portfolio" target="_blank" rel="noreferrer">Technical repository ↗</a>
      </footer>
    </div>
  )
}

interface DemoErrorBoundaryState {
  failed: boolean
}

export class DemoErrorBoundary extends Component<{ children: ReactNode }, DemoErrorBoundaryState> {
  state: DemoErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): DemoErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Refract browser demo render failure', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main className="fatal-fallback">
        <BrandMark />
        <p className="section-kicker">Refract browser demo</p>
        <h1>The interactive interface could not start.</h1>
        <p>The desktop project and its technical documentation remain available, and no personal or camera data was sent.</p>
        <div>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>Reload demo</button>
          <a className="secondary-link" href="https://github.com/kzhu37/Refract-Portfolio">View repository</a>
        </div>
      </main>
    )
  }
}