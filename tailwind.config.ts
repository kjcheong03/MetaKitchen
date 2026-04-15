import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sage: {
          50: "#f4f9f4",
          100: "#e6f2e7",
          200: "#cce5ce",
          300: "#a3cfa7",
          400: "#72b27a",
          500: "#4e9458",
          600: "#3b7743",
          700: "#305f37",
          800: "#294d2f",
          900: "#234028",
        },
        cream: {
          50: "#fefcf8",
          100: "#fdf8ef",
          200: "#faf0db",
          300: "#f5e3bd",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "breathe": "breathe 4s ease-in-out infinite",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.8" },
          "50%": { transform: "scale(1.05)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
