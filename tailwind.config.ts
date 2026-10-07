import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sand: '#FDF8EE',
        aqua: '#E4F2EF',
        surface: '#FFFFFF',
        deep: '#0B3D45',
        ink: '#16333B',
        muted: '#4A6670',
        faint: '#7D939B',
        line: '#DED3BF',
        surf: { DEFAULT: '#00A6A0', ink: '#027E79', pale: '#CFEAE7' },
        coral: { DEFAULT: '#FF4C38', ink: '#D63420', pale: '#FFDBD5' },
        sun: { DEFAULT: '#FFC22E', pale: '#FFEEC2' },
        grape: '#6C4BD6',
      },
      fontFamily: {
        display: ['Righteous', 'Archivo Black', 'sans-serif'],
        heading: ['"Archivo Black"', 'Arial Black', 'sans-serif'],
        body: ['Outfit', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '14px' },
    },
  },
  plugins: [],
};
export default config;
