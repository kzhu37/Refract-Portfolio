import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getAppIconPath } from '../icon-paths'

export class MainWindow {
  private win: BrowserWindow | null = null

  createWindow(): BrowserWindow {
    const iconPath = getAppIconPath()

    this.win = new BrowserWindow({
      width: 1100,
      height: 800,
      minWidth: 900,
      minHeight: 650,
      show: false,
      autoHideMenuBar: true,
      title: 'Refract',
      ...(iconPath ? { icon: iconPath } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/main-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    this.win.on('ready-to-show', () => {
      this.win?.show()
    })

    this.win.on('closed', () => {
      this.win = null
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return this.win
  }

  getWindow(): BrowserWindow | null {
    return this.win
  }

  show(): void {
    if (!this.win) {
      this.createWindow()
      return
    }
    this.win.show()
    this.win.focus()
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

  // Ask the renderer to navigate to a route. The renderer listens for
  // 'navigate' on window.electronAPI.onNavigate and calls router.push().
  navigate(route: string): void {
    this.show()
    this.win?.webContents.send('navigate', route)
  }
}
