import React from "react";
import { DemoScene } from "./DemoScene";
import { WindowFrame } from "../components/WindowFrame";
import { VideoSlot } from "../components/VideoSlot";
import { ShortcutBeat } from "../components/Beats";
import { GradientText } from "../components/Caption";
import { recordings } from "../recordings";

export const DesktopScene: React.FC = () => {
  return (
    <DemoScene
      eyebrow="11:30 AM · Desktop"
      headline={
        <>
          Lives on your <GradientText>screen</GradientText>.
        </>
      }
      subhead="Pip floats on your desktop. Hit ⌘⇧T to snip anything and ask — the same task stays in view."
      beat={<ShortcutBeat keys={["⌘", "⇧", "T"]} delay={44} />}
      frameWidth={1000}
    >
      <WindowFrame title="Pip" width={1000} height={620}>
        <VideoSlot src={recordings.desktop} label="desktop-demo.mp4" camera="punchIn" />
      </WindowFrame>
    </DemoScene>
  );
};
