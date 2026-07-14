import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";

/**
 * Fades + slight scale punch a scene in/out based on sequence-local duration.
 */
export const SceneWrapper: React.FC<{
  children: React.ReactNode;
  fade?: number;
  style?: React.CSSProperties;
}> = ({ children, fade = 12, style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ease = Easing.bezier(0.22, 1, 0.36, 1);

  const opacity = interpolate(
    frame,
    [0, fade, durationInFrames - fade, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const scale = interpolate(
    frame,
    [0, fade + 6, durationInFrames - fade, durationInFrames],
    [0.985, 1, 1, 1.01],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease },
  );

  return (
    <AbsoluteFill
      style={{
        opacity,
        scale,
        alignItems: "center",
        justifyContent: "center",
        padding: 96,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
