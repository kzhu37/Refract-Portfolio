import React, { useEffect, useRef } from 'react'
import type { OverlayState } from '../renderer/lib/types/prescription'
import { CorrectionRenderer } from './lib/webgl/webgl-utils'
import { DesktopCapturer } from './lib/capture/desktop-capturer'
import { AdaptiveQuality } from './lib/quality/adaptive-quality'

/**
 * The correction canvas is the overlay. It lives in the transparent,
 * click-through overlay window and does one high-frequency job: pull the live
 * screen capture, run the gaze-contingent correction shader, and paint the
 * result full-screen.
 *
 * It holds no UI and no application store. Everything that drives a frame
 * arrives from the main process over IPC and is parked in a ref so the render
 * loop does not trigger React re-renders.
 */

const defaultState: OverlayState = {
  enabled: false,
  mode: 'none',
  strength: 0,
  gazePoint: null,
  kernelOD: null,
  kernelOS: null,
  activeEye: 'OD',
  fovealRadius: 100,
  tracking: 'cursor'
}

const BLEND_RADIUS_RATIO = 1.2

const CorrectionCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CorrectionRenderer | null>(null)
  const capturerRef = useRef<DesktopCapturer | null>(null)
  const stateRef = useRef<OverlayState>(defaultState)
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
    rendererRef.current = new CorrectionRenderer(canvasRef.current!)
    rendererRef.current.init()

    unsubscribeRef.current = window.overlayAPI.onOverlayStateUpdate((state) => {
      stateRef.current = state
      const selected = state.activeEye === 'OS' ? state.kernelOS : state.kernelOD
      if (selected && rendererRef.current) {
        rendererRef.current.setKernel(
          new Float32Array(selected.kernelData),
          selected.size
        )
      }
    })

    capturerRef.current = new DesktopCapturer()
    const videoEl = await capturerRef.current.initialize()

    if (disposedRef.current) return
    renderLoop(videoEl)
  }

  function renderLoop(video: HTMLVideoElement): void {
    if (disposedRef.current) return
    rafRef.current = requestAnimationFrame(() => renderLoop(video))

    const state = stateRef.current
    const quality = qualityRef.current
    const renderer = rendererRef.current!

    if (!state.enabled || state.strength === 0) {
      renderer.clear()
      return
    }

    if (!capturerRef.current!.isReady()) return

    const frameStart = performance.now()
    renderer.uploadVideoFrame(video)

    const kernel = state.activeEye === 'OS' ? state.kernelOS : state.kernelOD
    const hasKernel = kernel != null && kernel.size >= 3 && kernel.kernelData.length >= 9
    if (hasKernel) {
      renderer.setKernel(new Float32Array(kernel!.kernelData), kernel!.size)
    } else {
      renderer.setKernel(new Float32Array(0), 0)
    }

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
    renderer.render()

    const frameTime = performance.now() - frameStart
    quality.recordFrame(frameTime)
    if (quality.shouldReduce()) {
      // Adaptive-quality feedback is measured here. Resolution changes remain
      // future prototype work, so this hook intentionally has no UI control.
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
