# Timeline Ruler Alignment — Root Cause

## The Problem

Timestamps appear shifted left of their large notches (notches appear to the right of the text center). This happens at various zoom levels.

## Root Cause: Two Independent Positioning Systems

Labels and notches use **different positioning mechanisms** that have to stay in sync:

### 1. Labels (timestamps)
- Positioned with **JavaScript**: `left: frameToPx(frame)` where `frameToPx = frame × pixelsPerFrame`
- Centered with `transform: translateX(-50%)`
- Each tick is a DOM element with its own `left` value

### 2. Major notches
- Positioned with **CSS**: a repeating `linear-gradient` with `background-size: majorStepPx`
- The gradient draws a 1px line at the **right edge** of each cell: from `(majorStepPx - 1px)` to `majorStepPx`
- **There is no notch at 0** — the first notch is at `majorStepPx`
- The pattern is purely CSS — it doesn’t know about actual tick frame positions

### 3. Why they drift
- **Rounding**: `majorStepPx = tickStepFrames × pixelsPerFrame` can be fractional; gradients and layout can round differently
- **Sub-pixel rendering**: Browsers handle fractional pixels inconsistently for transforms vs backgrounds
- **Different math paths**: Labels use `frameToPx(frame)` (exact per tick); notches use a repeating gradient derived from `tickStepFrames × effectivePx`. They should match in theory, but any tiny mismatch causes visible drift
- **Gradient cell boundaries**: The line is drawn at the cell edge, not at a “center” — the visual “position” of a 1px line can be ambiguous

## The Fix: Single Source of Truth

Instead of a CSS gradient, render each major notch as a DOM element at the **exact same position** as its label. One tick = one label + one notch, sharing the same `left` value. That guarantees pixel-perfect alignment regardless of zoom.
