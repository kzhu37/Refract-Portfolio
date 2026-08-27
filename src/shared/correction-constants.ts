export const LIVE_CORRECTION_KERNEL_SIZE = 15
export const LIVE_CORRECTION_KERNEL_TAPS = LIVE_CORRECTION_KERNEL_SIZE * LIVE_CORRECTION_KERNEL_SIZE
export const LIVE_CORRECTION_KERNEL_HALF = Math.floor(LIVE_CORRECTION_KERNEL_SIZE / 2)

export function validateLiveKernelDimensions(kernelLength: number, kernelSize: number): void {
  if (!Number.isInteger(kernelSize) || kernelSize < 0) {
    throw new Error(`Invalid correction kernel size: ${kernelSize}`)
  }

  if (kernelSize === 0) {
    if (kernelLength !== 0) {
      throw new Error('A disabled correction kernel must have zero taps')
    }
    return
  }

  if (kernelSize < 3 || kernelSize % 2 === 0) {
    throw new Error(`Live correction kernels must have an odd size of at least 3, received ${kernelSize}`)
  }

  if (kernelSize > LIVE_CORRECTION_KERNEL_SIZE) {
    throw new Error(
      `Live correction kernels are limited to ${LIVE_CORRECTION_KERNEL_SIZE} x ${LIVE_CORRECTION_KERNEL_SIZE}, received ${kernelSize} x ${kernelSize}`,
    )
  }

  const expected = kernelSize * kernelSize
  if (kernelLength !== expected) {
    throw new Error(`Correction kernel length mismatch: expected ${expected}, received ${kernelLength}`)
  }
}
