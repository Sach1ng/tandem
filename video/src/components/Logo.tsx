import React from "react";
import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";
import { theme } from "../theme";

/**
 * The Pip mark: two overlapping rounded squares (the "tandem" pair) with a
 * gradient stroke, plus an orbiting dot. Purely drawn — no asset needed.
 */
export const Logo: React.FC<{ size?: number; delay?: number }> = ({
  size = 120,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.7 },
  });
  const scale = interpolate(enter, [0, 1], [0.6, 1]);
  const orbit = interpolate(frame - delay, [0, 120], [0, 360], {
    extrapolateRight: "extend",
  });

  const s = size;
  const dotR = s * 0.11;
  const orbitR = s * 0.52;
  const cx = s / 2 + Math.cos((orbit * Math.PI) / 180) * orbitR;
  const cy = s / 2 + Math.sin((orbit * Math.PI) / 180) * orbitR;

  return (
    <svg
      width={s * 1.5}
      height={s * 1.5}
      viewBox={`${-s * 0.25} ${-s * 0.25} ${s * 1.5} ${s * 1.5}`}
      style={{ transform: `scale(${scale})`, opacity: enter }}
    >
      <defs>
        <linearGradient id="pipGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={theme.colors.accent} />
          <stop offset="100%" stopColor={theme.colors.accent2} />
        </linearGradient>
      </defs>
      <rect
        x={s * 0.12}
        y={s * 0.12}
        width={s * 0.62}
        height={s * 0.62}
        rx={s * 0.2}
        fill="none"
        stroke="url(#pipGrad)"
        strokeWidth={s * 0.075}
        opacity={0.55}
      />
      <rect
        x={s * 0.3}
        y={s * 0.3}
        width={s * 0.62}
        height={s * 0.62}
        rx={s * 0.2}
        fill="none"
        stroke="url(#pipGrad)"
        strokeWidth={s * 0.075}
      />
      <circle cx={cx} cy={cy} r={dotR} fill={theme.colors.accent2}>
      </circle>
    </svg>
  );
};
