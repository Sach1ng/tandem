import React from "react";
import { DemoScene } from "./DemoScene";
import { BrowserFrame } from "../components/BrowserFrame";
import { VideoSlot } from "../components/VideoSlot";
import { ThreadBeat } from "../components/Beats";
import { GradientText } from "../components/Caption";
import { recordings } from "../recordings";

export const BrowserScene: React.FC = () => {
  return (
    <DemoScene
      eyebrow="2:15 PM · Browser"
      headline={
        <>
          Answers on <GradientText>any tab</GradientText>.
        </>
      }
      subhead="Page-aware prompts about whatever you're reading — still the same thread, still the same memory from this morning."
      beat={<ThreadBeat delay={44} />}
    >
      <BrowserFrame url="notion.so/q3-launch-brief" width={1040} height={620}>
        <VideoSlot src={recordings.browser} label="browser-demo.mp4" camera="drift" />
      </BrowserFrame>
    </DemoScene>
  );
};
