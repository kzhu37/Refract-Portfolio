export type EyeSide = 'OD' | 'OS'

export interface EyePrescription {
  /** Diopters, -20 to +20, step 0.25 */
  sphere: number
  /** Diopters, -8 to +8, step 0.25. null = no astigmatism */
  cylinder: number | null
  /** 1-180 degrees. null when cylinder is null */
  axis: number | null
  /** Near-add power, 0 to +4.0. null = not applicable */
  add: number | null
  /** Monocular PD, 25-40 mm */
  pd: number
}

export interface FullPrescription {
  OD: EyePrescription
  OS: EyePrescription
  binocularPD: number
  measuredAt: Date
  source: 'exam' | 'manual' | 'imported'
  /**
   * Legacy persistence slot. The guided workflow no longer assigns a numeric
   * confidence score because no calibrated uncertainty model supports one.
   */
  examConfidence?: null
}

/** PSF (Point Spread Function) kernel: describes how this eye blurs light */
export interface PSFKernel {
  /** Float32Array serialized to number[] for IPC transport */
  kernelData: number[]
  size: number
  sigmaX: number
  sigmaY: number
  /** Astigmatism axis in radians */
  angle: number
  eye: EyeSide
}

/** Deconvolution kernel applied by the overlay to pre-sharpen the image */
export interface CorrectionKernel {
  /** Float32Array serialized to number[] for IPC transport */
  kernelData: number[]
  size: number
  eye: EyeSide
  prescriptionUsed: EyePrescription
  viewingDistanceCm: number
}

export interface GazePoint {
  /** Absolute screen coordinates (not window-relative) */
  x: number
  y: number
  timestamp: number
  /**
   * Optional quality signal reserved for trackers that can define and compute
   * one. The current iris tracker intentionally does not invent a fixed score.
   */
  confidence?: number
}

export interface ExamResult {
  /** Snellen denominator line passed (e.g. 20 for 20/20) */
  snellenLine: number
  estimatedSphere: number
  astigmatismAngle: number | null
  estimatedCylinder: number | null
  eye: EyeSide
  rawResponses: Record<string, unknown>
}

export type CorrectionMode = 'none' | 'correction' | 'simulation'

/**
 * What drives the position of the correction bubble.
 *   - 'eye'    - webcam iris/gaze tracking (the bubble follows where you look)
 *   - 'cursor' - the bubble follows the mouse cursor (no camera needed)
 */
export type TrackingMode = 'eye' | 'cursor'

/** Sent from the main renderer to the overlay window via IPC */
export interface OverlayState {
  enabled: boolean
  mode: CorrectionMode
  /** 0-1 blend strength applied by the WebGL shader */
  strength: number
  gazePoint: GazePoint | null
  kernelOD: CorrectionKernel | null
  kernelOS: CorrectionKernel | null
  /** Single eye profile used by the current screen-level correction pass */
  activeEye: EyeSide
  /** Radius in pixels of the foveal correction region */
  fovealRadius: number
  /** Where the bubble follows: webcam gaze or the mouse cursor */
  tracking: TrackingMode
}
