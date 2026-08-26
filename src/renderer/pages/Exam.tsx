import { useEffect, useReducer } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DistanceCalibration } from '../components/exam/DistanceCalibration'
import { SnellenChart } from '../components/exam/SnellenChart'
import { AstigmatismClock } from '../components/exam/AstigmatismClock'
import { AstigmatismFan } from '../components/exam/AstigmatismFan'
import { ContrastCheck } from '../components/exam/ContrastCheck'
import { ExamResults } from '../components/exam/ExamResults'
import type { ExamResult } from '../lib/types/prescription'
import type { CalibrationData } from '../lib/optics/prescription'

// -- Types ---------------------------------------------------------------------

type ExamStep =
  | 'distance'
  | 'snellen-od'
  | 'astigmatism-od'
  | 'astigmatism-fan-od'
  | 'snellen-os'
  | 'astigmatism-os'
  | 'astigmatism-fan-os'
  | 'contrast-check'
  | 'results'

type AstigResult = {
  axis: number | null
  estimatedCylinder: number
  confidence: 'low' | 'medium' | 'high'
}

interface ExamState {
  calibration: CalibrationData | null
  snellenOD: ExamResult | null
  snellenOS: ExamResult | null
  astigmatismOD: AstigResult | null
  astigmatismOS: AstigResult | null
  astigDetectedOD: boolean
  astigDetectedOS: boolean
}

type ExamAction =
  | { type: 'SET_CALIBRATION'; data: CalibrationData }
  | { type: 'SET_SNELLEN'; data: { OD: ExamResult; OS: ExamResult } }
  | { type: 'SET_ASTIG_OD'; data: AstigResult }
  | { type: 'SET_ASTIG_OS'; data: AstigResult }

// -- Reducer -------------------------------------------------------------------

const initialState: ExamState = {
  calibration: null,
  snellenOD: null,
  snellenOS: null,
  astigmatismOD: null,
  astigmatismOS: null,
  astigDetectedOD: false,
  astigDetectedOS: false,
}

function examReducer(state: ExamState, action: ExamAction): ExamState {
  switch (action.type) {
    case 'SET_CALIBRATION':
      return { ...state, calibration: action.data }
    case 'SET_SNELLEN':
      return { ...state, snellenOD: action.data.OD, snellenOS: action.data.OS }
    case 'SET_ASTIG_OD': {
      const detected = Math.abs(action.data.estimatedCylinder) > 0 && action.data.axis !== null
      return { ...state, astigmatismOD: action.data, astigDetectedOD: detected }
    }
    case 'SET_ASTIG_OS': {
      const detected = Math.abs(action.data.estimatedCylinder) > 0 && action.data.axis !== null
      return { ...state, astigmatismOS: action.data, astigDetectedOS: detected }
    }
  }
}

// -- Session storage key -------------------------------------------------------

const SESSION_KEY = 'refract:exam-state'

function loadSession(): ExamState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw) as ExamState
  } catch { /* noop */ }
  return initialState
}

// -- Exam ----------------------------------------------------------------------

export function Exam() {
  const { step } = useParams<{ step?: string }>()
  const navigate  = useNavigate()

  const current = (step ?? 'distance') as ExamStep

  const [state, dispatch] = useReducer(examReducer, undefined, loadSession)

  // Persist state to sessionStorage on each update
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  }, [state])

  function advance(from: ExamStep, astigDetected = false): void {
    switch (from) {
      case 'distance':
        navigate('/exam/snellen-od'); break
      case 'snellen-od':
        navigate('/exam/astigmatism-od'); break
      case 'astigmatism-od':
        navigate(astigDetected ? '/exam/astigmatism-fan-od' : '/exam/snellen-os'); break
      case 'astigmatism-fan-od':
        navigate('/exam/snellen-os'); break
      case 'snellen-os':
        navigate('/exam/astigmatism-os'); break
      case 'astigmatism-os':
        navigate(astigDetected ? '/exam/astigmatism-fan-os' : '/exam/contrast-check'); break
      case 'astigmatism-fan-os':
        navigate('/exam/contrast-check'); break
      case 'contrast-check':
        navigate('/exam/results'); break
    }
  }

  // If we land on a step that needs calibration but it's missing, restart
  useEffect(() => {
    if (current !== 'distance' && current !== 'results' && !state.calibration) {
      navigate('/exam/distance', { replace: true })
    }
  }, [current, state.calibration, navigate])

  // snellen-os is handled by SnellenChart during snellen-od (it tests both eyes).
  // If we navigate here and already have OS results, skip forward.
  useEffect(() => {
    if (current === 'snellen-os' && state.snellenOS) {
      navigate('/exam/astigmatism-os', { replace: true })
    }
  }, [current, state.snellenOS, navigate])

  const calib = state.calibration ?? { pixelsPerMm: 3.78, viewingDistanceCm: 60 }

  return (
    <div className="h-screen bg-bg-primary overflow-hidden">

      {current === 'distance' && (
          <DistanceCalibration
            onComplete={(data) => {
              dispatch({ type: 'SET_CALIBRATION', data })
              advance('distance')
            }}
            onSkip={() => {
              dispatch({ type: 'SET_CALIBRATION', data: { pixelsPerMm: 3.78, viewingDistanceCm: 60 } })
              advance('distance')
            }}
          />
        )}

        {current === 'snellen-od' && (
          <SnellenChart
            pixelsPerMm={calib.pixelsPerMm}
            viewingDistanceCm={calib.viewingDistanceCm}
            onComplete={(results) => {
              dispatch({ type: 'SET_SNELLEN', data: results })
              advance('snellen-od')
            }}
          />
        )}

        {current === 'astigmatism-od' && (
          <AstigmatismClock
            pixelsPerMm={calib.pixelsPerMm}
            eye="OD"
            onComplete={(result) => {
              dispatch({ type: 'SET_ASTIG_OD', data: result })
              advance('astigmatism-od', Math.abs(result.estimatedCylinder) > 0 && result.axis !== null)
            }}
          />
        )}

        {current === 'astigmatism-fan-od' && (
          <AstigmatismFan
            pixelsPerMm={calib.pixelsPerMm}
            eye="OD"
            onComplete={(result) => {
              dispatch({ type: 'SET_ASTIG_OD', data: result })
              advance('astigmatism-fan-od')
            }}
          />
        )}

        {/* snellen-os: redirect handled by useEffect above */}

        {current === 'astigmatism-os' && (
          <AstigmatismClock
            pixelsPerMm={calib.pixelsPerMm}
            eye="OS"
            onComplete={(result) => {
              dispatch({ type: 'SET_ASTIG_OS', data: result })
              advance('astigmatism-os', Math.abs(result.estimatedCylinder) > 0 && result.axis !== null)
            }}
          />
        )}

        {current === 'astigmatism-fan-os' && (
          <AstigmatismFan
            pixelsPerMm={calib.pixelsPerMm}
            eye="OS"
            onComplete={(result) => {
              dispatch({ type: 'SET_ASTIG_OS', data: result })
              advance('astigmatism-fan-os')
            }}
          />
        )}

        {current === 'contrast-check' && (
          <ContrastCheck onContinue={() => advance('contrast-check')} />
        )}

        {current === 'results' && state.snellenOD && state.snellenOS && (
          <ExamResults
            OD={state.snellenOD}
            OS={state.snellenOS}
            calibration={calib}
          />
        )}

        {/* Fallback if results reached without snellen data */}
        {current === 'results' && (!state.snellenOD || !state.snellenOS) && (
          <div className="text-center text-text-secondary">
            <p className="text-body-sm mb-4">Exam data incomplete.</p>
            <button
              onClick={() => navigate('/exam/distance')}
              className="text-color-interactive text-body-sm hover:underline bg-transparent border-none cursor-pointer outline-none"
            >
              Start over →
            </button>
          </div>
        )}
    </div>
  )
}

export default Exam
