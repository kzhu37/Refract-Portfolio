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
  activeEye: EyeSide
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
  setActiveEye(eye: EyeSide): void
  setFovealRadius(radius: number): void
  setTrackingMode(mode: TrackingMode): void
  setGazePoint(point: GazePoint): void
  setViewingDistance(cm: number): void
  invalidatePSFCache(eye?: EyeSide): void
  computeAndCacheKernels(): void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOverlayState(s: PrescriptionState): OverlayState {
  return {
    enabled: s.correctionEnabled,
    mode: s.correctionMode,
    // Strength is applied exactly once, in the WebGL shader. The cached kernel
    // stays full-strength so slider updates do not leave stale kernel state.
    strength: s.correctionEnabled ? s.correctionStrength : 0,
    gazePoint: s.gazePoint,
    kernelOD: s.correctionKernelCache.OD,
    kernelOS: s.correctionKernelCache.OS,
    activeEye: s.activeEye,
    fovealRadius: s.fovealRadius,
    tracking: s.trackingMode
  }
}

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

    setPrescription(rx) {
      set({ prescription: rx })
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
      get().invalidatePSFCache(eye)
      get().computeAndCacheKernels()
    },

    setExamResult(eye, result) {
      set((s) => ({
        examResults: { ...s.examResults, [eye]: result }
      }))
    },

    toggleCorrection() {
      const next = !get().correctionEnabled
      set({
        correctionEnabled: next,
        correctionMode: next ? 'correction' : 'none',
        isOverlayActive: next
      })

      window.electronAPI?.toggleOverlay(next)
      sendStateToMain(buildOverlayState(get()))
    },

    setCorrectionStrength(strength) {
      const bounded = Math.min(1, Math.max(0, strength))
      set({ correctionStrength: bounded })
      sendStateToMain(buildOverlayState(get()))
    },

    setActiveEye(eye) {
      set({ activeEye: eye })
      sendStateToMain(buildOverlayState(get()))
    },

    setFovealRadius(radius) {
      const bounded = Math.min(300, Math.max(50, radius))
      set({ fovealRadius: bounded })
      sendStateToMain(buildOverlayState(get()))
    },

    setTrackingMode(mode) {
      set({
        trackingMode: mode,
        eyeTrackingEnabled: mode === 'eye',
        gazePoint: mode === 'cursor' ? null : get().gazePoint
      })
      sendStateToMain(buildOverlayState(get()))
    },

    setGazePoint(point) {
      set({ gazePoint: point })
      window.electronAPI?.sendGazeUpdate(point)
    },

    setViewingDistance(cm) {
      const bounded = Math.min(120, Math.max(30, cm))
      set({ viewingDistanceCm: bounded })
      window.electronAPI?.sendDistanceUpdate(bounded)
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
        const psf =
          newPSF[eye] ??
          computePSF(
            rx,
            { viewingDistanceCm: s.viewingDistanceCm, pupilDiameterMm: 4 },
            eye
          )
        newPSF[eye] = psf

        newKernels[eye] = computeCorrectionKernel(
          psf,
          rx,
          { method: 'unsharp' },
          s.viewingDistanceCm
        )
      }

      set({
        psfCache: newPSF,
        correctionKernelCache: newKernels
      })

      sendStateToMain(buildOverlayState(get()))
    }
  }))
)

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
