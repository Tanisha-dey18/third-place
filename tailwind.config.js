/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#FBF8F3',
        cream: '#F5EFE5',
        sand: '#EAE0D0',
        oat: '#DCCFBB',
        espresso: '#2A1C13',
        mocha: '#4E3B2E',
        latte: '#8A7562',
        sage: { DEFAULT: '#7D8B6A', light: '#E4E8DB', dark: '#4F5C3F' },
        clay: { DEFAULT: '#B5704A', light: '#F3E2D6' },
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: { xl2: '1.25rem' },
      boxShadow: {
        card: '0 1px 2px rgba(42,28,19,0.04), 0 8px 24px -12px rgba(42,28,19,0.18)',
        lift: '0 2px 4px rgba(42,28,19,0.06), 0 18px 40px -18px rgba(42,28,19,0.28)',
      },
      maxWidth: { page: '1200px' },
    },
  },
  plugins: [],
};
