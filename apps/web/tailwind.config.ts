import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#0b0f14',
          raised: '#121821',
          border: '#1e2936',
        },
        accent: {
          DEFAULT: '#3b82f6',
          muted: '#1d4ed8',
          soft: '#93c5fd',
        },
        warn: '#f59e0b',
        ok: '#22c55e',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
export default config;
