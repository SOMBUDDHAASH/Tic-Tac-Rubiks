/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        handwritten: ['Architects Daughter', 'Patrick Hand', 'cursive'],
        sans: ['Architects Daughter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
