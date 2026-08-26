import type { FaceMesh, Results } from '@mediapipe/face_mesh'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FaceData {
  distanceCm:     number
  leftEyeCenter:  { x: number; y: number }   // window-relative pixels
  rightEyeCenter: { x: number; y: number }
  faceWidthPx:    number
  confidence:     number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Average adult bizygomatic (cheekbone-to-cheekbone) width in mm.
const FACE_WIDTH_MM = 140

// Throttle: send a frame to FaceMesh at most once per interval (~5fps).
// Distance doesn't change fast; 200ms is plenty responsive.
const THROTTLE_MS = 200

// ---------------------------------------------------------------------------
// FaceTracker
// ---------------------------------------------------------------------------

export class FaceTracker {
  private faceMesh:     FaceMesh | null = null
  private latestData:   FaceData | null = null
  private videoElement: HTMLVideoElement | null = null
  private rafId  = 0
  private lastAt = 0

  // -- Initialization --------------------------------------------------------

  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement

    // Lazy import - FaceMesh + WASM bundle is ~3 MB; don't block startup.
    const { FaceMesh: FM } = await import('@mediapipe/face_mesh')
    this.faceMesh = new FM({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
    }) as FaceMesh

    this.faceMesh.setOptions({
      maxNumFaces:            1,
      refineLandmarks:        true,
      minDetectionConfidence: 0.8,
      minTrackingConfidence:  0.5,
    })

    this.faceMesh.onResults((r: Results) => this.onResults(r))
    await this.faceMesh.initialize()
  }

  // -- Results callback ------------------------------------------------------

  onResults(results: Results): void {
    if (!results.multiFaceLandmarks?.length || !this.videoElement) {
      this.latestData = null
      return
    }

    const lm = results.multiFaceLandmarks[0]
    const vw = this.videoElement.videoWidth  || 640
    const vh = this.videoElement.videoHeight || 480

    // Bizygomatic face width: left cheekbone [234] to right cheekbone [454]
    const lc = lm[234]
    const rc = lm[454]
    const faceWidthPx = Math.hypot((rc.x - lc.x) * vw, (rc.y - lc.y) * vh)
    if (faceWidthPx < 1) return

    // Pinhole model: focalLength ≈ videoWidth × 1.2 (typical webcam FOV)
    const distanceCm = (FACE_WIDTH_MM * (vw * 1.2)) / faceWidthPx / 10

    // Eye centres: average of inner / outer / top / bottom landmark pairs
    const eyePx = (indices: number[]) => ({
      x: indices.reduce((s, i) => s + lm[i].x, 0) / indices.length * vw,
      y: indices.reduce((s, i) => s + lm[i].y, 0) / indices.length * vh,
    })

    this.latestData = {
      distanceCm,
      leftEyeCenter:  eyePx([33,  133, 159, 145]),
      rightEyeCenter: eyePx([362, 263, 386, 374]),
      faceWidthPx,
      // FaceMesh 0.4 doesn't expose a per-face confidence score;
      // use a high constant since minDetectionConfidence=0.8 already gates this.
      confidence: 0.9,
    }
  }

  // -- Processing loop -------------------------------------------------------

  startProcessing(videoElement: HTMLVideoElement): void {
    this.videoElement = videoElement

    const tick = (now: number): void => {
      if (now - this.lastAt > THROTTLE_MS && this.videoElement && this.faceMesh) {
        this.lastAt = now
        this.faceMesh.send({ image: this.videoElement }).catch(() => {})
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void {
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.faceMesh?.close()
    this.faceMesh     = null
    this.videoElement = null
    this.latestData   = null
  }

  // -- Accessors -------------------------------------------------------------

  getLatestFaceData(): FaceData | null {
    return this.latestData
  }
}
