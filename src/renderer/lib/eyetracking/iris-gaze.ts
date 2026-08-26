import type { FaceMesh, Results } from '@mediapipe/face_mesh'
import type { GazePoint } from '../types/prescription'
import { GazeSmoother } from './gaze-smoother'

// ---------------------------------------------------------------------------
// Iris-landmark gaze tracking
//
// FaceMesh with refineLandmarks=true emits 478 landmarks; the two iris centres
// sit at index 468 (left) and 473 (right) in normalised 0–1 coords.
//
// We do NOT regress on the raw iris pixel position — that moves both when the
// eye rotates AND when the head translates, so a calibration is only valid at
// the exact head pose it was captured in. Instead we use a head-pose-invariant
// feature: the iris position RELATIVE to the eye corners, divided by the eye
// width. Because the corners move with the head, this cancels head translation
// and viewing distance, leaving a signal that depends (mostly) on gaze angle.
// That feature is mapped to the screen with a per-axis degree-2 polynomial.
// ---------------------------------------------------------------------------

const LEFT_IRIS_CENTER  = 468
const RIGHT_IRIS_CENTER = 473

// Eye-corner landmarks (same indices the FaceTracker uses for eye centres).
const LEFT_EYE_OUTER  = 33
const LEFT_EYE_INNER  = 133
const RIGHT_EYE_INNER = 362
const RIGHT_EYE_OUTER = 263

// A degree-2 polynomial in (x, y) has 6 coefficients, so the least-squares fit
// needs at least 6 samples. The 9-point calibration grid comfortably exceeds it.
const MIN_CALIB_SAMPLES = 6

// Per-calibration-point robustness: keep a short rolling history of the gaze
// feature and, on each recorded point, take the median of the most recent
// frames. Median rejects blinks / micro-saccades far better than a single
// instantaneous sample. ~10 frames is well within the dot's fixation dwell.
const RECENT_BUFFER_SIZE   = 16
const CALIB_SAMPLE_FRAMES  = 10

// Uncalibrated fallback gain, in feature units (iris offset ÷ eye width). The
// feature swings roughly ±0.2 horizontally / ±0.12 vertically across the screen.
// These only shape the rough pre-calibration dot; the polynomial replaces them.
const UNCAL_HALF_RANGE_X = 0.18
const UNCAL_HALF_RANGE_Y = 0.12

export interface IrisPosition {
  x: number
  y: number
}

interface CalibSample {
  feature: IrisPosition   // head-normalized gaze feature
  targetX: number         // window-relative (viewport) screen target in px
  targetY: number
}

type Landmark = { x: number; y: number; z?: number }

/**
 * Head-pose-invariant gaze feature for one eye: the iris centre's offset from
 * the midpoint of the eye corners, divided by the eye width. Returns null if
 * the corner landmarks are degenerate.
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

/** Average head-normalized gaze feature across both eyes. */
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
// Polynomial regression — features [1, x, y, x², xy, y²], solved per axis via
// the normal equations (AᵀA)c = Aᵀb with Gauss–Jordan elimination.
// ---------------------------------------------------------------------------

function buildFeatures(x: number, y: number): number[] {
  return [1, x, y, x * x, x * y, y * y]
}

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/**
 * Solve the linear system M·c = v (n×n) by Gauss–Jordan elimination with
 * partial pivoting. Returns null if the matrix is singular (degenerate
 * calibration, e.g. all samples collected at one iris position).
 */
function solveLinear(M: number[][], v: number[]): number[] | null {
  const n = v.length
  // Augmented matrix [M | v]
  const a = M.map((row, i) => [...row, v[i]])

  for (let col = 0; col < n; col++) {
    // Partial pivot: largest magnitude entry in this column at/below the diagonal
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null
    if (pivot !== col) {
      const tmp = a[pivot]; a[pivot] = a[col]; a[col] = tmp
    }

    // Eliminate this column from every other row
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
 * Fit degree-2 polynomial coefficients mapping iris (x, y) → a single target
 * axis, given the precomputed feature rows and matching target values.
 */
function fitAxis(featureRows: number[][], targets: number[]): number[] | null {
  const n = 6
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

  private latestIris: IrisPosition | null = null   // raw iris centre (px), for accessors
  private latestGaze: GazePoint | null = null

  // Rolling history of the gaze feature, used to take a robust median per
  // calibration point instead of a single noisy frame.
  private recentFeatures: IrisPosition[] = []

  private samples: CalibSample[] = []
  private coeffsX: number[] | null = null
  private coeffsY: number[] | null = null

  // The gaze feature is further mean-centred + scaled to unit std before
  // building polynomial features, keeping the normal equations well-conditioned.
  private normMeanX = 0
  private normMeanY = 0
  private normScaleX = 1
  private normScaleY = 1

  // Neutral feature for the uncalibrated fallback (first valid reading, treated
  // as "looking at screen centre").
  private baselineFeature: IrisPosition | null = null

  private smoother = new GazeSmoother()

  // Wired up by the wrapper to feed the store / event emitter. The Kalman
  // filter, screen-absolute conversion and sendGazeUpdate all live here; these
  // callbacks are just notifications.
  onGaze:     ((point: GazePoint) => void) | null = null
  onGazeLost: (() => void) | null = null

  // ── Initialization ────────────────────────────────────────────────────────

  async initialize(video: HTMLVideoElement): Promise<void> {
    this.video = video

    // Lazy import — FaceMesh + WASM bundle is ~3 MB; don't block startup.
    const { FaceMesh: FM } = await import('@mediapipe/face_mesh')
    this.faceMesh = new FM({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
    }) as FaceMesh

    this.faceMesh.setOptions({
      maxNumFaces:            1,
      refineLandmarks:        true,   // required — adds the 10 iris landmarks
      minDetectionConfidence: 0.8,
      minTrackingConfidence:  0.5,
    })

    this.faceMesh.onResults((r: Results) => this.handleResults(r))
    await this.faceMesh.initialize()
  }

  // ── Results callback ──────────────────────────────────────────────────────

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

    // Raw iris centre (px) — kept for the accessor / debugging.
    const left  = lm[LEFT_IRIS_CENTER]
    const right = lm[RIGHT_IRIS_CENTER]
    if (left && right) {
      this.latestIris = {
        x: ((left.x + right.x) / 2) * vw,
        y: ((left.y + right.y) / 2) * vh,
      }
    }

    // Head-pose-invariant gaze feature (iris offset ÷ eye width). This is what
    // drives both calibration and runtime mapping.
    const feature = gazeFeature(lm as Landmark[], vw, vh)
    if (!feature) {
      this.onGazeLost?.()
      return
    }
    this.recentFeatures.push(feature)
    if (this.recentFeatures.length > RECENT_BUFFER_SIZE) this.recentFeatures.shift()

    // Map feature → raw window-relative gaze. Whenever tracking is enabled the
    // dot follows the eyes, calibrated or not.
    let rawX: number
    let rawY: number

    if (this.coeffsX && this.coeffsY) {
      // Calibrated: accurate degree-2 polynomial, using the same normalisation
      // applied at fit time.
      const nx = (feature.x - this.normMeanX) / this.normScaleX
      const ny = (feature.y - this.normMeanY) / this.normScaleY
      const f = buildFeatures(nx, ny)
      rawX = dot(this.coeffsX, f)
      rawY = dot(this.coeffsY, f)
    } else {
      // Uncalibrated: rough mapping so the dot still tracks immediately. Amplify
      // the feature's deviation from its neutral (first-seen) value out to a full
      // window sweep. gainX is negative because a standard, unmirrored webcam
      // sees the iris move opposite to the on-screen gaze direction horizontally.
      if (!this.baselineFeature) this.baselineFeature = { x: feature.x, y: feature.y }
      const w = window.innerWidth
      const h = window.innerHeight
      const gainX = -(w / 2) / UNCAL_HALF_RANGE_X
      const gainY =  (h / 2) / UNCAL_HALF_RANGE_Y
      rawX = w / 2 + (feature.x - this.baselineFeature.x) * gainX
      rawY = h / 2 + (feature.y - this.baselineFeature.y) * gainY
    }

    // Never forward a non-finite prediction — it would poison the Kalman filter
    // and paint NaN gaze into the correction shader.
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      this.onGazeLost?.()
      return
    }

    const ts = performance.now()
    const smoothed = this.smoother.update(rawX, rawY, ts)

    // Convert window-relative → screen-absolute, exactly as the old controller.
    const point: GazePoint = {
      x: smoothed.x + window.screenX,
      y: smoothed.y + window.screenY,
      timestamp: ts,
      confidence: 0.9,
    }
    this.latestGaze = point

    // The browser portfolio demo reuses this tracker without an Electron
    // preload bridge. Electron still receives the same IPC update, while the
    // optional callback remains the browser adapter's source of gaze points.
    window.electronAPI?.sendGazeUpdate(point)
    this.onGaze?.(point)
  }

  // ── Processing loop ───────────────────────────────────────────────────────

  startProcessing(): void {
    const tick = (): void => {
      // Send the next frame only once the previous one has resolved; this
      // self-throttles to FaceMesh's actual throughput without queueing a
      // backlog of frames.
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

  // ── Calibration ───────────────────────────────────────────────────────────

  /**
   * Record a calibration point against a known window-relative screen target.
   * Instead of a single noisy frame, the recorded feature is the median of the
   * most recent frames (the user has been fixating the dot for the dwell
   * period), which rejects blinks and micro-saccades. Once enough samples exist
   * the per-axis polynomials are (re)fitted. Returns false if no face/iris is
   * currently visible (the sample is skipped).
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
    // Population std; guard against a degenerate (zero-variance) axis so we
    // never divide by zero when the calibration barely moved.
    const stdX = Math.sqrt(xs.reduce((a, x) => a + (x - meanX) ** 2, 0) / xs.length) || 1
    const stdY = Math.sqrt(ys.reduce((a, y) => a + (y - meanY) ** 2, 0) / ys.length) || 1

    const featureRows = this.samples.map((s) =>
      buildFeatures((s.feature.x - meanX) / stdX, (s.feature.y - meanY) / stdY),
    )
    const cx = fitAxis(featureRows, this.samples.map((s) => s.targetX))
    const cy = fitAxis(featureRows, this.samples.map((s) => s.targetY))

    // Only activate a fit whose coefficients are all finite.
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
    this.baselineFeature = null   // re-establish neutral for the uncalibrated path
    this.smoother.reset()
  }

  isCalibrated(): boolean {
    return this.coeffsX !== null && this.coeffsY !== null
  }

  // ── Accessors / teardown ──────────────────────────────────────────────────

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
