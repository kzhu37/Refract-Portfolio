// Pure calibration math kept separate from webcam, DOM, and Electron state so
// the numerical mapping can be verified deterministically in isolation.

/** Degree-2 polynomial basis [1, x, y, x^2, xy, y^2]. */
export function buildFeatures(x: number, y: number): number[] {
  return [1, x, y, x * x, x * y, y * y]
}

/**
 * Solve M*c = v by Gauss-Jordan elimination with partial pivoting. Returns null
 * when the matrix is singular, as can happen with degenerate calibration data.
 */
function solveLinear(M: number[][], v: number[]): number[] | null {
  const n = v.length
  const augmented: number[][] = M.map((row, i) => [...row, v[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) {
        pivot = row
      }
    }

    if (Math.abs(augmented[pivot][col]) < 1e-12) return null

    if (pivot !== col) {
      const tmp = augmented[pivot]
      augmented[pivot] = augmented[col]
      augmented[col] = tmp
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = augmented[row][col] / augmented[col][col]
      if (factor === 0) continue
      for (let c = col; c <= n; c++) {
        augmented[row][c] -= factor * augmented[col][c]
      }
    }
  }

  return augmented.map((row, i) => row[n] / row[i])
}

/**
 * Fit degree-2 polynomial coefficients mapping normalized gaze features to one
 * target screen axis using normal equations and the solver above.
 */
export function fitAxis(featureRows: number[][], targets: number[]): number[] | null {
  const coefficientCount = 6
  if (featureRows.length !== targets.length || featureRows.length < coefficientCount) return null
  if (
    featureRows.some(
      (row) => row.length !== coefficientCount || row.some((value) => !Number.isFinite(value)),
    )
  ) return null
  if (targets.some((value) => !Number.isFinite(value))) return null

  const ata: number[][] = Array.from(
    { length: coefficientCount },
    () => new Array<number>(coefficientCount).fill(0),
  )
  const atb: number[] = new Array<number>(coefficientCount).fill(0)

  for (let sample = 0; sample < featureRows.length; sample++) {
    const features: number[] = featureRows[sample]
    const target: number = targets[sample]

    for (let i = 0; i < coefficientCount; i++) {
      atb[i] += features[i] * target
      for (let j = 0; j < coefficientCount; j++) {
        ata[i][j] += features[i] * features[j]
      }
    }
  }

  return solveLinear(ata, atb)
}
