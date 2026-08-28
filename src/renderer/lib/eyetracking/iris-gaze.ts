import type { FaceMesh, Results } from '@mediapipe/face_mesh'
import type { GazePoint } from '../types/prescription'
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
const RECENT_BUFFER_SIZE   = 16
const CALIB_SAMPLE_FRAMES  = 10

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
  const l = eyeFeature(lm, LEFT_IRIS_CENTER,  LEFT_EYE_OUTER,  LEFT_EYE_INNER,  vw, vh)
  const r = eyeFeature(lm, RIGHT_IRIS_CENTER, RIGHT_EYE_INNER, RIGHT_EYE_OUTER, vw, vh)
  if (l && r) return { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }
  return l ?? r
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---------------------------------------------------------------------------
// Polynomial regression: features [1, x, y, x², xy, y²], solved per axis via
// the normal equations (AᵀA)c = Aᵀb with Gauss-Jordan elimination.
// ---------------------------------------------------------------------------

/** Exported so deterministic tests can verify the calibration basis. */
export function buildFeatures(x: number, y: number): number[] {
  return [1, x, y, x * x, x * y, y * y]
}

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/**
 * Solve M·c = v by Gauss-Jordan elimination with partial pivoting. Returns null
 * when the matrix is singular, as can happen with degenerate calibration data.
 */
function solveLinear(M: number[][], v: number[]): number[] | null {
  const n = v.length
  const a = M.map((row, i) => [...row, v[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null
    if (pivot !== col) {
      const tmp = a[pivot]; a[pivot] = a[col]; a[col] = tmp
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = a[r][col] / a[col][col]
      if (factor === 0) continue
      for (let c = col; c <= n; c++) a[r][c] -= factor * a[col][c]
    }
  }

  return a.map((row, i) => row[n] / row[i][i])
}

/**
 * Fit degree-2 polynomial coefficients mapping normalized gaze features to one
 * target screen axis. Exported for deterministic numerical verification.
 */
export function fitAxis(featureRows: number[][], targets: number[]): number[] | null {
  const n = 6
  if (featureRows.length !== targets.length || featureRows.length < n) return null
  if (featureRows.some((row) => row.length !== n || row.some((v) => !Number.isFinite(v)))) return null
  if (targets.some((v) => !Number.isFinite(v))) return null

  const ATA: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  const ATb: number[] = new Array(n).fill(0)

  for (let s = 0; s < featureRows.length; s++) {
    const f = featureRows[s]
    const t = targets[s]
    for (let i = 0; i < n; i++) {
      ATb[i] += f[i] * t
      for (let j = 0; j < n; j++) ATA[i][j] += f[i] * f[j]
    }
  }

  return solveLinear(ATA, ATb)
}

// ---------------------------------------------------------------------------
// IrisGazeTracker
// ---------------------------------------------------------------------------

export class IrisGazeTracker {
  private faceMesh:   FaceMesh | null = null
  private video:      HTMLVideoElement | null = null
  private rafId       = 0
  private processing  = false
  private paused      = false

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

  onGaze:     ((point: GazePoint) => void) | null = null
  onGazeLost: (() => void) | null = null

  async initialize(video: HTMLVideoElement): Promise<void> {
    this.video = video

    const { FaceMesh: FM } = await import('@mediapipe/face_mesh')
    this.faceMesh = new FM({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
    }) as FaceMesh

    this.faceMesh.setOptions({
      maxNumFaces:            1,
      refineLandmarks:        true,
      minDetectionConfidence: 0.8,
      minTrackingConfidence:  0.5,
    })

    this.faceMesh.onResults((r: Results) => this.handleResults(r))
    await this.faceMesh.initialize()
  }

  private handleResults(results: Results): void {
    const video = this.video
    if (!results.multiFaceLandmarks?.length || !video) {
      this.latestIris = null
      this.onGazeLost?.()
      return
    }

    const lm = results.multiFaceLandmarks[0]
    const vw = video.videoWidth  || 640
    const vh = video.videoHeight || 480

    const left  = lm[LEFT_IRIS_CENTER]
    const right = lm[RIGHT_IRIS_CENTER]
    if (left && right) {
      this.latestIris = {
        x: ((left.x + right.x) / 2) * vw,
        y: ((left.y + right.y) / 2) * vh,
      }
    }

    const feature = gazeFeature(lm as Landmark[], vw, vh)
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
      const f = buildFeatures(nx, ny)
      rawX = dot(this.coeffsX, f)
      rawY = dot(this.coeffsY, f)
    } else {
      if (!this.baselineFeature) this.baselineFeature = { x: feature.x, y: feature.y }
      const w = window.innerWidth
      const h = window.innerHeight
      const gainX = -(w / 2) / UNCAL_HALF_RANGE_X
      const gainY =  (h / 2) / UNCAL_HALF_RANGE_Y
      rawX = w / 2 + (feature.x - this.baselineFeature.x) * gainX
      rawY = h / 2 + (feature.y - this.baselineFeature.y) * gainY
    }

    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      this.onGazeLost?.()
      return
    }

    const ts = performance.now()
    const smoothed = this.smoother.update(rawX, rawY, ts)

    const point: GazePoint = {
      x: smoothed.x + window.screenX,
      y: smoothed.y + window.screenY,
      timestamp: ts,
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

  pause(): void  { this.paused = true }
  resume(): void { this.paused = false }

  /**
   * Record a calibration point against a known window-relative screen target.
   * The feature is the median of recent frames rather than one instantaneous
   * sample. Once enough samples exist, the per-axis polynomials are refitted.
   */
  recordCalibrationPoint(targetX: number, targetY: number): boolean {
    const buf = this.recentFeatures
    if (buf.length === 0) return false

    const recent = buf.slice(Math.max(0, buf.length - CALIB_SAMPLE_FRAMES))
    const feature: IrisPosition = {
      x: median(recent.map((f) => f.x)),
      y: median(recent.map((f) => f.y)),
    }

    this.samples.push({ feature, targetX, targetY })
    if (this.samples.length >= MIN_CALIB_SAMPLES) this.fit()
    return true
  }

  private fit(): void {
    const xs = this.samples.map((s) => s.feature.x)
    const ys = this.samples.map((s) => s.feature.y)
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length
    const stdX = Math.sqrt(xs.reduce((a, x) => a + (x - meanX) ** 2, 0) / xs.length) || 1
    const stdY = Math.sqrt(ys.reduce((a, y) => a + (y - meanY) ** 2, 0) / ys.length) || 1

    const featureRows = this.samples.map((s) =>
      buildFeatures((s.feature.x - meanX) / stdX, (s.feature.y - meanY) / stdY),
    )
    const cx = fitAxis(featureRows, this.samples.map((s) => s.targetX))
    const cy = fitAxis(featureRows, this.samples.map((s) => s.targetY))

    if (cx && cy && cx.every(Number.isFinite) && cy.every(Number.isFinite)) {
      this.normMeanX  = meanX
      this.normMeanY  = meanY
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
    this.faceMesh   = null
    this.video      = null
    this.latestIris = null
    this.latestGaze = null
    this.recentFeatures = []
    this.baselineFeature = null
    this.processing = false
  }
}
