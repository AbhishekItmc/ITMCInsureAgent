/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), sunken: v('sunken'), line: v('line'),
        ink: v('ink'), muted: v('muted'), navy: v('navy'), navyink: v('navy-ink'), navymuted: v('navy-muted'),
        teal: v('teal'), tealsoft: v('teal-soft'), tealink: v('teal-ink'),
        ok: v('ok'), oksoft: v('ok-soft'), warn: v('warn'), warnsoft: v('warn-soft'),
        crit: v('crit'), critsoft: v('crit-soft'), info: v('info'), infosoft: v('info-soft'),
      },
      fontFamily: {
        display: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
