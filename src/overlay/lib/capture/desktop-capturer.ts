/**
 * Live screen capture for the correction overlay (DESKTOP path).
 *
 * Uses Electron's desktopCapturer (via preload IPC) + getUserMedia to obtain a
 * hardware-accelerated MediaStream of the whole screen, exposed as an
 * <video> element that can be uploaded directly into a WebGL texture every
 * rAF tick (texImage2D from a video = zero-copy on most GPUs).
 *
 * WHY THIS IS BETTER THAN html2canvas:
 *   - Runs at 60fps vs ~10fps for html2canvas
 *   - Hardware-accelerated GPU path (zero-copy texImage2D from video)
 *   - Captures EVERYTHING on screen, not just one app's DOM
 *   - No latency from DOM serialization
 *   - Works with any content: other browsers, native apps, games, PDFs, etc.
 *
 * SELF-EXCLUSION:
 *   The overlay window excludes itself from the feedback loop because it is
 *   transparent and renders its corrected output ON TOP of the captured
 *   desktop frame. The capture reflects what is behind the overlay; the
 *   overlay's own output replaces that region, so there is no recursion.
 */

// getUserMedia's standard typings don't include Chromium's `mandatory`
// desktop-capture constraints, so we describe the shape we actually pass.
interface DesktopMediaConstraints {
  mandatory: {
    chromeMediaSource: 'desktop';
    chromeMediaSourceId: string;
    maxWidth: number;
    maxHeight: number;
    maxFrameRate: number;
  };
}

export class DesktopCapturer {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;

  async initialize(): Promise<HTMLVideoElement> {
    // 1. Resolve the primary display's capture source id from the main process.
    const sourceId = await window.overlayAPI.getScreenSourceId();

    // 2. Open the desktop stream. The `mandatory` constraints are
    //    Chromium-specific, hence the cast through our local interface.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: screen.width,
          maxHeight: screen.height,
          maxFrameRate: 60,
        },
      } as unknown as MediaTrackConstraints,
    } as MediaStreamConstraints & { video: DesktopMediaConstraints });

    // 3. Hidden <video> sink — drives the WebGL texture, never shown directly.
    const video = document.createElement('video');
    video.srcObject = this.stream;
    video.muted = true;
    video.style.display = 'none';
    document.body.appendChild(video);
    await video.play();
    this.videoElement = video;

    // 4. The renderer reads frames from this element each tick.
    return video;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  isReady(): boolean {
    return this.videoElement !== null && this.videoElement.readyState >= 2;
  }

  stop(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement.remove();
      this.videoElement = null;
    }
  }
}
