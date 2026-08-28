/**
 * Frame-time monitor for the correction render loop.
 *
 * Convolution cost scales with capture resolution and kernel size. This class
 * records a short rolling window of render times and reports when the average
 * remains above the target budget. The current prototype uses that signal for
 * instrumentation only. It does not automatically change capture resolution or
 * claim to provide an adaptive-resolution system.
 *
 * A full window prevents one-off hitches from triggering an over-budget signal.
 * A cooldown prevents the caller from receiving the same signal every frame.
 */
export class AdaptiveQuality {
  private readonly budgetMs: number
  private readonly windowSize: number
  private readonly cooldownMs: number
  private readonly frameTimes: number[] = []
  private lastSignalAt = 0

  constructor(targetFps = 60, windowSize = 30, cooldownMs = 1000) {
    this.budgetMs = 1000 / targetFps
    this.windowSize = windowSize
    this.cooldownMs = cooldownMs
  }

  /** Record one frame's wall-clock render time in milliseconds. */
  recordFrame(frameTimeMs: number): void {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs < 0) return
    this.frameTimes.push(frameTimeMs)
    if (this.frameTimes.length > this.windowSize) {
      this.frameTimes.shift()
    }
  }

  /** Rolling average frame time, or 0 before any frames are recorded. */
  averageFrameTime(): number {
    if (this.frameTimes.length === 0) return 0
    let sum = 0
    for (const t of this.frameTimes) sum += t
    return sum / this.frameTimes.length
  }

  /**
   * Report sustained over-budget rendering after a full measurement window.
   * Returning true does not change quality settings. The caller may log or use
   * the signal in future adaptive-resolution work.
   */
  isSustainedOverBudget(): boolean {
    if (this.frameTimes.length < this.windowSize) return false

    const now = performance.now()
    if (now - this.lastSignalAt < this.cooldownMs) return false

    if (this.averageFrameTime() > this.budgetMs * 1.25) {
      this.lastSignalAt = now
      this.frameTimes.length = 0
      return true
    }

    return false
  }

  /** Discard the current measurement window. */
  reset(): void {
    this.frameTimes.length = 0
  }
}
