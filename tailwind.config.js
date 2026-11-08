/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // === Stitch / PropTech Trust Systems M3 token set ===
        // Brand: Forest Green (primary) / Mandarin Orange (secondary) / Crest Yellow (tertiary)
        // Surfaces
        'surface': '#fcfdfd',
        'surface-dim': '#dbe1e0',
        'surface-bright': '#fafafa',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f7f8f8',
        'surface-container': '#f1f3f3',
        'surface-container-high': '#e9eceb',
        'surface-container-highest': '#e4e7e7',
        'surface-variant': '#e5ebe9',
        'surface-tint': '#015D47',
        'inverse-surface': '#2f3735',
        'inverse-on-surface': '#f4f6f5',

        // Text on surfaces / background
        'on-surface': '#1c2120',
        'on-surface-variant': '#455450',
        'background': '#fcfdfd',
        'on-background': '#1c2120',

        // Outlines
        'outline': '#6e8681',
        'outline-variant': '#c7d1cf',

        // Primary — Forest Green
        'on-primary': '#ffffff',
        'primary-container': '#d2f9f0',
        'on-primary-container': '#013d2e',
        'inverse-primary': '#a3ebda',
        'primary-fixed': '#d2f9f0',
        'primary-fixed-dim': '#a3ebda',
        'on-primary-fixed': '#013227',
        'on-primary-fixed-variant': '#028d6c',

        // Secondary — Mandarin Orange
        'secondary': '#FD550A',
        'on-secondary': '#ffffff',
        'secondary-container': '#fbe1d5',
        'on-secondary-container': '#792601',
        'secondary-fixed': '#fbe1d5',
        'secondary-fixed-dim': '#edc0ab',
        'on-secondary-fixed': '#471601',
        'on-secondary-fixed-variant': '#a23301',

        // Tertiary — Crest Yellow
        'tertiary': '#E0F354',
        'on-tertiary': '#2d3017',
        'tertiary-container': '#f4f8d3',
        'on-tertiary-container': '#3d421a',
        'tertiary-fixed': '#f5f8dd',
        'tertiary-fixed-dim': '#e3e9b9',
        'on-tertiary-fixed': '#2d3017',
        'on-tertiary-fixed-variant': '#585f25',

        // Error
        'error': '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',

        // === Legacy AirHouse aliases (kept for back-compat) ===
        bg: '#f5f7fb',
        card: '#ffffff',
        border: '#e5e7eb',

        'text-primary': '#0f172a',
        'text-secondary': '#475569',

        primary: {
          DEFAULT: '#015D47',  // Forest Green
          soft: '#d2f9f0',
          dark: '#013d2e',
        },
        accent: {
          DEFAULT: '#FD550A',  // Mandarin Orange
        },
        success: {
          DEFAULT: '#16a34a',
          soft: '#dcfce7',
        },
        warning: {
          DEFAULT: '#ca8a04',
          soft: '#fef9c3',
        },
        danger: {
          DEFAULT: '#dc2626',
          soft: '#fee2e2',
        },
        airhouse: {
          50: '#f2f7f6',
          100: '#e0f0ec',
          200: '#b3e5d9',
          300: '#74ddc4',
          400: '#26d9ae',
          500: '#13af89',
          600: '#0b8e6f',
          700: '#06745a',
          800: '#035e48',
          900: '#015d47',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Stitch typography aliases — every named scale also maps to Inter
        'headline-xl': ['Inter', 'system-ui', 'sans-serif'],
        'headline-lg': ['Inter', 'system-ui', 'sans-serif'],
        'headline-md': ['Inter', 'system-ui', 'sans-serif'],
        'body-lg':     ['Inter', 'system-ui', 'sans-serif'],
        'body-md':     ['Inter', 'system-ui', 'sans-serif'],
        'body-sm':     ['Inter', 'system-ui', 'sans-serif'],
        'label-lg':    ['Inter', 'system-ui', 'sans-serif'],
        'label-md':    ['Inter', 'system-ui', 'sans-serif'],
        'data-mono':   ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Stitch typographic scale (size + line-height + letter-spacing + weight)
        'headline-xl': ['40px', { lineHeight: '48px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-lg':     ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md':     ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm':     ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-lg':    ['14px', { lineHeight: '20px', letterSpacing: '0.02em', fontWeight: '600' }],
        'label-md':    ['12px', { lineHeight: '16px', letterSpacing: '0.04em', fontWeight: '500' }],
        'data-mono':   ['14px', { lineHeight: '20px', fontWeight: '500' }],
      },
      spacing: {
        // Stitch spacing scale (8px base)
        base:   '8px',
        xs:     '4px',
        sm:     '12px',
        md:     '24px',
        lg:     '48px',
        xl:     '80px',
        gutter: '24px',
        margin: '32px',
      },
      borderRadius: {
        // Stitch radius scale
        sm:      '0.125rem',
        DEFAULT: '0.25rem',
        md:      '0.375rem',
        lg:      '0.5rem',
        xl:      '0.75rem',
        full:    '9999px',

        // Legacy AirHouse aliases (kept for back-compat)
        'card':    '16px',
        'card-lg': '18px',
        'button':  '12px',
        'badge':   '999px',
      },
      boxShadow: {
        // Legacy aliases — Stitch surfaces should use the .ambient-shadow utility
        'card':       '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'ambient':    '0 4px 24px rgba(17, 24, 39, 0.06)',
      },
    },
  },
  plugins: [],
}
