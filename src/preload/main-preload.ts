import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/types/ipc-channels'
import type { FullPrescription, GazePoint, OverlayState } from '../renderer/lib/types/prescription'

const electronAPI = {
  // Prescription I/O
  savePrescription: (rx: FullPrescription): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PRESCRIPTION_SAVE, rx),

  loadPrescription: (): Promise<FullPrescription | null> =>
    ipcRenderer.invoke(IPC.PRESCRIPTION_LOAD),

  // Overlay
  toggleOverlay: (show?: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.OVERLAY_TOGGLE, show),

  // Fire-and-forget gaze — invoked every animation frame, invoke() overhead
  // would accumulate; send() is sufficient because no return value is needed.
  sendGazeUpdate: (gaze: GazePoint): void => {
    ipcRenderer.send(IPC.GAZE_UPDATE, gaze)
  },

  sendDistanceUpdate: (cm: number): void => {
    ipcRenderer.send(IPC.DISTANCE_UPDATE, cm)
  },

  // Push a full OverlayState to main (e.g. after kernel recomputation).
  // Main merges it into currentOverlayState and forwards to the overlay window.
  sendOverlayState: (state: OverlayState): void => {
    ipcRenderer.send(IPC.OVERLAY_STATE_PUSH, state)
  },

  // Subscribe to overlay toggle events pushed back from main.
  // Returns an unsubscribe function so callers can clean up in useEffect.
  onOverlayToggled: (cb: (enabled: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, enabled: boolean): void => cb(enabled)
    ipcRenderer.on(IPC.OVERLAY_TOGGLE, handler)
    return () => ipcRenderer.removeListener(IPC.OVERLAY_TOGGLE, handler)
  },

  showMainWindow: (): void => {
    ipcRenderer.invoke(IPC.WINDOW_SHOW_MAIN)
  },

  hideMainWindow: (): void => {
    ipcRenderer.invoke(IPC.WINDOW_HIDE_MAIN)
  },

  getDisplayInfo: (): Promise<{ scaleFactor: number; physicalWidth: number; physicalHeight: number }> =>
    ipcRenderer.invoke(IPC.DISPLAY_INFO),

  setOverlayInteractive: (interactive: boolean): void => {
    ipcRenderer.send(IPC.OVERLAY_INTERACTIVE, interactive)
  },

  // Validation export — shows native save dialog, writes JSON to chosen path.
  exportValidationResults: (data: unknown): Promise<string | null> =>
    ipcRenderer.invoke(IPC.VALIDATION_EXPORT, data),

  // Read-only platform string so the renderer can adapt UI without Node access.
  platform: process.platform as NodeJS.Platform
} as const

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI)
} else {
  // Fallback for non-sandboxed dev environments — should never reach prod.
  // @ts-ignore
  window.electronAPI = electronAPI
}
