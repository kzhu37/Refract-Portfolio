import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CalibrationOverlay from '../components/eyetracking/CalibrationOverlay'
import { gazeTracker } from '../lib/eyetracking/webgazer'
import { usePrescriptionStore } from '../lib/store/prescription-store'

/**
 * Calibration route (/calibration).
 *
 * The "Recalibrate" button in CorrectionControls navigates here. This page owns
 * the lifecycle the CalibrationOverlay itself does not: it starts WebGazer
 * (which turns on the webcam), shows a loading/error state while the model and
 * camera spin up, then hands control to the 9-point CalibrationOverlay. On
 * accept it persists the calibrated flag and leaves tracking running so the
 * correction overlay can follow the user's gaze.
 */

type InitPhase = 'starting' | 'ready' | 'error'

const WRAP: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 18,
  background: 'rgba(7,11,30,0.96)',
  fontFamily: 'Inter, sans-serif',
  textAlign: 'center',
  padding: 40,
}

const PRIMARY_BTN: React.CSSProperties = {
  height: 36,
  padding: '0 20px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)',
  boxShadow: '0 0 0 1px rgba(75,138,240,0.4), 0 4px 24px rgba(75,138,240,0.25)',
}

const GHOST_BTN: React.CSSProperties = {
  height: 36,
  padding: '0 16px',
  borderRadius: 8,
  border: '1px solid rgba(75,94,191,0.18)',
  cursor: 'pointer',
  background: 'transparent',
  color: '#8BADC8',
  fontSize: 13,
}

export function Calibration(): JSX.Element {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<InitPhase>('starting')
  const mounted = useRef(true)

  const startTracking = useCallback(() => {
    setPhase('starting')
    gazeTracker
      .initialize()
      .then(() => {
        if (!mounted.current) return
        gazeTracker.setCameraPreview(true)
        setPhase('ready')
      })
      .catch((err) => {
        console.error('Eye tracking init failed:', err)
        if (mounted.current) setPhase('error')
      })
  }, [])

  useEffect(() => {
    mounted.current = true
    startTracking()
    return () => {
      mounted.current = false
      // Hide the preview when leaving; tracking itself keeps running.
      gazeTracker.setCameraPreview(false)
    }
  }, [startTracking])

  function handleComplete(): void {
    // Persist the calibrated flag and keep tracking enabled so the correction
    // overlay follows the user's gaze instead of falling back to screen-centre.
    usePrescriptionStore.setState({ eyeTrackingCalibrated: true, eyeTrackingEnabled: true })
    navigate('/')
  }

  function handleSkip(): void {
    navigate('/')
  }

  if (phase === 'starting') {
    return (
      <div style={WRAP}>
        <style>{`@keyframes refractSpin { to { transform: rotate(360deg) } }`}</style>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '3px solid rgba(75,138,240,0.25)',
            borderTopColor: '#4B8AF0',
            animation: 'refractSpin 0.8s linear infinite',
          }}
        />
        <p style={{ color: '#E8EDF8', fontSize: 16, margin: 0 }}>Starting camera…</p>
        <p style={{ color: '#6B82A8', fontSize: 13, margin: 0, maxWidth: 360 }}>
          Loading the eye-tracking model and turning on your webcam. This can take a few
          seconds the first time.
        </p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div style={WRAP}>
        <p style={{ color: '#F87171', fontSize: 16, margin: 0 }}>Couldn’t start eye tracking</p>
        <p style={{ color: '#6B82A8', fontSize: 13, margin: 0, maxWidth: 380 }}>
          Make sure no other app is using the webcam and that camera access is allowed, then
          try again.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button onClick={startTracking} style={PRIMARY_BTN}>
            Retry
          </button>
          <button onClick={() => navigate('/')} style={GHOST_BTN}>
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <CalibrationOverlay
      gazeTracker={gazeTracker}
      onCalibrationComplete={handleComplete}
      onSkip={handleSkip}
    />
  )
}

export default Calibration
