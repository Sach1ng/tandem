---
version: alpha
name: Tandem Liquid Glass — Frame
description: >
  Dark cinematic canvas with frosted liquid-glass panels — translucent white fills,
  backdrop blur, soft specular edges, and Tandem burnt-orange voltage. Product demos
  play full-bleed under glass caption cards. Inter + JetBrains Mono.
unit: the frame — 1920×1080
principle: glass floats over footage · type is sparse · orange is scarce voltage

colors:
  void: "#07080C"
  ink: "#F4F5F7"
  ink-dim: "rgba(244,245,247,0.72)"
  ink-faint: "rgba(244,245,247,0.45)"
  glass: "rgba(255,255,255,0.08)"
  glass-strong: "rgba(255,255,255,0.14)"
  glass-edge: "rgba(255,255,255,0.28)"
  glass-shine: "rgba(255,255,255,0.55)"
  accent: "#D9480F"
  accent-soft: "rgba(217,72,15,0.35)"
  teal: "#0CA678"
  violet: "#7048E8"

borders:
  glass: "1px solid rgba(255,255,255,0.22)"
  glass-strong: "1.5px solid rgba(255,255,255,0.35)"
  accent: "1px solid #D9480F"

shadows:
  glass: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)"
  float: "0 24px 80px rgba(0,0,0,0.55)"

typography:
  kicker: { fontFamily: "Inter", cqw: 1.35, weight: 600, tracking: "0.14em", upper: true }
  body: { fontFamily: "Inter", cqw: 1.6, weight: 400, lineHeight: 1.45 }
  headline: { fontFamily: "Inter", cqw: 4.8, weight: 600, lineHeight: 1.05, tracking: "-0.03em" }
  display: { fontFamily: "Inter", cqw: 7.2, weight: 700, lineHeight: 0.98, tracking: "-0.04em" }
  mono: { fontFamily: "JetBrains Mono", cqw: 1.5, weight: 500 }

spacing:
  slide-pad: "4.5cqw"
  radius-glass: "28px"
  radius-pill: "9999px"

components:
  glass-panel:
    background: "linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))"
    backdropFilter: "blur(28px) saturate(1.4)"
    border: "{borders.glass}"
    rounded: "{spacing.radius-glass}"
    shadow: "{shadows.glass}"
    description: "Primary liquid-glass card for captions over full-bleed footage."
  glass-pill:
    background: "rgba(255,255,255,0.12)"
    backdropFilter: "blur(16px)"
    border: "{borders.glass}"
    rounded: "{spacing.radius-pill}"
    description: "Eyebrow / surface chip."
  accent-dot:
    color: "{colors.accent}"
    description: "Scarce voltage — one orange mark per frame max."
---

# Tandem Liquid Glass

## Overview

A **cinematic product film** look: deep void behind full-bleed demos, **frosted liquid-glass** caption panels floating over the footage (blur + translucent fill + specular top edge). Burnt orange (`#D9480F`) is the only voltage — used once per beat. Type is Inter, sparse and large; JetBrains Mono for commands.

## Do

- Full-bleed product video as the ground; glass panels never cover more than ~35% of the frame
- Soft vignette at edges so glass reads against busy UI
- Caption lines short (≤8 words); stagger word/line reveals
- Specular highlight as a thin top-edge gradient on glass

## Don't

- Opaque white cards, hard drop shadows, purple glow stacks
- Dense SaaS feature grids or window chrome as the hero
- More than one orange accent per frame
