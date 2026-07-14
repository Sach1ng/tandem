import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SceneWrapper } from "../components/SceneWrapper";
import { Headline, GradientText } from "../components/Caption";
import { theme } from "../theme";

const Pill: React.FC<{ children: React.ReactNode; delay: number }> = ({
  children,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        padding: "16px 28px",
        borderRadius: 999,
        border: `1px solid ${theme.colors.border}`,
        background: theme.gradientSoft,
        fontFamily: theme.font,
        fontSize: 28,
        fontWeight: 600,
        color: theme.colors.text,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px)`,
      }}
    >
      {children}
    </div>
  );
};

export const PayoffScene: React.FC = () => {
  return (
    <SceneWrapper>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40 }}>
        <Headline delay={2} size={68} style={{ textAlign: "center", maxWidth: 1300 }}>
          One coworker. Many surfaces.{" "}
          <GradientText>One brain that compounds.</GradientText>
        </Headline>
        <div style={{ display: "flex", gap: 20 }}>
          <Pill delay={20}>Your models</Pill>
          <Pill delay={28}>Your machine</Pill>
          <Pill delay={36}>Your context</Pill>
        </div>
      </AbsoluteFill>
    </SceneWrapper>
  );
};
