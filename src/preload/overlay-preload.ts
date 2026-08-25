import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/types/ipc-channels'
import type { OverlayState } from '../renderer/lib/types/prescription'

const overlayAPI = {
  // Main process pushes full overlay state on every gaze update and toggle.
  // Returns an unsubscribe function for cleanup.
  onOverlayStateUpdate: (cb: (state: OverlayState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: OverlayState): void => cb(state)
    ipcRenderer.on(IPC.OVERLAY_STATE_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.OVERLAY_STATE_UPDATE, handler)
  },

  // Main process sends a desktopCapturer sourceId when a screen frame is ready.
  onScreenSourceReady: (cb: (sourceId: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sourceId: string): void => cb(sourceId)
    ipcRenderer.on(IPC.SCREEN_FRAME_READY, handler)
    return () => ipcRenderer.removeListener(IPC.SCREEN_FRAME_READY, handler)
  },

  // Resolve the primary display's desktopCapturer source id for getUserMedia.
  getScreenSourceId: (): Promise<string> => ipcRenderer.invoke(IPC.SCREEN_SOURCE_ID_GET)
} as const

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('overlayAPI', overlayAPI)
} else {
  // @ts-ignore
  window.overlayAPI = overlayAPI
}
