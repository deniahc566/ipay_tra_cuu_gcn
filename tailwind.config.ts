import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        vbi: {
          primary: "#00538E",
          dark: "#012082",
          accent: "#DF416D",
          light: "#BFE8FA",
        },
      },
      fontFamily: {
        sans: ["Be Vietnam Pro", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
