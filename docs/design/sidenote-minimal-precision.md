---
name: Sidenote Minimal Precision
colors:
  surface: '#12131a'
  surface-dim: '#12131a'
  surface-bright: '#383941'
  surface-container-lowest: '#0d0e15'
  surface-container-low: '#1a1b22'
  surface-container: '#1e1f26'
  surface-container-high: '#292931'
  surface-container-highest: '#33343c'
  on-surface: '#e3e1ec'
  on-surface-variant: '#d8c3ad'
  inverse-surface: '#e3e1ec'
  inverse-on-surface: '#2f3038'
  outline: '#a08e7a'
  outline-variant: '#534434'
  surface-tint: '#ffb95f'
  primary: '#ffc174'
  on-primary: '#472a00'
  primary-container: '#f59e0b'
  on-primary-container: '#613b00'
  inverse-primary: '#855300'
  secondary: '#ffb77d'
  on-secondary: '#4d2600'
  secondary-container: '#d97707'
  on-secondary-container: '#432100'
  tertiary: '#cecbcf'
  on-tertiary: '#303033'
  tertiary-container: '#b2b0b4'
  on-tertiary-container: '#444347'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffddb8'
  primary-fixed-dim: '#ffb95f'
  on-primary-fixed: '#2a1700'
  on-primary-fixed-variant: '#653e00'
  secondary-fixed: '#ffdcc3'
  secondary-fixed-dim: '#ffb77d'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6e3900'
  tertiary-fixed: '#e4e1e6'
  tertiary-fixed-dim: '#c8c5ca'
  on-tertiary-fixed: '#1b1b1e'
  on-tertiary-fixed-variant: '#47464a'
  background: '#12131a'
  on-background: '#e3e1ec'
  surface-variant: '#33343c'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Geist
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: 1.25rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.625rem
  body-md:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-sm:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
  label-md:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Geist
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.875rem
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

<!--
  Source of truth for this file is the Stitch design system asset, not this copy.

      project  7468485208499048889   "SideNote App Screen Redesign"
      asset    3b12f55042964cc59281ebab1a8ffd08   v3
      theme    colorMode DARK - variant FIDELITY - GEIST / GEIST - #f59e0b - ROUND_FOUR

  Fetch the current version with `list_design_systems` and prefer it over this
  snapshot. Regenerate rather than hand-editing: the frontmatter is the token
  source, and a drifting copy is worse than no copy.

  Note the prose below contradicts its own frontmatter in places — it describes
  `#E4E4E7` hairline borders and a `#18181B` primary button, both light-mode
  values from an earlier draft. The frontmatter is the token source and wins.
-->

## Brand & Style

This design system is engineered for local-first, privacy-focused productivity. The aesthetic prioritizes immediate intellectual flow, absolute clarity, and utility over ornamentation. It bridges high-craft developer tooling with refined consumer note-taking software.

### Tone & Personality
- **Quietly Capable:** Interface elements retreat to give primacy to thought and written text.
- **Reliable & Grounded:** Clean zinc/slate neutral surfaces inspire confidence in data longevity and local storage integrity.
- **Precise & Expressive:** Strict micro-geometry, crisp hair-thin dividers, and intentional warm amber sparks create moments of delight without distraction.

### Visual Style Movement
Minimalism combined with tactile micro-interactions. The interface relies on a dark monochrome zinc hierarchy punctuated by deliberate amber accents for favorite states, active tags, and storage integrity indicators.

## Colors

The color palette is built on strict neutral discipline in a dark mode environment. Chromatic energy is reserved strictly for meaningful states: starred items, active tag filters, system health alerts, and primary actions.

### Palette Architecture
- **Primary (`#F59E0B`) & Secondary (`#D97706`):** Dedicated to semantic warmth—favorited/pinned note markers, warning states, and interactive highlight pulses.
- **Tertiary (`#18181B`):** Anchors high-contrast functional interactive controls (e.g., the primary `+ New` button) and primary editorial headings.
- **Neutrals (`#71717A`, `#E4E4E7`, `#F4F4F5`):** Form structural boundaries, subtle column separations, inactive icons, and metadata timestamps.

### Usage Rules
- Background canvases must remain dark for editor clarity, transitioning to persistent navigational sidebars.
- Use `amber-soft` (`#FEF3C7`) as background fills behind amber iconography or pinned status indicators to maintain subtle, readable contrast.

## Typography

The typography leverages the technical precision of Geist across all touchpoints. Proportions are calibrated for high-density document lists, markdown editors, and administrative metadata.

### Application Guidelines
- **Headlines:** Use `headline-lg` and `headline-md` with slight negative tracking (`-0.02em`) to maintain tightness in note titles and panel headers.
- **Section Headers & Sidebar Categories:** Render using `label-md` or `label-sm` in uppercase with subtle tracking (`0.05em`) and secondary zinc color tone (`#71717A`).
- **Body & Document Editor:** Provide balanced vertical rhythm with `body-lg` at `1.625rem` line-height for fatigue-free extended reading and writing.

## Layout & Spacing

The layout employs a high-productivity 3-column tri-pane architecture:
1. **Navigation Sidebar:** Fixed width (240px–280px) housing workspaces, tag taxonomy, and storage telemetry.
2. **List Column:** Fixed/fluid pane (300px–360px) presenting notes sorted chronologically with inline tags and search filters.
3. **Reading/Editor Canvas:** Flexible viewport space optimized with a maximum content line length of 720px for markdown flow.

### Responsive Behaviors
- **Desktop (>= 1024px):** All three panes visible side-by-side with 1px border dividers.
- **Tablet (768px - 1023px):** Collapsible sidebar toggle; list pane and editor take full viewport.
- **Mobile (< 768px):** Single-pane drilldown stack: Navigation > Note List > Note Editor with persistent bottom app bar.

## Elevation & Depth

Visual separation relies primarily on low-contrast structural outlines rather than heavy drop shadows, optimized for the dark color mode.

- **Hairline Borders:** The primary depth mechanism is a crisp `1px solid #E4E4E7` divider between panels, inputs, and card bounds.
- **Surface Nesting:** Sidebar navigation uses subtle tonal step-downs against the dark canvas rather than elevation tiers.
- **Ambient Focus Elevation:** When dialogs, dropdown palettes, or the template selector float above the workspace, employ a delicate, non-intrusive shadow: `0 4px 20px -2px rgba(24, 24, 27, 0.06), 0 2px 6px -1px rgba(24, 24, 27, 0.04)` combined with a 1px border.

## Shapes

The geometric identity adheres to a soft, disciplined corner profile (`roundedness: 1`):
- **Micro controls & inputs:** `0.25rem` (4px) border radius for crisp operational feel.
- **Cards, modals, and container shells:** `0.5rem` (8px) border radius for approachable containment.
- **Tag chips & selection pills:** Fully rounded pill curves (`9999px`) to create clear semantic distinction from rectangular document blocks and buttons.

## Components

### Buttons
- **Primary Action (`+ New`):** Solid `#18181B` fill, `#FFFFFF` text, `0.375rem` radius, `0.5rem 0.875rem` padding, subtle hover shift to `#27272A`.
- **Secondary / Action Ghost:** Surface fill with `1px solid #E4E4E7`, `#18181B` text, hover transition.
- **Destructive / Reset:** Subtle amber or muted warning text with transparent background, shifting to warm amber tint on hover.

### Tag Badges & Chips
- Rendered as pill-shaped inline elements with background, text, `0.125rem 0.5rem` padding, and `label-sm` font.
- Active or filtered state shifts badge background to `#FEF3C7` with `#D97706` amber text.

### Note List Item Cards
- Flat container with bottom `1px solid #F4F4F5` border.
- Includes a circular selection indicator, title in `headline-sm`, relative time in `body-sm text-secondary`, and amber star for favorited items.
- Active/selected note receives a solid background and bolded title.

### Search & Text Inputs
- Pill/rounded input with `1px solid #E4E4E7`, surface background, placeholder in `#A1A1AA`.
- Focus state features a crisp `1px solid #18181B` without heavy glow halos.

### Empty States & Splash Screen
- Centered minimal icon line drawings (`#A1A1AA`) paired with `headline-md` title and centered instructional subtext.
- Ample whitespace (minimum `3rem` padding) to convey serenity and focus.