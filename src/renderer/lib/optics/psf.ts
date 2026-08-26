import type { EyePrescription, PSFKernel, CorrectionKernel, EyeSide } from '../types/prescription'
import { blurRadiusPixels } from './prescription'

// ---------------------------------------------------------------------------
// Public option interfaces (re-exported so the store can import them here)
// ---------------------------------------------------------------------------

export interface PSFOptions {
  viewingDistanceCm: number
  screenPPM?: number
  pupilDiameterMm?: number
  kernelSize?: number
}

export interface CorrectionOptions {
  strength: number
  method: 'wiener' | 'unsharp'
}

// ---------------------------------------------------------------------------
// 1. Anisotropic (rotated elliptical) Gaussian kernel
// ---------------------------------------------------------------------------

/**
 * Builds a 2-D rotated elliptical Gaussian kernel of dimensions size×size.
 *
 * For each offset (dx, dy) from the kernel centre:
 *   1. Rotate into the kernel's principal-axis frame:
 *        dx' =  dx·cos θ + dy·sin θ
 *        dy' = -dx·sin θ + dy·cos θ
 *   2. Evaluate the 2-D Gaussian:
 *        val = exp(-0.5 · ((dx'/σX)² + (dy'/σY)²))
 *   3. Normalise so all values sum exactly to 1.0
 *
 * Returns a row-major number[] of length size*size.
 * number[] (not Float32Array) keeps the output IPC-serialisable.
 */
export function computeAnisotropicGaussianKernel(params: {
  sigmaX: number
  sigmaY: number
  angleDeg: number
  size: number
}): number[] {
  const { sigmaX, sigmaY, angleDeg, size } = params

  // Guard: kernel must be odd-sized and at least 1×1
  const n = Math.max(1, size % 2 === 0 ? size + 1 : size)
  const half = Math.floor(n / 2)
  const theta = (angleDeg * Math.PI) / 180

  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)

  // Reciprocals computed once outside the loop
  const inv2SX2 = 1 / (2 * sigmaX * sigmaX)
  const inv2SY2 = 1 / (2 * sigmaY * sigmaY)

  const data = new Array<number>(n * n)
  let sum = 0

  for (let row = 0; row < n; row++) {
    const dy = row - half
    for (let col = 0; col < n; col++) {
      const dx = col - half

      // Rotate into the ellipse frame
      const dxR = dx * cosT + dy * sinT
      const dyR = -dx * sinT + dy * cosT

      const val = Math.exp(-(dxR * dxR * inv2SX2 + dyR * dyR * inv2SY2))
      data[row * n + col] = val
      sum += val
    }
  }

  // Normalise so the kernel sums to 1 (energy-preserving convolution)
  if (sum > 0) {
    for (let i = 0; i < data.length; i++) {
      data[i] /= sum
    }
  }

  return data
}

// ---------------------------------------------------------------------------
// 2. Full PSF for one eye
// ---------------------------------------------------------------------------

/**
 * Compute the Point Spread Function kernel for the given prescription and
 * viewing conditions.
 *
 * - If the eye is emmetropic (sphere≈0, no cylinder) returns an identity kernel
 *   so downstream convolution is a no-op.
 * - Kernel size is auto-derived: 2·ceil(3·max(σX,σY))+1, clamped to [7, 31].
 *   Overrideable via params.kernelSize.
 *
 * The PSF models blur as a Gaussian - a pragmatic approximation that's fast
 * to convolve and visually accurate for moderate refractive errors (≤4 D).
 * Higher-order aberrations (Zernike) can replace this in a later phase.
 */
export function computePSF(
  rx: EyePrescription,
  opts: PSFOptions,
  eye: EyeSide
): PSFKernel {
  const {
    viewingDistanceCm,
    screenPPM = 3780,      // ~96 DPI fallback
    pupilDiameterMm = 4,
    kernelSize
  } = opts

  // Emmetropic eye - skip all computation
  const isEmmetropic =
    Math.abs(rx.sphere) < 0.125 &&
    (rx.cylinder === null || Math.abs(rx.cylinder) < 0.125)

  if (isEmmetropic) {
    const size = kernelSize ?? 7
    return {
      kernelData: getIdentityKernel(size),
      size,
      sigmaX: 0,
      sigmaY: 0,
      angle: 0,
      eye
    }
  }

  // Map prescription → blur radii in pixels
  const { sigmaX, sigmaY, angleDeg } = blurRadiusPixels({
    sphere: rx.sphere,
    cylinder: rx.cylinder,
    axis: rx.axis,
    viewingDistanceCm,
    screenPPM,
    pupilDiameterMm
  })

  // Auto-size: 3σ coverage on the largest axis, always odd, clamped [7, 31]
  const autoSize = 2 * Math.ceil(3 * Math.max(sigmaX, sigmaY)) + 1
  const size = kernelSize ?? Math.min(31, Math.max(7, autoSize))

  const kernelData = computeAnisotropicGaussianKernel({ sigmaX, sigmaY, angleDeg, size })

  return {
    kernelData,
    size,
    sigmaX,
    sigmaY,
    angle: (angleDeg * Math.PI) / 180,  // stored as radians in the type
    eye
  }
}

// ---------------------------------------------------------------------------
// 3. Identity kernel
// ---------------------------------------------------------------------------

/**
 * A size×size kernel with 1 in the centre and 0 everywhere else.
 * Convolution with an identity kernel is a no-op - used for emmetropic eyes
 * or when correction is disabled, avoiding conditional branches downstream.
 */
export function getIdentityKernel(size: number): number[] {
  const n = Math.max(1, size % 2 === 0 ? size + 1 : size)
  const data = new Array<number>(n * n).fill(0)
  data[Math.floor((n * n) / 2)] = 1
  return data
}

// ---------------------------------------------------------------------------
// 4. PSF canvas visualisation (debug)
// ---------------------------------------------------------------------------

/**
 * Renders a PSF kernel as a grayscale HTMLCanvasElement.
 * Useful for debug overlays and the settings screen's kernel preview.
 *
 * @param psf   The PSF to render.
 * @param scale Pixel magnification factor (default 8 - so a 15×15 kernel
 *              renders as a 120×120 canvas, visible without squinting).
 */
export function visualizePSFAsCanvas(psf: PSFKernel, scale = 8): HTMLCanvasElement {
  const { kernelData, size } = psf
  const canvas = document.createElement('canvas')
  canvas.width = size * scale
  canvas.height = size * scale

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  // Find the max value for normalised display (PSF peak may be < 1 after
  // normalisation spreads energy across many pixels)
  const maxVal = Math.max(...kernelData, 1e-9)

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const val = kernelData[row * size + col]
      const brightness = Math.round((val / maxVal) * 255)
      ctx.fillStyle = `rgb(${brightness},${brightness},${brightness})`
      ctx.fillRect(col * scale, row * scale, scale, scale)
    }
  }

  return canvas
}

// ---------------------------------------------------------------------------
// Correction kernel (stub retained from Phase 1 - Wiener filter in Phase 3)
// ---------------------------------------------------------------------------

/**
 * Derives a sharpening kernel from a PSF.
 * Current implementation: unsharp-mask blend at the requested strength.
 * Wiener deconvolution will replace this in Phase 3.
 */
export function computeCorrectionKernel(
  psf: PSFKernel,
  rx: EyePrescription,
  opts: CorrectionOptions,
  viewingDistanceCm: number
): CorrectionKernel {
  const { kernelData, size, eye } = psf
  const { strength, method } = opts

  let corrected: number[]

  if (method === 'unsharp') {
    // Unsharp mask: identity - strength × (identity - PSF)
    // Equivalent to: (1 + strength) × identity - strength × PSF
    const identity = getIdentityKernel(size)
    corrected = kernelData.map((v, i) => {
      return (1 + strength) * identity[i] - strength * v
    })
  } else {
    // 'wiener' placeholder - same as unsharp until Phase 3
    const identity = getIdentityKernel(size)
    corrected = kernelData.map((v, i) => {
      return (1 + strength) * identity[i] - strength * v
    })
  }

  // Re-normalise so the correction kernel sums to 1 (preserves average luminance)
  const sum = corrected.reduce((a, b) => a + b, 0)
  if (Math.abs(sum) > 1e-9) {
    corrected = corrected.map((v) => v / sum)
  }

  return {
    kernelData: corrected,
    size,
    eye,
    prescriptionUsed: rx,
    viewingDistanceCm
  }
}
