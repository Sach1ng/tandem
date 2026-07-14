import React from "react";
import { Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { music } from "../recordings";

/** Background music with a gentle fade-in and fade-out. No-op until a track is set. */
export const Music: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  if (!music) return null;

  const fade = fps; // ~1s fades
  const volume = interpolate(
    frame,
    [0, fade, durationInFrames - fade, durationInFrames],
    [0, 0.7, 0.7, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return <Audio src={staticFile(music)} volume={volume} />;
};
