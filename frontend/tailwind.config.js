/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0a0a1a',
          1: '#0f0f23',
          2: '#161631',
          3: '#1c1c42',
          4: '#252550',
        },
        accent: {
          DEFAULT: '#6c63ff',
          hover: '#7b73ff',
          dim: '#6c63ff20',
          glow: '#6c63ff40',
        },
        neon: {
          green: '#22c55e',
          red: '#ef4444',
          amber: '#f59e0b',
          cyan: '#06b6d4',
          pink: '#ec4899',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideDown: { from: { opacity: 0, transform: 'translateY(-8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
