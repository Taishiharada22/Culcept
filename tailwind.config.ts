import type { Config } from "tailwindcss";

export default {
    darkMode: "class",
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            borderRadius: {
                lg: "0.75rem",
                md: "0.6rem",
                sm: "0.5rem",
            },
            boxShadow: {
                soft: "0 8px 30px rgba(0,0,0,0.08)",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
} satisfies Config;
