import { app } from 'electron'
import ElectronStore from 'electron-store'
import type { FullPrescription, EyeSide, TrackingMode } from '../../renderer/lib/types/prescription'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

interface StoreSchema {
  prescription: FullPrescription | null
  settings: {
    correctionStrength: number
    fovealRadius: number
    kernelMethod: 'wiener' | 'unsharp'
    captureResolutionScale: number
    eyeTrackingEnabled: boolean
    trackingMode: TrackingMode
    launchAtStartup: boolean
    activeEye: EyeSide
  }
  calibrationData: {
    pixelsPerMm: number
    viewingDistanceCm: number
    lastCalibrated: string | null
  }
}

const defaults: StoreSchema = {
  prescription: null,
  settings: {
    correctionStrength: 0.8,
    fovealRadius: 100,
    kernelMethod: 'unsharp',
    captureResolutionScale: 0.75,
    eyeTrackingEnabled: true,
    trackingMode: 'eye',
    launchAtStartup: false,
    activeEye: 'OD'
  },
  calibrationData: {
    pixelsPerMm: 3.78, // ~96 DPI default
    viewingDistanceCm: 60,
    lastCalibrated: null
  }
}

// ---------------------------------------------------------------------------
// Store singleton
// ---------------------------------------------------------------------------

export const store = new ElectronStore<StoreSchema>({ defaults })

// ---------------------------------------------------------------------------
// Typed helpers
// ---------------------------------------------------------------------------

export function getPrescription(): FullPrescription | null {
  return store.get('prescription')
}

export function setPrescription(rx: FullPrescription): void {
  store.set('prescription', rx)
}

export function getSettings(): StoreSchema['settings'] {
  const settings = store.get('settings')
  // Older prototype builds persisted "both". The current screen-level renderer
  // applies one optical profile at a time, so migrate any legacy value to OD.
  const activeEye: EyeSide = settings.activeEye === 'OS' ? 'OS' : 'OD'
  return { ...settings, activeEye }
}

export function setSetting<K extends keyof StoreSchema['settings']>(
  key: K,
  value: StoreSchema['settings'][K]
): void {
  store.set(`settings.${key}`, value)
}

export function getCalibration(): StoreSchema['calibrationData'] {
  return store.get('calibrationData')
}

export function setCalibration(data: Partial<StoreSchema['calibrationData']>): void {
  const current = store.get('calibrationData')
  store.set('calibrationData', { ...current, ...data })
}

// ---------------------------------------------------------------------------
// Launch at startup
// ---------------------------------------------------------------------------

export function setLaunchAtStartup(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    path: process.execPath
  })
  setSetting('launchAtStartup', enabled)
}
