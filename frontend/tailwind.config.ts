import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0a0a0f',
          1: '#111118',
          2: '#18181f',
          3: '#1e1e28',
          4: '#25252f',
        },
        accent: {
          blue:    '#4f8ef7',
          indigo:  '#7c6ef7',
          cyan:    '#2dd4bf',
          emerald: '#34d399',
          amber:   '#fbbf24',
          rose:    '#f87171',
        },
        muted: '#6b7280',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' },            to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' },
                   to:   { transform: 'translateY(0)',   opacity: '1' } },
      },
    },
  },
  plugins: [],
}

export default config
