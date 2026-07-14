import React from "react";
import { DemoScene } from "./DemoScene";
import { WindowFrame } from "../components/WindowFrame";
import { VideoSlot } from "../components/VideoSlot";
import { SlackBeat } from "../components/Beats";
import { GradientText } from "../components/Caption";
import { recordings } from "../recordings";

export const SlackScene: React.FC = () => {
  return (
    <DemoScene
      eyebrow="9:02 AM · Slack"
      headline={
        <>
          It starts as a <GradientText>Slack</GradientText> message.
        </>
      }
      subhead="Tag @Pip in any thread. It runs in your workspace and replies right where the work is happening."
      beat={<SlackBeat delay={44} />}
      frameWidth={1000}
    >
      <WindowFrame title="Slack — #launch" width={1000} height={620}>
        <VideoSlot src={recordings.slack} label="slack-demo.mp4" camera="kenBurns" />
      </WindowFrame>
    </DemoScene>
  );
};
