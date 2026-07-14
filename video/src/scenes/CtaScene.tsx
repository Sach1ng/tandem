import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { SceneWrapper } from "../components/SceneWrapper";
import { Logo } from "../components/Logo";
import { Subhead } from "../components/Caption";
import { theme } from "../theme";

const Command: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const caret = Math.floor(frame / 15) % 2 === 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "22px 30px",
        borderRadius: 14,
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        fontFamily: theme.mono,
        fontSize: 30,
        color: theme.colors.text,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px)`,
        boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
      }}
    >
      <span style={{ color: theme.colors.accent2 }}>$</span>
      <span>tandem pip</span>
      <span style={{ color: theme.colors.faint }}>&nbsp;# launch Pip</span>
      <span
        style={{
          width: 14,
          height: 30,
          background: caret ? theme.colors.accent2 : "transparent",
          display: "inline-block",
          borderRadius: 2,
        }}
      />
    </div>
  );
};

export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nameEnter = spring({ frame: frame - 10, fps, config: { damping: 200 } });

  return (
    <SceneWrapper>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 }}>
        <Logo size={120} delay={0} />
        <div
          style={{
            fontFamily: theme.font,
            fontSize: 84,
            fontWeight: 800,
            letterSpacing: -2,
            color: theme.colors.text,
            opacity: nameEnter,
            transform: `translateY(${interpolate(nameEnter, [0, 1], [20, 0])}px)`,
          }}
        >
          Tandem
        </div>
        <Subhead delay={20} size={30} style={{ textAlign: "center" }}>
          The ambient AI coworker. Open source, local-first, any model.
        </Subhead>
        <Command delay={30} />
        <Subhead delay={44} size={24} style={{ color: theme.colors.faint }}>
          github.com/Sach1ng/tandem
        </Subhead>
      </AbsoluteFill>
    </SceneWrapper>
  );
};
