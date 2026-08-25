import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  FullPrescription,
  EyePrescription,
  EyeSide,
  ExamResult,
  CorrectionMode,
  GazePoint,
  PSFKernel,
  CorrectionKernel,
  OverlayState,
  TrackingMode
} from '../types/prescription'
import { computePSF, computeCorrectionKernel } from '../optics/psf'
import { getSettings } from '../settings'

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface PrescriptionState {
  prescription: FullPrescription | null
  examResults: { OD: ExamResult | null; OS: ExamResult | null }
  activeEye: EyeSide | 'both'
  correctionEnabled: boolean
  correctionMode: CorrectionMode
  correctionStrength: number
  gazePoint: GazePoint | null
  eyeTrackingEnabled: boolean
  trackingMode: TrackingMode
  eyeTrackingCalibrated: boolean
  viewingDistanceCm: number
  psfCache: { OD: PSFKernel | null; OS: PSFKernel | null }
  correctionKernelCache: { OD: CorrectionKernel | null; OS: CorrectionKernel | null }
  fovealRadius: number
  isOverlayActive: boolean
}

// ---------------------------------------------------------------------------
// Actions shape
// ---------------------------------------------------------------------------

interface PrescriptionActions {
  setPrescription(rx: FullPrescription): void
  loadPrescriptionFromDisk(): Promise<void>
  updateEyePrescription(eye: EyeSide, rx: Partial<EyePrescription>): void
  setExamResult(eye: EyeSide, result: ExamResult): void
  toggleCorrection(): void
  setCorrectionStrength(strength: number): void
  setTrackingMode(mode: TrackingMode): void
  setGazePoint(point: GazePoint): void
  setViewingDistance(cm: number): void
  invalidatePSFCache(eye?: EyeSide): void
  computeAndCacheKernels(): void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assemble an OverlayState snapshot from current store state. */
function buildOverlayState(s: PrescriptionState): OverlayState {
  return {
    enabled: s.correctionEnabled,
    mode: s.correctionMode,
    // Send 0 when disabled so the overlay clears, but keep the store value intact
    // so re-enabling restores the user's chosen strength without resetting to 0.
    strength: s.correctionEnabled ? s.correctionStrength : 0,
    gazePoint: s.gazePoint,
    kernelOD: s.correctionKernelCache.OD,
    kernelOS: s.correctionKernelCache.OS,
    fovealRadius: s.fovealRadius,
    tracking: s.trackingMode
  }
}

/** Fire-and-forget send to main process (safe to call at any rate). */
function sendStateToMain(state: OverlayState): void {
  window.electronAPI?.sendOverlayState(state)
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Store = PrescriptionState & PrescriptionActions

const initialSettings = getSettings()

export const usePrescriptionStore = create<Store>()(
  subscribeWithSelector((set, get) => ({
    // -------------------------------------------------------------------------
    // Initial state
    // -------------------------------------------------------------------------
    prescription: null,
    examResults: { OD: null, OS: null },
    activeEye: initialSettings.activeEye,
    correctionEnabled: false,
    correctionMode: 'none',
    correctionStrength: initialSettings.correctionStrength,
    gazePoint: null,
    eyeTrackingEnabled: initialSettings.eyeTrackingEnabled,
    trackingMode: initialSettings.trackingMode,
    eyeTrackingCalibrated: false,
    viewingDistanceCm: initialSettings.viewingDistanceCm,
    psfCache: { OD: null, OS: null },
    correctionKernelCache: { OD: null, OS: null },
    fovealRadius: initialSettings.fovealRadius,
    isOverlayActive: false,

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    setPrescription(rx) {
      set({ prescription: rx })
      // Persist to disk then recompute kernels with the new Rx.
      window.electronAPI?.savePrescription(rx)
      get().computeAndCacheKernels()
    },

    async loadPrescriptionFromDisk() {
      const rx = await window.electronAPI?.loadPrescription()
      if (rx) {
        set({ prescription: rx })
        get().computeAndCacheKernels()
      }
    },

    updateEyePrescription(eye, partial) {
      const current = get().prescription
      if (!current) return

      const updated: FullPrescription = {
        ...current,
        [eye]: { ...current[eye], ...partial }
      }

      set({ prescription: updated })
      window.electronAPI?.savePrescription(updated)
      // Invalidate only the affected eye's cache then recompute.
      get().invalidatePSFCache(eye)
      get().computeAndCacheKernels()
    },

    setExamResult(eye, result) {
      set((s) => ({
        examResults: { ...s.examResults, [eye]: result }
      }))
    },

    toggleCorrection() {
      const s = get()
      const next = !s.correctionEnabled
      const nextMode: CorrectionMode = next ? 'correction' : 'none'

      // Don't touch correctionStrength — buildOverlayState sends 0 when disabled
      // so the overlay clears, but the slider value is preserved for re-enable.
      set({
        correctionEnabled: next,
        correctionMode: nextMode,
        isOverlayActive: next
      })

      window.electronAPI?.toggleOverlay(next)
      sendStateToMain(buildOverlayState(get()))
    },

    setCorrectionStrength(strength) {
      set({ correctionStrength: strength })
      sendStateToMain(buildOverlayState(get()))
    },

    setTrackingMode(mode) {
      // Keep eyeTrackingEnabled in lockstep so the rest of the app (and the
      // webcam tracker) reflects whether the camera is the active source.
      // Drop the last gaze point when leaving eye mode so a stale fixation
      // doesn't linger before the cursor poller takes over.
      set({
        trackingMode: mode,
        eyeTrackingEnabled: mode === 'eye',
        gazePoint: mode === 'cursor' ? null : get().gazePoint
      })
      sendStateToMain(buildOverlayState(get()))
    },

    setGazePoint(point) {
      set({ gazePoint: point })
      // Forward to main; main routes it to the overlay window.
      window.electronAPI?.sendGazeUpdate(point)
    },

    setViewingDistance(cm) {
      set({ viewingDistanceCm: cm })
      window.electronAPI?.sendDistanceUpdate(cm)
      // Distance affects defocus calculations — invalidate all cached kernels.
      get().invalidatePSFCache()
      get().computeAndCacheKernels()
    },

    invalidatePSFCache(eye) {
      if (eye) {
        set((s) => ({
          psfCache: { ...s.psfCache, [eye]: null },
          correctionKernelCache: { ...s.correctionKernelCache, [eye]: null }
        }))
      } else {
        set({
          psfCache: { OD: null, OS: null },
          correctionKernelCache: { OD: null, OS: null }
        })
      }
    },

    computeAndCacheKernels() {
      const s = get()
      if (!s.prescription) return

      const eyes: EyeSide[] = ['OD', 'OS']
      const newPSF = { ...s.psfCache }
      const newKernels = { ...s.correctionKernelCache }

      for (const eye of eyes) {
        const rx = s.prescription[eye]

        // Compute PSF (reuse cache entry if still valid).
        const psf =
          newPSF[eye] ??
          computePSF(
            rx,
            { viewingDistanceCm: s.viewingDistanceCm, pupilDiameterMm: 4 },
            eye
          )
        newPSF[eye] = psf

        // Compute correction kernel from PSF.
        newKernels[eye] = computeCorrectionKernel(psf, rx, {
          strength: s.correctionStrength,
          method: 'unsharp'
        }, s.viewingDistanceCm)
      }

      set({
        psfCache: newPSF,
        correctionKernelCache: newKernels
      })

      // Push updated kernels to main process → overlay.
      sendStateToMain(buildOverlayState(get()))
    }
  }))
)

// ---------------------------------------------------------------------------
// Selector hooks
// ---------------------------------------------------------------------------

export function usePrescription(): FullPrescription | null {
  return usePrescriptionStore((s) => s.prescription)
}

export function useCorrectionKernels(): {
  OD: CorrectionKernel | null
  OS: CorrectionKernel | null
} {
  return usePrescriptionStore((s) => s.correctionKernelCache)
}

export function useGazePoint(): GazePoint | null {
  return usePrescriptionStore((s) => s.gazePoint)
}

export function useIsOverlayActive(): boolean {
  return usePrescriptionStore((s) => s.isOverlayActive)
}
