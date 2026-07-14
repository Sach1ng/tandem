import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme } from "../theme";

export const GradientText: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <span
    style={{
      background: theme.gradient,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      ...style,
    }}
  >
    {children}
  </span>
);

/** A small eyebrow pill, e.g. "9:02 AM · Slack". */
export const Eyebrow: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 18px",
        borderRadius: 999,
        background: theme.gradientSoft,
        border: `1px solid ${theme.colors.border}`,
        color: theme.colors.text,
        fontFamily: theme.font,
        fontSize: 24,
        fontWeight: 600,
        letterSpacing: 0.4,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [12, 0])}px)`,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: theme.colors.accent2,
          boxShadow: `0 0 14px ${theme.colors.accent2}`,
        }}
      />
      {children}
    </div>
  );
};

/** Big scene headline that slides + fades in, with optional word-by-word feel. */
export const Headline: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, size = 64, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.6 },
  });
  return (
    <div
      style={{
        fontFamily: theme.font,
        fontSize: size,
        fontWeight: 700,
        lineHeight: 1.1,
        color: theme.colors.text,
        letterSpacing: -1,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Subhead: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, size = 30, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        fontFamily: theme.font,
        fontSize: size,
        fontWeight: 400,
        lineHeight: 1.4,
        color: theme.colors.muted,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
