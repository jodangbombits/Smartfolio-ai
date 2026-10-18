/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                darkBg: "#0B0F17",
                cardBg: "#151C2C",
                cardBorder: "#232D42",
                accentBlue: "#6366F1",
                accentGlow: "#818CF8",
            },
        },
    },
    plugins: [],
}