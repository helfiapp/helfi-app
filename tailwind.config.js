/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'helfi': {
          black: '#1A1A1A', // Charcoal Black
          green: '#4CAF50', // Fresh Green
          'green-light': '#81C784',
          'green-dark': '#388E3C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Helvetica Neue', 'SF Pro', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
} 