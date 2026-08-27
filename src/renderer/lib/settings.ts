import type { EyeSide, TrackingMode } from './types/prescription'

/** Runtime settings visible to the renderer.
 *  Defaults come from .env (VITE_ prefix exposes them via import.meta.env).
 *  The main process owns authoritative persistence via electron-store;
 *  this module provides a synchronous snapshot for store initialisation.
 */
export interface RendererSettings {
  correctionStrength: number
  fovealRadius: number
  eyeTrackingEnabled: boolean
  trackingMode: TrackingMode
  activeEye: EyeSide
  viewingDistanceCm: number
}

export function getSettings(): RendererSettings {
  return {
    correctionStrength: 0.8,
    fovealRadius: 100,
    eyeTrackingEnabled: false,
    trackingMode: 'cursor',
    activeEye: 'OD',
    viewingDistanceCm: Number(import.meta.env.VITE_DEFAULT_VIEWING_DISTANCE_CM ?? 60)
  }
}
