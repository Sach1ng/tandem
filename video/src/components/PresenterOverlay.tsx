import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { theme } from "../theme";
import { presenter } from "../recordings";

const MARGIN = 56;
const RING = 4;

const getAnchorStyle = (
  position: typeof presenter.position,
  rise: number,
): React.CSSProperties => {
  const base: React.CSSProperties = {
    position: "absolute",
    bottom: MARGIN,
    overflow: "visible",
  };

  switch (position) {
    case "bottom-right":
      return { ...base, right: MARGIN, transform: `translateY(${rise}px)` };
    case "bottom-center":
      return {
        ...base,
        left: "50%",
        transform: `translateX(-50%) translateY(${rise}px)`,
      };
    case "bottom-left":
    default:
      return { ...base, left: MARGIN, transform: `translateY(${rise}px)` };
  }
};

/**
 * A persistent talking-head cutout over the whole video. Animates in once at
 * the start and stays pinned. No-op logic degrades to a positioning
 * placeholder until you set `presenter.src` in recordings.ts.
 */
export const PresenterOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { src, shape, position, size, startFrom, showPlaceholder } = presenter;

  if (!src && !showPlaceholder) {
    return null;
  }

  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const rise = interpolate(enter, [0, 1], [40, 0]);

  if (shape === "cutout") {
    return (
      <AbsoluteFill style={{ opacity, overflow: "visible" }}>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            overflow: "visible",
            ...(position === "bottom-right"
              ? { right: 0 }
              : position === "bottom-center"
                ? {
                    left: "50%",
                    transform: `translateX(-50%) translateY(${rise}px)`,
                  }
                : { left: 0 }),
            height: "58%",
            transform:
              position === "bottom-center"
                ? undefined
                : `translateY(${rise}px)`,
          }}
        >
          {src ? (
            <OffthreadVideo
              src={staticFile(src)}
              startFrom={startFrom}
              transparent
              style={{ height: "100%", width: "auto" }}
            />
          ) : (
            <CutoutPlaceholder />
          )}
        </div>
      </AbsoluteFill>
    );
  }

  const w = shape === "rounded" ? Math.round(size * 1.4) : size;
  const h = size;
  const isCircle = shape === "circle";
  const outerRadius = isCircle ? "50%" : 24;
  const innerRadius = isCircle ? "50%" : 20;

  return (
    <AbsoluteFill style={{ opacity, overflow: "visible", pointerEvents: "none" }}>
      <div style={getAnchorStyle(position, rise)}>
        <div
          style={{
            position: "relative",
            width: w,
            height: h,
            overflow: "visible",
            filter: "drop-shadow(0 24px 70px rgba(0,0,0,0.55))",
          }}
        >
          {/* gradient ring — inset pattern avoids border-radius clipping */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: outerRadius,
              background: theme.gradient,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: RING,
              borderRadius: innerRadius,
              overflow: "hidden",
              background: theme.colors.surface,
            }}
          >
            {src ? (
              <OffthreadVideo
                src={staticFile(src)}
                startFrom={startFrom}
                muted={false}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <BubblePlaceholder isCircle={isCircle} />
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const BubblePlaceholder: React.FC<{ isCircle: boolean }> = ({ isCircle }) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.55, 1]);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: isCircle ? 6 : 10,
        padding: isCircle ? "8px 12px" : "12px 16px",
        background: `radial-gradient(circle at 50% 28%, rgba(124,108,246,0.5), rgba(34,211,238,0.2) 55%, ${theme.colors.bgSoft})`,
      }}
    >
      <div style={{ fontSize: isCircle ? 44 : 54, lineHeight: 1, opacity: pulse }}>
        🎙️
      </div>
      <div
        style={{
          fontFamily: theme.font,
          fontSize: isCircle ? 17 : 20,
          fontWeight: 700,
          color: theme.colors.text,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        You · presenter
      </div>
      <div
        style={{
          fontFamily: theme.font,
          fontSize: isCircle ? 13 : 15,
          color: theme.colors.faint,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        Your video here
      </div>
    </AbsoluteFill>
  );
};

const CutoutPlaceholder: React.FC = () => {
  return (
    <div
      style={{
        height: "100%",
        aspectRatio: "9 / 16",
        borderRadius: 24,
        border: `2px dashed ${theme.colors.faint}`,
        background:
          "linear-gradient(180deg, rgba(124,108,246,0.10), rgba(34,211,238,0.06))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 24,
        gap: 8,
      }}
    >
      <div style={{ fontSize: 64 }}>🧍</div>
      <div
        style={{
          fontFamily: theme.font,
          fontSize: 18,
          fontWeight: 700,
          color: theme.colors.text,
        }}
      >
        cutout · transparent .webm
      </div>
    </div>
  );
};
