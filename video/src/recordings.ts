/**
 * Drop your screen recordings into `video/public/` and set the filename here.
 * Leave a value as `null` to keep the animated placeholder slot for that scene.
 *
 * Example:
 *   slack: "slack-demo.mp4",
 *
 * Supported: any browser-playable video (mp4/H.264 recommended, or webm).
 */
export const recordings: Record<string, string | null> = {
  slack: "slack-demo.mp4",
  desktop: "desktop-demo.mp4",
  browser: "browser-demo.mp4",
};

/**
 * Background music. Drop a file into `video/public/` (e.g. "music.mp3")
 * and set it here. Leave null for a silent, autoplay-friendly cut.
 */
export const music: string | null = null;

/**
 * A talking-head cutout of you, pinned over the whole video.
 *
 *   src         filename in video/public/ (e.g. "me.mp4"). null = show a
 *               positioning placeholder bubble so you can dial in the spot.
 *   shape       "circle" | "rounded" | "cutout"
 *                 - circle / rounded: webcam bubble (any normal recording)
 *                 - cutout: background-free presenter — REQUIRES a transparent
 *                   .webm (alpha channel). Anchored to the bottom, no clip.
 *   position    "bottom-left" | "bottom-right" | "bottom-center"
 *   size        bubble height in px (circle diameter). Ignored for "cutout".
 *   startFrom   trim: frame to start the clip from.
 *   showPlaceholder  when src is null, show a positioning bubble (default false
 *                    so clean renders don't include the "You · presenter" stub).
 */
export const presenter: {
  src: string | null;
  shape: "circle" | "rounded" | "cutout";
  position: "bottom-left" | "bottom-right" | "bottom-center";
  size: number;
  startFrom: number;
  showPlaceholder: boolean;
} = {
  src: null,
  shape: "circle",
  position: "bottom-right",
  size: 320,
  startFrom: 0,
  showPlaceholder: false,
};
