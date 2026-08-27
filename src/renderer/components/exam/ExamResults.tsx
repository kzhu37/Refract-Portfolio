import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ExamResult, EyePrescription } from '../../lib/types/prescription'
import {
  examResultsToPrescription,
  type CalibrationData,
} from '../../lib/optics/prescription'
import { usePrescriptionStore } from '../../lib/store/prescription-store'

// --- Types --------------------------------------------------------------------

export interface ExamResultsProps {
  OD:          ExamResult
  OS:          ExamResult
  calibration: CalibrationData
}

// --- Helpers ------------------------------------------------------------------

/** Format a diopter value with a proper minus sign (U+2212). */
function fmtDiop(d: number): string {
  const sign = d >= 0 ? '+' : '-'
  return `${sign}${Math.abs(d).toFixed(2)}`
}

// --- Sub-components -----------------------------------------------------------

/** All 5 wizard step dots filled brand-gradient (final step). */
function AllDotsFilled() {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="rounded-full flex-shrink-0"
          style={{
            width:      6,
            height:     6,
            background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)',
          }}
        />
      ))}
    </div>
  )
}

/** One OD or OS line in the estimate hero block. */
function PrescriptionRow({
  label,
  rx,
}: {
  label: 'OD' | 'OS'
  rx: EyePrescription
}) {
  const hasCyl = rx.cylinder !== null && rx.cylinder !== 0
  const sphere = fmtDiop(rx.sphere)

  return (
    <div className="flex items-baseline" style={{ gap: 40 }}>
      <span
        className="font-primary uppercase text-text-tertiary"
        style={{
          fontSize:      11,
          fontWeight:    500,
          letterSpacing: '0.07em',
          lineHeight:    1.4,
          minWidth:      24,
          textAlign:     'right',
        }}
      >
        {label}
      </span>

      <span
        className="font-mono text-text-primary"
        style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.2 }}
      >
        {sphere}

        {hasCyl ? (
          <>
            <span className="text-text-tertiary font-mono" style={{ fontWeight: 400, margin: '0 8px' }}>
              /
            </span>
            {fmtDiop(rx.cylinder!)}
            <span className="text-text-tertiary font-mono" style={{ fontWeight: 400, margin: '0 8px' }}>
              ×
            </span>
            {rx.axis ?? 0}
          </>
        ) : (
          <span className="text-text-tertiary font-mono" style={{ fontSize: 24, fontWeight: 400 }}>
            {' '}DS
          </span>
        )}
      </span>
    </div>
  )
}

// --- Main component -----------------------------------------------------------

export function ExamResults({
  OD,
  OS,
  calibration,
}: ExamResultsProps): JSX.Element {
  const navigate          = useNavigate()
  const setPrescription   = usePrescriptionStore(s => s.setPrescription)
  const [saved, setSaved] = useState(false)

  const estimated = useMemo(
    () => examResultsToPrescription(OD, OS, calibration),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  function handleEnable(): void {
    setPrescription(estimated)
    setSaved(true)
    setTimeout(() => navigate('/'), 1400)
  }

  function handleEditManually(): void {
    navigate('/prescription', { state: { prescription: estimated } })
  }

  return (
    <div className="w-full h-full flex flex-col bg-bg-primary">

      {/* -- Top bar ------------------------------------------------------ */}
      <header
        className="flex-shrink-0 bg-bg-base border-b border-border-subtle flex items-center px-8 relative"
        style={{ height: 48 }}
      >
        <span className="text-caption text-text-tertiary font-primary">refract</span>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <AllDotsFilled />
        </div>

        <span className="ml-auto text-caption text-text-tertiary font-primary">
          Results
        </span>
      </header>

      {/* -- Amber disclaimer --------------------------------------------- */}
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          minHeight:   40,
          padding:     '8px 24px',
          background:  'rgba(251,191,36,0.10)',
        }}
      >
        <span
          className="text-caption text-text-secondary font-primary text-center"
          style={{ letterSpacing: '0.01em' }}
        >
          Exploratory estimate only · Not a refraction or a substitute for a professional eye exam
        </span>
      </div>

      {/* -- Main content ------------------------------------------------- */}
      <main className="flex-1 flex items-center justify-center overflow-y-auto px-8">
        <div
          className="flex flex-col items-center font-primary"
          style={{ width: 640 }}
        >

          <h1
            className="text-heading-xl text-text-primary text-center"
            style={{ marginBottom: 16 }}
          >
            Guided estimate
          </h1>

          <p
            className="text-body-sm text-text-secondary text-center font-primary"
            style={{ maxWidth: 520, margin: '0 0 44px', lineHeight: 1.65 }}
          >
            Refract uses the responses from this experimental workflow to create a starting point for the prototype. Visual acuity does not uniquely determine a prescription, so these values should not be treated as measured refraction.
          </p>

          <div className="relative" style={{ marginBottom: 28 }}>
            <div
              aria-hidden
              style={{
                position:      'absolute',
                top:           '50%',
                left:          '50%',
                transform:     'translate(-50%, -50%)',
                width:         520,
                height:        200,
                pointerEvents: 'none',
                background:    'radial-gradient(ellipse at 50% 50%, rgba(123,92,240,0.05) 0%, rgba(75,138,240,0.03) 45%, transparent 70%)',
              }}
            />

            <div
              className="relative flex flex-col items-center"
              style={{ gap: 16, zIndex: 1 }}
            >
              <PrescriptionRow label="OD" rx={estimated.OD} />
              <PrescriptionRow label="OS" rx={estimated.OS} />
            </div>
          </div>

          <div
            className="w-full bg-bg-elevated border border-border-subtle rounded-card-lg"
            style={{ padding: '20px 24px', marginBottom: 28 }}
          >
            <p
              className="text-body-sm text-text-secondary font-primary text-center"
              style={{ margin: 0, lineHeight: 1.65 }}
            >
              The values above are used only as inputs to Refract's experimental display model. For a known prescription, enter the professionally measured OD and OS values manually instead.
            </p>
          </div>

          <span
            className="text-caption text-text-tertiary font-primary text-center"
            style={{ letterSpacing: '0.01em', maxWidth: 520, lineHeight: 1.6 }}
          >
            PD uses a 63 mm population default. Update it in Settings if you know your measured value.
          </span>

        </div>
      </main>

      {/* -- Bottom bar --------------------------------------------------- */}
      <footer
        className="flex-shrink-0 bg-bg-base border-t border-border-subtle flex flex-col items-center justify-center"
        style={{ height: 64, gap: 6 }}
      >
        {saved ? (
          <span className="text-caption text-text-tertiary font-primary" style={{ letterSpacing: '0.01em' }}>
            Saved to your computer. It loads automatically each time you open Refract.
          </span>
        ) : (
          <>
            <button
              onClick={handleEnable}
              className="h-8 px-5 rounded-btn text-body-sm font-semibold text-text-on-brand border-none cursor-pointer outline-none shadow-glow-brand font-primary"
              style={{ background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)' }}
            >
              Use this estimate →
            </button>
            <button
              onClick={handleEditManually}
              className="h-7 px-3 rounded-btn bg-transparent border-none cursor-pointer outline-none font-primary text-body-sm hover:opacity-80 transition-opacity"
              style={{ color: '#4B8AF0' }}
            >
              Enter measured values instead
            </button>
          </>
        )}
      </footer>

    </div>
  )
}

export default ExamResults