import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { GradientBackground } from "./components/GradientBackground";
import { Music } from "./components/Music";
import { PresenterOverlay } from "./components/PresenterOverlay";
import { HookScene } from "./scenes/HookScene";
import { SlackScene } from "./scenes/SlackScene";
import { EngineScene } from "./scenes/EngineScene";
import { DesktopScene } from "./scenes/DesktopScene";
import { BrowserScene } from "./scenes/BrowserScene";
import { PayoffScene } from "./scenes/PayoffScene";
import { CtaScene } from "./scenes/CtaScene";

// Timing locked to video/script.md (30 fps). Demo scenes show the start of each clip.
export const SCENES = [
  { comp: HookScene, duration: 120 }, // 0:00–0:04
  { comp: SlackScene, duration: 420 }, // 0:04–0:18
  { comp: EngineScene, duration: 150 }, // 0:18–0:23
  { comp: DesktopScene, duration: 540 }, // 0:23–0:41 (full ~21s desktop clip)
  { comp: BrowserScene, duration: 420 }, // 0:41–0:55
  { comp: PayoffScene, duration: 150 }, // 0:55–1:00
  { comp: CtaScene, duration: 180 }, // 1:00–1:06
] as const;

export const TOTAL_FRAMES = SCENES.reduce((sum, s) => sum + s.duration, 0);

export const LaunchVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <GradientBackground />
      <Series>
        {SCENES.map(({ comp: Comp, duration }, i) => (
          <Series.Sequence key={i} durationInFrames={duration}>
            <Comp />
          </Series.Sequence>
        ))}
      </Series>
      <PresenterOverlay />
      <Music />
    </AbsoluteFill>
  );
};
