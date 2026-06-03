/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f6f8',
          100: '#e7ebf0',
          200: '#cfd7e2',
          300: '#a7b5ca',
          400: '#768ca9',
          550: '#536d8d',
          600: '#415570',
          700: '#35455c',
          800: '#2d384a',
          900: '#1b2330',
        }
      }
    },
  },
  plugins: [],
}
