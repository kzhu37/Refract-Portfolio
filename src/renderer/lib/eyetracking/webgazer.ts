import type { GazePoint } from '../types/prescription'
import { usePrescriptionStore } from '../store/prescription-store'
import { IrisGazeTracker } from './iris-gaze'

// ---------------------------------------------------------------------------
// Gaze controller
//
// Thin wrapper around IrisGazeTracker (MediaPipe FaceMesh iris landmarks). It
// owns the webcam (video element + MediaStream + the calibration-time preview)
// and forwards the tracker's gaze output to the store and event listeners. All
// the tracking maths — iris reading, polynomial calibration, Kalman smoothing,
// screen-absolute conversion and sendGazeUpdate — live in IrisGazeTracker.
//
// The public surface (initialize / getLatestGaze / calibrate /
// recordCalibrationPoint / destroy / on / off / pauseTracking / resumeTracking /
// setCameraPreview) is unchanged from the previous WebGazer implementation, so
// CalibrationOverlay and the rest of the app keep working untouched. The
// `WebGazerController` name is re-exported below purely for backward compat.
// ---------------------------------------------------------------------------

type GazeEvent =
  | 'initialized'
  | 'gaze_update'
  | 'gaze_lost'
  | 'calibration_needed'
  | 'error'

const PREVIEW_VIDEO_ID = 'irisGazeVideo'

export class GazeController {
  private tracker       = new IrisGazeTracker()
  private latestGaze:   GazePoint | null = null
  private listeners:    Map<string, Function[]> = new Map()
  private isInitialized = false

  private video:  HTMLVideoElement | null = null
  private stream: MediaStream | null = null

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.resumeTracking()
      return
    }
    try {
      // Acquire the webcam ourselves (WebGazer used to do this internally).
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      this.stream = stream

      const video = this.createVideoElement()
      this.video = video
      video.srcObject = stream
      await video.play()

      // Feed the tracker's gaze output into the store + event listeners. The
      // tracker has already run the Kalman filter and called sendGazeUpdate.
      this.tracker.onGaze = (point) => {
        this.latestGaze = point
        usePrescriptionStore.getState().setGazePoint(point)
        this.emit('gaze_update', point)
      }
      this.tracker.onGazeLost = () => this.emit('gaze_lost')

      await this.tracker.initialize(video)
      this.tracker.startProcessing()

      this.isInitialized = true
      this.emit('initialized')
    } catch (err) {
      this.emit('error', err)
      throw err
    }
  }

  // ── Calibration ───────────────────────────────────────────────────────────

  async calibrate(): Promise<void> {
    this.emit('calibration_needed')
    // CalibrationOverlay drives the UI; it calls recordCalibrationPoint() for
    // each fixation target. The tracker fits the polynomials automatically once
    // enough points are recorded.
  }

  recordCalibrationPoint(x: number, y: number): void {
    // x/y are window-relative (viewport) coords — the same space the tracker
    // predicts in before adding window.screenX/Y for screen-absolute gaze.
    this.tracker.recordCalibrationPoint(x, y)
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getLatestGaze(): GazePoint | null {
    return this.latestGaze
  }

  pauseTracking(): void {
    this.tracker.pause()
  }

  resumeTracking(): void {
    this.tracker.resume()
  }

  // ── Camera preview ──────────────────────────────────────────────────────────
  // The video element always exists (FaceMesh needs it), but it is hidden during
  // normal tracking and only surfaced as a small click-through preview during
  // calibration so the user can frame their face.

  setCameraPreview(visible: boolean): void {
    const video = this.video
    if (!video) return
    if (visible) {
      video.style.opacity = '0.9'
      video.style.width   = '160px'
      video.style.height  = '120px'
    } else {
      // Shrink to 1px + opacity 0 rather than display:none — a display:none
      // <video> can stop decoding frames, which would freeze FaceMesh's input.
      // At 1px in the corner it's invisible but still delivering frames. (CSS
      // size doesn't affect capture; FaceMesh reads the native videoWidth/Height.)
      video.style.opacity = '0'
      video.style.width   = '1px'
      video.style.height  = '1px'
    }
  }

  async destroy(): Promise<void> {
    if (!this.isInitialized) return
    this.tracker.stop()
    this.tracker.onGaze     = null
    this.tracker.onGazeLost = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video?.remove()
    this.video = null
    this.isInitialized = false
    this.latestGaze = null
    this.listeners.clear()
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private createVideoElement(): HTMLVideoElement {
    const existing = document.getElementById(PREVIEW_VIDEO_ID) as HTMLVideoElement | null
    if (existing) return existing

    const video = document.createElement('video')
    video.id          = PREVIEW_VIDEO_ID
    video.autoplay    = true
    video.playsInline = true
    video.muted       = true
    Object.assign(video.style, {
      position:      'fixed',
      bottom:        '16px',
      right:         '16px',
      width:         '1px',
      height:        '1px',
      opacity:       '0',
      borderRadius:  '8px',
      objectFit:     'cover',
      pointerEvents: 'none',           // never swallow a calibration-dot click
      transform:     'scaleX(-1)',     // mirror so the preview reads naturally
      zIndex:        '10002',
      transition:    'opacity 0.15s ease',
    } as Partial<CSSStyleDeclaration>)
    document.body.appendChild(video)
    return video
  }

  // ── Event emitter ───────────────────────────────────────────────────────────

  on(event: GazeEvent, cb: Function): void {
    const list = this.listeners.get(event) ?? []
    list.push(cb)
    this.listeners.set(event, list)
  }

  off(event: GazeEvent, cb: Function): void {
    const list = this.listeners.get(event)
    if (!list) return
    const idx = list.indexOf(cb)
    if (idx !== -1) list.splice(idx, 1)
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach((cb) => cb(...args))
  }
}

// Backward-compatible alias: existing code imports `WebGazerController` as a
// type. The implementation is now iris-landmark based.
export { GazeController as WebGazerController }

export const gazeTracker = new GazeController()
