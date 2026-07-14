import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { SceneWrapper } from "../components/SceneWrapper";
import { Headline, GradientText } from "../components/Caption";
import { theme } from "../theme";

const Node: React.FC<{
  label: string;
  sub?: string;
  delay: number;
  primary?: boolean;
}> = ({ label, sub, delay, primary }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        padding: primary ? "22px 34px" : "16px 26px",
        borderRadius: 16,
        background: primary ? theme.gradient : theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        color: primary ? "#0B0E14" : theme.colors.text,
        fontFamily: theme.font,
        textAlign: "center",
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
        boxShadow: primary ? "0 20px 60px rgba(124,108,246,0.35)" : "none",
      }}
    >
      <div style={{ fontSize: primary ? 30 : 24, fontWeight: 700 }}>{label}</div>
      {sub ? (
        <div
          style={{
            fontSize: 18,
            marginTop: 4,
            color: primary ? "rgba(11,14,20,0.7)" : theme.colors.muted,
            fontFamily: theme.mono,
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
};

/** Animated flow line with a traveling pulse. */
const Flow: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grow = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const travel = (frame - delay) % 45;
  const y = interpolate(travel, [0, 45], [0, 60], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "relative", width: 3, height: 60 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: theme.colors.border,
          transform: `scaleY(${grow})`,
          transformOrigin: "top",
        }}
      />
      {grow > 0.9 ? (
        <div
          style={{
            position: "absolute",
            top: y,
            left: -3,
            width: 9,
            height: 9,
            borderRadius: 999,
            background: theme.colors.accent2,
            boxShadow: `0 0 12px ${theme.colors.accent2}`,
          }}
        />
      ) : null}
    </div>
  );
};

export const EngineScene: React.FC = () => {
  return (
    <SceneWrapper>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Headline delay={2} size={52} style={{ textAlign: "center", marginBottom: 46 }}>
          One engine. <GradientText>Any model.</GradientText>
        </Headline>

        <div style={{ display: "flex", gap: 40, marginBottom: 4 }}>
          <Node label="Slack" delay={12} />
          <Node label="Desktop" delay={18} />
          <Node label="Browser" delay={24} />
        </div>

        <div style={{ display: "flex", gap: 168 }}>
          <Flow delay={30} />
          <Flow delay={30} />
          <Flow delay={30} />
        </div>

        <Node label="Engine" sub="cursor-agent · runAgent()" delay={40} primary />

        <div style={{ height: 60, display: "flex", justifyContent: "center" }}>
          <Flow delay={52} />
        </div>

        <Node label="Your brain" sub="memory · skills · knowledge" delay={60} />
      </AbsoluteFill>
    </SceneWrapper>
  );
};
