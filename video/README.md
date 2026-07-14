# Tandem — launch + demo video

A [Remotion](https://remotion.dev) project that renders the Tandem / Pip launch video:
a ~50s, 16:9 day-in-the-life story that follows one task across all three surfaces
(Slack → desktop → browser) and lands on the "one brain that compounds" payoff + CTA.

Motion graphics, captions, frames, and timing are all built. Your screen recordings
drop into labeled slots — no re-editing required.

## Quick start

```bash
cd video
npm install
npm run dev        # opens Remotion Studio to preview + scrub
```

Render to MP4:

```bash
npm run render         # 16:9 → out/tandem-launch.mp4
npm run render:square  # 1:1  → out/tandem-launch-square.mp4
```

## Add your footage (optional — placeholders work without it)

1. Record each surface (Slack, desktop, browser).
2. Drop the files into `public/` (H.264 `.mp4` recommended).
3. Set the filenames in `src/recordings.ts`:

   ```ts
   export const recordings = {
     slack: "slack-demo.mp4",
     desktop: "desktop-demo.mp4",
     browser: "browser-demo.mp4",
   };
   ```

Each slot uses `object-fit: cover` inside its frame. Record at 16:9 for the cleanest fit.

## Add music (optional)

Drop e.g. `music.mp3` into `public/` and set `music: "music.mp3"` in `src/recordings.ts`.
It fades in/out automatically. Leave it `null` for a silent, autoplay-friendly cut.

## Add a talking-head cutout of you (optional)

A presenter overlay is pinned over the whole video. Configure it via `presenter` in
`src/recordings.ts`:

```ts
export const presenter = {
  src: "me.mp4",          // your recording in public/ (null = positioning placeholder)
  shape: "circle",         // "circle" | "rounded" | "cutout"
  position: "bottom-left", // "bottom-left" | "bottom-right" | "bottom-center"
  size: 320,               // bubble height in px
  startFrom: 0,
};
```

- **`circle` / `rounded`** — a webcam bubble; works with any normal recording.
- **`cutout`** — a true background-free presenter. This needs a **transparent `.webm`**
  (alpha channel), e.g. exported after background removal. It's anchored to the bottom
  with no clip, so you appear to stand in front of the content.

Until `src` is set, a labeled placeholder shows where you'll land so you can dial in
`position`/`size` before recording.

## Structure

```
src/
  Root.tsx            # registers LaunchVideo (16:9) + LaunchVideoSquare (1:1)
  LaunchVideo.tsx     # scene list + durations (edit timing here)
  theme.ts            # colors, gradient, fonts, dimensions
  recordings.ts       # ← your footage + music filenames
  components/         # background, logo, frames, captions, video slot, beats
  scenes/             # Hook · Slack · Engine · Desktop · Browser · Payoff · CTA
```

### Tweak the story

- **Timing:** edit the `duration` values in `src/LaunchVideo.tsx` (30 fps).
- **Copy:** each scene in `src/scenes/` holds its own headline/subhead/eyebrow.
- **Look:** colors and gradient live in `src/theme.ts`.
- **CTA:** update the command + repo URL in `src/scenes/CtaScene.tsx`.
