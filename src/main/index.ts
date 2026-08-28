import { app, BrowserWindow, globalShortcut, Notification } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { MainWindow } from './windows/main-window'
import { OverlayWindow } from './windows/overlay-window'
import { TrayManager } from './tray/tray-manager'
import { setupIpcHandlers, toggleOverlayState } from './ipc/ipc-handlers'
import { getAppIconPath } from './icon-paths'

const mainWindow = new MainWindow()
const overlayWindow = new OverlayWindow()
let tray: TrayManager | null = null

// Track correction state here so the shortcut handler and tray stay in sync.
let correctionEnabled = false

function toggleCorrection(): void {
  toggleOverlayState(overlayWindow, mainWindow)
  const enabled = !correctionEnabled
  correctionEnabled = enabled
  tray?.updateCorrectionStatus(enabled, enabled ? 0.8 : 0)
  new Notification({
    title: 'Refract',
    body: enabled ? 'Display correction enabled' : 'Display correction disabled'
  }).show()
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.refract.app')

  const appIconPath = getAppIconPath()
  if (process.platform === 'darwin' && appIconPath) {
    app.dock.setIcon(appIconPath)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  mainWindow.createWindow()
  overlayWindow.createWindow()

  tray = new TrayManager(mainWindow, overlayWindow)
  tray.init()

  setupIpcHandlers(mainWindow, overlayWindow)

  // Global shortcuts ---------------------------------------------------------
  // Cmd/Ctrl+Shift+V - toggle vision correction on/off
  const toggleAccel = process.platform === 'darwin' ? 'Cmd+Shift+V' : 'Ctrl+Shift+V'
  globalShortcut.register(toggleAccel, toggleCorrection)

  // Cmd/Ctrl+Shift+B - bring Refract settings to front
  const settingsAccel = process.platform === 'darwin' ? 'Cmd+Shift+B' : 'Ctrl+Shift+B'
  globalShortcut.register(settingsAccel, () => mainWindow.show())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow.createWindow()
      overlayWindow.createWindow()
    } else {
      mainWindow.show()
    }
  })
})

// Unregister shortcuts before quit so they don't linger.
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// On macOS the app stays alive in the tray when the main window closes.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
