import type { FaceMesh, Results } from '@mediapipe/face_mesh'
import type { GazePoint } from '../types/prescription'
import { buildFeatures, fitAxis } from './gaze-calibration'
import { GazeSmoother } from './gaze-smoother'

// ---------------------------------------------------------------------------
// Iris-landmark gaze tracking
//
// FaceMesh with refineLandmarks=true emits 478 landmarks; the two iris centres
// sit at index 468 (left) and 473 (right) in normalised 0-1 coordinates.
//
// Regressing directly on raw iris pixels makes calibration especially sensitive
// to head translation and viewing-distance changes. Instead, Refract measures
// iris position relative to the eye corners and divides by eye width. This
// eye-relative feature reduces those effects, but it does not make the tracker
// invariant to head pose, lighting, camera position, or individual eye geometry.
// The calibrated feature is mapped to the screen with a per-axis degree-2
// polynomial and then smoothed for runtime use.
// ---------------------------------------------------------------------------

const LEFT_IRIS_CENTER  = 468
const RIGHT_IRIS_CENTER = 473

const LEFT_EYE_OUTER  = 33
const LEFT_EYE_INNER  = 133
const RIGHT_EYE_INNER = 362
const RIGHT_EYE_OUTER = 263

const MIN_CALIB_SAMPLES = 6
const RECENT_BUFFER_SIZE = 16
const CALIB_SAMPLE_FRAMES = 10

const UNCAL_HALF_RANGE_X = 0.18
const UNCAL_HALF_RANGE_Y = 0.12

export interface IrisPosition {
  x: number
  y: number
}

interface CalibSample {
  feature: IrisPosition
  targetX: number
  targetY: number
}

type Landmark = { x: number; y: number; z?: number }

/**
 * Eye-relative gaze feature for one eye: iris offset from the midpoint of the
 * eye corners, divided by eye width. Returns null when the landmarks are
 * degenerate. This representation reduces sensitivity to translation and scale
 * compared with raw iris pixels; it is not a head-pose-invariant measurement.
 */
function eyeFeature(
  lm: Landmark[], irisIdx: number, cornerA: number, cornerB: number,
  vw: number, vh: number,
): IrisPosition | null {
  const iris = lm[irisIdx], a = lm[cornerA], b = lm[cornerB]
  if (!iris || !a || !b) return null
  const ax = a.x * vw, ay = a.y * vh
  const bx = b.x * vw, by = b.y * vh
  const width = Math.hypot(bx - ax, by - ay)
  if (width < 1) return null
  const midX = (ax + bx) / 2, midY = (ay + by) / 2
  return { x: (iris.x * vw - midX) / width, y: (iris.y * vh - midY) / width }
}

/** Average the available eye-relative features across both eyes. */
function gazeFeature(lm: Landmark[], vw: number, vh: number): IrisPosition | null {
  const l = eyeFeature(lm, LEFT_IRIS_CENTER, LEFT_EYE_OUTER, LEFT_EYE_INNER, vw, vh)
  const r = eyeFeature(lm, RIGHT_IRIS_CENTER, RIGHT_EYE_INNER, RIGHT_EYE_OUTER, vw, vh)
  if (l && r) return { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }
  return l ?? r
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function dot(a: number[], b: number[]): number {
  let total = 0
  for (let i = 0; i < a.length; i++) total += a[i] * b[i]
  return total
}

// ---------------------------------------------------------------------------
// IrisGazeTracker
// ---------------------------------------------------------------------------

export class IrisGazeTracker {
  private faceMesh: FaceMesh | null = null
  private video: HTMLVideoElement | null = null
  private rafId = 0
  private processing = false
  private paused = false

  private latestIris: IrisPosition | null = null
  private latestGaze: GazePoint | null = null
  private recentFeatures: IrisPosition[] = []

  private samples: CalibSample[] = []
  private coeffsX: number[] | null = null
  private coeffsY: number[] | null = null

  private normMeanX = 0
  private normMeanY = 0
  private normScaleX = 1
  private normScaleY = 1

  private baselineFeature: IrisPosition | null = null
  private smoother = new GazeSmoother()

  onGaze: ((point: GazePoint) => void) | null = null
  onGazeLost: (() => void) | null = null

  async initialize(video: HTMLVideoElement): Promise<void> {
    this.video = video

    const { FaceMesh: FM } = await import('@mediapipe/face_mesh')
    this.faceMesh = new FM({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
    }) as FaceMesh

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.8,
      minTrackingConfidence: 0.5,
    })

    this.faceMesh.onResults((results: Results) => this.handleResults(results))
    await this.faceMesh.initialize()
  }

  private handleResults(results: Results): void {
    const video = this.video
    if (!results.multiFaceLandmarks?.length || !video) {
      this.latestIris = null
      this.onGazeLost?.()
      return
    }

    const landmarks = results.multiFaceLandmarks[0]
    const vw = video.videoWidth || 640
    const vh = video.videoHeight || 480

    const left = landmarks[LEFT_IRIS_CENTER]
    const right = landmarks[RIGHT_IRIS_CENTER]
    if (left && right) {
      this.latestIris = {
        x: ((left.x + right.x) / 2) * vw,
        y: ((left.y + right.y) / 2) * vh,
      }
    }

    const feature = gazeFeature(landmarks as Landmark[], vw, vh)
    if (!feature) {
      this.onGazeLost?.()
      return
    }

    this.recentFeatures.push(feature)
    if (this.recentFeatures.length > RECENT_BUFFER_SIZE) this.recentFeatures.shift()

    let rawX: number
    let rawY: number

    if (this.coeffsX && this.coeffsY) {
      const nx = (feature.x - this.normMeanX) / this.normScaleX
      const ny = (feature.y - this.normMeanY) / this.normScaleY
      const polynomial = buildFeatures(nx, ny)
      rawX = dot(this.coeffsX, polynomial)
      rawY = dot(this.coeffsY, polynomial)
    } else {
      if (!this.baselineFeature) this.baselineFeature = { x: feature.x, y: feature.y }
      const width = window.innerWidth
      const height = window.innerHeight
      const gainX = -(width / 2) / UNCAL_HALF_RANGE_X
      const gainY = (height / 2) / UNCAL_HALF_RANGE_Y
      rawX = width / 2 + (feature.x - this.baselineFeature.x) * gainX
      rawY = height / 2 + (feature.y - this.baselineFeature.y) * gainY
    }

    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      this.onGazeLost?.()
      return
    }

    const timestamp = performance.now()
    const smoothed = this.smoother.update(rawX, rawY, timestamp)

    const point: GazePoint = {
      x: smoothed.x + window.screenX,
      y: smoothed.y + window.screenY,
      timestamp,
    }
    this.latestGaze = point

    window.electronAPI?.sendGazeUpdate(point)
    this.onGaze?.(point)
  }

  startProcessing(): void {
    const tick = (): void => {
      if (!this.processing && !this.paused && this.video && this.faceMesh) {
        this.processing = true
        this.faceMesh
          .send({ image: this.video })
          .catch(() => {})
          .finally(() => { this.processing = false })
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  pause(): void { this.paused = true }
  resume(): void { this.paused = false }

  /**
   * Record a calibration point against a known window-relative screen target.
   * The feature is the median of recent frames rather than one instantaneous
   * sample. Once enough samples exist, the per-axis polynomials are refitted.
   */
  recordCalibrationPoint(targetX: number, targetY: number): boolean {
    if (this.recentFeatures.length === 0) return false

    const recent = this.recentFeatures.slice(
      Math.max(0, this.recentFeatures.length - CALIB_SAMPLE_FRAMES),
    )
    const feature: IrisPosition = {
      x: median(recent.map((sample) => sample.x)),
      y: median(recent.map((sample) => sample.y)),
    }

    this.samples.push({ feature, targetX, targetY })
    if (this.samples.length >= MIN_CALIB_SAMPLES) this.fit()
    return true
  }

  private fit(): void {
    const xs = this.samples.map((sample) => sample.feature.x)
    const ys = this.samples.map((sample) => sample.feature.y)
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length
    const stdX = Math.sqrt(xs.reduce((a, x) => a + (x - meanX) ** 2, 0) / xs.length) || 1
    const stdY = Math.sqrt(ys.reduce((a, y) => a + (y - meanY) ** 2, 0) / ys.length) || 1

    const featureRows = this.samples.map((sample) =>
      buildFeatures(
        (sample.feature.x - meanX) / stdX,
        (sample.feature.y - meanY) / stdY,
      ),
    )
    const cx = fitAxis(featureRows, this.samples.map((sample) => sample.targetX))
    const cy = fitAxis(featureRows, this.samples.map((sample) => sample.targetY))

    if (cx && cy && cx.every(Number.isFinite) && cy.every(Number.isFinite)) {
      this.normMeanX = meanX
      this.normMeanY = meanY
      this.normScaleX = stdX
      this.normScaleY = stdY
      this.coeffsX = cx
      this.coeffsY = cy
      this.smoother.reset()
    }
  }

  resetCalibration(): void {
    this.samples = []
    this.coeffsX = null
    this.coeffsY = null
    this.baselineFeature = null
    this.smoother.reset()
  }

  isCalibrated(): boolean {
    return this.coeffsX !== null && this.coeffsY !== null
  }

  getLatestGaze(): GazePoint | null { return this.latestGaze }
  getLatestIris(): IrisPosition | null { return this.latestIris }

  stop(): void {
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.faceMesh?.close()
    this.faceMesh = null
    this.video = null
    this.latestIris = null
    this.latestGaze = null
    this.recentFeatures = []
    this.baselineFeature = null
    this.processing = false
  }
}
