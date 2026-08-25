import { useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { Home } from '../pages/Home'
import { Exam } from '../pages/Exam'
import { PrescriptionEntry } from '../pages/PrescriptionEntry'
import { Settings } from '../pages/Settings'
import { Calibration } from '../pages/Calibration'
import { Help } from '../pages/Help'
import refractPrism from './assets/refract-prism.svg'

// ── Sidebar nav ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Home',            path: '/',            icon: HomeIcon    },
  { label: 'Eye Exam',        path: '/exam',         icon: ScanIcon    },
  { label: 'My Prescription', path: '/prescription', icon: FileIcon    },
  { label: 'Settings',        path: '/settings',     icon: GearIcon    },
  { label: 'Help',            path: '/help',         icon: HelpIcon    },
] as const

function Sidebar({ section }: { section: string }) {
  return (
    <aside className="app-sidebar">
      <NavLink to="/" end aria-label="Refract Home" className="brand-home">
        <img className="brand-mark" src={refractPrism} alt="" />
        <span className="brand-wordmark">
          refract
        </span>
      </NavLink>

      {/* Nav */}
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) => `sidebar-nav-link${isActive ? ' is-active' : ''}`}
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <span>{section}</span>
      </div>
    </aside>
  )
}

// ── Window title sync ─────────────────────────────────────────────────────────

const PATH_TO_SECTION: Record<string, string> = {
  '/':            'Home',
  '/exam':        'Eye Exam',
  '/prescription': 'My Prescription',
  '/settings':    'Settings',
  '/calibration': 'Calibration',
  '/help':        'Help',
}

function useWindowTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    const key = Object.keys(PATH_TO_SECTION)
      .filter(k => k === '/' ? pathname === '/' : pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0] ?? '/'
    const section = PATH_TO_SECTION[key] ?? 'Refract'
    document.title = `Refract: ${section}`
  }, [pathname])

  const key = Object.keys(PATH_TO_SECTION)
    .filter(k => k === '/' ? pathname === '/' : pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0] ?? '/'
  return PATH_TO_SECTION[key] ?? ''
}

// ── App shell ─────────────────────────────────────────────────────────────────

function App(): JSX.Element {
  const section  = useWindowTitle()
  const { pathname } = useLocation()
  const isExam   = pathname.startsWith('/exam')

  return (
      <div className="app-shell">
        {/* Sidebar is hidden during the full-screen exam wizard */}
        {!isExam && <Sidebar section={section} />}

        <main className="app-main">
          <Routes>
            <Route path="/"               element={<Home />} />
            <Route path="/exam"           element={<Exam />} />
            <Route path="/exam/:step"     element={<Exam />} />
            <Route path="/prescription"   element={<PrescriptionEntry />} />
            <Route path="/settings"       element={<Settings />} />
            <Route path="/calibration"    element={<Calibration />} />
            <Route path="/help"           element={<Help />} />
          </Routes>
        </main>
      </div>
  )
}

export default App

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function HomeIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function ScanIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    </svg>
  )
}

function FileIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  )
}

function GearIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function HelpIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5" />
    </svg>
  )
}
