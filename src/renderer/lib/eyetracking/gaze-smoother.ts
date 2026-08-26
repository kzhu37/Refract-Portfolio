// ---------------------------------------------------------------------------
// Module-private matrix utilities (2D number arrays, no external dependencies)
// ---------------------------------------------------------------------------

/** A (m×n) × B (n×p) → C (m×p) */
function mul(A: number[][], B: number[][]): number[][] {
  const m = A.length
  const n = B.length
  const p = B[0].length
  const C: number[][] = Array.from({ length: m }, () => new Array(p).fill(0))
  for (let i = 0; i < m; i++)
    for (let k = 0; k < n; k++) {
      if (A[i][k] === 0) continue
      for (let j = 0; j < p; j++) C[i][j] += A[i][k] * B[k][j]
    }
  return C
}

/** A (m×n) × v (n) → w (m) */
function mulVec(A: number[][], v: number[]): number[] {
  const m = A.length
  const w = new Array<number>(m).fill(0)
  for (let i = 0; i < m; i++)
    for (let j = 0; j < v.length; j++) w[i] += A[i][j] * v[j]
  return w
}

function transpose(A: number[][]): number[][] {
  const m = A.length
  const n = A[0].length
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) => A[j][i])
  )
}

function add(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]))
}

function sub(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v - B[i][j]))
}

function eye4(): number[][] {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]
}

/** [[a,b],[c,d]]⁻¹ = [[d,-b],[-c,a]] / (ad - bc) */
function inv2(M: number[][]): number[][] {
  const d = 1 / (M[0][0] * M[1][1] - M[0][1] * M[1][0])
  return [
    [ M[1][1] * d, -M[0][1] * d],
    [-M[1][0] * d,  M[0][0] * d],
  ]
}

// ---------------------------------------------------------------------------
// Constants shared by GazeSmoother
// ---------------------------------------------------------------------------

// Initial error covariance - high position uncertainty, moderate velocity
const INITIAL_P: readonly (readonly number[])[] = [
  [100,   0,  0,  0],
  [  0, 100,  0,  0],
  [  0,   0, 10,  0],
  [  0,   0,  0, 10],
]

// Observation matrix: we only measure position, not velocity
const H: number[][] = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
]
const Ht = transpose(H)  // computed once; H is constant

function freshP(): number[][] {
  return INITIAL_P.map(row => [...row]) as number[][]
}

// ---------------------------------------------------------------------------
// GazeSmoother - constant-velocity Kalman filter on state [px, py, vx, vy]
// ---------------------------------------------------------------------------

export interface GazeSmootherOptions {
  /** Q scale factor - higher = trust motion model less (default 1.0) */
  processNoise?: number
  /** R scale factor - higher = trust sensor less, smoother output (default 8.0) */
  measurementNoise?: number
  /** px/s velocity at which a saccade is detected; filter resets instantly (default 300) */
  saccadeThreshold?: number
}

export class GazeSmoother {
  private state: number[] = [0, 0, 0, 0]  // [px, py, vx, vy]
  private P: number[][] = freshP()
  private initialized = false
  private lastTimestamp = 0

  private readonly processNoise: number
  private readonly measurementNoise: number
  private readonly saccadeThreshold: number

  constructor(opts?: GazeSmootherOptions) {
    this.processNoise = opts?.processNoise ?? 1.0
    this.measurementNoise = opts?.measurementNoise ?? 8.0
    this.saccadeThreshold = opts?.saccadeThreshold ?? 300
  }

  update(rawX: number, rawY: number, timestamp: number): { x: number; y: number } {
    if (!this.initialized) {
      this.state = [rawX, rawY, 0, 0]
      this.lastTimestamp = timestamp
      this.initialized = true
      return { x: rawX, y: rawY }
    }

    // dt in seconds; clamp to avoid huge prediction steps on tab-blur or first tick
    const dt = Math.min(Math.max((timestamp - this.lastTimestamp) / 1000, 0.005), 0.1)
    this.lastTimestamp = timestamp

    // 1. PREDICT -----------------------------------------------------------
    const F: number[][] = [
      [1, 0, dt,  0],
      [0, 1,  0, dt],
      [0, 0,  1,  0],
      [0, 0,  0,  1],
    ]
    const q = this.processNoise
    const Q: number[][] = [
      [0.25 * q,        0, 0, 0],
      [       0, 0.25 * q, 0, 0],
      [       0,        0, q, 0],
      [       0,        0, 0, q],
    ]

    this.state = mulVec(F, this.state)
    this.P = add(mul(mul(F, this.P), transpose(F)), Q)

    // 2. SACCADE CHECK -----------------------------------------------------
    // Predicted velocity magnitude in px/s; reset instantly for fast movements
    // so the filter introduces no lag during intentional saccades.
    const vx = this.state[2]
    const vy = this.state[3]
    if (Math.sqrt(vx * vx + vy * vy) > this.saccadeThreshold) {
      this.state = [rawX, rawY, 0, 0]
      this.P = freshP()
      return { x: rawX, y: rawY }
    }

    // 3. UPDATE ------------------------------------------------------------
    // Innovation: difference between raw measurement and predicted position
    const innov = [rawX - this.state[0], rawY - this.state[1]]

    const r = this.measurementNoise
    const R: number[][] = [
      [r, 0],
      [0, r],
    ]

    // S = H P Hᵀ + R  (2×2 innovation covariance)
    const S = add(mul(mul(H, this.P), Ht), R)

    // K = P Hᵀ S⁻¹   (4×2 Kalman gain)
    const K = mul(mul(this.P, Ht), inv2(S))

    // Posterior state and covariance
    const Ky = mulVec(K, innov)
    this.state = this.state.map((v, i) => v + Ky[i])
    this.P = mul(sub(eye4(), mul(K, H)), this.P)

    return { x: this.state[0], y: this.state[1] }
  }

  reset(x = 0, y = 0): void {
    this.state = [x, y, 0, 0]
    this.P = freshP()
    this.initialized = false
  }
}

// ---------------------------------------------------------------------------
// WeightedAverageFilter - simpler fallback smoother
// ---------------------------------------------------------------------------

const WAF_WEIGHTS = [0.05, 0.1, 0.15, 0.2, 0.2, 0.3]  // oldest → newest; sums to 1
const WAF_SIZE = WAF_WEIGHTS.length

export class WeightedAverageFilter {
  private bufX: number[] = []
  private bufY: number[] = []

  update(x: number, y: number): { x: number; y: number } {
    this.bufX.push(x)
    this.bufY.push(y)
    if (this.bufX.length > WAF_SIZE) {
      this.bufX.shift()
      this.bufY.shift()
    }

    const n = this.bufX.length
    // Take the last n entries from the weight table and renormalize
    const weights = WAF_WEIGHTS.slice(WAF_SIZE - n)
    const total = weights.reduce((s, w) => s + w, 0)

    let outX = 0
    let outY = 0
    for (let i = 0; i < n; i++) {
      const w = weights[i] / total
      outX += this.bufX[i] * w
      outY += this.bufY[i] * w
    }

    return { x: outX, y: outY }
  }

  reset(): void {
    this.bufX = []
    this.bufY = []
  }
}
