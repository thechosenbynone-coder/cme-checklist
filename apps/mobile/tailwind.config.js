/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:           'rgb(var(--bg) / <alpha-value>)',
        surface:      'rgb(var(--surface) / <alpha-value>)',
        'surface-2':  'rgb(var(--surface-2) / <alpha-value>)',
        border:       'rgb(var(--border) / <alpha-value>)',
        content:      'rgb(var(--text) / <alpha-value>)',
        muted:        'rgb(var(--muted) / <alpha-value>)',
        accent:       'rgb(var(--accent) / <alpha-value>)',
        'accent-text':'rgb(var(--accent-text) / <alpha-value>)',
        primary:      'rgb(var(--primary) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
