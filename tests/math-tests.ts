import assert from 'node:assert/strict'
import {
  LIVE_CORRECTION_KERNEL_SIZE,
  validateLiveKernelDimensions,
} from '../src/shared/correction-constants'
import {
  blurRadiusPixels,
  examResultsToPrescription,
  normalizeRx,
} from '../src/renderer/lib/optics/prescription'
import {
  computeAnisotropicGaussianKernel,
  computeCorrectionKernel,
  computePSF,
  getIdentityKernel,
} from '../src/renderer/lib/optics/psf'
import {
  buildFeatures,
  fitAxis,
} from '../src/renderer/lib/eyetracking/gaze-calibration'
import { GazeSmoother } from '../src/renderer/lib/eyetracking/gaze-smoother'
import type { ExamResult, EyePrescription } from '../src/renderer/lib/types/prescription'

function approx(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  )
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function testGaussianNormalization(): void {
  const kernel = computeAnisotropicGaussianKernel({
    sigmaX: 1.3,
    sigmaY: 2.1,
    angleDeg: 35,
    size: 15,
  })

  assert.equal(kernel.length, 225)
  approx(sum(kernel), 1, 1e-12)
  assert.ok(kernel.every(Number.isFinite))
  assert.ok(kernel.every((value) => value >= 0))
}

function testGaussianRejectsInvalidInputs(): void {
  assert.throws(() => computeAnisotropicGaussianKernel({
    sigmaX: 0,
    sigmaY: 1,
    angleDeg: 0,
    size: 15,
  }))
  assert.throws(() => computeAnisotropicGaussianKernel({
    sigmaX: 1,
    sigmaY: Number.NaN,
    angleDeg: 0,
    size: 15,
  }))
}

function testIdentityAndEmmetropicPSF(): void {
  const identity = getIdentityKernel(6)
  assert.equal(identity.length, 49)
  assert.equal(identity.filter((value) => value === 1).length, 1)
  approx(sum(identity), 1)

  const rx: EyePrescription = {
    sphere: 0,
    cylinder: null,
    axis: null,
    add: null,
    pd: 31.5,
  }
  const psf = computePSF(rx, { viewingDistanceCm: 60 }, 'OD')
  assert.equal(psf.sigmaX, 0)
  assert.equal(psf.sigmaY, 0)
  approx(sum(psf.kernelData), 1)
}

function testDirectionalBlur(): void {
  const sphereOnly = blurRadiusPixels({
    sphere: -2,
    cylinder: null,
    viewingDistanceCm: 60,
    screenPPM: 3780,
  })
  approx(sphereOnly.sigmaX, sphereOnly.sigmaY)

  const directional = blurRadiusPixels({
    sphere: -2,
    cylinder: -1,
    axis: 90,
    viewingDistanceCm: 60,
    screenPPM: 3780,
  })
  assert.notEqual(directional.sigmaX, directional.sigmaY)
  assert.equal(directional.angleDeg, 0)
}

function testBlurModelRejectsInvalidPhysicalInputs(): void {
  const base = {
    sphere: -2,
    cylinder: null,
    viewingDistanceCm: 60,
    screenPPM: 3780,
  }

  assert.throws(() => blurRadiusPixels({ ...base, viewingDistanceCm: 0 }))
  assert.throws(() => blurRadiusPixels({ ...base, screenPPM: -1 }))
  assert.throws(() => blurRadiusPixels({ ...base, pupilDiameterMm: Number.NaN }))
  assert.throws(() => blurRadiusPixels({ ...base, cylinder: Number.POSITIVE_INFINITY }))
}

function testLiveKernelSizingContract(): void {
  const strongRx: EyePrescription = {
    sphere: -4,
    cylinder: -2,
    axis: 35,
    add: null,
    pd: 31.5,
  }

  const live = computePSF(strongRx, { viewingDistanceCm: 60 }, 'OD')
  assert.equal(live.size, LIVE_CORRECTION_KERNEL_SIZE)
  assert.equal(live.kernelData.length, LIVE_CORRECTION_KERNEL_SIZE ** 2)

  const experimental = computePSF(
    strongRx,
    { viewingDistanceCm: 60, kernelSize: 31 },
    'OD',
  )
  assert.equal(experimental.size, 31)
  assert.equal(experimental.kernelData.length, 31 ** 2)
}

function testLiveKernelValidation(): void {
  validateLiveKernelDimensions(225, 15)
  validateLiveKernelDimensions(49, 7)
  validateLiveKernelDimensions(0, 0)

  assert.throws(() => validateLiveKernelDimensions(961, 31))
  assert.throws(() => validateLiveKernelDimensions(64, 8))
  assert.throws(() => validateLiveKernelDimensions(224, 15))
  assert.throws(() => validateLiveKernelDimensions(1, 0))
}

function testPrescriptionNormalization(): void {
  const rx: EyePrescription = {
    sphere: -2,
    cylinder: -1,
    axis: 25,
    add: null,
    pd: 31.5,
  }
  const normalized = normalizeRx(rx)
  assert.equal(normalized.sphere, -3)
  assert.equal(normalized.cylinder, 1)
  assert.equal(normalized.axis, 115)
}

function testCorrectionKernelStrengthSemantics(): void {
  const rx: EyePrescription = {
    sphere: -2.25,
    cylinder: -0.75,
    axis: 90,
    add: null,
    pd: 31.5,
  }
  const psf = computePSF(
    rx,
    { viewingDistanceCm: 60, kernelSize: 15 },
    'OD',
  )

  const lowInput = computeCorrectionKernel(
    psf,
    rx,
    { method: 'unsharp', strength: 0.2 },
    60,
  )
  const highInput = computeCorrectionKernel(
    psf,
    rx,
    { method: 'unsharp', strength: 0.9 },
    60,
  )

  assert.deepEqual(lowInput.kernelData, highInput.kernelData)
  approx(sum(lowInput.kernelData), 1, 1e-10)
  assert.ok(lowInput.kernelData.some((value) => value < 0))
  assert.ok(lowInput.kernelData.every(Number.isFinite))
}

function testGazeSmoother(): void {
  const smoother = new GazeSmoother({
    processNoise: 0.5,
    measurementNoise: 8,
    saccadeThreshold: 100000,
  })

  const first = smoother.update(100, 200, 0)
  assert.deepEqual(first, { x: 100, y: 200 })

  let last = first
  for (let i = 1; i <= 30; i++) {
    last = smoother.update(100, 200, i * 16)
  }
  approx(last.x, 100, 1e-6)
  approx(last.y, 200, 1e-6)
  assert.ok(Number.isFinite(last.x) && Number.isFinite(last.y))

  smoother.reset()
  assert.deepEqual(smoother.update(7, 9, 1000), { x: 7, y: 9 })
}

function testGuidedWorkflowDoesNotInventConfidence(): void {
  const makeResult = (eye: 'OD' | 'OS'): ExamResult => ({
    snellenLine: 40,
    estimatedSphere: -0.75,
    astigmatismAngle: 90,
    estimatedCylinder: 0.5,
    eye,
    rawResponses: {},
  })

  const rx = examResultsToPrescription(
    makeResult('OD'),
    makeResult('OS'),
    { pixelsPerMm: 3.78, viewingDistanceCm: 60 },
  )

  assert.equal(rx.source, 'exam')
  assert.equal(rx.examConfidence, null)
  assert.equal(rx.OD.sphere, -0.75)
  assert.equal(rx.OS.sphere, -0.75)
}

function testPolynomialGazeFitRecoversKnownMapping(): void {
  const samples: Array<[number, number]> = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [0, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ]
  const expected = [120, 35, -22, 8, 5, -3]
  const rows = samples.map(([x, y]) => buildFeatures(x, y))
  const targets = rows.map((row) => row.reduce((total, value, i) => total + value * expected[i], 0))

  const fitted = fitAxis(rows, targets)
  assert.ok(fitted)
  fitted!.forEach((value, i) => approx(value, expected[i], 1e-8))
}

function testPolynomialGazeFitRejectsDegenerateData(): void {
  const rows = Array.from({ length: 9 }, () => buildFeatures(0, 0))
  const fitted = fitAxis(rows, Array.from({ length: 9 }, (_, i) => i * 10))
  assert.equal(fitted, null)
}

const tests: Array<[string, () => void]> = [
  ['Gaussian kernel normalization', testGaussianNormalization],
  ['Gaussian input guards', testGaussianRejectsInvalidInputs],
  ['Identity and emmetropic PSF', testIdentityAndEmmetropicPSF],
  ['Directional blur response', testDirectionalBlur],
  ['Blur-model physical input guards', testBlurModelRejectsInvalidPhysicalInputs],
  ['Live kernel sizing contract', testLiveKernelSizingContract],
  ['Live kernel boundary validation', testLiveKernelValidation],
  ['Prescription normalization', testPrescriptionNormalization],
  ['Single strength application', testCorrectionKernelStrengthSemantics],
  ['Gaze smoother stability', testGazeSmoother],
  ['Guided workflow confidence boundary', testGuidedWorkflowDoesNotInventConfidence],
  ['Polynomial gaze fit recovery', testPolynomialGazeFitRecoversKnownMapping],
  ['Polynomial gaze fit degeneracy guard', testPolynomialGazeFitRejectsDegenerateData],
]

for (const [name, test] of tests) {
  test()
  console.log(`PASS ${name}`)
}

console.log(`Verified ${tests.length} numerical and renderer invariants.`)
