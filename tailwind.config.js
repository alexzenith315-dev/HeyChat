import { fontFamily } from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0075de',
        canvas: '#ffffff',
        'canvas-soft': '#f6f5f4',
        ink: '#000000',
        'ink-secondary': '#31302e',
        'ink-muted': '#615d59',
        'ink-faint': '#a39e98',
        hairline: '#e6e6e6',
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
