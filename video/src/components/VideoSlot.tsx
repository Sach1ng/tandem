import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { theme } from "../theme";

export type CameraMove =
  | "none"
  | "kenBurns"
  | "punchIn"
  | "drift"
  | "zoomOut";

/**
 * Shows a real recording if `src` is set (a filename inside video/public/),
 * otherwise renders a labeled, animated placeholder so the layout is final
 * before any footage exists. Drop a file + set it in src/recordings.ts and
 * it swaps in automatically.
 *
 * `camera` adds Remotion-driven zoom/pan (no CSS transitions).
 */
export const VideoSlot: React.FC<{
  src?: string | null;
  label: string;
  /** trim/loop control for real footage */
  startFrom?: number;
  camera?: CameraMove;
}> = ({ src, label, startFrom = 0, camera = "kenBurns" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const cameraStyle = getCameraStyle(camera, frame, durationInFrames);

  if (src) {
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill style={cameraStyle}>
          <OffthreadVideo
            src={staticFile(src)}
            startFrom={startFrom}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return <Placeholder label={label} />;
};

function getCameraStyle(
  camera: CameraMove,
  frame: number,
  durationInFrames: number,
): React.CSSProperties {
  const ease = Easing.bezier(0.22, 1, 0.36, 1);
  const end = Math.max(durationInFrames - 1, 1);

  switch (camera) {
    case "kenBurns": {
      // Slow push-in toward upper-right (UI chrome / reply area)
      return {
        scale: interpolate(frame, [0, end], [1, 1.14], {
          extrapolateRight: "clamp",
          easing: ease,
        }),
        translate: interpolate(
          frame,
          [0, end],
          ["0% 0%", "2.5% -1.5%"],
          { extrapolateRight: "clamp", easing: ease },
        ),
        transformOrigin: "50% 40%",
      };
    }
    case "punchIn": {
      // Hold, then snap-zoom on the aha beat (~1.2s in)
      const punchAt = Math.min(36, Math.floor(end * 0.25));
      return {
        scale: interpolate(
          frame,
          [0, punchAt, punchAt + 28, end],
          [1, 1, 1.22, 1.28],
          { extrapolateRight: "clamp", easing: ease },
        ),
        translate: interpolate(
          frame,
          [0, punchAt, punchAt + 28, end],
          ["0% 0%", "0% 0%", "0% -3%", "0% -4%"],
          { extrapolateRight: "clamp", easing: ease },
        ),
        transformOrigin: "50% 45%",
      };
    }
    case "drift": {
      // Lateral drift + gentle zoom (browser / reading feel)
      return {
        scale: interpolate(frame, [0, end], [1.04, 1.16], {
          extrapolateRight: "clamp",
          easing: ease,
        }),
        translate: interpolate(
          frame,
          [0, end],
          ["-2% 1%", "2.5% -2%"],
          { extrapolateRight: "clamp", easing: ease },
        ),
        transformOrigin: "40% 50%",
      };
    }
    case "zoomOut": {
      return {
        scale: interpolate(frame, [0, end], [1.18, 1], {
          extrapolateRight: "clamp",
          easing: ease,
        }),
        transformOrigin: "50% 50%",
      };
    }
    case "none":
    default:
      return {};
  }
}

const Placeholder: React.FC<{ label: string }> = ({ label }) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.4, 1]);
  const shimmer = interpolate(frame % 120, [0, 120], [-40, 140]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${theme.colors.surface}, ${theme.colors.bgSoft})`,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          background: `linear-gradient(105deg, transparent ${shimmer - 20}%, rgba(255,255,255,0.05) ${shimmer}%, transparent ${
            shimmer + 20
          }%)`,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: theme.colors.danger,
            fontFamily: theme.font,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            opacity: pulse,
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              background: theme.colors.danger,
              boxShadow: `0 0 18px ${theme.colors.danger}`,
            }}
          />
          Recording slot
        </div>
        <div
          style={{
            fontFamily: theme.mono,
            fontSize: 28,
            color: theme.colors.text,
            padding: "14px 22px",
            borderRadius: 12,
            border: `1px dashed ${theme.colors.faint}`,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: theme.font,
            fontSize: 20,
            color: theme.colors.faint,
          }}
        >
          drop into <span style={{ color: theme.colors.muted }}>video/public/</span> · set in{" "}
          <span style={{ color: theme.colors.muted }}>src/recordings.ts</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
