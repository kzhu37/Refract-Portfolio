import type { EyePrescription, PSFKernel, CorrectionKernel } from '../types/prescription'
import { computeAnisotropicGaussianKernel, getIdentityKernel } from './psf'

// ---------------------------------------------------------------------------
// Wiener deconvolution & sharpening kernels
//
// The PSF (psf.ts) tells us how an uncorrected eye *blurs* the screen. To
// pre-compensate, the overlay convolves the source image with the inverse of
// that blur so the light landing on the retina is approximately sharp again.
//
// This module produces those correction kernels two ways:
//   - Wiener  : true frequency-domain regularised inverse (slow, accurate)
//   - Unsharp : (1+s)·δ - s·gaussian approximation (fast, fewer artifacts at
//               low strength)
//
// All kernels are row-major number[] (not Float32Array) so they stay
// IPC-serialisable for transport to the overlay window.
// ---------------------------------------------------------------------------

// Below this, a sigma is treated as "no blur" - the eye is effectively
// emmetropic and the correction collapses to an identity (no-op) kernel.
const SIGMA_EPSILON = 1e-3

// Default measurement-noise to signal ratio used to regularise the inverse
// filter (Tikhonov term). Larger ⇒ gentler, less ringing; smaller ⇒ sharper,
// more amplified noise.
const DEFAULT_NSR = 0.05

// ---------------------------------------------------------------------------
// 1. Wiener deconvolution kernel
// ---------------------------------------------------------------------------

/**
 * Frequency-domain Wiener deconvolution of a PSF.
 *
 * Pipeline (matches the classic regularised-inverse recipe):
 *   a. Zero-pad the PSF, centred, into an outputSize×outputSize array.
 *   b. ifftshift so the PSF peak sits at the origin (0,0), then take the 2-D
 *      DFT  →  H(u,v).  (A naive separable DFT is plenty fast for small N.)
 *   c. Wiener filter:  W(u,v) = H*(u,v) / (|H(u,v)|² + NSR)
 *   d. Inverse 2-D DFT  →  spatial inverse kernel.
 *   e. Take the real part, ifftshift back to a centred kernel, normalise so it
 *      sums to 1 (preserves average luminance / DC).
 *
 * The leading ifftshift (b) is what makes the trailing ifftshift (e) land the
 * kernel peak back in the centre: outputSize is forced even, where ifftshift
 * is its own inverse (a roll by N/2), so the two cancel except for the
 * conjugate-phase introduced by the Wiener step.
 *
 * Returns the full outputSize×outputSize kernel, row-major.
 */
export function computeWienerKernel(
  psf: PSFKernel,
  params: {
    noiseToSignalRatio?: number
    outputSize?: number
  } = {}
): number[] {
  const { noiseToSignalRatio = DEFAULT_NSR, outputSize } = params

  // Choose an even pad size ≥ the PSF (never crop the PSF). Default pads to
  // ~2× the kernel so the DFT has zero-padding margin and avoids wraparound
  // aliasing (which otherwise broadens/weakens the inverse). Clamped to keep
  // the naive O(n³) DFT cheap.
  const requested = outputSize ?? Math.max(16, 2 * psf.size)
  let n = Math.max(requested, psf.size)
  if (n % 2 !== 0) n += 1 // force even so ifftshift == fftshift (self-inverse)
  n = Math.min(n, 64) // hard cap - naive DFT is O(n³) per pass

  // (a) Zero-pad the PSF centred into the n×n field.
  const padRe = new Array<number>(n * n).fill(0)
  const padIm = new Array<number>(n * n).fill(0)
  const srcHalf = Math.floor(psf.size / 2)
  const dstCentre = n / 2
  const offset = dstCentre - srcHalf
  for (let r = 0; r < psf.size; r++) {
    const dr = offset + r
    if (dr < 0 || dr >= n) continue
    for (let c = 0; c < psf.size; c++) {
      const dc = offset + c
      if (dc < 0 || dc >= n) continue
      padRe[dr * n + dc] = psf.kernelData[r * psf.size + c]
    }
  }

  // (b) Move the PSF peak to the origin, then forward DFT.
  const shiftedRe = ifftShift2D(padRe, n)
  const shiftedIm = ifftShift2D(padIm, n)
  const H = dft2D(shiftedRe, shiftedIm, n, -1)

  // (c) Wiener filter:  W = H* / (|H|² + NSR)
  const wRe = new Array<number>(n * n)
  const wIm = new Array<number>(n * n)
  for (let i = 0; i < n * n; i++) {
    const hr = H.re[i]
    const hi = H.im[i]
    const denom = hr * hr + hi * hi + noiseToSignalRatio
    // H* = hr - i·hi, divided by the real denominator.
    wRe[i] = hr / denom
    wIm[i] = -hi / denom
  }

  // (d) Inverse DFT back to the spatial domain, (e) take the real part.
  const inv = dft2D(wRe, wIm, n, +1)
  const realKernel = inv.re

  // (e) ifftshift back to a centred kernel and normalise to sum 1.
  const centred = ifftShift2D(realKernel, n)
  return normaliseSum(centred)
}

// ---------------------------------------------------------------------------
// 2. Unsharp-mask sharpening kernel
// ---------------------------------------------------------------------------

/**
 * Fast unsharp-mask approximation of a deconvolution kernel:
 *
 *   kernel = (1 + strength)·identity - strength·anisotropic_gaussian
 *
 * The gaussian models the eye's blur (same elliptical/rotated form the PSF
 * uses), so subtracting a scaled copy boosts exactly the frequencies the eye
 * attenuates. Output is clamped to tame ring/halo overshoot, then normalised
 * so the centre tap is exactly 1.
 */
export function computeSharpeningKernel(params: {
  sigmaX: number
  sigmaY: number
  angleDeg: number
  strength: number
  size: number
}): number[] {
  const { angleDeg, strength, size } = params

  // Guard against zero/near-zero sigma (emmetropic eye) - a degenerate
  // gaussian would produce NaNs. Clamp to a tiny positive floor.
  const sigmaX = Math.max(SIGMA_EPSILON, params.sigmaX)
  const sigmaY = Math.max(SIGMA_EPSILON, params.sigmaY)

  const gaussian = computeAnisotropicGaussianKernel({ sigmaX, sigmaY, angleDeg, size })
  const identity = getIdentityKernel(size)

  // Match the odd-ised length getIdentityKernel / the gaussian produce.
  const len = identity.length
  const centreIdx = Math.floor(len / 2)

  // Ringing guard: keep taps within [-strength, 1+strength]. For a clean
  // gaussian this rarely binds, but it caps overshoot from odd sigma/aliasing.
  const lo = -strength
  const hi = 1 + strength

  const kernel = new Array<number>(len)
  for (let i = 0; i < len; i++) {
    const raw = (1 + strength) * identity[i] - strength * gaussian[i]
    kernel[i] = Math.min(hi, Math.max(lo, raw))
  }

  // Normalise so the centre tap is exactly 1 (unity passthrough of the
  // original pixel; surrounding negative lobes do the sharpening).
  const centre = kernel[centreIdx]
  if (Math.abs(centre) > 1e-9) {
    for (let i = 0; i < len; i++) kernel[i] /= centre
  }

  return kernel
}

// ---------------------------------------------------------------------------
// 3. Main entry point - derive a CorrectionKernel from a PSF
// ---------------------------------------------------------------------------

/**
 * Build the pre-sharpening correction kernel for a given PSF.
 *
 * Method selection (when not forced):
 *   - strength <  0.7  →  'unsharp'  (fast, gentle, fewer artifacts)
 *   - strength >= 0.7  →  'wiener'   (true inverse, handles heavier blur)
 *
 * `strength` is also the blend amount: 0 = identity (no correction),
 * 1 = full effect. The Wiener path blends its (NSR-regularised) inverse with
 * the identity by `strength` for smooth, ringing-bounded scaling.
 */
export function computeCorrectionKernel(
  psf: PSFKernel,
  params: {
    strength?: number
    method?: 'wiener' | 'unsharp'
    viewingDistanceCm: number
    /**
     * Optional: the prescription this PSF was derived from. Stored on the
     * result purely for downstream traceability. Defaults to a neutral
     * placeholder since it does not affect the kernel maths.
     */
    prescriptionUsed?: EyePrescription
  }
): CorrectionKernel {
  const { viewingDistanceCm } = params
  const strength = clamp01(params.strength ?? 0.5)
  const method = params.method ?? (strength < 0.7 ? 'unsharp' : 'wiener')
  const size = psf.size
  const eye = psf.eye

  const prescriptionUsed: EyePrescription =
    params.prescriptionUsed ?? { sphere: 0, cylinder: null, axis: null, add: null, pd: 32 }

  // Emmetropic / no-blur PSF, or zero strength → identity (no-op) correction.
  const noBlur = psf.sigmaX < SIGMA_EPSILON && psf.sigmaY < SIGMA_EPSILON
  if (noBlur || strength <= 0) {
    return {
      kernelData: getIdentityKernel(size),
      size,
      eye,
      prescriptionUsed,
      viewingDistanceCm
    }
  }

  let kernelData: number[]

  if (method === 'unsharp') {
    kernelData = computeSharpeningKernel({
      sigmaX: psf.sigmaX,
      sigmaY: psf.sigmaY,
      angleDeg: (psf.angle * 180) / Math.PI, // PSFKernel stores angle in radians
      strength,
      size
    })
  } else {
    // Wiener: full-field inverse, crop the central size×size region, then
    // blend with identity by `strength` so the effect scales smoothly.
    const full = computeWienerKernel(psf, { noiseToSignalRatio: DEFAULT_NSR })
    const cropped = cropCentre(full, size)
    const identity = getIdentityKernel(size)
    kernelData = blendKernels(identity, cropped, strength)
  }

  return {
    kernelData,
    size,
    eye,
    prescriptionUsed,
    viewingDistanceCm
  }
}

// ---------------------------------------------------------------------------
// 4. Linear kernel blend
// ---------------------------------------------------------------------------

/**
 * Linear interpolation between two equally-sized kernels:
 *   result = (1 - t)·k1 + t·k2
 *
 * Used to cross-fade correction kernels as the viewing distance changes,
 * avoiding a visible "pop" when the active kernel is swapped. `t` is clamped
 * to [0, 1].
 */
export function blendKernels(k1: number[], k2: number[], t: number): number[] {
  if (k1.length !== k2.length) {
    throw new Error(
      `blendKernels: length mismatch (${k1.length} vs ${k2.length}). Kernels must match.`
    )
  }
  const u = clamp01(t)
  const out = new Array<number>(k1.length)
  for (let i = 0; i < k1.length; i++) {
    out[i] = (1 - u) * k1[i] + u * k2[i]
  }
  return out
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/** Normalise a kernel so its elements sum to 1 (preserves DC / mean). */
function normaliseSum(kernel: number[]): number[] {
  let sum = 0
  for (let i = 0; i < kernel.length; i++) sum += kernel[i]
  if (Math.abs(sum) < 1e-12) return kernel
  return kernel.map((v) => v / sum)
}

/**
 * Crop the central size×size region out of a square (n×n) kernel and
 * re-normalise it to sum 1. `size` is forced odd to keep a true centre tap.
 */
function cropCentre(square: number[], size: number): number[] {
  const n = Math.round(Math.sqrt(square.length))
  const out = size % 2 === 0 ? size + 1 : size
  const start = Math.floor(n / 2) - Math.floor(out / 2)
  const cropped = new Array<number>(out * out).fill(0)
  for (let r = 0; r < out; r++) {
    const sr = start + r
    if (sr < 0 || sr >= n) continue
    for (let c = 0; c < out; c++) {
      const sc = start + c
      if (sc < 0 || sc >= n) continue
      cropped[r * out + c] = square[sr * n + sc]
    }
  }
  return normaliseSum(cropped)
}

/**
 * 2-D ifftshift on a square n×n array: roll by ⌊n/2⌋ on both axes.
 * For even n this equals fftshift and is its own inverse.
 */
function ifftShift2D(data: number[], n: number): number[] {
  const half = Math.floor(n / 2)
  const out = new Array<number>(n * n)
  for (let r = 0; r < n; r++) {
    const sr = (r + half) % n
    for (let c = 0; c < n; c++) {
      const sc = (c + half) % n
      out[sr * n + sc] = data[r * n + c]
    }
  }
  return out
}

/**
 * Naive separable 2-D DFT of an n×n complex field.
 *   sign = -1  → forward transform
 *   sign = +1  → inverse transform (scaled by 1/n²)
 *
 * Separable (rows then columns) makes this O(n³) rather than O(n⁴); for the
 * small n used here (≤64) that is comfortably real-time.
 */
function dft2D(
  re: number[],
  im: number[],
  n: number,
  sign: number
): { re: number[]; im: number[] } {
  // Precompute the twiddle table cos/sin(sign·2π·k·m / n) once and reuse it
  // for both the row and column passes (same length n in each).
  const ang = (sign * 2 * Math.PI) / n
  const cosTab = new Array<number>(n * n)
  const sinTab = new Array<number>(n * n)
  for (let k = 0; k < n; k++) {
    for (let m = 0; m < n; m++) {
      const a = ang * k * m
      cosTab[k * n + m] = Math.cos(a)
      sinTab[k * n + m] = Math.sin(a)
    }
  }

  // Pass 1: transform every row.
  let curRe = re
  let curIm = im
  const rowRe = new Array<number>(n * n)
  const rowIm = new Array<number>(n * n)
  for (let r = 0; r < n; r++) {
    const base = r * n
    for (let k = 0; k < n; k++) {
      let sr = 0
      let si = 0
      for (let m = 0; m < n; m++) {
        const xr = curRe[base + m]
        const xi = curIm[base + m]
        const c = cosTab[k * n + m]
        const s = sinTab[k * n + m]
        sr += xr * c - xi * s
        si += xr * s + xi * c
      }
      rowRe[base + k] = sr
      rowIm[base + k] = si
    }
  }

  // Pass 2: transform every column of the row-transformed field.
  curRe = rowRe
  curIm = rowIm
  const outRe = new Array<number>(n * n)
  const outIm = new Array<number>(n * n)
  const invScale = sign > 0 ? 1 / (n * n) : 1
  for (let col = 0; col < n; col++) {
    for (let k = 0; k < n; k++) {
      let sr = 0
      let si = 0
      for (let m = 0; m < n; m++) {
        const idx = m * n + col
        const xr = curRe[idx]
        const xi = curIm[idx]
        const c = cosTab[k * n + m]
        const s = sinTab[k * n + m]
        sr += xr * c - xi * s
        si += xr * s + xi * c
      }
      const o = k * n + col
      outRe[o] = sr * invScale
      outIm[o] = si * invScale
    }
  }

  return { re: outRe, im: outIm }
}
