import type { Config } from 'tailwindcss';
// Design tokens via ThemeAdapter — no hard-coded colors (modular)
import { tailwindColors } from './lib/adapters/theme';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: tailwindColors() as Config['theme'] extends { extend?: { colors?: infer C } } ? C : never,
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        fredoka: ['var(--font-fredoka)', 'Fredoka', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
