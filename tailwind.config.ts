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
      colors: tailwindColors() as unknown as Config['theme'] extends { extend?: { colors?: infer C } } ? C : never,
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
        'candy': '0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glow-mint': '0 8px 24px rgba(52,211,153,0.35)',
        'liquid-glass': '0 0 0 1px rgba(255,255,255,0.05), 0 8px 32px rgba(2,44,30,0.45)',
      },
      transform: {
        'road-parallax': 'perspective(1000px) rotateX(3deg) translateZ(0)',
      },
    },
  },
  plugins: [],
};

export default config;