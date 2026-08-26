/**
 * Adaptive quality governor for the correction render loop.
 *
 * The convolution pass cost scales with capture resolution and kernel size, so
 * on weaker GPUs the loop can blow past the per-frame budget and the corrected
 * image starts to lag the live desktop. This class watches a short rolling
 * window of frame times and, when the average is sustained over budget, signals
 * that the pipeline should drop a quality tier (the main process then lowers the
 * capture resolution on the next state push).
 *
 * Two guards prevent thrashing:
 *   - a full window must accumulate before any decision is made, so a single
 *     hitch (GC pause, window resize) never triggers a downgrade;
 *   - a cooldown after each decision gives the new resolution time to settle
 *     before we measure again.
 */
export class AdaptiveQuality {
  private readonly budgetMs: number
  private readonly windowSize: number
  private readonly cooldownMs: number
  private readonly frameTimes: number[] = []
  private lastDecisionAt = 0

  constructor(targetFps = 60, windowSize = 30, cooldownMs = 1000) {
    this.budgetMs = 1000 / targetFps
    this.windowSize = windowSize
    this.cooldownMs = cooldownMs
  }

  /** Record one frame's wall-clock render time (ms). */
  recordFrame(frameTimeMs: number): void {
    this.frameTimes.push(frameTimeMs)
    if (this.frameTimes.length > this.windowSize) {
      this.frameTimes.shift()
    }
  }

  /** Rolling average frame time (ms), or 0 before any frames are recorded. */
  averageFrameTime(): number {
    if (this.frameTimes.length === 0) return 0
    let sum = 0
    for (const t of this.frameTimes) sum += t
    return sum / this.frameTimes.length
  }

  /**
   * True when sustained frame time exceeds 1.25× budget and the cooldown has
   * elapsed. Resets the window after returning true so the next decision is
   * based on fresh measurements at the new quality tier.
   */
  shouldReduce(): boolean {
    if (this.frameTimes.length < this.windowSize) return false

    const now = performance.now()
    if (now - this.lastDecisionAt < this.cooldownMs) return false

    if (this.averageFrameTime() > this.budgetMs * 1.25) {
      this.lastDecisionAt = now
      this.frameTimes.length = 0
      return true
    }

    return false
  }

  /** Discard the current window (e.g. after a resolution change). */
  reset(): void {
    this.frameTimes.length = 0
  }
}
