import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrescriptionStore } from '../lib/store/prescription-store'
import { PageHeader } from '../components/PageHeader'
import type { EyeSide } from '../lib/types/prescription'

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex gap-1 flex-shrink-0" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === option}
          key={option}
          onClick={() => onChange(option)}
          className="h-9 px-4 rounded-[7px] cursor-pointer outline-none transition-all duration-100 text-body-sm whitespace-nowrap"
          style={{
            background: value === option ? 'rgba(75,138,240,0.14)' : 'transparent',
            border: `1px solid ${value === option ? 'rgba(75,138,240,0.5)' : 'rgba(75,94,191,0.2)'}`,
            color: value === option ? '#FFFFFF' : '#4E6B8F',
            fontWeight: value === option ? 500 : 400,
          }}
        >
          {option}
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
  format: (value: number) => string
  onChange: (value: number) => void
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
        onChange={(event) => onChange(Number(event.target.value))}
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
      <span className="font-mono text-body-sm font-medium text-text-secondary min-w-[64px] text-right">
        {format(value)}
      </span>
    </div>
  )
}

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
    <div className={`setting-row ${last ? '' : 'border-b border-border-subtle'}`}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[15px] leading-6 font-medium text-text-primary">{label}</span>
        {desc && <span className="text-[14px] leading-5 text-text-tertiary">{desc}</span>}
      </div>
      <div className="setting-control">{control}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <span className="text-[13px] leading-5 font-semibold uppercase text-text-tertiary tracking-[0.09em]">
        {children}
      </span>
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-7 rounded-btn border border-border-subtle bg-bg-elevated px-5 py-4">
      <div className="text-[14px] font-medium text-text-secondary mb-2">{title}</div>
      <div className="text-[13px] leading-5 text-text-tertiary">{children}</div>
    </div>
  )
}

function CorrectionTab() {
  const {
    correctionStrength,
    fovealRadius,
    activeEye,
    viewingDistanceCm,
    setCorrectionStrength,
    setFovealRadius,
    setActiveEye,
    setViewingDistance,
  } = usePrescriptionStore()

  const eyeOptions: readonly EyeSide[] = ['OD', 'OS']

  return (
    <div>
      <SectionLabel>Live correction</SectionLabel>
      <SettingRow
        label="Correction strength"
        desc="One shader blend from the original frame to the corrected frame."
        control={
          <InlineSlider
            label="Correction strength"
            value={Math.round(correctionStrength * 100)}
            min={0}
            max={100}
            format={(value) => `${value}%`}
            onChange={(value) => setCorrectionStrength(value / 100)}
          />
        }
      />
      <SettingRow
        label="Focal region"
        desc="Radius of full correction before the edge fades into the untouched desktop."
        control={
          <InlineSlider
            label="Focal region"
            value={fovealRadius}
            min={50}
            max={300}
            step={5}
            format={(value) => `${value} px`}
            onChange={setFovealRadius}
          />
        }
      />
      <SettingRow
        label="Active optical profile"
        desc="The current screen-level renderer applies one eye profile at a time."
        control={
          <Segmented
            label="Active optical profile"
            options={eyeOptions}
            value={activeEye}
            onChange={setActiveEye}
          />
        }
      />
      <SettingRow
        label="Viewing distance"
        desc="Used when converting modeled optical blur into screen pixels."
        last
        control={
          <InlineSlider
            label="Viewing distance"
            value={viewingDistanceCm}
            min={30}
            max={120}
            step={1}
            format={(value) => `${value} cm`}
            onChange={setViewingDistance}
          />
        }
      />

      <InfoCard title="Active algorithm">
        The live route uses a rotated anisotropic Gaussian point spread function, a full-strength unsharp correction kernel, and a WebGL2 luminance blend. Wiener deconvolution remains a separate engineering experiment in the codebase and is not exposed here as an active control.
      </InfoCard>
    </div>
  )
}

function TrackingTab() {
  const navigate = useNavigate()
  const { trackingMode, eyeTrackingCalibrated, setTrackingMode } = usePrescriptionStore()

  return (
    <div>
      <SectionLabel>Point of attention</SectionLabel>
      <SettingRow
        label="Tracking source"
        desc="Cursor mode is immediate and camera-free. Eye tracking is optional."
        control={
          <Segmented
            label="Tracking source"
            options={['Cursor', 'Eye tracking'] as const}
            value={trackingMode === 'cursor' ? 'Cursor' : 'Eye tracking'}
            onChange={(value) => setTrackingMode(value === 'Cursor' ? 'cursor' : 'eye')}
          />
        }
      />
      <SettingRow
        label="Eye-tracking calibration"
        desc="Nine fixation points are followed by separate validation targets."
        last
        control={
          <div className="flex items-center gap-3">
            <span
              className="text-[13px] px-2.5 py-1 rounded-badge"
              style={{
                background: eyeTrackingCalibrated ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
                color: eyeTrackingCalibrated ? '#34D399' : '#FBBF24',
              }}
            >
              {eyeTrackingCalibrated ? 'Calibrated' : 'Not calibrated'}
            </span>
            <button
              type="button"
              onClick={() => navigate('/calibration')}
              className="h-9 text-[14px] text-color-interactive bg-bg-elevated border border-border-subtle rounded-btn px-4 cursor-pointer outline-none hover:border-border-brand transition-colors"
            >
              Calibrate
            </button>
          </div>
        }
      />

      <InfoCard title="Camera behavior">
        Selecting eye tracking requests camera access because MediaPipe iris landmarks become the input to the calibration model. Camera frames are processed locally by the desktop application and are not written to the project data store. Cursor mode remains available without camera access.
      </InfoCard>
    </div>
  )
}

function PrivacyTab() {
  const rows = [
    {
      label: 'Camera',
      desc: 'Used locally for optional eye tracking. Refract does not record camera video to disk.',
    },
    {
      label: 'Screen capture',
      desc: 'Used as the live input texture for correction. The capture pipeline does not save desktop frames to disk.',
    },
    {
      label: 'Prescription',
      desc: 'Stored locally through electron-store so the desktop application can restore it later.',
    },
  ]

  return (
    <div>
      <SectionLabel>Local data</SectionLabel>
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={`flex items-start gap-3.5 py-4 ${index < rows.length - 1 ? 'border-b border-border-subtle' : ''}`}
        >
          <div className="flex flex-col gap-1">
            <span className="text-[15px] font-medium text-text-primary">{row.label}</span>
            <span className="text-[14px] leading-5 text-text-tertiary">{row.desc}</span>
          </div>
        </div>
      ))}

      <InfoCard title="Prototype scope">
        Refract is an experimental engineering prototype, not a medical device or diagnostic system. The guided vision workflow produces heuristic estimates and should not be treated as a prescription or substitute for professional eye care.
      </InfoCard>
    </div>
  )
}

const TABS = ['Correction', 'Tracking', 'Privacy'] as const
type Tab = typeof TABS[number]

function TabBar({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="Settings categories">
      {TABS.map((tab, index) => {
        const isActive = tab === active
        const tabId = `settings-tab-${tab.toLowerCase()}`
        const focusTab = (nextIndex: number) => {
          const nextTab = TABS[nextIndex]
          onSelect(nextTab)
          requestAnimationFrame(() => {
            document.getElementById(`settings-tab-${nextTab.toLowerCase()}`)?.focus()
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
            key={tab}
            onClick={() => onSelect(tab)}
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
            {tab}
          </button>
        )
      })}
    </div>
  )
}

export function Settings() {
  const [tab, setTab] = useState<Tab>('Correction')

  return (
    <div className="settings-page">
      <div className="settings-content">
        <PageHeader
          title="Settings"
          description="Controls shown here are wired to the current prototype. Experimental methods stay labeled as experiments instead of appearing as inactive options."
          className="settings-header"
        />

        <TabBar active={tab} onSelect={setTab} />

        <div
          id="settings-tabpanel"
          className="settings-body"
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab.toLowerCase()}`}
        >
          {tab === 'Correction' && <CorrectionTab />}
          {tab === 'Tracking' && <TrackingTab />}
          {tab === 'Privacy' && <PrivacyTab />}
        </div>
      </div>
    </div>
  )
}

export default Settings
