import type { EyePrescription, PSFKernel, CorrectionKernel, EyeSide } from '../types/prescription'
import { blurRadiusPixels } from './prescription'

// ---------------------------------------------------------------------------
// Public option interfaces
// ---------------------------------------------------------------------------

export interface PSFOptions {
  viewingDistanceCm: number
  screenPPM?: number
  pupilDiameterMm?: number
  kernelSize?: number
}

export interface CorrectionOptions {
  method: 'unsharp'
  /** Backward-compatible input. Runtime strength is applied by the shader. */
  strength?: number
}

// ---------------------------------------------------------------------------
// 1. Anisotropic rotated elliptical Gaussian kernel
// ---------------------------------------------------------------------------

/**
 * Builds a 2-D rotated elliptical Gaussian kernel of dimensions size x size.
 *
 * For each offset (dx, dy) from the kernel centre:
 *   1. Rotate into the kernel's principal-axis frame.
 *   2. Evaluate the 2-D Gaussian.
 *   3. Normalize so all values sum exactly to 1.0.
 *
 * Returns a row-major number[] of length size*size.
 * number[] keeps the output IPC-serializable.
 */
export function computeAnisotropicGaussianKernel(params: {
  sigmaX: number
  sigmaY: number
  angleDeg: number
  size: number
}): number[] {
  const { sigmaX, sigmaY, angleDeg, size } = params

  const n = Math.max(1, size % 2 === 0 ? size + 1 : size)
  const half = Math.floor(n / 2)
  const theta = (angleDeg * Math.PI) / 180

  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)

  const inv2SX2 = 1 / (2 * sigmaX * sigmaX)
  const inv2SY2 = 1 / (2 * sigmaY * sigmaY)

  const data = new Array<number>(n * n)
  let sum = 0

  for (let row = 0; row < n; row++) {
    const dy = row - half
    for (let col = 0; col < n; col++) {
      const dx = col - half

      const dxR = dx * cosT + dy * sinT
      const dyR = -dx * sinT + dy * cosT

      const val = Math.exp(-(dxR * dxR * inv2SX2 + dyR * dyR * inv2SY2))
      data[row * n + col] = val
      sum += val
    }
  }

  if (sum > 0) {
    for (let i = 0; i < data.length; i++) data[i] /= sum
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
 * If the eye is emmetropic, return an identity kernel so downstream convolution
 * is a no-op. Kernel size is derived from the largest sigma and clamped to a
 * practical real-time range unless the caller provides an explicit size.
 *
 * The Gaussian PSF is a pragmatic engineering approximation rather than a
 * clinically calibrated wavefront model.
 */
export function computePSF(
  rx: EyePrescription,
  opts: PSFOptions,
  eye: EyeSide
): PSFKernel {
  const {
    viewingDistanceCm,
    screenPPM = 3780,
    pupilDiameterMm = 4,
    kernelSize
  } = opts

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

  const { sigmaX, sigmaY, angleDeg } = blurRadiusPixels({
    sphere: rx.sphere,
    cylinder: rx.cylinder,
    axis: rx.axis,
    viewingDistanceCm,
    screenPPM,
    pupilDiameterMm
  })

  const autoSize = 2 * Math.ceil(3 * Math.max(sigmaX, sigmaY)) + 1
  const size = kernelSize ?? Math.min(31, Math.max(7, autoSize))

  const kernelData = computeAnisotropicGaussianKernel({ sigmaX, sigmaY, angleDeg, size })

  return {
    kernelData,
    size,
    sigmaX,
    sigmaY,
    angle: (angleDeg * Math.PI) / 180,
    eye
  }
}

// ---------------------------------------------------------------------------
// 3. Identity kernel
// ---------------------------------------------------------------------------

export function getIdentityKernel(size: number): number[] {
  const n = Math.max(1, size % 2 === 0 ? size + 1 : size)
  const data = new Array<number>(n * n).fill(0)
  data[Math.floor((n * n) / 2)] = 1
  return data
}

// ---------------------------------------------------------------------------
// 4. PSF canvas visualization
// ---------------------------------------------------------------------------

export function visualizePSFAsCanvas(psf: PSFKernel, scale = 8): HTMLCanvasElement {
  const { kernelData, size } = psf
  const canvas = document.createElement('canvas')
  canvas.width = size * scale
  canvas.height = size * scale

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

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
// 5. Live correction kernel
// ---------------------------------------------------------------------------

/**
 * Derive the full-strength spatial correction kernel from a PSF.
 *
 * The active live path uses a normalized unsharp kernel:
 *
 *   K = 2I - PSF
 *
 * Runtime strength is intentionally not baked into K. The WebGL shader owns the
 * single user-facing strength blend, which prevents stale kernels when the
 * slider changes and makes the meaning of strength unambiguous.
 *
 * Frequency-domain Wiener inversion remains a separate experiment in wiener.ts
 * and is not presented as an active runtime option.
 */
export function computeCorrectionKernel(
  psf: PSFKernel,
  rx: EyePrescription,
  opts: CorrectionOptions,
  viewingDistanceCm: number
): CorrectionKernel {
  const { kernelData, size, eye } = psf
  void opts

  const identity = getIdentityKernel(size)
  let corrected = kernelData.map((v, i) => 2 * identity[i] - v)

  const sum = corrected.reduce((a, b) => a + b, 0)
  if (Math.abs(sum) > 1e-9) corrected = corrected.map((v) => v / sum)

  return {
    kernelData: corrected,
    size,
    eye,
    prescriptionUsed: rx,
    viewingDistanceCm
  }
}
