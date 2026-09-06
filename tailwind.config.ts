import type { Config } from 'tailwindcss';
import { tailwindColors } from './lib/adapters/theme';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ...tailwindColors() as Record<string, string | Record<string, string>>,
        campus: {
          DEFAULT: '#e0f2fe',
          sky: '#7dd3fc',
          brick: '#dc2626',
          stone: '#78716c',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        fredoka: ['var(--font-fredoka)', 'Fredoka', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        'campus': '0 8px 32px rgba(12,30,58,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glow-sky': '0 8px 24px rgba(3,105,161,0.35)',
      },
      transform: {
        'road-parallax': 'perspective(1000px) rotateX(3deg) translateZ(0)',
      },
    },
  },
  plugins: [],
};

export default config;