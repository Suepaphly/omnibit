import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#070b12',
          raised: '#0d1420',
          overlay: '#121a28',
          border: '#1c2a3d',
          'border-strong': '#2a3f5a',
        },
        accent: {
          DEFAULT: '#22d3ee',
          muted: '#0891b2',
          soft: '#a5f3fc',
          deep: '#0e7490',
          glow: 'rgba(34, 211, 238, 0.35)',
        },
        accretion: {
          DEFAULT: '#f59e0b',
          soft: '#fcd34d',
          muted: '#b45309',
          glow: 'rgba(245, 158, 11, 0.25)',
        },
        warn: '#f59e0b',
        ok: '#34d399',
        danger: '#f87171',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(34, 211, 238, 0.25)',
        'glow-sm': '0 0 12px -2px rgba(34, 211, 238, 0.2)',
        'accretion-glow': '0 0 20px -4px rgba(245, 158, 11, 0.2)',
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 32px -12px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to right, rgba(34,211,238,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(34,211,238,0.04) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '48px 48px',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
export default config;
