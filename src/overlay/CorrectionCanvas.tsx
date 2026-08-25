import React, { useEffect, useRef } from 'react'
import type { OverlayState } from '../renderer/lib/types/prescription'
import { CorrectionRenderer } from './lib/webgl/webgl-utils'
import { DesktopCapturer } from './lib/capture/desktop-capturer'
import { AdaptiveQuality } from './lib/quality/adaptive-quality'

/**
 * The correction canvas IS the overlay. It lives in the transparent, click-
 * through overlay window and does exactly one thing: pull the live screen
 * capture, run the gaze-contingent correction shader over it, and paint the
 * result full-screen.
 *
 * It holds no UI and no store. Everything that drives a frame — enable flag,
 * strength, gaze point, correction kernel, foveal radius — arrives from the
 * main process over IPC and is parked in a ref so the 60fps render loop never
 * triggers a React re-render.
 *
 * Transparency contract:
 *   - disabled / zero strength  → canvas cleared to transparent; the real
 *     desktop shows straight through the window, untouched.
 *   - enabled                   → canvas shows the corrected capture, which
 *     overlays the same pixels it was captured from, so the swap is seamless
 *     and flicker-free.
 */

const defaultState: OverlayState = {
  enabled: false,
  mode: 'none',
  strength: 0,
  gazePoint: null,
  kernelOD: null,
  kernelOS: null,
  fovealRadius: 100,
  tracking: 'eye'
}

// Width of the correction fade ring relative to the foveal radius. Mirrors the
// shader's documented 100px foveal / 120px blend defaults (a 1.2 ratio).
const BLEND_RADIUS_RATIO = 1.2

const CorrectionCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CorrectionRenderer | null>(null)
  const capturerRef = useRef<DesktopCapturer | null>(null)
  const stateRef = useRef<OverlayState>(defaultState) // no re-render needed for perf
  const rafRef = useRef<number>(0)
  const qualityRef = useRef<AdaptiveQuality>(new AdaptiveQuality())
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const disposedRef = useRef(false)

  useEffect(() => {
    disposedRef.current = false
    void initPipeline()
    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function initPipeline(): Promise<void> {
    // Initialize WebGL renderer
    rendererRef.current = new CorrectionRenderer(canvasRef.current!)
    rendererRef.current.init()

    // Subscribe to state updates BEFORE the async capture init so we never miss
    // a toggle that arrives while getUserMedia is pending.
    unsubscribeRef.current = window.overlayAPI.onOverlayStateUpdate((state) => {
      stateRef.current = state
      if (state.kernelOD && rendererRef.current) {
        rendererRef.current.setKernel(
          new Float32Array(state.kernelOD.kernelData),
          state.kernelOD.size
        )
      }
    })

    // Initialize screen capturer
    capturerRef.current = new DesktopCapturer()
    const videoEl = await capturerRef.current.initialize()

    // The window may have unmounted while we awaited the capture stream.
    if (disposedRef.current) return

    // Start render loop
    renderLoop(videoEl)
  }

  function renderLoop(video: HTMLVideoElement): void {
    if (disposedRef.current) return
    rafRef.current = requestAnimationFrame(() => renderLoop(video))
    const state = stateRef.current
    const quality = qualityRef.current
    const renderer = rendererRef.current!

    if (!state.enabled || state.strength === 0) {
      // Clear canvas to transparent — show desktop as-is
      renderer.clear()
      return
    }

    if (!capturerRef.current!.isReady()) return

    const frameStart = performance.now()

    // Upload screen frame to GPU texture (zero-copy video path)
    renderer.uploadVideoFrame(video)

    // When a valid kernel exists, upload it; otherwise pass kernelSize=0 so the
    // shader falls through to the zoom-only pass-through path (never black).
    const kernel = state.kernelOD
    const hasKernel = kernel != null && kernel.size >= 3 && kernel.kernelData.length >= 9
    if (hasKernel) {
      renderer.setKernel(new Float32Array(kernel!.kernelData), kernel!.size)
    } else {
      renderer.setKernel(new Float32Array(0), 0)
    }

    // Update gaze uniforms — fall back to screen centre when there's no tracking
    // data OR the point is non-finite. A NaN gaze coordinate would poison the
    // shader's smoothstep and break the whole correction pass.
    const canvas = canvasRef.current!
    const gaze = state.gazePoint
    const gazeValid = gaze != null && Number.isFinite(gaze.x) && Number.isFinite(gaze.y)
    renderer.setGazePoint(
      gazeValid ? gaze!.x : canvas.width / 2,
      gazeValid ? gaze!.y : canvas.height / 2
    )

    renderer.setEnabled(true)
    renderer.setFovealParams(state.fovealRadius, state.fovealRadius * BLEND_RADIUS_RATIO)
    renderer.setStrength(state.strength)
    renderer.setZoom(0.12)
    renderer.render()

    // Adaptive quality monitoring
    const frameTime = performance.now() - frameStart
    quality.recordFrame(frameTime)
    if (quality.shouldReduce()) {
      // Ask the main process to lower the capture resolution; the change comes
      // back as the next overlay-state update, so nothing to do inline here.
    }
  }

  function cleanup(): void {
    disposedRef.current = true
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    capturerRef.current?.stop()
    capturerRef.current = null
    rendererRef.current?.destroy()
    rendererRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none'
      }}
      width={window.screen.width}
      height={window.screen.height}
    />
  )
}

export default CorrectionCanvas
