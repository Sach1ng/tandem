import React from "react";
import { theme } from "../theme";

/** A stylized macOS-style desktop window used for the Pip desktop scene. */
export const WindowFrame: React.FC<{
  title?: string;
  width: number;
  height: number;
  children: React.ReactNode;
}> = ({ title = "Pip", width, height, children }) => {
  const barH = 52;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 16,
        overflow: "hidden",
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        boxShadow:
          "0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: barH,
          background: theme.colors.surfaceHi,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 20px",
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          {["#F87171", "#FBBF24", "#34D399"].map((c) => (
            <span
              key={c}
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: c,
                opacity: 0.9,
              }}
            />
          ))}
        </div>
        <div
          style={{
            color: theme.colors.muted,
            fontFamily: theme.font,
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
};
