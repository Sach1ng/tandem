import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { theme } from "../theme";

/**
 * Deep, subtly-drifting backdrop used behind every scene so the whole
 * video feels like one continuous piece.
 */
export const GradientBackground: React.FC<{ intensity?: number }> = ({
  intensity = 1,
}) => {
  const frame = useCurrentFrame();

  const drift = interpolate(frame, [0, 300], [0, 60], {
    extrapolateRight: "extend",
  });
  const pulse = interpolate(Math.sin(frame / 40), [-1, 1], [0.75, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 55% at ${20 + drift * 0.1}% 18%, rgba(124,108,246,${
            0.28 * intensity * pulse
          }) 0%, rgba(124,108,246,0) 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(55% 55% at ${85 - drift * 0.1}% 88%, rgba(34,211,238,${
            0.22 * intensity * pulse
          }) 0%, rgba(34,211,238,0) 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(45% 45% at 55% 50%, rgba(244,114,182,${
            0.08 * intensity
          }) 0%, rgba(244,114,182,0) 55%)`,
        }}
      />
      {/* subtle vignette for depth */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 120% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
