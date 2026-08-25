import { BrowserWindow, screen, Display } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC } from '../types/ipc-channels'
import type { OverlayState } from '../../renderer/lib/types/prescription'

export class OverlayWindow {
  private win: BrowserWindow | null = null
  private currentDisplay: Display | null = null

  createWindow(): BrowserWindow {
    const display = this.getActiveDisplay()
    this.currentDisplay = display
    const { x, y, width, height } = display.bounds

    this.win = new BrowserWindow({
      x,
      y,
      width,
      height,
      show: false,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      resizable: false,
      movable: false,
      webPreferences: {
        preload: join(__dirname, '../preload/overlay-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        offscreen: false
      }
    })

    // CRITICAL: exclude the overlay from screen capture. desktopCapturer would
    // otherwise see our own corrected output, we'd correct that again next frame,
    // and brightness compounds exponentially until the screen goes white.
    // setContentProtection keeps the window visible to the user but invisible
    // to capture APIs, breaking the feedback loop.
    this.win.setContentProtection(true)

    // Click-through: mouse events pass to apps below. forward keeps move events
    // flowing so we can still track cursor position and gaze regions.
    this.win.setIgnoreMouseEvents(true, { forward: true })
    // 'screen-saver' level sits above fullscreen apps on macOS.
    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.setVisibleOnAllWorkspaces(true)

    this.win.on('closed', () => {
      this.win = null
      this.currentDisplay = null
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
    } else {
      this.win.loadFile(join(__dirname, '../renderer/overlay.html'))
    }

    this.registerDisplayListeners()

    return this.win
  }

  getWindow(): BrowserWindow | null {
    return this.win
  }

  sendOverlayState(state: OverlayState): void {
    if (!this.win || this.win.isDestroyed()) return
    this.win.webContents.send(IPC.OVERLAY_STATE_UPDATE, state)
  }

  // Keep window alive even when "disabled" — destroying and recreating has
  // latency. Set strength to 0 and render transparent instead.
  show(): void {
    this.win?.showInactive()
  }

  hide(): void {
    this.win?.hide()
  }

  toggle(): void {
    if (this.win?.isVisible()) {
      this.hide()
    } else {
      this.show()
    }
  }

  // ---------------------------------------------------------------------------
  // Multi-monitor
  // ---------------------------------------------------------------------------

  // Returns the display where the cursor currently sits, falling back to the
  // primary display if getCursorScreenPoint() returns something off-screen.
  private getActiveDisplay(): Display {
    const cursor = screen.getCursorScreenPoint()
    return screen.getDisplayNearestPoint(cursor)
  }

  // Reposition and resize the overlay to cover the given display.
  private fitToDisplay(display: Display): void {
    if (!this.win || this.win.isDestroyed()) return

    const { x, y, width, height } = display.bounds
    this.win.setBounds({ x, y, width, height })
    this.currentDisplay = display
  }

  // Called on every display topology change. Re-evaluates which display is
  // "active" (nearest the cursor) and snaps the overlay to it.
  private handleDisplayChange(): void {
    const active = this.getActiveDisplay()

    // Skip if we're already covering this display to avoid unnecessary repaints.
    if (this.currentDisplay && this.currentDisplay.id === active.id) {
      // Still need to re-fit in case the display's own metrics changed
      // (resolution, scale factor, work area).
      this.fitToDisplay(active)
      return
    }

    this.fitToDisplay(active)
  }

  private registerDisplayListeners(): void {
    // display-metrics-changed fires when a display's resolution or scale changes.
    screen.on('display-metrics-changed', (_event, _display, _changedMetrics) => {
      this.handleDisplayChange()
    })

    // display-added / display-removed: external monitor plugged in or unplugged.
    screen.on('display-added', () => {
      this.handleDisplayChange()
    })

    screen.on('display-removed', (_event, removedDisplay) => {
      // If the removed display was the one we were covering, snap to whatever
      // is now nearest the cursor (the OS will have moved it).
      if (this.currentDisplay?.id === removedDisplay.id) {
        this.currentDisplay = null
      }
      this.handleDisplayChange()
    })
  }
}
