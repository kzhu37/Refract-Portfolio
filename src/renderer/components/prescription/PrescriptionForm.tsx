import { useEffect, useReducer, useState, useCallback } from 'react'
import { usePrescriptionStore } from '../../lib/store/prescription-store'
import type { FullPrescription } from '../../lib/types/prescription'
import { PageHeader } from '../PageHeader'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EyeState {
  sph: number
  cyl: number
  axis: number
  add: string
  noAstig: boolean
}

type EyeAction = { field: keyof EyeState; value: number | string | boolean }

const ADD_OPTIONS = ['None', '+0.75', '+1.00', '+1.25', '+1.50', '+1.75', '+2.00', '+2.25', '+2.50', '+2.75', '+3.00']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function roundStep(v: number, step: number) {
  return Math.round(v / step) * step
}

function formatSphere(v: number): string {
  if (v === 0) return 'Plano'
  const sign = v > 0 ? '+' : '−'
  return `${sign}${Math.abs(v).toFixed(2)}`
}

function formatDiopter(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${sign}${Math.abs(v).toFixed(2)}`
}

function formatAxis(v: number): string {
  return String(Math.round(v))
}

function formatPD(v: number): string {
  return `${v.toFixed(1)} mm`
}

function eyeReducer(state: EyeState, action: EyeAction): EyeState {
  return { ...state, [action.field]: action.value }
}

// ---------------------------------------------------------------------------
// AxisDial
// ---------------------------------------------------------------------------

function AxisDial({ angle }: { angle: number }) {
  const cx = 34, cy = 34, r = 27
  const rad = (angle * Math.PI) / 180
  const x1 = cx + r * Math.cos(Math.PI - rad)
  const y1 = cy - r * Math.sin(Math.PI - rad)
  const x2 = cx - r * Math.cos(Math.PI - rad)
  const y2 = cy + r * Math.sin(Math.PI - rad)
  return (
    <svg width={68} height={68} className="shrink-0">
      <defs>
        <linearGradient id="axisGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7B5CF0" />
          <stop offset="100%" stopColor="#4B8AF0" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="#000000" stroke="rgba(75,94,191,0.25)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={1.5} fill="rgba(255,255,255,0.2)" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#axisGrad)" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// NumericStepper
// ---------------------------------------------------------------------------

interface StepperProps {
  value: number
  step: number
  min: number
  max: number
  format?: (v: number) => string
  onChange: (v: number) => void
}

function NumericStepper({ value, step, min, max, format, onChange }: StepperProps) {
  const display = format ? format(value) : formatDiopter(value)
  const decrement = () => onChange(clamp(roundStep(value - step, step), min, max))
  const increment = () => onChange(clamp(roundStep(value + step, step), min, max))

  return (
    <div className="flex items-center w-full h-12 bg-bg-elevated border border-border-subtle rounded-input overflow-hidden">
      <button
        type="button"
        onClick={decrement}
        className="flex items-center justify-center w-11 h-full shrink-0 text-text-tertiary hover:text-text-primary transition-colors duration-100"
        aria-label="Decrease"
      >
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
          <path d="M3 7h8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </button>
      <span className="flex-1 text-center font-mono text-[19px] font-semibold tracking-[-0.02em] text-text-primary select-none">
        {display}
      </span>
      <button
        type="button"
        onClick={increment}
        className="flex items-center justify-center w-11 h-full shrink-0 text-text-tertiary hover:text-text-primary transition-colors duration-100"
        aria-label="Increase"
      >
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
          <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TinyToggle
// ---------------------------------------------------------------------------

function TinyToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-[7px] bg-transparent border-0 cursor-pointer p-0 outline-none"
    >
      <span className="text-[13px] text-text-tertiary font-primary tracking-[0.01em]">{label}</span>
      <span
        className="relative inline-flex shrink-0 rounded-full transition-all duration-[180ms]"
        style={{
          width: 34, height: 20,
          background: checked
            ? 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)'
            : 'rgba(37,53,128,0.7)',
        }}
      >
        <span
          className="absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-[left] duration-200"
          style={{ left: checked ? 17 : 3, transitionTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)' }}
        />
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="prescription-field">
      <span className="text-[14px] leading-5 font-medium text-text-secondary">{label}</span>
      {children}
      {error && <span className="text-caption text-color-danger">{error}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AddSelect
// ---------------------------------------------------------------------------

function AddSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-12 appearance-none bg-bg-elevated border border-border-subtle rounded-input text-text-secondary font-primary text-[15px] pl-4 pr-9 cursor-pointer outline-none transition-colors duration-[120ms] hover:border-border-default focus:border-border-strong focus:shadow-glow-focus"
      >
        {ADD_OPTIONS.map(o => (
          <option key={o} value={o} style={{ background: '#0F1635', color: '#FFFFFF' }}>{o}</option>
        ))}
      </select>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-tertiary flex">
        <svg width={13} height={13} viewBox="0 0 13 13" fill="none">
          <path d="M3 5l3.5 3.5L10 5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EyeColumn
// ---------------------------------------------------------------------------

interface EyeColumnProps {
  eyeId: string
  eyeName: string
  state: EyeState
  dispatch: React.Dispatch<EyeAction>
  axisError?: string
  highCylWarn?: boolean
}

function EyeColumn({ eyeId, eyeName, state, dispatch, axisError, highCylWarn: _ }: EyeColumnProps) {
  const { sph, cyl, axis, add, noAstig } = state

  const showAxis = !noAstig

  return (
    <section className={`prescription-eye-card prescription-eye-card--${eyeId.toLowerCase()}`}>
      <div className="prescription-eye-heading">
        <span>{eyeId}</span>
        <span>{eyeName} eye</span>
      </div>

      <div className="flex flex-col gap-5">
        <Field label="Sphere">
          <NumericStepper
            value={sph}
            step={0.25}
            min={-20}
            max={20}
            format={formatSphere}
            onChange={v => dispatch({ field: 'sph', value: v })}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <Field label="Cylinder">
            <NumericStepper
              value={cyl}
              step={0.25}
              min={-8}
              max={8}
              onChange={v => dispatch({ field: 'cyl', value: v })}
            />
          </Field>
          <div className="flex justify-end mt-[5px]">
            <TinyToggle
              label="No astigmatism"
              checked={noAstig}
              onChange={v => dispatch({ field: 'noAstig', value: v })}
            />
          </div>
        </div>

        <div
          className="overflow-hidden transition-[max-height,opacity] duration-[220ms] ease-in-out"
          style={{ maxHeight: showAxis ? 132 : 0, opacity: showAxis ? 1 : 0 }}
        >
          <Field label="Axis" error={axisError}>
            <div className="flex gap-2.5 items-center">
              <div className="flex-1">
                <NumericStepper
                  value={axis}
                  step={1}
                  min={1}
                  max={180}
                  format={formatAxis}
                  onChange={v => dispatch({ field: 'axis', value: v })}
                />
              </div>
              <AxisDial angle={axis} />
            </div>
          </Field>
        </div>

        <Field label="Add">
          <AddSelect value={add} onChange={v => dispatch({ field: 'add', value: v })} />
        </Field>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// PrescriptionForm
// ---------------------------------------------------------------------------

export function PrescriptionForm() {
  const { setPrescription, prescription } = usePrescriptionStore()

  const initOD: EyeState = {
    sph: prescription?.OD.sphere ?? 0,
    cyl: prescription?.OD.cylinder ?? 0,
    axis: prescription?.OD.axis ?? 90,
    add: prescription?.OD.add != null ? `+${prescription.OD.add.toFixed(2)}` : 'None',
    noAstig: prescription?.OD.cylinder === null,
  }
  const initOS: EyeState = {
    sph: prescription?.OS.sphere ?? 0,
    cyl: prescription?.OS.cylinder ?? 0,
    axis: prescription?.OS.axis ?? 90,
    add: prescription?.OS.add != null ? `+${prescription.OS.add.toFixed(2)}` : 'None',
    noAstig: prescription?.OS.cylinder === null,
  }

  const [od, dispatchOD] = useReducer(eyeReducer, initOD)
  const [os, dispatchOS] = useReducer(eyeReducer, initOS)
  const [pd, setPd] = useState(prescription?.binocularPD ?? 63.0)
  const [perEyePD, setPerEyePD] = useState(false)
  const [pdOD, setPdOD] = useState(prescription?.OD.pd ?? 31.5)
  const [pdOS, setPdOS] = useState(prescription?.OS.pd ?? 31.5)
  const [date, setDate] = useState<string>(() => {
    const d = prescription?.measuredAt ? new Date(prescription.measuredAt) : new Date()
    return d.toISOString().split('T')[0]
  })
  const [hasPrevious, setHasPrevious] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [errors, setErrors] = useState<{ odAxis?: string; osAxis?: string }>({})
  const [warnings, setWarnings] = useState<string[]>([])

  const savedDateLabel = prescription?.measuredAt
    ? new Date(prescription.measuredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  // Load from disk on mount
  useEffect(() => {
    window.electronAPI?.loadPrescription().then(rx => {
      if (rx) setHasPrevious(true)
    }).catch(() => {})
  }, [])

  // Cmd/Ctrl+S to save
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSubmit()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  function validate(): boolean {
    const errs: typeof errors = {}
    const warns: string[] = []

    if (!od.noAstig && Math.abs(od.cyl) > 0.25 && (od.axis < 1 || od.axis > 180)) {
      errs.odAxis = 'Axis required'
    }
    if (!os.noAstig && Math.abs(os.cyl) > 0.25 && (os.axis < 1 || os.axis > 180)) {
      errs.osAxis = 'Axis required'
    }

    for (const [id, eye] of [['OD', od], ['OS', os]] as const) {
      if (eye.sph > 6 || eye.sph < -15) {
        warns.push(`Unusual sphere value (${id}). Please confirm.`)
      }
      if (!eye.noAstig && Math.abs(eye.cyl) > 4) {
        warns.push(`High astigmatism (${id}); correction accuracy may be limited.`)
      }
    }

    setErrors(errs)
    setWarnings(warns)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = useCallback(() => {
    if (!validate()) return

    const parseAdd = (s: string) => (s === 'None' ? null : parseFloat(s))

    const rx: FullPrescription = {
      OD: {
        sphere: od.sph,
        cylinder: od.noAstig ? null : od.cyl,
        axis: od.noAstig ? null : od.axis,
        add: parseAdd(od.add),
        pd: perEyePD ? pdOD : pd / 2,
      },
      OS: {
        sphere: os.sph,
        cylinder: os.noAstig ? null : os.cyl,
        axis: os.noAstig ? null : os.axis,
        add: parseAdd(os.add),
        pd: perEyePD ? pdOS : pd / 2,
      },
      binocularPD: pd,
      measuredAt: new Date(date || Date.now()),
      source: 'manual',
      examConfidence: null,
    }

    setPrescription(rx)
    setHasPrevious(false)
    setDismissed(false)

  }, [od, os, pd, pdOD, pdOS, perEyePD, date, setPrescription])

  const showOverwriteBanner = hasPrevious && !dismissed

  const odAxisError = !od.noAstig && Math.abs(od.cyl) > 0.25 ? errors.odAxis : undefined
  const osAxisError = !os.noAstig && Math.abs(os.cyl) > 0.25 ? errors.osAxis : undefined

  return (
    <div className="prescription-page">
      <div className="prescription-page__inner">
      <PageHeader
        title="Prescription"
        className="prescription-header"
        action={savedDateLabel ? (
          <span className="text-[14px] text-text-tertiary">Saved {savedDateLabel}</span>
        ) : undefined}
      />

      {/* Overwrite banner */}
      {showOverwriteBanner && (
        <div className="flex items-center justify-between gap-4 mb-6 px-4 py-3 rounded-card bg-color-warning/10 border border-color-warning/30 shrink-0">
          <span className="text-caption text-color-warning">Previous prescription will be overwritten.</span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-caption text-color-warning/80 hover:text-color-warning underline underline-offset-2 transition-colors shrink-0"
          >
            Keep current
          </button>
        </div>
      )}

      {/* Validation warnings */}
      {warnings.map(w => (
        <div key={w} className="flex items-center gap-3 mb-4 px-4 py-3 rounded-card bg-color-warning/10 border border-color-warning/30 shrink-0">
          <span className="text-caption text-color-warning">{w}</span>
        </div>
      ))}

      {/* Scrollable body */}
      <div className="prescription-scroll">
        <div className="prescription-form-content">

          {/* Two eye columns */}
          <div className="prescription-eyes">
            <EyeColumn eyeId="OD" eyeName="Right" state={od} dispatch={dispatchOD} axisError={odAxisError} />
            <EyeColumn eyeId="OS" eyeName="Left"  state={os} dispatch={dispatchOS} axisError={osAxisError} />
          </div>

          {/* PD + Date */}
          <div className="prescription-details">
            <div className="prescription-details-grid">
              {!perEyePD ? (
                <Field label="PD">
                  <NumericStepper
                    value={pd}
                    step={0.5}
                    min={50}
                    max={75}
                    format={formatPD}
                    onChange={v => setPd(v)}
                  />
                </Field>
              ) : (
                <>
                  <Field label="OD">
                    <NumericStepper value={pdOD} step={0.5} min={25} max={40} format={formatPD} onChange={setPdOD} />
                  </Field>
                  <Field label="OS">
                    <NumericStepper value={pdOS} step={0.5} min={25} max={40} format={formatPD} onChange={setPdOS} />
                  </Field>
                </>
              )}
              <Field label="Date">
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="h-12 w-full bg-transparent border border-border-subtle rounded-input text-text-secondary font-primary text-[15px] px-4 outline-none transition-colors duration-[120ms] hover:border-border-default focus:border-border-strong focus:shadow-glow-focus [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </Field>
            </div>

            <div className="flex justify-end mt-3">
              <div className="flex items-center gap-2.5">
                <span className="text-caption text-text-tertiary tracking-[0.01em]">Enter PD per eye</span>
                <TinyToggle checked={perEyePD} onChange={setPerEyePD} label="" />
              </div>
            </div>
          </div>

          {/* Save row */}
          <div className="mt-8">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleSubmit}
                className="w-[160px] h-11 rounded-btn bg-brand-gradient text-text-on-brand text-[15px] font-semibold tracking-[-0.01em] transition-opacity duration-150 hover:opacity-90 active:opacity-80"
              >
                Save
              </button>
              <button
                type="button"
                className="h-11 px-5 rounded-btn border border-border-subtle text-text-secondary text-[15px] hover:border-border-default hover:text-text-primary transition-colors duration-150"
              >
                Cancel
              </button>
              <span className="ml-auto font-mono text-caption text-text-tertiary tracking-[0.04em]">⌘S</span>
            </div>

            <div className="flex items-center gap-[7px] mt-4">
              <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className="text-text-tertiary shrink-0">
                <rect x={2} y={5} width={8} height={6} rx={1} stroke="currentColor" strokeWidth={1.25} />
                <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" />
              </svg>
              <span className="text-caption text-text-tertiary tracking-[0.01em]">Stored locally · never uploaded</span>
            </div>
          </div>

        </div>
      </div>

      </div>
    </div>
  )
}
