import React from "react";
import { theme } from "../theme";

/** A stylized browser chrome around content (used for the Chrome extension scene). */
export const BrowserFrame: React.FC<{
  url?: string;
  width: number;
  height: number;
  children: React.ReactNode;
}> = ({ url = "app.example.com", width, height, children }) => {
  const barH = 64;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 18,
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
          gap: 20,
          padding: "0 22px",
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          {["#F87171", "#FBBF24", "#34D399"].map((c) => (
            <span
              key={c}
              style={{
                width: 15,
                height: 15,
                borderRadius: 999,
                background: c,
                opacity: 0.9,
              }}
            />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            height: 36,
            borderRadius: 10,
            background: theme.colors.bgSoft,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 10,
            color: theme.colors.muted,
            fontFamily: theme.font,
            fontSize: 20,
          }}
        >
          <span style={{ color: theme.colors.success, fontSize: 16 }}>●</span>
          {url}
        </div>
        {/* Pip extension pin */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: theme.gradient,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: theme.font,
            fontWeight: 800,
            color: "#0B0E14",
            fontSize: 20,
          }}
        >
          P
        </div>
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
};
