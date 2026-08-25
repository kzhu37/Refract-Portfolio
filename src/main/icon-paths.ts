import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

function resolveIcon(filename: string): string | undefined {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'icons', filename)]
    : [
        join(app.getAppPath(), 'resources', 'icons', filename),
        join(process.cwd(), 'resources', 'icons', filename)
      ]

  return candidates.find((candidate) => existsSync(candidate))
}

export function getAppIconPath(): string | undefined {
  return resolveIcon('refract-icon.png')
}

export function getTrayIconPath(): string | undefined {
  return resolveIcon('refract-tray.png')
}
