/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: 'var(--tg-theme-bg-color, #1a1a2e)',
          text: 'var(--tg-theme-text-color, #e0e0e0)',
          hint: 'var(--tg-theme-hint-color, #7a7a8e)',
          link: 'var(--tg-theme-link-color, #6c63ff)',
          btn: 'var(--tg-theme-button-color, #6c63ff)',
          btnText: 'var(--tg-theme-button-text-color, #ffffff)',
          secondary: 'var(--tg-theme-secondary-bg-color, #16213e)',
        },
      },
    },
  },
  plugins: [],
};
