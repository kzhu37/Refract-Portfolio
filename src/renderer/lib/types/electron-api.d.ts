import type { FullPrescription, GazePoint, OverlayState } from './prescription'

interface ElectronAPI {
  savePrescription(rx: FullPrescription): Promise<boolean>
  loadPrescription(): Promise<FullPrescription | null>
  toggleOverlay(show?: boolean): Promise<void>
  sendGazeUpdate(gaze: GazePoint): void
  sendDistanceUpdate(cm: number): void
  sendOverlayState(state: OverlayState): void
  onOverlayToggled(cb: (enabled: boolean) => void): () => void
  showMainWindow(): void
  hideMainWindow(): void
  getDisplayInfo(): Promise<{ scaleFactor: number; physicalWidth: number; physicalHeight: number }>
  setOverlayInteractive(interactive: boolean): void
  exportValidationResults(data: unknown): Promise<string | null>
  readonly platform: NodeJS.Platform
}

interface OverlayAPI {
  onOverlayStateUpdate(cb: (state: OverlayState) => void): () => void
  onScreenSourceReady(cb: (sourceId: string) => void): () => void
  getScreenSourceId(): Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    overlayAPI: OverlayAPI
  }
}

export {}
