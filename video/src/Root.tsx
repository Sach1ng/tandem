import React from "react";
import { Composition } from "remotion";
import { LaunchVideo, TOTAL_FRAMES } from "./LaunchVideo";
import { FPS, WIDTH, HEIGHT } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="LaunchVideo"
        component={LaunchVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      {/* 1:1 crop for LinkedIn/X — same timeline, square canvas */}
      <Composition
        id="LaunchVideoSquare"
        component={LaunchVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1080}
        height={1080}
      />
      {/* 9:16 vertical for Shorts / Reels / TikTok */}
      <Composition
        id="LaunchVideoVertical"
        component={LaunchVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
      />
    </>
  );
};
