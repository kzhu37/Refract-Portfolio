import { ipcMain, screen, desktopCapturer, dialog } from 'electron'
import fs from 'fs'
import { IPC } from '../types/ipc-channels'
import {
  getPrescription,
  setPrescription,
  getSettings,
  setCalibration
} from '../store/electron-store'
import type { MainWindow } from '../windows/main-window'
import type { OverlayWindow } from '../windows/overlay-window'
import type { FullPrescription, GazePoint, OverlayState } from '../../renderer/lib/types/prescription'

// ---------------------------------------------------------------------------
// Module-level overlay state - single source of truth for what the overlay
// is currently rendering. Updated incrementally by each handler.
// ---------------------------------------------------------------------------

let currentOverlayState: OverlayState = {
  enabled: false,
  mode: 'none',
  strength: 0,
  gazePoint: null,
  kernelOD: null,
  kernelOS: null,
  fovealRadius: getSettings().fovealRadius,
  tracking: getSettings().trackingMode
}

function pushOverlayState(overlayWindow: OverlayWindow): void {
  overlayWindow.sendOverlayState(currentOverlayState)
}

// ---------------------------------------------------------------------------
// Cursor-follow mode
// ---------------------------------------------------------------------------
// When tracking === 'cursor' there's no webcam gaze stream, so the main process
// becomes the source of the bubble position: it polls the OS cursor location
// (which works system-wide, even though the overlay window is click-through)
// and feeds it as the gazePoint. getCursorScreenPoint() returns absolute screen
// coordinates - the same space gazePoint is documented to use.

const CURSOR_POLL_MS = 16 // ~60 Hz, matches the overlay's render cadence
let cursorPollTimer: NodeJS.Timeout | null = null

function startCursorPolling(overlayWindow: OverlayWindow): void {
  if (cursorPollTimer) return
  cursorPollTimer = setInterval(() => {
    const { x, y } = screen.getCursorScreenPoint()
    currentOverlayState = {
      ...currentOverlayState,
      gazePoint: { x, y, timestamp: Date.now(), confidence: 1 }
    }
    pushOverlayState(overlayWindow)
  }, CURSOR_POLL_MS)
}

function stopCursorPolling(): void {
  if (!cursorPollTimer) return
  clearInterval(cursorPollTimer)
  cursorPollTimer = null
}

// Run the cursor poller only while the overlay is active AND in cursor mode.
function syncCursorTracking(overlayWindow: OverlayWindow): void {
  const wantCursor = currentOverlayState.enabled && currentOverlayState.tracking === 'cursor'
  if (wantCursor) startCursorPolling(overlayWindow)
  else stopCursorPolling()
}

export function toggleOverlayState(
  overlayWindow: OverlayWindow,
  mainWindow: MainWindow,
  show?: boolean
): void {
  const next = show !== undefined ? show : !currentOverlayState.enabled
  currentOverlayState = {
    ...currentOverlayState,
    enabled: next,
    mode: next ? 'correction' : 'none',
    strength: next ? getSettings().correctionStrength : 0
  }
  if (next) {
    overlayWindow.show()
    // Ensure focus returns to the main window; showing an alwaysOnTop overlay
    // can briefly displace it in the OS z-order on some platforms.
    mainWindow.getWindow()?.focus()
  } else {
    overlayWindow.hide()
  }
  pushOverlayState(overlayWindow)
  syncCursorTracking(overlayWindow)
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function setupIpcHandlers(mainWindow: MainWindow, overlayWindow: OverlayWindow): void {
  // Prescription persistence --------------------------------------------------
  ipcMain.handle(IPC.PRESCRIPTION_SAVE, (_event, rx: FullPrescription) => {
    setPrescription(rx)
    return true
  })

  ipcMain.handle(IPC.PRESCRIPTION_LOAD, () => {
    return getPrescription()
  })

  // Overlay toggle ------------------------------------------------------------
  ipcMain.handle(IPC.OVERLAY_TOGGLE, (_event, show?: boolean) => {
    toggleOverlayState(overlayWindow, mainWindow, show)
  })

  // Full overlay state push from renderer (after kernel recomputation) ---------
  // Renderer owns kernel computation; main merges the result and forwards it.
  ipcMain.on(IPC.OVERLAY_STATE_PUSH, (_event, state: OverlayState) => {
    currentOverlayState = { ...currentOverlayState, ...state }
    pushOverlayState(overlayWindow)
    // The push may have changed enabled / tracking - re-evaluate the poller.
    syncCursorTracking(overlayWindow)
  })

  // Gaze relay - renderer sends webcam gaze output, main forwards to overlay ---
  // Ignored in cursor mode: there the main-process poller owns the gazePoint and
  // a stray late webcam frame would otherwise fight it.
  ipcMain.on(IPC.GAZE_UPDATE, (_event, gaze: GazePoint) => {
    if (currentOverlayState.tracking === 'cursor') return
    currentOverlayState = { ...currentOverlayState, gazePoint: gaze }
    pushOverlayState(overlayWindow)
  })

  // Viewing distance - renderer detects via MediaPipe face mesh ---------------
  ipcMain.on(IPC.DISTANCE_UPDATE, (_event, distanceCm: number) => {
    // Persist for kernel recomputation (Phase 2).
    setCalibration({ viewingDistanceCm: distanceCm })
    // Forward to overlay so it can independently scale foveal radius.
    overlayWindow.getWindow()?.webContents.send(IPC.DISTANCE_UPDATE, distanceCm)
  })

  // Main window visibility ----------------------------------------------------
  ipcMain.handle(IPC.WINDOW_SHOW_MAIN, () => mainWindow.show())
  ipcMain.handle(IPC.WINDOW_HIDE_MAIN, () => mainWindow.hide())

  // Screen capture source - overlay requests the primary display's id and ----
  // feeds it to getUserMedia({ chromeMediaSourceId }) for live capture.
  ipcMain.handle(IPC.SCREEN_SOURCE_ID_GET, async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }  // Skip thumbnails for speed.
    })
    return sources[0].id  // Primary display source.
  })

  // Calibration overlay - temporarily allow overlay window to receive clicks --
  // setIgnoreMouseEvents(false) lets the overlay respond to pointer events;
  // { forward: true } ensures pointer moves are still forwarded when re-enabled.
  ipcMain.on(IPC.OVERLAY_INTERACTIVE, (_event, interactive: boolean) => {
    overlayWindow.getWindow()?.setIgnoreMouseEvents(!interactive, { forward: true })
  })

  // Validation export - save results JSON via native save dialog -------------
  ipcMain.handle(IPC.VALIDATION_EXPORT, async (_event, data: unknown) => {
    const win = mainWindow.getWindow()
    const opts = {
      title: 'Export Validation Results',
      defaultPath: 'refract-validation.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    }
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts)
    if (canceled || !filePath) return null
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return filePath
  })

  // Display info - physical pixel dimensions and HiDPI scale factor ----------
  ipcMain.handle(IPC.DISPLAY_INFO, () => {
    const display = screen.getPrimaryDisplay()
    return {
      scaleFactor: display.scaleFactor,
      physicalWidth: Math.round(display.size.width * display.scaleFactor),
      physicalHeight: Math.round(display.size.height * display.scaleFactor),
    }
  })
}
