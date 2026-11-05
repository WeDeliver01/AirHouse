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
        // Surfaces
        'surface': '#f9f9ff',
        'surface-dim': '#d3daef',
        'surface-bright': '#f9f9ff',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f1f3ff',
        'surface-container': '#e9edff',
        'surface-container-high': '#e1e8fd',
        'surface-container-highest': '#dce2f7',
        'surface-variant': '#dce2f7',
        'surface-tint': '#38675a',
        'inverse-surface': '#293040',
        'inverse-on-surface': '#edf0ff',

        // Text on surfaces / background
        'on-surface': '#141b2b',
        'on-surface-variant': '#404945',
        'background': '#f9f9ff',
        'on-background': '#141b2b',

        // Outlines
        'outline': '#707975',
        'outline-variant': '#c0c8c4',

        // Primary
        'on-primary': '#ffffff',
        'primary-container': '#6b9b8c',
        'on-primary-container': '#003127',
        'inverse-primary': '#9fd1c0',
        'primary-fixed': '#bbeddc',
        'primary-fixed-dim': '#9fd1c0',
        'on-primary-fixed': '#002019',
        'on-primary-fixed-variant': '#1e4f42',

        // Secondary
        'secondary': '#006c4e',
        'on-secondary': '#ffffff',
        'secondary-container': '#80f9c8',
        'on-secondary-container': '#007353',
        'secondary-fixed': '#80f9c8',
        'secondary-fixed-dim': '#62dcad',
        'on-secondary-fixed': '#002115',
        'on-secondary-fixed-variant': '#00513a',

        // Tertiary
        'tertiary': '#555f6d',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#8892a2',
        'on-tertiary-container': '#212b38',
        'tertiary-fixed': '#d9e3f4',
        'tertiary-fixed-dim': '#bdc7d8',
        'on-tertiary-fixed': '#121c28',
        'on-tertiary-fixed-variant': '#3e4755',

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
          DEFAULT: '#38675a',  // Stitch primary (was AirHouse #6B9B8C)
          soft: '#E8F0ED',
          dark: '#4A7A6B',
        },
        accent: {
          DEFAULT: '#5A8A7B',
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
          50: '#F0F5F3',
          100: '#E8F0ED',
          200: '#C5D9D1',
          300: '#A3C2B5',
          400: '#87AC9E',
          500: '#6B9B8C',
          600: '#5A8A7B',
          700: '#4A7A6B',
          800: '#3B615A',
          900: '#2C4943',
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
