import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ExamResult, EyePrescription } from '../../lib/types/prescription'
import {
  examResultsToPrescription,
  type CalibrationData,
} from '../../lib/optics/prescription'
import { usePrescriptionStore } from '../../lib/store/prescription-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExamResultsProps {
  OD:          ExamResult
  OS:          ExamResult
  calibration: CalibrationData
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_TEXT =
  'Edges appear less defined without optical correction. Reading distance text requires additional focus effort. Fine detail and contrast are visibly reduced.'

/** Format a diopter value with a proper minus sign (U+2212). */
function fmtDiop(d: number): string {
  const sign = d >= 0 ? '+' : '−'
  return `${sign}${Math.abs(d).toFixed(2)}`
}

/** Map examConfidence (0–1) to a display tier. */
function confidenceTier(c: number): 'high' | 'medium' | 'low' {
  if (c >= 0.75) return 'high'
  if (c >= 0.50) return 'medium'
  return 'low'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

/** Success/warning/danger badge for the confidence row. */
function ConfidenceBadge({ confidence }: { confidence: number }) {
  const tier = confidenceTier(confidence)

  const styles = {
    high:   { bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.30)',  color: '#34D399' },
    medium: { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.30)',  color: '#FBBF24' },
    low:    { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.30)', color: '#F87171' },
  }[tier]

  const label =
    tier === 'high'   ? 'High confidence'   :
    tier === 'medium' ? 'Medium confidence' :
                        'Low confidence'

  return (
    <span
      className="rounded-badge font-primary"
      style={{
        padding:     '3px 10px',
        background:  styles.bg,
        border:      `1px solid ${styles.border}`,
        color:       styles.color,
        fontSize:    12,
        fontWeight:  500,
        letterSpacing: '0.01em',
        lineHeight:  1.5,
      }}
    >
      {label}
    </span>
  )
}

/** One OD or OS line in the prescription hero block. */
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
      {/* Eye label */}
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

      {/* Value — JetBrains Mono, 36px */}
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

// ─── Main component ───────────────────────────────────────────────────────────

export function ExamResults({
  OD,
  OS,
  calibration,
}: ExamResultsProps): JSX.Element {
  const navigate         = useNavigate()
  const setPrescription  = usePrescriptionStore(s => s.setPrescription)
  const [saved, setSaved] = useState(false)

  const estimated = useMemo(
    () => examResultsToPrescription(OD, OS, calibration),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Blur the "Without Refract" panel proportional to the stronger sphere.
  const dominantSphere = Math.max(
    Math.abs(estimated.OD.sphere),
    Math.abs(estimated.OS.sphere)
  )
  const blurPx = Math.max(1.5, Math.min(7, dominantSphere)).toFixed(1)

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

      {/* ── Top bar ────────────────────────────────────────────────────── */}
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

      {/* ── Amber disclaimer ───────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          height:     40,
          background: 'rgba(251,191,36,0.10)',
        }}
      >
        <span
          className="text-caption text-text-secondary font-primary"
          style={{ letterSpacing: '0.01em' }}
        >
          Estimate only · ±0.50 D · Not a substitute for a professional exam
        </span>
      </div>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main
        className="flex-1 flex items-center justify-center overflow-y-auto px-8"
      >
        <div
          className="flex flex-col items-center font-primary"
          style={{ width: 640 }}
        >

          {/* Heading */}
          <h1
            className="text-heading-xl text-text-primary text-center"
            style={{ marginBottom: 48 }}
          >
            Your prescription
          </h1>

          {/* ── Prescription hero block ─────────────────────────────── */}
          <div className="relative" style={{ marginBottom: 16 }}>
            {/* Atmospheric glow */}
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

            {/* OD / OS rows */}
            <div
              className="relative flex flex-col items-center"
              style={{ gap: 16, zIndex: 1 }}
            >
              <PrescriptionRow label="OD" rx={estimated.OD} />
              <PrescriptionRow label="OS" rx={estimated.OS} />
            </div>
          </div>

          {/* Confidence badge */}
          <div style={{ marginBottom: 40 }}>
            <ConfidenceBadge confidence={estimated.examConfidence ?? 0.65} />
          </div>

          {/* Divider */}
          <div
            className="w-full bg-border-subtle"
            style={{ height: 1, marginBottom: 32 }}
          />

          {/* ── Before / After preview ──────────────────────────────── */}
          <div className="w-full" style={{ marginBottom: 8 }}>
            <h2
              className="text-heading-sm text-text-primary"
              style={{ marginBottom: 16 }}
            >
              Preview: what correction does
            </h2>
          </div>

          <div className="flex w-full" style={{ gap: 24, marginBottom: 40 }}>
            {/* Without Refract */}
            <div className="flex-1 flex flex-col" style={{ gap: 8 }}>
              <span
                className="text-caption text-text-tertiary font-primary"
                style={{ letterSpacing: '0.01em' }}
              >
                Without Refract
              </span>
              <div
                className="bg-bg-elevated border border-border-subtle rounded-card-lg"
                style={{ padding: 20 }}
              >
                <p
                  className="text-body-md text-text-primary font-primary select-none"
                  style={{
                    lineHeight: 1.7,
                    filter:     `blur(${blurPx}px)`,
                    opacity:    0.7,
                  }}
                >
                  {SAMPLE_TEXT}
                </p>
              </div>
            </div>

            {/* With Refract */}
            <div className="flex-1 flex flex-col" style={{ gap: 8 }}>
              <span
                className="text-caption font-primary"
                style={{ color: '#34D399', letterSpacing: '0.01em' }}
              >
                With Refract
              </span>
              <div
                className="bg-bg-elevated rounded-card-lg"
                style={{
                  padding:   20,
                  border:    '1px solid rgba(52,211,153,0.25)',
                  boxShadow: '0 0 20px rgba(52,211,153,0.08)',
                }}
              >
                <p
                  className="text-body-md text-text-primary font-primary"
                  style={{ lineHeight: 1.7 }}
                >
                  {SAMPLE_TEXT}
                </p>
              </div>
            </div>
          </div>

          {/* PD note */}
          <span
            className="text-caption text-text-tertiary font-primary text-center"
            style={{ letterSpacing: '0.01em' }}
          >
            PD estimated at 63 mm · Update in Settings for best accuracy
          </span>

        </div>
      </main>

      {/* ── Bottom bar ─────────────────────────────────────────────────── */}
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
              Enable correction →
            </button>
            <button
              onClick={handleEditManually}
              className="h-7 px-3 rounded-btn bg-transparent border-none cursor-pointer outline-none font-primary text-body-sm hover:opacity-80 transition-opacity"
              style={{ color: '#4B8AF0' }}
            >
              Edit manually
            </button>
          </>
        )}
      </footer>

    </div>
  )
}

export default ExamResults
