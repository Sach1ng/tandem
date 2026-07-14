import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  Easing,
} from "remotion";
import { SceneWrapper } from "../components/SceneWrapper";
import { Logo } from "../components/Logo";
import { Headline, Subhead, GradientText } from "../components/Caption";

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = interpolate(frame, [0, 120], [0.97, 1.04], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });

  return (
    <SceneWrapper>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            scale: breathe,
          }}
        >
          <Logo size={150} delay={2} />
          <Headline delay={14} size={92} style={{ textAlign: "center" }}>
            Meet <GradientText>Pip</GradientText>
          </Headline>
          <Subhead delay={26} size={34} style={{ textAlign: "center" }}>
            One AI coworker. Everywhere you already work.
          </Subhead>
        </div>
      </AbsoluteFill>
    </SceneWrapper>
  );
};
