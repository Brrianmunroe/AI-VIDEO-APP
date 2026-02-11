# Design System — Recommended New Variables

The codebase was audited to follow the design system rule (no hardcoded colors, typography, spacing, radii). Where a value had **no token**, the code uses the closest existing token or a temporary value and a comment. Below are **recommended new variables** to add to `design-system.json` (then run `npm run tokens:generate`) so future work stays fully on the system.

---

## 1. Layout / dimensions

| Suggested token | Current value in code | Where used |
|----------------|----------------------|------------|
| `--layout-nav-width` or `layout.navWidth` | `80px` | NavigationBar width, App main padding, ProjectHeader full-bleed |
| `--size-header-min-height` | `36px` | ProjectHeader min-height |
| `--size-modal-max-width` | `500px` | CreateProjectModal max-width |
| `--size-textarea-min-height` | `80px` | GenerateSelectsModal textarea |
| `--size-highlight-row-height` | `62px` | HighlightContainer row height |
| `--size-actions-cell` or use `--icon-size-lg` | `60px` (or `44px`) | ProjectManagement table actions column (currently uses `--icon-size-lg`) |

---

## 2. Overlays and shadows

| Suggested token | Purpose |
|-----------------|---------|
| `--color-overlay-modal` | Modal backdrop (e.g. 70% primary-950); used in CreateProjectModal |
| `--color-overlay-over-card` | Dark overlay on thumbnails (type icon, duration); used in MediaFileCard |
| `--color-overlay-accent` | Accent overlay (e.g. primary-500 90%); used for “master audio” badge |
| `--shadow-button-hover` | Button hover shadow (e.g. 0 4px 12px primary-500 30%); GenerateSelectsButton, others |
| `--shadow-card-hover` | Card hover shadow; ProjectManagement action cards |

---

## 3. Typography / misc

| Suggested token | Current value | Where used |
|-----------------|---------------|------------|
| `--letter-spacing-label` or `letter-spacing.uppercase` | `0.5px` | ProjectManagement table headers |
| `--size-progress-text-min-width` | `35px` | GenerateSelectsModal progress text column |

---

## 4. Spacing / scale gaps

The design system has no **2px**, **3px**, **6px**, **12px**, **35px**, **48px**, **62px** spacing/size tokens. Where it mattered:

- **2px** — Used for waveform bar padding; `--spacing-xxs` (1px) used elsewhere. Consider `spacing.2px` or a “micro” step.
- **3px** — MediaCard waveform grid `background-size`; left as 3px with a comment.
- **6px** — No token; e.g. duration pill horizontal padding used `--spacing-xs` (4px).
- **12px** — Some padding used `--spacing-sm` (8px); consider a 12px step if you want tighter consistency with Figma.
- **48px** — Thumbnail size in GenerateSelectsModal; currently uses `--icon-size-lg` (44px). Consider `--icon-size-xl` or a “thumbnail” size.

---

## 5. Inline SVG (e.g. iconPaths.jsx)

- **Colors**: Already use `var(--color-...)` where a fill/stroke is set.
- **strokeWidth**: Values like `2` and `1.5` are numeric React attributes. There is no `--stroke-width-lg` (2px) in inline SVG attributes unless you pass the resolved value (e.g. from a theme hook or inline style). **Recommendation**: Either keep numeric strokeWidth and document that “2 = stroke-width-lg”, or add a small util that reads the CSS variable and pass it to `strokeWidth`.

---

## Summary

- **Add when you want consistency**: Layout (nav width, header height, modal max-width), overlay colors, shadow tokens, letter-spacing.
- **Optional**: Extra spacing/size steps (2px, 12px, 48px, etc.) if Figma or future components need them.
- **No change needed for**: All existing typography, spacing, radius, and semantic colors now use tokens; fallbacks were removed and wrong variable names (e.g. `--border-radius-*`) were fixed to `--radius-*`.
