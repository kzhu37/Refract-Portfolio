import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/renderer/**/*.{ts,tsx}',
    './src/overlay/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'bg-base':     '#070B1E',
        'bg-primary':  '#090D24',
        'bg-elevated': '#0F1635',
        'bg-overlay':  '#162045',

        // Borders
        'border-subtle':  'rgba(75,94,191,0.18)',
        'border-default': 'rgba(75,138,240,0.28)',
        'border-strong':  'rgba(75,138,240,0.5)',
        'border-brand':   '#4B8AF0',

        // Text
        'text-primary':   '#FFFFFF',
        'text-secondary': '#8BADC8',
        'text-tertiary':  '#4E6B8F',
        'text-disabled':  '#2D4260',
        'text-on-brand':  '#FFFFFF',

        // Brand
        'color-purple':      '#7B5CF0',
        'color-blue':        '#4B8AF0',
        'color-interactive': '#4B8AF0',
        'color-interactive-hover': '#6BA4F8',

        // Status
        'color-success':  '#34D399',
        'color-warning':  '#FBBF24',
        'color-danger':   '#F87171',
        'color-info':     '#60A5FA',
        'color-neutral':  '#8BADC8',

        // Palette aliases used in UI
        'toggle-track-off':  '#1E2D60',
        'slider-track':      '#162045',
        'step-dot-inactive': '#253580',
      },

      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #7B5CF0 0%, #4B8AF0 100%)',
        'slider-fill':    'linear-gradient(to right, #4B8AF0, #4B8AF0)',
      },

      fontFamily: {
        primary: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },

      fontSize: {
        'display':    ['36px', { fontWeight: '700', letterSpacing: '-0.02em', lineHeight: '1.15' }],
        'heading-xl': ['26px', { fontWeight: '600', letterSpacing: '-0.01em', lineHeight: '1.25' }],
        'heading-lg': ['22px', { fontWeight: '600', letterSpacing: '-0.01em', lineHeight: '1.3'  }],
        'heading-md': ['17px', { fontWeight: '600', letterSpacing: '0',       lineHeight: '1.4'  }],
        'heading-sm': ['15px', { fontWeight: '600', letterSpacing: '0',       lineHeight: '1.4'  }],
        'body-md':    ['15px', { fontWeight: '400', letterSpacing: '0',       lineHeight: '1.6'  }],
        'body-sm':    ['14px', { fontWeight: '400', letterSpacing: '0',       lineHeight: '1.55' }],
        'caption':    ['13px', { fontWeight: '400', letterSpacing: '0.01em',  lineHeight: '1.5'  }],
        'label':      ['12px', { fontWeight: '500', letterSpacing: '0.07em',  lineHeight: '1.4'  }],
        // large numeric readout
        'readout':    ['52px', { fontWeight: '700', letterSpacing: '-0.02em', lineHeight: '1'    }],
      },

      boxShadow: {
        'md':         '0 4px 16px rgba(4,6,20,0.55)',
        'lg':         '0 8px 40px rgba(4,6,20,0.65)',
        'glow-brand': '0 0 0 1px rgba(75,138,240,0.4), 0 4px 24px rgba(75,138,240,0.25)',
        'glow-focus': '0 0 0 3px rgba(75,138,240,0.4)',
        'glow-blue':  '0 0 20px rgba(75,138,240,0.35)',
        'glow-status-dot': '0 0 6px rgba(52,211,153,0.6)',
        'thumb':      '0 1px 4px rgba(0,0,0,0.45)',
        'thumb-hover':'0 0 0 5px rgba(75,138,240,0.22), 0 1px 4px rgba(0,0,0,0.45)',
      },

      borderRadius: {
        'badge':    '3px',
        'chip':     '4px',
        'btn':      '8px',
        'input':    '8px',
        'card':     '12px',
        'card-lg':  '16px',
        'full':     '9999px',
      },

      spacing: {
        'page-h': '32px',
        'page-t': '24px',
        'card':   '24px',
        'sidebar-item-v': '10px',
        'sidebar-item-h': '16px',
        'sidebar': '220px',
      },
    },
  },
  plugins: [],
}

export default config
