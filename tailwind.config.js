/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/features/LayoutEditor/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  // Isolate Tailwind styles to avoid conflicts with MUI
  corePlugins: {
    preflight: false,
  },
}

