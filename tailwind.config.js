/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 暖色调中性灰阶（更"纸感"，不刺眼）
        ink: {
          50: "#fbfaf7",
          100: "#f4f3ee",
          200: "#e6e4dc",
          300: "#cdcbc0",
          700: "#3a3a36",
          800: "#1f1f1c",
          900: "#0a0a09",
        },
        // 纸张底色（页面背景）
        paper: {
          DEFAULT: "#fbfaf7",
          subtle: "#f6f4ee",
        },
        // indigo 主色微调成偏冷的"墨水紫"
        accent: {
          50: "#eef0ff",
          100: "#dee2ff",
          200: "#c2c9ff",
          400: "#7c83f0",
          500: "#5b62e0",
          600: "#4a51d1",
          700: "#3d44b8",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        // 层叠卡片（栈顶层）多层阴影 → 像真的"压在上面"
        layer:
          "0 -2px 24px rgba(15, 23, 42, 0.06), 0 20px 50px -10px rgba(15, 23, 42, 0.18), 0 8px 24px -8px rgba(15, 23, 42, 0.12)",
        // 微抬起的气泡 / 卡片
        soft:
          "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.05)",
        // 焦点环（替代 default ring）
        focus: "0 0 0 3px rgba(91, 98, 224, 0.18)",
      },
      backgroundImage: {
        // 顶部双光晕：左 indigo，右 emerald，都极淡
        "page-aura":
          "radial-gradient(ellipse 80% 50% at 15% -10%, rgba(91, 98, 224, 0.08), transparent 60%), radial-gradient(ellipse 70% 50% at 85% -15%, rgba(16, 185, 129, 0.05), transparent 60%)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: 0, transform: "translateY(4px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        shimmer: {
          "0%, 100%": { opacity: 0.4 },
          "50%": { opacity: 1 },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
        shimmer: "shimmer 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
