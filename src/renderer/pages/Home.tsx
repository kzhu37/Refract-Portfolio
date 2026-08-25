import { useNavigate } from 'react-router-dom'
import { usePrescriptionStore } from '../lib/store/prescription-store'
import { CorrectionControls } from '../components/correction/CorrectionControls'
import type { EyePrescription } from '../lib/types/prescription'

function fmtDiop(d: number): string {
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{
        width: 9,
        height: 9,
        background: active ? '#34D399' : '#253580',
        boxShadow: active ? '0 0 6px rgba(52,211,153,0.6)' : 'none',
        transition: 'all 0.2s ease',
      }}
    />
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label="Toggle correction"
      onClick={onChange}
      className="relative flex-shrink-0 cursor-pointer p-0 outline-none border-none transition-all duration-150"
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        background: on
          ? 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)'
          : '#1E2D60',
        boxShadow: on ? '0 0 8px rgba(75,138,240,0.35)' : 'none',
      }}
    >
      <span
        className="absolute rounded-full bg-white"
        style={{
          width: 20,
          height: 20,
          top: 3,
          left: on ? 21 : 3,
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          transition: 'left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />
    </button>
  )
}

function RxRow({ label, rx }: { label: 'OD' | 'OS'; rx: EyePrescription }) {
  const hasCyl = rx.cylinder != null && rx.cylinder !== 0
  const eyeName = label === 'OD' ? 'Right eye' : 'Left eye'
  const needsCompactValues = Math.abs(rx.sphere) >= 10 || (rx.axis ?? 0) >= 100

  return (
    <div className="home-rx-readout">
      <div className="home-rx-label-row">
        <span className="home-rx-label">{label}</span>
        <span className="home-rx-eye-name">{eyeName}</span>
      </div>

      <div className={`home-rx-value-row${needsCompactValues ? ' home-rx-value-row--compact' : ''}`}>
        <span className="home-rx-value">{fmtDiop(rx.sphere)}</span>
        {!hasCyl && <span className="home-rx-unit">DS</span>}
        {hasCyl && rx.cylinder != null && (
          <>
            <span className="home-rx-operator">/</span>
            <span className="home-rx-value">{fmtDiop(rx.cylinder)}</span>
            <span className="home-rx-operator">×</span>
            <span className="home-rx-value home-rx-axis">{rx.axis ?? 0}</span>
          </>
        )}
      </div>
    </div>
  )
}

type QuickAction = {
  label: string
  description: string
  path: string
  Icon: React.FC<{ className?: string }>
}

function QuickActionCard({ label, description, path, Icon }: QuickAction) {
  const navigate = useNavigate()

  return (
    <button onClick={() => navigate(path)} className="home-quick-action">
      <span className="home-quick-action__icon">
        <Icon className="text-color-blue" />
      </span>
      <span className="home-quick-action__copy">
        <span className="home-quick-action__title">{label}</span>
        <span className="home-quick-action__description">{description}</span>
      </span>
      <svg className="home-quick-action__arrow" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M4 9h9M10 5l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Exam',
    description: 'Start a guided vision check',
    path: '/exam',
    Icon: ({ className }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className={className}>
        <circle cx="12" cy="12" r="3" />
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      </svg>
    ),
  },
  {
    label: 'Prescription',
    description: 'Review or edit your values',
    path: '/prescription',
    Icon: ({ className }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className={className}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    description: 'Tune correction preferences',
    path: '/settings',
    Icon: ({ className }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className={className}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

export function Home() {
  const navigate = useNavigate()
  const prescription = usePrescriptionStore((s) => s.prescription)
  const correctionEnabled = usePrescriptionStore((s) => s.correctionEnabled)
  const eyeTrackingCalibrated = usePrescriptionStore((s) => s.eyeTrackingCalibrated)
  const viewingDistanceCm = usePrescriptionStore((s) => s.viewingDistanceCm)
  const activeEye = usePrescriptionStore((s) => s.activeEye)
  const toggleCorrection = usePrescriptionStore((s) => s.toggleCorrection)

  const eyeLabel = activeEye === 'both' ? 'Both' : activeEye
  const stats = [
    {
      label: 'Eye tracking',
      value: eyeTrackingCalibrated ? 'Calibrated ✓' : 'Not calibrated',
    },
    { label: 'Distance', value: `${viewingDistanceCm} cm` },
    { label: 'Selected eye', value: eyeLabel },
  ]

  return (
    <div className="home-shell">
      <div className="home-shortcut-chip">
        <span className="font-mono text-caption text-text-tertiary tracking-wide">⌘ Shift V</span>
      </div>

      <section className="home-workspace">
        <div className="home-stage">
          {prescription ? (
            <div className="home-dashboard">
              <div className="home-status">
                <StatusDot active={correctionEnabled} />
                <span>{correctionEnabled ? 'Correction active' : 'Correction inactive'}</span>
              </div>

              <div className="home-rx-grid">
                <RxRow label="OD" rx={prescription.OD} />
                <RxRow label="OS" rx={prescription.OS} />
              </div>

              <div className="home-correction-row">
                <div>
                  <span className="home-correction-row__title">Correction</span>
                  <span className="home-correction-row__hint">
                    {correctionEnabled ? 'Applied to your selected eye view' : 'Ready when you need it'}
                  </span>
                </div>
                <Toggle on={correctionEnabled} onChange={toggleCorrection} />
              </div>

              <div className="home-stats-grid">
                {stats.map((stat) => (
                  <div key={stat.label} className="home-stat">
                    <span className="home-stat__label">{stat.label}</span>
                    <span className="home-stat__value">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="home-empty-state">
              <h1>Set up your prescription to get started</h1>
              <p>Enter your current values or take the guided eye exam.</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => navigate('/exam')}
                  className="px-6 py-3 rounded-btn text-body-sm font-medium text-text-on-brand cursor-pointer border-none outline-none transition-all duration-150 hover:brightness-110 bg-brand-gradient"
                >
                  Take Eye Exam →
                </button>
                <button
                  onClick={() => navigate('/prescription')}
                  className="px-6 py-3 rounded-btn text-body-sm font-medium text-text-secondary bg-bg-elevated border border-border-default cursor-pointer outline-none transition-all duration-150 hover:border-border-brand hover:text-text-primary"
                >
                  Enter Prescription
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="home-quick-grid">
          {QUICK_ACTIONS.map((action) => (
            <QuickActionCard key={action.label} {...action} />
          ))}
        </div>
      </section>

      <aside className="home-control-column" aria-label="Correction controls">
        <CorrectionControls />
      </aside>
    </div>
  )
}

export default Home
