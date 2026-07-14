import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { SceneWrapper } from "../components/SceneWrapper";
import { Eyebrow, Headline, Subhead } from "../components/Caption";

/** Shared layout for the three surface demo scenes. Adapts to portrait. */
export const DemoScene: React.FC<{
  eyebrow: React.ReactNode;
  headline: React.ReactNode;
  subhead: React.ReactNode;
  beat?: React.ReactNode;
  /** intrinsic width of the framed child, used to scale-to-fit */
  frameWidth?: number;
  children: React.ReactNode;
}> = ({ eyebrow, headline, subhead, beat, frameWidth = 1040, children }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const pad = portrait ? 60 : 96;
  const availWidth = portrait ? width - pad * 2 : (width - pad * 2) * 0.62;
  const fitScale = Math.min(1, availWidth / frameWidth);

  // Frame floats in: slight overshoot scale + rise
  const enter = interpolate(frame, [0, 28], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const frameRise = interpolate(enter, [0, 1], [36, 0]);
  const frameScale = interpolate(enter, [0, 1], [0.92, 1]);
  const frameOpacity = interpolate(enter, [0, 1], [0, 1]);
  // Soft floating shadow pulse after settle
  const floatY = interpolate(
    Math.sin(frame / 42),
    [-1, 1],
    [-4, 4],
  );

  const text = (
    <div
      style={{
        width: portrait ? "100%" : "38%",
        display: "flex",
        flexDirection: "column",
        gap: portrait ? 20 : 26,
        alignItems: portrait ? "center" : "flex-start",
        textAlign: portrait ? "center" : "left",
      }}
    >
      <Eyebrow delay={4}>{eyebrow}</Eyebrow>
      <Headline delay={12} size={portrait ? 62 : 58}>
        {headline}
      </Headline>
      <Subhead delay={22} size={portrait ? 30 : 28}>
        {subhead}
      </Subhead>
      {beat ? <div style={{ marginTop: 8 }}>{beat}</div> : null}
    </div>
  );

  const framed = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...(portrait ? {} : { flex: 1 }),
        opacity: frameOpacity,
        scale: fitScale * frameScale,
        translate: `0px ${frameRise + (enter > 0.95 ? floatY : 0)}px`,
        transformOrigin: "center",
      }}
    >
      {children}
    </div>
  );

  return (
    <SceneWrapper style={{ padding: pad }}>
      <AbsoluteFill
        style={{
          flexDirection: portrait ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: portrait ? 48 : 64,
          padding: pad,
        }}
      >
        {text}
        {framed}
      </AbsoluteFill>
    </SceneWrapper>
  );
};
