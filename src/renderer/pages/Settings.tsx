import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrescriptionStore } from '../lib/store/prescription-store'
import { PageHeader } from '../components/PageHeader'

// ── Shared primitives ─────────────────────────────────────────────────────────

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative flex-shrink-0 cursor-pointer p-0 outline-none border-none transition-all duration-150"
      style={{
        width: 44, height: 26, borderRadius: 13,
        background: on ? 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)' : '#1E2D60',
        boxShadow: on ? '0 0 8px rgba(75,138,240,0.3)' : 'none',
      }}
    >
      <span
        className="absolute rounded-full bg-white"
        style={{
          width: 20, height: 20,
          top: 3, left: on ? 21 : 3,
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          transition: 'left 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />
    </button>
  )
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 flex-shrink-0" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === o}
          key={o}
          onClick={() => onChange(o)}
          className="h-9 px-4 rounded-[7px] cursor-pointer outline-none transition-all duration-100 text-body-sm whitespace-nowrap"
          style={{
            background: value === o ? 'rgba(75,138,240,0.14)' : 'transparent',
            border: `1px solid ${value === o ? 'rgba(75,138,240,0.5)' : 'rgba(75,94,191,0.2)'}`,
            color: value === o ? '#FFFFFF' : '#4E6B8F',
            fontWeight: value === o ? 500 : 400,
          }}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function InlineSlider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  const bg = `linear-gradient(to right, #4B8AF0 0%, #4B8AF0 ${pct}%, #162045 ${pct}%, #162045 100%)`
  return (
    <div className="settings-slider">
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="refract-range settings-inline-range outline-none border-none cursor-pointer"
        style={{
          WebkitAppearance: 'none',
          appearance: 'none',
          height: 5,
          borderRadius: 9999,
          background: bg,
          padding: 0,
        }}
      />
      <span className="font-mono text-body-sm font-medium text-text-secondary min-w-[56px] text-right">
        {format(value)}
      </span>
    </div>
  )
}

// ── Setting row ───────────────────────────────────────────────────────────────

function SettingRow({
  label,
  desc,
  control,
  last = false,
}: {
  label: string
  desc?: string
  control: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className={`setting-row ${
        last ? '' : 'border-b border-border-subtle'
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[15px] leading-6 font-medium text-text-primary">{label}</span>
        {desc && <span className="text-[14px] leading-5 text-text-tertiary">{desc}</span>}
      </div>
      <div className="setting-control">{control}</div>
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <span className="text-[13px] leading-5 font-semibold uppercase text-text-tertiary tracking-[0.09em]">{children}</span>
      {action}
    </div>
  )
}

// ── MonoPill ──────────────────────────────────────────────────────────────────

function MonoPill({ children }: { children: string }) {
  return (
    <span className="font-mono text-body-sm text-text-secondary bg-bg-elevated border border-border-subtle rounded-[6px] px-3 py-1.5 tracking-wide">
      {children}
    </span>
  )
}

// ── CORRECTION TAB ────────────────────────────────────────────────────────────

function CorrectionTab() {
  const [strength, setStrength] = useState(80)
  const [foveal, setFoveal]     = useState(100)
  const [method, setMethod]     = useState<'Unsharp' | 'Wiener'>('Unsharp')
  const [startWith, setStart]   = useState<'ON' | 'OFF'>('ON')
  const [advOpen, setAdvOpen]   = useState(false)
  const [nsr, setNsr]           = useState('0.05')
  const [kernel, setKernel]     = useState<'7×7' | '9×9' | '11×11' | '15×15'>('9×9')

  function save(key: string, value: unknown) {
    ;(window as any).electronAPI?.saveSettings?.(key, value)
  }

  return (
    <div>
      <SectionLabel>Defaults</SectionLabel>
      <SettingRow
        label="Default strength"
        desc="Applied on launch."
        control={
          <InlineSlider
            label="Default strength"
            value={strength} min={0} max={100} format={(v) => `${v}%`}
            onChange={(v) => { setStrength(v); save('defaultStrength', v / 100) }}
          />
        }
      />
      <SettingRow
        label="Foveal zone"
        desc="Clear-centre radius."
        control={
          <InlineSlider
            label="Foveal zone"
            value={foveal} min={20} max={200} step={5} format={(v) => `${v} px`}
            onChange={(v) => { setFoveal(v); save('fovealRadius', v) }}
          />
        }
      />
      <SettingRow
        label="Correction method"
        desc="Faster, less ringing."
        control={
          <Segmented
            label="Correction method"
            options={['Unsharp', 'Wiener'] as const}
            value={method}
            onChange={(v) => { setMethod(v); save('correctionMethod', v.toLowerCase()) }}
          />
        }
      />
      <SettingRow
        label="Start with"
        desc="Correction on at open."
        last={!advOpen}
        control={
          <Segmented
            label="Start with correction"
            options={['ON', 'OFF'] as const}
            value={startWith}
            onChange={(v) => { setStart(v); save('startEnabled', v === 'ON') }}
          />
        }
      />

      {/* Advanced section */}
      <div className="mt-8">
        <SectionLabel
          action={
            <button
              onClick={() => setAdvOpen((o) => !o)}
              className="flex items-center gap-1.5 text-[14px] text-color-interactive bg-transparent border-none cursor-pointer outline-none p-0 hover:opacity-80 transition-opacity"
            >
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="transition-transform duration-150"
                style={{ transform: advOpen ? 'rotate(90deg)' : 'none' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              {advOpen ? 'Hide' : 'Show'}
            </button>
          }
        >
          Advanced
        </SectionLabel>

        {!advOpen && (
          <button
            type="button"
            className="flex w-full items-center justify-between h-[60px] rounded-btn border border-border-subtle px-5 bg-bg-elevated cursor-pointer text-left hover:border-border-default transition-colors"
            onClick={() => setAdvOpen(true)}
          >
            <span className="text-[15px] text-text-tertiary">Advanced correction parameters</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4E6B8F" strokeWidth="1.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}

        {advOpen && (
          <div className="flex flex-col gap-0">
            <SettingRow
              label="NSR override"
              desc="Noise-to-signal ratio for Wiener filter."
              control={
                <input
                  type="number"
                  min={0.01} max={0.2} step={0.01}
                  value={nsr}
                  onChange={(e) => { setNsr(e.target.value); save('nsrOverride', parseFloat(e.target.value)) }}
                  className="font-mono text-body-sm text-text-primary bg-bg-elevated border border-border-subtle rounded-input px-3 outline-none w-[104px] h-10 transition-colors"
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(75,138,240,0.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '' }}
                />
              }
            />
            <SettingRow
              label="Kernel size"
              last
              control={
                <Segmented
                  label="Kernel size"
                  options={['7×7', '9×9', '11×11', '15×15'] as const}
                  value={kernel}
                  onChange={(v) => { setKernel(v); save('kernelSize', parseInt(v)) }}
                />
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── EYE TRACKING TAB ──────────────────────────────────────────────────────────

function EyeTrackingTab() {
  const navigate = useNavigate()
  const { eyeTrackingCalibrated, eyeTrackingEnabled } = usePrescriptionStore()
  const [enabled, setEnabled]         = useState(eyeTrackingEnabled)
  const [cameras, setCameras]         = useState<MediaDeviceInfo[]>([])
  const [camera, setCamera]           = useState('')
  const [advOpen, setAdvOpen]         = useState(false)
  const [processNoise, setProcessN]   = useState('0.01')
  const [measureNoise, setMeasureN]   = useState('0.1')
  const [saccadeThresh, setSaccade]   = useState('50')

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then((devs) => {
        const vids = devs.filter((d) => d.kind === 'videoinput')
        setCameras(vids)
        if (vids.length > 0) setCamera(vids[0].deviceId)
      })
      .catch(() => {})
  }, [])

  function save(key: string, value: unknown) {
    ;(window as any).electronAPI?.saveSettings?.(key, value)
  }

  return (
    <div>
      <SectionLabel>Eye Tracking</SectionLabel>

      <SettingRow
        label="Eye tracking enabled"
        desc="Required for foveal correction."
        control={
          <Toggle label="Eye tracking enabled" on={enabled} onChange={(v) => { setEnabled(v); save('eyeTrackingEnabled', v) }} />
        }
      />

      <SettingRow
        label="Camera device"
        control={
          cameras.length > 0 ? (
            <div className="relative flex-shrink-0">
              <select
                value={camera}
                onChange={(e) => { setCamera(e.target.value); save('cameraDeviceId', e.target.value) }}
                className="h-10 pl-3.5 pr-9 bg-bg-elevated border border-border-subtle rounded-input text-body-sm text-text-secondary outline-none cursor-pointer appearance-none transition-colors min-w-[240px] max-w-full"
                style={{ WebkitAppearance: 'none' }}
              >
                {cameras.map((cam, i) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-tertiary">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          ) : (
            <span className="text-[14px] text-text-tertiary">No camera found</span>
          )
        }
      />

      <SettingRow
        label="Calibration"
        desc="Last calibration status."
        last={!advOpen}
        control={
          <div className="flex items-center gap-3">
            <span
              className="text-[13px] px-2.5 py-1 rounded-badge"
              style={{
                background: eyeTrackingCalibrated ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
                color:      eyeTrackingCalibrated ? '#34D399' : '#FBBF24',
              }}
            >
              {eyeTrackingCalibrated ? 'Calibrated ✓' : 'Not calibrated'}
            </span>
            <button
              onClick={() => navigate('/exam/distance')}
              className="h-9 text-[14px] text-color-interactive bg-bg-elevated border border-border-subtle rounded-btn px-4 cursor-pointer outline-none hover:border-border-brand transition-colors"
            >
              Recalibrate
            </button>
          </div>
        }
      />

      <div className="mt-8">
        <SectionLabel
          action={
            <button
              onClick={() => setAdvOpen((o) => !o)}
              className="flex items-center gap-1.5 text-[14px] text-color-interactive bg-transparent border-none cursor-pointer outline-none p-0"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                style={{ transform: advOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              {advOpen ? 'Hide' : 'Show'}
            </button>
          }
        >
          Advanced
        </SectionLabel>

        {advOpen && (
          <div>
            {(
              [
                { label: 'Kalman process noise', key: 'kalmanProcessNoise', val: processNoise, set: setProcessN },
                { label: 'Measurement noise',    key: 'kalmanMeasureNoise', val: measureNoise, set: setMeasureN },
                { label: 'Saccade threshold',    key: 'saccadeThreshold',   val: saccadeThresh, set: setSaccade },
              ] as const
            ).map(({ label, key, val, set }, i, arr) => (
              <SettingRow
                key={key}
                label={label}
                last={i === arr.length - 1}
                control={
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => { (set as (v: string) => void)(e.target.value); save(key, parseFloat(e.target.value)) }}
                    className="font-mono text-body-sm text-text-primary bg-bg-elevated border border-border-subtle rounded-input px-3 outline-none w-[104px] h-10 transition-colors"
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(75,138,240,0.5)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '' }}
                  />
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── DISPLAY TAB ───────────────────────────────────────────────────────────────

function DisplayTab() {
  const [resolution, setResolution] = useState<'50%' | '75%' | '100%'>('75%')
  const [kernelLim, setKernelLim]   = useState<'7' | '9' | '11' | '15'>('11')
  const [display, setDisplay]       = useState('Display under cursor')

  function save(key: string, value: unknown) {
    ;(window as any).electronAPI?.saveSettings?.(key, value)
  }

  const displayOptions = ['Primary display', 'Display under cursor', 'All displays']

  return (
    <div>
      <SectionLabel>Display</SectionLabel>
      <SettingRow
        label="Capture resolution"
        desc="Higher = sharper correction, more GPU."
        control={
          <Segmented
            label="Capture resolution"
            options={['50%', '75%', '100%'] as const}
            value={resolution}
            onChange={(v) => { setResolution(v); save('captureResolution', v) }}
          />
        }
      />
      <SettingRow
        label="Kernel size limit"
        desc="Maximum correction kernel allowed."
        control={
          <Segmented
            label="Kernel size limit"
            options={['7', '9', '11', '15'] as const}
            value={kernelLim}
            onChange={(v) => { setKernelLim(v); save('kernelSizeLimit', parseInt(v)) }}
          />
        }
      />
      <SettingRow
        label="Apply correction to"
        desc="Active display only."
        last
        control={
          <div className="relative flex-shrink-0">
            <select
              value={display}
              onChange={(e) => { setDisplay(e.target.value); save('applyTo', e.target.value) }}
              className="h-10 pl-3.5 pr-9 bg-bg-elevated border border-border-subtle rounded-input text-body-sm text-text-secondary outline-none cursor-pointer min-w-[240px] max-w-full transition-colors"
              style={{ WebkitAppearance: 'none', appearance: 'none' }}
            >
              {displayOptions.map((o) => <option key={o}>{o}</option>)}
            </select>
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-tertiary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
        }
      />
    </div>
  )
}

// ── SYSTEM TAB ────────────────────────────────────────────────────────────────

function SystemTab() {
  const navigate = useNavigate()
  const [launch, setLaunch] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function save(key: string, value: unknown) {
    ;(window as any).electronAPI?.saveSettings?.(key, value)
  }

  async function handleDelete() {
    if (!window.confirm('Delete all stored data? This will remove your prescription and settings and cannot be undone.')) return
    setDeleting(true)
    try {
      await (window as any).electronAPI?.clearAllData?.()
    } finally {
      setDeleting(false)
      navigate('/')
    }
  }

  const dataPath = window.navigator.platform.toLowerCase().includes('win')
    ? '%APPDATA%\\Refract'
    : '~/Library/Application Support/Refract'

  return (
    <div>
      <SectionLabel>System</SectionLabel>
      <SettingRow
        label="Launch at startup"
        desc="Opens on login."
        control={
          <Toggle
            label="Launch at startup"
            on={launch}
            onChange={(v) => {
              setLaunch(v)
              ;(window as any).electronAPI?.setLaunchAtStartup?.(v)
              save('launchAtStartup', v)
            }}
          />
        }
      />
      <SettingRow
        label="Global shortcuts"
        desc="Toggle correction."
        control={
          <div className="flex gap-1.5">
            <MonoPill>⌘⇧V</MonoPill>
            <MonoPill>⌘⇧B</MonoPill>
          </div>
        }
      />
      <SettingRow
        label="Check for updates"
        last
        control={
          <div className="flex items-center gap-3">
            <button
              className="h-9 text-[14px] text-text-secondary bg-bg-elevated border border-border-subtle rounded-btn px-4 cursor-pointer outline-none hover:border-border-brand hover:text-text-primary transition-colors"
            >
              Check now
            </button>
            <span className="text-[13px] text-text-tertiary">Last checked: today</span>
          </div>
        }
      />

      {/* Data section */}
      <div className="mt-8">
        <div className="h-px bg-border-subtle mb-6" />
        <SectionLabel>Data</SectionLabel>

        <SettingRow
          label="Storage location"
          desc="Local app support folder."
          last
          control={
            <span className="max-w-full overflow-hidden text-ellipsis font-mono text-[13px] text-text-tertiary tracking-wide whitespace-nowrap" title={dataPath}>
              {dataPath}
            </span>
          }
        />

        <div className="mt-5 flex flex-col gap-1.5">
          <div className="flex gap-3">
            <button
              onClick={() => (window as any).electronAPI?.openDataFolder?.()}
              className="h-9 text-[14px] text-text-secondary bg-bg-elevated border border-border-subtle rounded-btn px-4 cursor-pointer outline-none hover:border-border-brand hover:text-text-primary transition-colors"
            >
              Open folder
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="h-9 text-[14px] text-color-danger bg-color-danger/10 border border-color-danger/30 rounded-btn px-4 cursor-pointer outline-none hover:bg-color-danger/20 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete all data'}
            </button>
          </div>
          <span className="text-[13px] text-color-danger">
            This removes your prescription and settings.
          </span>
        </div>
      </div>
    </div>
  )
}

// ── PRIVACY TAB ───────────────────────────────────────────────────────────────

function PrivacyTab() {
  const navigate = useNavigate()

  const rows = [
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      ),
      label: 'Camera',
      desc: 'Used locally for eye tracking. Never recorded or transmitted.',
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      label: 'Screen capture',
      desc: 'Captured in real-time for correction only. Never saved to disk.',
    },
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      label: 'Prescription',
      desc: 'Stored on your device. Never uploaded.',
    },
  ]

  return (
    <div>
      <SectionLabel>Privacy</SectionLabel>

      {rows.map(({ icon, label, desc }, i) => (
        <div
          key={label}
          className={`flex items-start gap-3.5 py-4 ${i < rows.length - 1 ? 'border-b border-border-subtle' : ''}`}
        >
          <span className="text-text-tertiary flex-shrink-0 mt-0.5">{icon}</span>
          <div className="flex flex-col gap-1">
            <span className="text-[15px] font-medium text-text-primary">{label}</span>
            <span className="text-[14px] leading-5 text-text-tertiary">{desc}</span>
          </div>
        </div>
      ))}

      <div className="mt-8 pt-6 border-t border-border-subtle">
        <button
          onClick={() => {
            if (window.confirm('Delete all stored data? This cannot be undone.')) {
              ;(window as any).electronAPI?.clearAllData?.().then(() => navigate('/'))
            }
          }}
          className="h-10 text-[14px] text-color-danger bg-color-danger/10 border border-color-danger/30 rounded-btn px-4 cursor-pointer outline-none hover:bg-color-danger/20 transition-colors"
        >
          Delete all stored data
        </button>
      </div>
    </div>
  )
}

// ── TABS ──────────────────────────────────────────────────────────────────────

const TABS = ['Correction', 'Eye Tracking', 'Display', 'System', 'Privacy'] as const
type Tab = typeof TABS[number]

function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="Settings categories">
      {TABS.map((t, index) => {
        const isActive = t === active
        const tabId = `settings-tab-${t.toLowerCase().replace(' ', '-')}`
        const focusTab = (nextIndex: number) => {
          const nextTab = TABS[nextIndex]
          onSelect(nextTab)
          requestAnimationFrame(() => {
            document.getElementById(`settings-tab-${nextTab.toLowerCase().replace(' ', '-')}`)?.focus()
          })
        }
        return (
          <button
            type="button"
            role="tab"
            id={tabId}
            aria-selected={isActive}
            aria-controls="settings-tabpanel"
            tabIndex={isActive ? 0 : -1}
            key={t}
            onClick={() => onSelect(t)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                focusTab((index + 1) % TABS.length)
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault()
                focusTab((index - 1 + TABS.length) % TABS.length)
              } else if (event.key === 'Home') {
                event.preventDefault()
                focusTab(0)
              } else if (event.key === 'End') {
                event.preventDefault()
                focusTab(TABS.length - 1)
              }
            }}
            className="relative h-[46px] px-5 cursor-pointer bg-transparent border-none outline-none transition-colors text-[15px] whitespace-nowrap"
            style={{
              color: isActive ? '#FFFFFF' : '#4E6B8F',
              fontWeight: isActive ? 500 : 400,
              marginBottom: -1,
            }}
          >
            {isActive && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                style={{ background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)' }}
              />
            )}
            {t}
          </button>
        )
      })}
    </div>
  )
}

// ── Settings page ─────────────────────────────────────────────────────────────

export function Settings() {
  const [tab, setTab] = useState<Tab>('Correction')

  return (
    <div className="settings-page">
      <div className="settings-content">
        <PageHeader title="Settings" className="settings-header" />

        <TabBar active={tab} onSelect={setTab} />

        <div
          id="settings-tabpanel"
          className="settings-body"
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab.toLowerCase().replace(' ', '-')}`}
        >
          {tab === 'Correction'   && <CorrectionTab />}
          {tab === 'Eye Tracking' && <EyeTrackingTab />}
          {tab === 'Display'      && <DisplayTab />}
          {tab === 'System'       && <SystemTab />}
          {tab === 'Privacy'      && <PrivacyTab />}
        </div>
      </div>
    </div>
  )
}

export default Settings
