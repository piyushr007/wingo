/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        wgold: '#f4d160',
        wmaroon: '#3a0d0d',
        wdark: '#1a0505',
      },
    },
  },
  plugins: [],
};
