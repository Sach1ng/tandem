export const theme = {
  colors: {
    bg: "#0B0E14",
    bgSoft: "#0F131C",
    surface: "#141924",
    surfaceHi: "#1B2130",
    border: "rgba(255,255,255,0.08)",
    text: "#EAECF2",
    muted: "#8B93A7",
    faint: "#5C6474",
    accent: "#7C6CF6",
    accent2: "#22D3EE",
    accentPink: "#F472B6",
    success: "#34D399",
    slack: "#4A154B",
    slackGreen: "#2BAC76",
    danger: "#F87171",
  },
  // indigo -> cyan, used across the whole piece for cohesion
  gradient: "linear-gradient(100deg, #7C6CF6 0%, #22D3EE 100%)",
  gradientSoft:
    "linear-gradient(100deg, rgba(124,108,246,0.18) 0%, rgba(34,211,238,0.18) 100%)",
  font: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
} as const;

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
