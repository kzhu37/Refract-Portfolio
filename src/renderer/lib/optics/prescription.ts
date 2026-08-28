import type { EyePrescription, FullPrescription, ExamResult } from '../types/prescription'

// ---------------------------------------------------------------------------
// 1. Cylinder form normalisation
// ---------------------------------------------------------------------------

/**
 * Convert between minus-cylinder and plus-cylinder forms.
 * The two forms are optically identical; this lets us normalise to a
 * consistent convention before any downstream calculation.
 *
 *   new sphere = old sphere + old cylinder
 *   new cylinder = -old cylinder
 *   new axis   = (old axis + 90) % 180
 */
export function normalizeRx(rx: EyePrescription): EyePrescription {
  if (rx.cylinder === null || rx.cylinder === 0) return rx

  const newSphere = round25(rx.sphere + rx.cylinder)
  const newCylinder = round25(-rx.cylinder)
  const newAxis = rx.axis !== null ? ((rx.axis + 90) % 180 || 180) : null

  return {
    ...rx,
    sphere: newSphere,
    cylinder: newCylinder,
    axis: newAxis
  }
}

// ---------------------------------------------------------------------------
// 2. Spherical equivalent
// ---------------------------------------------------------------------------

/**
 * SE = sphere + cylinder/2
 * Represents the average power across all meridians.
 * Returns sphere alone when no cylinder is present.
 */
export function sphericalEquivalent(rx: EyePrescription): number {
  if (rx.cylinder === null) return rx.sphere
  return round25(rx.sphere + rx.cylinder / 2)
}

// ---------------------------------------------------------------------------
// 3. Snellen denominator to prototype sphere estimate
// ---------------------------------------------------------------------------

/**
 * Prototype guidance table mapping Snellen denominator to a coarse sphere
 * estimate for the experimental guided workflow. Negative values = myopia.
 *
 * This is an interaction heuristic, not a validated refraction model. Visual
 * acuity and refractive error are related at a population level but do not map
 * one-to-one for an individual. See docs/OPTICAL_MODEL.md for claim boundaries.
 */
const SNELLEN_TABLE: readonly [denominator: number, sphere: number][] = [
  [20, 0.0],
  [25, -0.25],
  [30, -0.5],
  [40, -0.75],
  [50, -1.0],
  [70, -1.5],
  [100, -2.0],
  [200, -3.0],
  [400, -4.5]
]

/**
 * Return the guided workflow's prototype sphere estimate for a Snellen
 * denominator. Interpolates linearly between table entries when the denominator
 * falls between known values. This output must not be treated as a prescription.
 */
export function snellenToSphere(snellenDenominator: number): number {
  const denom = Math.max(20, snellenDenominator)

  const exact = SNELLEN_TABLE.find(([d]) => d === denom)
  if (exact) return exact[1]

  if (denom < SNELLEN_TABLE[0][0]) return 0.0

  if (denom > SNELLEN_TABLE[SNELLEN_TABLE.length - 1][0]) {
    return SNELLEN_TABLE[SNELLEN_TABLE.length - 1][1]
  }

  for (let i = 0; i < SNELLEN_TABLE.length - 1; i++) {
    const [d0, s0] = SNELLEN_TABLE[i]
    const [d1, s1] = SNELLEN_TABLE[i + 1]
    if (denom >= d0 && denom <= d1) {
      const t = (denom - d0) / (d1 - d0)
      return round25(s0 + t * (s1 - s0))
    }
  }

  return 0.0
}

// ---------------------------------------------------------------------------
// 4. Blur radius in pixels
// ---------------------------------------------------------------------------

export interface BlurRadiusParams {
  sphere: number
  cylinder: number | null
  /** Axis of the cylinder meridian, 1-180 degrees */
  axis?: number | null
  viewingDistanceCm: number
  /** Pixels per metre on the physical screen */
  screenPPM: number
  /** Effective entrance pupil diameter, default 4 mm */
  pupilDiameterMm?: number
}

export interface BlurRadius {
  sigmaX: number
  sigmaY: number
  /** Rotation of the blur ellipse in degrees (0 = horizontal axis) */
  angleDeg: number
}

/**
 * Compute the prototype Gaussian blur scale in screen pixels.
 *
 * Geometrical optics motivates blur growing with pupil size and dioptric
 * defocus, but the distance-adjusted mapping below is an engineering heuristic
 * for display-space kernel sizing. It is not a clinically validated retinal
 * blur equation, and its output is used as Gaussian sigma rather than a measured
 * retinal blur-disc diameter. See docs/OPTICAL_MODEL.md.
 *
 * For a spherocylindrical Rx:
 *   - The sphere meridian has power = sphere
 *   - The cylinder meridian has power = sphere + cylinder
 *   Each meridian contributes an independent scale; the result is an
 *   elliptical Gaussian kernel rotated by the cylinder axis.
 */
export function blurRadiusPixels(params: BlurRadiusParams): BlurRadius {
  const {
    sphere,
    cylinder,
    axis,
    viewingDistanceCm,
    screenPPM,
    pupilDiameterMm = 4
  } = params

  const finiteInputs = [sphere, viewingDistanceCm, screenPPM, pupilDiameterMm]
  if (!finiteInputs.every(Number.isFinite)) {
    throw new Error('Blur-model inputs must be finite')
  }
  if (cylinder !== null && !Number.isFinite(cylinder)) {
    throw new Error('Cylinder must be finite when provided')
  }
  if (axis !== null && axis !== undefined && !Number.isFinite(axis)) {
    throw new Error('Axis must be finite when provided')
  }
  if (viewingDistanceCm <= 0 || screenPPM <= 0 || pupilDiameterMm <= 0) {
    throw new Error('Viewing distance, screen density, and pupil diameter must be positive')
  }

  const dist_m = viewingDistanceCm / 100
  const pupil_m = pupilDiameterMm / 1000

  const defocusBlur = (dioptres: number): number => {
    const D = Math.abs(dioptres)
    if (D === 0) return 0
    const blur_m = (D * pupil_m) / (1 + D * dist_m)
    return blur_m * screenPPM
  }

  const sigmaFromSphere = defocusBlur(sphere)

  if (!cylinder || cylinder === 0) {
    return { sigmaX: sigmaFromSphere, sigmaY: sigmaFromSphere, angleDeg: 0 }
  }

  const sigmaAxis1 = defocusBlur(sphere + cylinder)
  const sigmaAxis2 = sigmaFromSphere

  const rawAxis = axis ?? 0
  const angleDeg = ((rawAxis - 90) % 180 + 180) % 180

  return {
    sigmaX: Math.max(0.5, sigmaAxis2),
    sigmaY: Math.max(0.5, sigmaAxis1),
    angleDeg
  }
}

// ---------------------------------------------------------------------------
// 5. Exam results to FullPrescription
// ---------------------------------------------------------------------------

export interface CalibrationData {
  pixelsPerMm: number
  viewingDistanceCm: number
}

/**
 * Combine OD and OS guided-workflow results into prototype input values.
 *
 * Cylinder is returned in minus-cylinder form. astigmatismAngle is treated as
 * a clinical axis in degrees [1, 180]. Binocular PD defaults to 63 mm and can
 * be replaced with a measured value in Settings.
 *
 * No numeric confidence is generated. The workflow has not been calibrated
 * against professional refraction measurements, so assigning a probability or
 * error bound would overstate what the prototype establishes.
 */
export function examResultsToPrescription(
  OD: ExamResult,
  OS: ExamResult,
  calibration: CalibrationData
): FullPrescription {
  void calibration

  const buildEyeRx = (result: ExamResult): EyePrescription => {
    const rawCyl = result.estimatedCylinder
    const hasCyl = rawCyl !== null && rawCyl !== 0

    return {
      sphere: snellenToSphere(result.snellenLine),
      cylinder: hasCyl ? -Math.abs(rawCyl) : null,
      axis: hasCyl && result.astigmatismAngle !== null
        ? (Math.round(((result.astigmatismAngle % 180) + 180) % 180) || 1)
        : null,
      add: null,
      pd: 31.5,
    }
  }

  const odRx = buildEyeRx(OD)
  const osRx = buildEyeRx(OS)

  return {
    OD: odRx,
    OS: osRx,
    binocularPD: 63,
    measuredAt: new Date(),
    source: 'exam',
    examConfidence: null,
  }
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/** Round to nearest 0.25 D (standard optical step). */
function round25(value: number): number {
  return Math.round(value * 4) / 4
}
