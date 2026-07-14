import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme } from "../theme";

const useEnter = (delay: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200 } });
};

/** A Slack-style message showing a teammate tagging @Pip. */
export const SlackBeat: React.FC<{ delay?: number }> = ({ delay = 40 }) => {
  const enter = useEnter(delay);
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: 18,
        borderRadius: 14,
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        maxWidth: 520,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px)`,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: theme.colors.slackGreen,
          flexShrink: 0,
        }}
      />
      <div style={{ fontFamily: theme.font }}>
        <div style={{ color: theme.colors.text, fontWeight: 700, fontSize: 20 }}>
          Priya · 9:02 AM
        </div>
        <div style={{ color: theme.colors.muted, fontSize: 22, marginTop: 4 }}>
          <span style={{ color: theme.colors.accent2, fontWeight: 600 }}>@Pip</span>{" "}
          can you draft the Q3 launch brief?
        </div>
      </div>
    </div>
  );
};

/** A keyboard shortcut chip, e.g. ⌘⇧T. */
export const ShortcutBeat: React.FC<{ keys: string[]; delay?: number }> = ({
  keys,
  delay = 40,
}) => {
  const enter = useEnter(delay);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity: enter,
        transform: `scale(${interpolate(enter, [0, 1], [0.85, 1])})`,
        transformOrigin: "left center",
      }}
    >
      {keys.map((k) => (
        <div
          key={k}
          style={{
            minWidth: 56,
            height: 56,
            padding: "0 16px",
            borderRadius: 12,
            background: theme.colors.surfaceHi,
            border: `1px solid ${theme.colors.border}`,
            boxShadow: "0 4px 0 rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: theme.font,
            fontSize: 26,
            fontWeight: 700,
            color: theme.colors.text,
          }}
        >
          {k}
        </div>
      ))}
      <span
        style={{
          marginLeft: 8,
          fontFamily: theme.font,
          fontSize: 22,
          color: theme.colors.faint,
        }}
      >
        snip &amp; ask
      </span>
    </div>
  );
};

/** A little "same thread" chip to reinforce continuity across surfaces. */
export const ThreadBeat: React.FC<{ delay?: number }> = ({ delay = 40 }) => {
  const enter = useEnter(delay);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderRadius: 999,
        border: `1px solid ${theme.colors.border}`,
        background: "rgba(255,255,255,0.03)",
        fontFamily: theme.font,
        fontSize: 20,
        color: theme.colors.muted,
        opacity: enter,
      }}
    >
      <span style={{ color: theme.colors.success }}>↺</span>
      same thread · same memory
    </div>
  );
};
