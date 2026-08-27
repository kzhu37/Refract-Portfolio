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

const initialSettings = getSettings()

let currentOverlayState: OverlayState = {
  enabled: false,
  mode: 'none',
  strength: 0,
  gazePoint: null,
  kernelOD: null,
  kernelOS: null,
  activeEye: initialSettings.activeEye,
  fovealRadius: initialSettings.fovealRadius,
  tracking: initialSettings.trackingMode
}

function pushOverlayState(overlayWindow: OverlayWindow): void {
  overlayWindow.sendOverlayState(currentOverlayState)
}

// ---------------------------------------------------------------------------
// Cursor-follow mode
// ---------------------------------------------------------------------------
// When tracking === 'cursor' there is no webcam gaze stream, so the main process
// becomes the source of the bubble position. It polls the OS cursor location
// system-wide and feeds it as gazePoint. getCursorScreenPoint() returns absolute
// screen coordinates, the same space gazePoint is documented to use.

const CURSOR_POLL_MS = 16 // ~60 Hz, matches the overlay render cadence
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

  // Full overlay state push from renderer after kernel or control changes.
  ipcMain.on(IPC.OVERLAY_STATE_PUSH, (_event, state: OverlayState) => {
    currentOverlayState = { ...currentOverlayState, ...state }
    pushOverlayState(overlayWindow)
    syncCursorTracking(overlayWindow)
  })

  // Gaze relay. In cursor mode the main-process poller owns gazePoint.
  ipcMain.on(IPC.GAZE_UPDATE, (_event, gaze: GazePoint) => {
    if (currentOverlayState.tracking === 'cursor') return
    currentOverlayState = { ...currentOverlayState, gazePoint: gaze }
    pushOverlayState(overlayWindow)
  })

  // Viewing distance ----------------------------------------------------------
  ipcMain.on(IPC.DISTANCE_UPDATE, (_event, distanceCm: number) => {
    setCalibration({ viewingDistanceCm: distanceCm })
    overlayWindow.getWindow()?.webContents.send(IPC.DISTANCE_UPDATE, distanceCm)
  })

  // Main window visibility ----------------------------------------------------
  ipcMain.handle(IPC.WINDOW_SHOW_MAIN, () => mainWindow.show())
  ipcMain.handle(IPC.WINDOW_HIDE_MAIN, () => mainWindow.hide())

  // Screen capture source -----------------------------------------------------
  ipcMain.handle(IPC.SCREEN_SOURCE_ID_GET, async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    })
    return sources[0].id
  })

  // Calibration overlay -------------------------------------------------------
  ipcMain.on(IPC.OVERLAY_INTERACTIVE, (_event, interactive: boolean) => {
    overlayWindow.getWindow()?.setIgnoreMouseEvents(!interactive, { forward: true })
  })

  // Validation export ---------------------------------------------------------
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

  // Display info --------------------------------------------------------------
  ipcMain.handle(IPC.DISPLAY_INFO, () => {
    const display = screen.getPrimaryDisplay()
    return {
      scaleFactor: display.scaleFactor,
      physicalWidth: Math.round(display.size.width * display.scaleFactor),
      physicalHeight: Math.round(display.size.height * display.scaleFactor),
    }
  })
}
