import { useEffect, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ExamResult } from '../../lib/types/prescription'

// --- Constants ---------------------------------------------------------------

const SLOAN_LETTERS = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z'] as const
const BTN_ROW1 = ['C', 'D', 'H', 'K', 'N'] as const
const BTN_ROW2 = ['O', 'R', 'S', 'V', 'Z'] as const
const TIMER_SECONDS = 10

// Physical Snellen letter heights at 20 feet per row denominator.
// letter_height_mm = (denominator / 20) × 8.73mm  →  px = mm × pixelsPerMm
const CHART_META = [
  { acuity: '20/200', denominator: 200 },
  { acuity: '20/100', denominator: 100 },
  { acuity: '20/70',  denominator: 70  },
  { acuity: '20/50',  denominator: 50  },
  { acuity: '20/40',  denominator: 40  },
  { acuity: '20/30',  denominator: 30  },
  { acuity: '20/20',  denominator: 20  },
] as const

// --- Types --------------------------------------------------------------------

export interface SnellenChartProps {
  pixelsPerMm: number
  viewingDistanceCm: number
  onComplete: (result: { OD: ExamResult; OS: ExamResult }) => void
}

type ExamPhase =
  | 'covering_left'
  | 'testing_right'
  | 'eye_switch'
  | 'covering_right'
  | 'testing_left'
  | 'done'

interface ChartRow {
  acuity: string
  denominator: number
  letters: string[]
}

interface ExamState {
  phase: ExamPhase
  rows: ChartRow[]
  rowIndex: number
  selections: string[]
  timeLeft: number
  passed: boolean[]
  OD: ExamResult | null
  OS: ExamResult | null
}

type ExamAction =
  | { type: 'START_TEST' }
  | { type: 'TOGGLE'; letter: string }
  | { type: 'NEXT_LINE' }
  | { type: 'PREV_LINE' }
  | { type: 'TICK' }
  | { type: 'NEXT_EYE' }

// --- Helpers ------------------------------------------------------------------

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generateRows(): ChartRow[] {
  return CHART_META.map(({ acuity, denominator }, i) => ({
    acuity,
    denominator,
    letters: shuffle(SLOAN_LETTERS).slice(0, i + 1),
  }))
}

function letterHeightPx(denominator: number, pixelsPerMm: number): number {
  return (denominator / 20) * 8.73 * pixelsPerMm
}

function buildResult(rows: ChartRow[], passed: boolean[], eye: 'OD' | 'OS'): ExamResult {
  let lastPassedDenom = rows[0].denominator
  for (let i = 0; i < passed.length; i++) {
    if (passed[i]) lastPassedDenom = rows[i].denominator
  }
  return {
    snellenLine:       lastPassedDenom,
    estimatedSphere:   0,
    astigmatismAngle:  null,
    estimatedCylinder: null,
    eye,
    rawResponses: {
      rows: rows.slice(0, passed.length).map((r, i) => ({
        acuity: r.acuity,
        letters: r.letters,
        passed: passed[i],
      })),
    },
  }
}

// --- Reducer ------------------------------------------------------------------

function getInitialState(): ExamState {
  return {
    phase:      'covering_left',
    rows:       generateRows(),
    rowIndex:   0,
    selections: [],
    timeLeft:   TIMER_SECONDS,
    passed:     [],
    OD:         null,
    OS:         null,
  }
}

function reducer(state: ExamState, action: ExamAction): ExamState {
  switch (action.type) {

    case 'START_TEST': {
      const nextPhase: ExamPhase =
        state.phase === 'covering_left'  ? 'testing_right' :
        state.phase === 'covering_right' ? 'testing_left'  :
        state.phase
      return {
        ...state,
        phase:      nextPhase,
        rows:       generateRows(),
        rowIndex:   0,
        selections: [],
        timeLeft:   TIMER_SECONDS,
        passed:     [],
      }
    }

    case 'TOGGLE': {
      const has = state.selections.includes(action.letter)
      return {
        ...state,
        selections: has
          ? state.selections.filter(l => l !== action.letter)
          : [...state.selections, action.letter],
      }
    }

    case 'NEXT_LINE': {
      const row      = state.rows[state.rowIndex]
      const correct  = state.selections.filter(l => row.letters.includes(l)).length
      const rowOk    = row.letters.length > 0 && correct / row.letters.length >= 0.5
      const newPassed = [...state.passed, rowOk]

      if (state.rowIndex >= state.rows.length - 1) {
        const eye    = state.phase === 'testing_right' ? 'OD' : 'OS'
        const result = buildResult(state.rows, newPassed, eye)
        return {
          ...state,
          passed: newPassed,
          phase:  state.phase === 'testing_right' ? 'eye_switch' : 'done',
          OD:     state.phase === 'testing_right' ? result : state.OD,
          OS:     state.phase === 'testing_left'  ? result : state.OS,
        }
      }

      return {
        ...state,
        passed:     newPassed,
        rowIndex:   state.rowIndex + 1,
        selections: [],
        timeLeft:   TIMER_SECONDS,
      }
    }

    case 'PREV_LINE':
      if (state.rowIndex === 0) return state
      return {
        ...state,
        rowIndex:   state.rowIndex - 1,
        selections: [],
        timeLeft:   TIMER_SECONDS,
      }

    case 'TICK':
      return { ...state, timeLeft: Math.max(0, state.timeLeft - 1) }

    case 'NEXT_EYE':
      return { ...state, phase: 'covering_right' }

    default:
      return state
  }
}

// --- StepDots -----------------------------------------------------------------

function StepDots({ total = 5, active = 0 }: { total?: number; active?: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="rounded-full flex-shrink-0 transition-all duration-150"
          style={{
            width:      i === active ? 6 : 4,
            height:     i === active ? 6 : 4,
            background: i === active
              ? 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)'
              : '#253580',
          }}
        />
      ))}
    </div>
  )
}

// --- TopBar -------------------------------------------------------------------

function TopBar({ onExit }: { onExit: () => void }) {
  return (
    <header className="h-12 flex-shrink-0 bg-bg-base border-b border-border-subtle flex items-center px-8">
      <span className="text-caption text-text-tertiary font-primary" style={{ marginRight: 40 }}>
        refract
      </span>
      <div className="flex-1 flex items-center justify-center">
        <StepDots total={5} active={1} />
      </div>
      <button
        onClick={onExit}
        className="text-caption text-text-tertiary font-primary bg-transparent border-none cursor-pointer p-0 hover:text-text-secondary transition-colors"
      >
        Exit
      </button>
    </header>
  )
}

// --- BottomBar ----------------------------------------------------------------

function BottomBar({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <footer className="h-12 flex-shrink-0 bg-bg-base border-t border-border-subtle flex items-center px-8 relative">
      <button
        onClick={onBack}
        className="text-body-sm font-primary bg-transparent border-none cursor-pointer p-0 hover:text-text-secondary transition-colors"
        style={{ color: '#4B8AF0' }}
      >
        ← Back
      </button>
      <span className="absolute left-1/2 -translate-x-1/2 text-caption text-text-tertiary font-primary">
        {label}
      </span>
    </footer>
  )
}

// --- ChartPanel ---------------------------------------------------------------

function ChartPanel({
  rows,
  activeIndex,
  pixelsPerMm,
}: {
  rows: ChartRow[]
  activeIndex: number
  pixelsPerMm: number
}) {
  // Cap letter height so letters never exceed their row's available space.
  // Account for topbar (48px) + banner (48px) + bottombar (48px) = 144px overhead.
  const maxRowH = Math.max(24, (window.innerHeight - 144) / rows.length)

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{ width: '55%', background: '#000000' }}
    >
      {rows.map((row, i) => {
        const isActive = i === activeIndex
        const sz       = Math.min(letterHeightPx(row.denominator, pixelsPerMm), maxRowH * 0.88)
        const gap      = sz * 0.8

        return (
          <div
            key={row.acuity}
            className="flex-1 relative flex items-center justify-center min-h-0"
          >
            {/* Brand-gradient left-edge accent on active row */}
            {isActive && (
              <div
                className="absolute left-0 top-0 bottom-0"
                style={{
                  width: 2,
                  background: 'linear-gradient(to bottom, #7B5CF0, #4B8AF0)',
                }}
              />
            )}

            {/* Acuity label */}
            <span
              className="absolute font-primary select-none"
              style={{
                left:          18,
                fontSize:      11,
                fontWeight:    400,
                letterSpacing: '0.04em',
                color:         'rgba(78,107,143,0.7)',
              }}
            >
              {row.acuity}
            </span>

            {/* Chart letters - flex+gap avoids trailing letter-spacing cutoff */}
            <div style={{ display: 'flex', gap, alignItems: 'center' }}>
              {row.letters.map((letter, li) => (
                <span
                  key={li}
                  className="font-primary font-bold select-none"
                  style={{
                    fontSize:   sz,
                    lineHeight: 1,
                    color:      isActive ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.4)',
                    transition: 'color 0.2s ease',
                  }}
                >
                  {letter}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- LetterButton -------------------------------------------------------------

function LetterButton({
  letter,
  selected,
  onToggle,
}: {
  letter: string
  selected: boolean
  onToggle: (l: string) => void
}) {
  return (
    <button
      onClick={() => onToggle(letter)}
      className={`rounded-btn border flex items-center justify-center transition-all duration-100 outline-none cursor-pointer p-0 ${
        selected
          ? 'border-transparent shadow-glow-brand text-text-on-brand'
          : 'bg-bg-elevated border-border-subtle text-text-primary hover:bg-bg-overlay hover:border-border-default'
      }`}
      style={{
        width:      64,
        height:     56,
        background: selected
          ? 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)'
          : undefined,
      }}
    >
      <span
        className="font-primary"
        style={{ fontSize: 16, fontWeight: 600, lineHeight: 1 }}
      >
        {letter}
      </span>
    </button>
  )
}

// --- ControlPanel -------------------------------------------------------------

function ControlPanel({
  timeLeft,
  rowIndex,
  selections,
  onToggle,
  onNextLine,
  onPrevLine,
}: {
  timeLeft: number
  rowIndex: number
  selections: string[]
  onToggle: (l: string) => void
  onNextLine: () => void
  onPrevLine: () => void
}) {
  const timerPct = (timeLeft / TIMER_SECONDS) * 100

  return (
    <div className="flex-1 flex flex-col items-center justify-center font-primary" style={{ padding: '0 48px' }}>

      {/* Countdown */}
      <div className="text-center w-full" style={{ marginBottom: 10 }}>
        <span
          className="font-primary text-text-primary"
          style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}
        >
          {timeLeft}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full" style={{ marginBottom: 8 }}>
        <div
          className="w-full rounded-full overflow-hidden"
          style={{ height: 4, background: '#162045' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width:      `${timerPct}%`,
              background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)',
              transition: 'width 0.9s linear',
            }}
          />
        </div>
      </div>

      <span
        className="text-caption text-text-tertiary"
        style={{ marginBottom: 40 }}
      >
        seconds
      </span>

      {/* Instruction */}
      <span
        className="text-body-sm text-text-tertiary text-center"
        style={{ marginBottom: 14 }}
      >
        Tap what you see
      </span>

      {/* Letter buttons - 2 rows of 5 */}
      <div className="flex flex-col" style={{ gap: 8, marginBottom: 24 }}>
        <div className="flex" style={{ gap: 8 }}>
          {BTN_ROW1.map(l => (
            <LetterButton
              key={l}
              letter={l}
              selected={selections.includes(l)}
              onToggle={onToggle}
            />
          ))}
        </div>
        <div className="flex" style={{ gap: 8 }}>
          {BTN_ROW2.map(l => (
            <LetterButton
              key={l}
              letter={l}
              selected={selections.includes(l)}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col w-full" style={{ gap: 8 }}>
        <button
          onClick={onPrevLine}
          disabled={rowIndex === 0}
          className="w-full rounded-btn border border-border-subtle bg-bg-elevated text-body-sm font-medium text-text-secondary hover:bg-bg-overlay hover:border-border-strong transition-all duration-100 cursor-pointer outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: 36 }}
        >
          Show a bigger line
        </button>
        <button
          onClick={onNextLine}
          className="w-full rounded-btn bg-transparent border-none text-body-sm cursor-pointer outline-none hover:opacity-80 transition-opacity"
          style={{ height: 36, color: '#4B8AF0' }}
        >
          All read · next line →
        </button>
      </div>

      {/* Invisible spacer so content stays vertically centred when row count changes */}
      <div style={{ height: 0 }} aria-hidden />
    </div>
  )
}

// --- Interstitial screens -----------------------------------------------------

function CoveringScreen({
  phase,
  onStart,
}: {
  phase: 'covering_left' | 'covering_right'
  onStart: () => void
}) {
  const isLeft = phase === 'covering_left'
  const coverSide  = isLeft  ? 'LEFT'  : 'RIGHT'
  const testingEye = isLeft  ? 'right' : 'left'

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 font-primary">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)' }}
        aria-hidden
      >
        <span
          className="font-primary font-bold text-text-on-brand"
          style={{ fontSize: 22 }}
        >
          {isLeft ? 'R' : 'L'}
        </span>
      </div>

      <h1 className="text-heading-xl text-text-primary text-center">
        Cover your {coverSide} eye
      </h1>

      <p className="text-body-sm text-text-secondary text-center" style={{ maxWidth: 320 }}>
        Keep your {testingEye} eye open and focused straight ahead.
        Start the test when you're ready.
      </p>

      <button
        onClick={onStart}
        className="h-9 px-6 rounded-btn text-body-sm font-semibold text-text-on-brand border-none cursor-pointer outline-none shadow-glow-brand"
        style={{ background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)' }}
      >
        Start {testingEye} eye test →
      </button>
    </div>
  )
}

function EyeSwitchScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 font-primary">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-color-success"
        style={{ background: 'rgba(52,211,153,0.08)' }}
        aria-hidden
      >
        <span
          className="text-color-success font-bold"
          style={{ fontSize: 26 }}
        >
          ✓
        </span>
      </div>

      <h1 className="text-heading-xl text-text-primary text-center">
        Right eye complete
      </h1>

      <p className="text-body-sm text-text-secondary text-center" style={{ maxWidth: 320 }}>
        Now cover your <strong className="text-text-primary">RIGHT eye</strong> and prepare
        for the left eye test.
      </p>

      <button
        onClick={onContinue}
        className="h-9 px-6 rounded-btn text-body-sm font-semibold text-text-on-brand border-none cursor-pointer outline-none shadow-glow-brand"
        style={{ background: 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)' }}
      >
        Continue →
      </button>
    </div>
  )
}

// --- Main component -----------------------------------------------------------

export function SnellenChart({
  pixelsPerMm,
  viewingDistanceCm: _viewingDistanceCm,
  onComplete,
}: SnellenChartProps): JSX.Element {
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState)
  const { phase, rows, rowIndex, selections, timeLeft, OD, OS } = state

  const isTestingPhase = phase === 'testing_right' || phase === 'testing_left'

  // Countdown interval - restarts whenever a new row begins or testing starts/stops.
  useEffect(() => {
    if (!isTestingPhase) return
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000)
    return () => clearInterval(id)
  }, [isTestingPhase, rowIndex])

  // Auto-advance when timer hits zero.
  useEffect(() => {
    if (isTestingPhase && timeLeft === 0) {
      dispatch({ type: 'NEXT_LINE' })
    }
  }, [isTestingPhase, timeLeft])

  // Notify parent when both eyes are done.
  useEffect(() => {
    if (phase === 'done' && OD && OS) {
      onComplete({ OD, OS })
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // -- Interstitial: cover left eye ------------------------------------------
  if (phase === 'covering_left' || phase === 'covering_right') {
    return (
      <div className="w-full h-full flex flex-col bg-bg-primary">
        <TopBar onExit={() => navigate('/')} />
        <CoveringScreen phase={phase} onStart={() => dispatch({ type: 'START_TEST' })} />
        <footer className="h-12 flex-shrink-0 bg-bg-base border-t border-border-subtle" />
      </div>
    )
  }

  // -- Interstitial: eye switch ----------------------------------------------
  if (phase === 'eye_switch') {
    return (
      <div className="w-full h-full flex flex-col bg-bg-primary">
        <TopBar onExit={() => navigate('/')} />
        <EyeSwitchScreen onContinue={() => dispatch({ type: 'NEXT_EYE' })} />
        <footer className="h-12 flex-shrink-0 bg-bg-base border-t border-border-subtle" />
      </div>
    )
  }

  // -- Done placeholder (parent handles navigation via onComplete) -----------
  if (phase === 'done') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-bg-primary font-primary">
        <span className="text-heading-lg text-text-secondary">Exam complete</span>
      </div>
    )
  }

  // -- Active exam screen ----------------------------------------------------
  const coverBannerText =
    phase === 'testing_right'
      ? 'Cover your LEFT eye · Testing RIGHT eye only'
      : 'Cover your RIGHT eye · Testing LEFT eye only'

  const bottomLabel =
    phase === 'testing_right'
      ? `Right eye · Line ${rowIndex + 1} of ${rows.length}`
      : `Left eye · Line ${rowIndex + 1} of ${rows.length}`

  return (
    <div className="w-full h-full flex flex-col bg-bg-primary">

      <TopBar onExit={() => navigate('/')} />

      {/* Cover-eye banner */}
      <div
        className="flex-shrink-0 flex items-center justify-center bg-bg-overlay"
        style={{ height: 48 }}
      >
        <span
          className="text-body-sm text-text-primary font-primary"
          style={{ fontWeight: 500 }}
        >
          {coverBannerText}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 flex overflow-hidden">

        <ChartPanel
          rows={rows}
          activeIndex={rowIndex}
          pixelsPerMm={pixelsPerMm}
        />

        {/* 1px vertical divider */}
        <div className="flex-shrink-0 bg-border-subtle" style={{ width: 1 }} />

        <ControlPanel
          timeLeft={timeLeft}
          rowIndex={rowIndex}
          selections={selections}
          onToggle={l => dispatch({ type: 'TOGGLE', letter: l })}
          onNextLine={() => dispatch({ type: 'NEXT_LINE' })}
          onPrevLine={() => dispatch({ type: 'PREV_LINE' })}
        />
      </div>

      <BottomBar onBack={() => navigate('/')} label={bottomLabel} />
    </div>
  )
}

export default SnellenChart
