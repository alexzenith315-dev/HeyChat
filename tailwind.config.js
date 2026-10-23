import { fontFamily } from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0075de',
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        'canvas-soft': 'rgb(var(--c-canvas-soft) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-secondary': 'rgb(var(--c-ink-secondary) / <alpha-value>)',
        'ink-muted': 'rgb(var(--c-ink-muted) / <alpha-value>)',
        'ink-faint': 'rgb(var(--c-ink-faint) / <alpha-value>)',
        hairline: 'rgb(var(--c-hairline) / <alpha-value>)',
        'primary-text': 'rgb(var(--c-primary-text) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
        'accent-pink': '#ff64c8',
        'accent-sky': '#62aef0',
        'accent-green': '#1aae39',
        'accent-orange': '#dd5b00',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', ...fontFamily.sans],
        sans: ['"DM Sans"', ...fontFamily.sans],
        mono: ['"IBM Plex Mono"', ...fontFamily.mono],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)',
        focus: '0 0 0 3px rgba(0,117,222,0.2)',
      },
    },
  },
  plugins: [],
};
