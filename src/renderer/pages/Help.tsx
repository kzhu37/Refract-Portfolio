import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'

// -- Help page - plain-language guide to vision terms -------------------------

const T = {
  bg:       '#090D24',
  card:     '#0F1635',
  cardAlt:  '#0C1230',
  border:   'rgba(75,94,191,0.18)',
  text:     '#FFFFFF',
  textSec:  '#8BADC8',
  textTert: '#4E6B8F',
  blue:     '#4B8AF0',
  purple:   '#7B5CF0',
  green:    '#34D399',
  amber:    '#FBBF24',
  teal:     '#2DD4BF',
} as const

// -- SVG icons -----------------------------------------------------------------

function EyeIcon({ color = '#4B8AF0', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function CircleIcon({ color = '#4B8AF0', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="3" fill={color} opacity="0.4" />
    </svg>
  )
}

function FootballIcon({ color = '#FBBF24', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <ellipse cx="12" cy="12" rx="10" ry="6" stroke={color} strokeWidth="2" fill="none" />
      <line x1="12" y1="6" x2="12" y2="18" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  )
}

function CompassIcon({ color = '#2DD4BF', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill="none" />
      <line x1="12" y1="3" x2="12" y2="21" stroke={color} strokeWidth="1" opacity="0.3" />
      <line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth="1" opacity="0.3" />
      <line x1="12" y1="12" x2="18" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function LensIcon({ color = '#34D399', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill="none" />
      <path d="M3 12c0-4 4-7 9-7s9 3 9 7-4 7-9 7-9-3-9-7z"
        stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
    </svg>
  )
}

function QuestionIcon({ color = '#8BADC8', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" />
    </svg>
  )
}

// -- Section label -------------------------------------------------------------

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{
      fontSize: 12, fontWeight: 500, letterSpacing: '0.09em',
      textTransform: 'uppercase' as const, color: T.textTert, marginBottom: 18,
    }}>
      {children}
    </p>
  )
}

// -- Concept card --------------------------------------------------------------

function Card({
  icon, title, tag, accent, children,
}: {
  icon: React.ReactNode
  title: string
  tag: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${accent}25`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 14,
      padding: '22px 24px',
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `${accent}16`,
          border: `1px solid ${accent}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: '-0.01em', marginBottom: 3 }}>
            {title}
          </div>
          <div style={{ fontSize: 13, color: T.textTert }}>{tag}</div>
        </div>
      </div>
      <div style={{ fontSize: 15, color: T.textSec, lineHeight: 1.75, paddingLeft: 60 }}>
        {children}
      </div>
    </div>
  )
}

// -- Two-up eye card -----------------------------------------------------------

function EyeCard({ side, color, latin, mnemonic }: {
  side: 'OD' | 'OS'
  color: string
  latin: string
  mnemonic: string
}) {
  const eyeName = side === 'OD' ? 'Right Eye' : 'Left Eye'
  return (
    <div style={{
      flex: 1,
      background: T.card,
      border: `1px solid ${color}28`,
      borderTop: `3px solid ${color}`,
      borderRadius: 14,
      padding: '24px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `${color}16`, border: `1px solid ${color}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <EyeIcon color={color} />
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.01em', lineHeight: 1 }}>{side}</div>
          <div style={{ fontSize: 13, color: T.textTert, marginTop: 2 }}>{eyeName}</div>
        </div>
      </div>
      <div style={{ fontSize: 14, color: T.textSec, lineHeight: 1.7 }}>
        Short for <span style={{ color: T.textSec, fontStyle: 'italic' }}>{latin}</span>
        {' '}in Latin. {mnemonic}
      </div>
    </div>
  )
}

function EyeDiagramHalf({
  centerX,
  code,
  eyeName,
  latin,
  color,
}: {
  centerX: number
  code: 'OD' | 'OS'
  eyeName: string
  latin: string
  color: string
}) {
  return (
    <g transform={`translate(${centerX} 76)`}>
      <ellipse rx="44" ry="24" fill="none" stroke={color} strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
      <circle r="13" fill="none" stroke={color} strokeWidth="1.5" opacity="0.72" vectorEffect="non-scaling-stroke" />
      <circle r="4.5" fill={color} opacity="0.58" />
      <text y="-58" textAnchor="middle" fill={color} fontSize="20" fontWeight="800"
        fontFamily="Inter, sans-serif">{code}</text>
      <text y="-41" textAnchor="middle" fill={T.textTert} fontSize="10.5"
        fontFamily="Inter, sans-serif" letterSpacing="0.04em">{eyeName}</text>
      <text y="50" textAnchor="middle" fill={T.textTert} fontSize="10.5"
        fontFamily="Inter, sans-serif" fontStyle="italic">{latin}</text>
    </g>
  )
}

// -- FAQ accordion -------------------------------------------------------------

const FAQS = [
  {
    q: 'Do I need my glasses while using Refract?',
    a: 'Nope! That\'s the whole point. Refract adjusts your screen so you can see it clearly without glasses. You can still wear them if you like, but try without first.',
  },
  {
    q: 'What does "Plano" mean on my prescription?',
    a: '"Plano" is just a fancy way of saying zero. It means that eye doesn\'t need a sphere correction. It\'s perfectly fine to leave it as 0.00.',
  },
  {
    q: 'What if I only have one eye that needs correction?',
    a: 'That\'s totally normal! You can choose OD (right eye only) or OS (left eye only) in the correction panel. No need to apply correction to a perfectly healthy eye.',
  },
  {
    q: 'Why does my prescription have so many numbers?',
    a: 'Each number fixes a different thing: sphere fixes basic blurry-ness, cylinder fixes the "football-shaped" distortion, and axis tells us which direction to fix it. Together they describe the exact shape of your eye.',
  },
  {
    q: 'Is it safe to use Refract for long periods?',
    a: 'Yes! Refract doesn\'t emit anything or change your eyes. It just adjusts pixels on your screen, much like your glasses bend light. Your eyes are completely safe.',
  },
  {
    q: 'What\'s the difference between nearsighted and farsighted?',
    a: 'Nearsighted (minus numbers) = you can see things NEAR you clearly, but things FAR away are blurry. Farsighted (plus numbers) = you can see FAR things more clearly, but things close up may blur. Remember: Near = Minus, Far = Plus.',
  },
]

function Faq({ item, isOpen, onToggle }: { item: typeof FAQS[0]; isOpen: boolean; onToggle: () => void }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 12, overflow: 'hidden', marginBottom: 8,
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '18px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 500, color: T.text, lineHeight: 1.4 }}>{item.q}</span>
        <svg width="18" height="18" viewBox="0 0 18 18" style={{
          flexShrink: 0, color: T.textTert,
          transform: isOpen ? 'rotate(180deg)' : undefined,
          transition: 'transform 0.2s ease',
        }}>
          <path d="M4 6.5L9 11.5L14 6.5" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      {isOpen && (
        <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${T.border}` }}>
          <p style={{ fontSize: 14, color: T.textSec, lineHeight: 1.75, marginTop: 16 }}>
            {item.a}
          </p>
        </div>
      )}
    </div>
  )
}

// -- Main export ---------------------------------------------------------------

export function Help() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="help-page" style={{ background: T.bg }}>
      <div className="help-content">

      <PageHeader
        title="Understanding Your Vision"
        description="No confusing doctor words here. We explain everything in plain, simple language, as if you're hearing it for the first time."
        className="help-header"
        eyebrow={<div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(75,138,240,0.1)', border: '1px solid rgba(75,138,240,0.2)',
          borderRadius: 8, padding: '5px 12px',
        }}>
          <QuestionIcon size={14} color={T.blue} />
          <span style={{ fontSize: 12, color: T.blue, fontWeight: 500, letterSpacing: '0.03em' }}>
            Vision Guide
          </span>
        </div>}
      />

      {/* -- Your two eyes --------------------------------------------------- */}
      <section style={{ marginBottom: 52 }}>
        <SectionLabel>Your two eyes</SectionLabel>

        {/* Eye diagram */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 16,
          padding: '24px 28px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg
            viewBox="0 0 480 140"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-labelledby="eye-diagram-title eye-diagram-description"
            style={{ display: 'block', width: '100%', maxWidth: 520, height: 'auto' }}
          >
            <title id="eye-diagram-title">Right and left eye prescription labels</title>
            <desc id="eye-diagram-description">A symmetrical diagram showing OD in blue for the right eye and OS in purple for the left eye.</desc>
            <path
              d="M60 76 C60 45 141 21 240 21 C339 21 420 45 420 76"
              fill="none" stroke="rgba(75,94,191,0.2)" strokeWidth="1"
              strokeLinecap="round" vectorEffect="non-scaling-stroke"
            />
            <path
              d="M60 76 C60 93 68 106 82 116 M165 125 C188 130 213 131 240 131 C267 131 292 130 315 125 M398 116 C412 106 420 93 420 76"
              fill="none" stroke="rgba(75,94,191,0.2)" strokeWidth="1"
              strokeLinecap="round" vectorEffect="non-scaling-stroke"
            />
            <line x1="240" y1="42" x2="240" y2="116"
              stroke="rgba(75,94,191,0.14)" strokeWidth="1" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
            <EyeDiagramHalf centerX={120} code="OD" eyeName="RIGHT EYE" latin="Oculus Dexter" color={T.blue} />
            <EyeDiagramHalf centerX={360} code="OS" eyeName="LEFT EYE" latin="Oculus Sinister" color={T.purple} />
          </svg>
        </div>

        <div className="help-eye-cards">
          <EyeCard
            side="OD"
            color={T.blue}
            latin="Oculus Dexter"
            mnemonic={`"Dexter" is Latin for right. Think of a right-handed person! On your prescription, OD always means your right eye.`}
          />
          <EyeCard
            side="OS"
            color={T.purple}
            latin="Oculus Sinister"
            mnemonic={`"Sinister" just means left in Latin (nothing scary!). On your prescription, OS always means your left eye.`}
          />
        </div>
      </section>

      {/* -- Prescription numbers -------------------------------------------- */}
      <section style={{ marginBottom: 52 }}>
        <SectionLabel>Your prescription numbers</SectionLabel>

        <Card
          icon={<CircleIcon color={T.blue} />}
          title="Sphere (SPH)"
          tag="How blurry your basic vision is"
          accent={T.blue}
        >
          <p style={{ marginBottom: 12 }}>
            Sphere is the main number. It tells us how much your eyes need help to see clearly.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: 'rgba(75,138,240,0.08)', borderRadius: 10, padding: '12px 14px',
            }}>
              <span style={{
                fontSize: 18, fontWeight: 700, color: T.blue,
                minWidth: 28, lineHeight: 1.2, fontFamily: 'JetBrains Mono, monospace',
              }}>-</span>
              <div>
                <strong style={{ color: T.text, fontSize: 14 }}>Minus numbers = Nearsighted</strong>
                <p style={{ color: T.textSec, fontSize: 13, marginTop: 3, lineHeight: 1.6 }}>
                  You see close things (like your phone) just fine, but faraway things (like a road sign) look fuzzy.
                </p>
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: 'rgba(52,211,153,0.07)', borderRadius: 10, padding: '12px 14px',
            }}>
              <span style={{
                fontSize: 18, fontWeight: 700, color: T.green,
                minWidth: 28, lineHeight: 1.2, fontFamily: 'JetBrains Mono, monospace',
              }}>+</span>
              <div>
                <strong style={{ color: T.text, fontSize: 14 }}>Plus numbers = Farsighted</strong>
                <p style={{ color: T.textSec, fontSize: 13, marginTop: 3, lineHeight: 1.6 }}>
                  Faraway things are usually okay, but up-close reading or screens may be the hard part.
                </p>
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: 'rgba(78,107,143,0.1)', borderRadius: 10, padding: '12px 14px',
            }}>
              <span style={{
                fontSize: 14, fontWeight: 700, color: T.textTert,
                minWidth: 28, lineHeight: 1.6, fontFamily: 'JetBrains Mono, monospace',
              }}>0</span>
              <div>
                <strong style={{ color: T.text, fontSize: 14 }}>Zero or "Plano" = No correction needed</strong>
                <p style={{ color: T.textSec, fontSize: 13, marginTop: 3, lineHeight: 1.6 }}>
                  That eye is perfect at basic focusing. Lucky!
                </p>
              </div>
            </div>
          </div>
          <p style={{ marginTop: 14, fontSize: 14, color: T.textTert }}>
            Bigger number (ignoring + or -) = stronger prescription = thicker glasses lens.
          </p>
        </Card>

        <Card
          icon={<FootballIcon color={T.amber} />}
          title="Cylinder (CYL)"
          tag="Whether your eye is round like a ball or oval like a football"
          accent={T.amber}
        >
          <p style={{ marginBottom: 12 }}>
            Cylinder is all about <strong style={{ color: T.text }}>astigmatism</strong>, a long word that just means
            "your eye isn't a perfect round ball shape."
          </p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{
              flex: 1, textAlign: 'center' as const,
              background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.15)',
              borderRadius: 10, padding: 16,
            }}>
              <svg viewBox="0 0 60 60" width="52" height="52" style={{ margin: '0 auto 8px' }}>
                <circle cx="30" cy="30" r="22" fill="none" stroke={T.green} strokeWidth="2" />
              </svg>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.green }}>CYL = 0</div>
              <div style={{ fontSize: 12, color: T.textTert, marginTop: 4 }}>Nice round eye, no astigmatism</div>
            </div>
            <div style={{
              flex: 1, textAlign: 'center' as const,
              background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)',
              borderRadius: 10, padding: 16,
            }}>
              <svg viewBox="0 0 60 60" width="52" height="52" style={{ margin: '0 auto 8px' }}>
                <ellipse cx="30" cy="30" rx="26" ry="16" fill="none" stroke={T.amber} strokeWidth="2" />
              </svg>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.amber }}>CYL ≠ 0</div>
              <div style={{ fontSize: 12, color: T.textTert, marginTop: 4 }}>Oval-shaped eye with astigmatism</div>
            </div>
          </div>
          <p style={{ fontSize: 14, color: T.textSec, lineHeight: 1.7 }}>
            With astigmatism, things can look smeared, shadowed, or blurry in one direction, like looking through a slightly warped window.
          </p>
        </Card>

        <Card
          icon={<CompassIcon color={T.teal} />}
          title="Axis"
          tag="Which direction your eye is oval-shaped (only matters if you have cylinder)"
          accent={T.teal}
        >
          <p style={{ marginBottom: 14 }}>
            Axis is a number from <strong style={{ color: T.text }}>1 to 180</strong>. Think of it like a compass angle.
          </p>
          <div style={{
            display: 'flex', gap: 16, alignItems: 'center',
            background: 'rgba(45,212,191,0.07)', borderRadius: 10, padding: '16px 18px', marginBottom: 14,
          }}>
            <svg viewBox="0 0 80 80" width="72" height="72" style={{ flexShrink: 0 }}>
              <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(45,212,191,0.2)" strokeWidth="1" />
              <line x1="8" y1="40" x2="72" y2="40" stroke="rgba(45,212,191,0.25)" strokeWidth="1" />
              <line x1="40" y1="8" x2="40" y2="72" stroke="rgba(45,212,191,0.25)" strokeWidth="1" />
              {/* 45° axis line */}
              <line x1="40" y1="40" x2="63" y2="17" stroke={T.teal} strokeWidth="2.5"
                strokeLinecap="round" />
              <circle cx="40" cy="40" r="3" fill={T.teal} />
              <text x="52" y="24" fill={T.teal} fontSize="10" fontFamily="JetBrains Mono, monospace"
                fontWeight="600">45°</text>
            </svg>
            <p style={{ fontSize: 14, color: T.textSec, lineHeight: 1.7 }}>
              The axis angle tells Refract exactly which direction to apply the correction so it lines up perfectly with how your eye is shaped.
            </p>
          </div>
          <p style={{ fontSize: 13, color: T.textTert }}>
            You'll only see an axis on your prescription if your cylinder is non-zero. If your CYL is 0, axis doesn't matter!
          </p>
        </Card>

        <Card
          icon={<LensIcon color={T.green} />}
          title="What Refract does with these numbers"
          tag="How your prescription becomes screen correction"
          accent={T.green}
        >
          <p style={{ marginBottom: 14 }}>
            Your glasses or contacts work by physically bending light before it hits your eye. Refract does something similar, but digitally:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {[
              { n: '1', title: 'Takes your numbers', body: 'Refract reads your sphere, cylinder, and axis to understand the exact shape of your eye\'s blur.' },
              { n: '2', title: 'Calculates the correction', body: 'It works out a mathematical "sharpening filter" that is the opposite of your eye\'s blur, like a lens in software.' },
              { n: '3', title: 'Applies it to your screen', body: 'The correction is applied in real-time to what your screen shows, making it look clear even without glasses.' },
            ].map(step => (
              <div key={step.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: T.green, fontFamily: 'JetBrains Mono, monospace',
                }}>
                  {step.n}
                </div>
                <div>
                  <strong style={{ fontSize: 14, color: T.text }}>{step.title}</strong>
                  <p style={{ fontSize: 13, color: T.textSec, lineHeight: 1.6, marginTop: 2 }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* -- FAQ ------------------------------------------------------------- */}
      <section style={{ marginBottom: 52 }}>
        <SectionLabel>Common questions</SectionLabel>
        {FAQS.map((faq, i) => (
          <Faq
            key={i}
            item={faq}
            isOpen={openFaq === i}
            onToggle={() => setOpenFaq(openFaq === i ? null : i)}
          />
        ))}
      </section>

      {/* -- Footer note ----------------------------------------------------- */}
      <div style={{
        background: 'rgba(75,138,240,0.06)',
        border: '1px solid rgba(75,138,240,0.14)',
        borderRadius: 12, padding: '18px 22px', marginBottom: 16,
      }}>
        <p style={{ fontSize: 13, color: T.textSec, lineHeight: 1.7 }}>
          <strong style={{ color: T.text }}>Not sure about your prescription?</strong>
          {' '}You can find it on any glasses or contact lens box, or ask your eye doctor for a copy. Alternatively, use the <strong style={{ color: T.text }}>Eye Exam</strong> feature in Refract to get an estimate!
        </p>
      </div>

      </div>
    </div>
  )
}

export default Help
