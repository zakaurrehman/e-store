# Veyora brand

Veyora is a calm, considered department store: a limited palette, generous space and editorial photography. The interface should get out of the way of the products.

All tokens below are defined once in `src/app/globals.css` (`@theme`) and used through Tailwind utilities. The default Tailwind palette is intentionally removed, so off-brand colours can't creep in.

## Logo

- **Wordmark and mark:** `src/components/brand/logo.tsx` (the `Logo` and `LogoMark` components, drawn as SVG paths so they render crisply at any size)
- **Favicon:** `src/app/icon.svg`
- Use the wordmark on light surfaces in ink, and the mark alone where space is tight (mobile header, admin, favicon). Don't recolour, stretch or add effects.

## Colour

| Role | Tokens | Use |
| --- | --- | --- |
| Ink | `ink-950` `#0b0c0e` → `ink-200` `#dcdee1` | Text, primary buttons, dark surfaces. Body text `ink-800`/`ink-950`; secondary text `ink-500`/`ink-600`. |
| Canvas | `canvas` `#f5f4f0`, `canvas-deep` `#ecebe5`, `surface` `#ffffff` | Page background, raised cards and panels |
| Lines | `line` `#e6e5df`, `line-strong` `#d3d2cb` | Hairline borders and dividers |
| Iris (accent) | `iris-700` `#2f22c9`, `iris-600` `#3e30ec`, `iris-500` `#5446ff`, `iris-100`, `iris-50` | Focus rings, selection, links and chart series. Use sparingly. |
| Sale | `sale` `#c2361a`, `sale-soft` | Sale prices and the Sale navigation link |
| Status | `success` `#0f7556`, `warning` `#9a5a06`, `danger` `#be2a2a`, `info` `#1f5fbf`, each with a `-soft` background | Status badges, alerts and toasts, always paired with a text label |

- Primary actions are ink, not iris.
- Status colours are reserved for status and never used as decoration.

## Typography

| Family | Token | Use |
| --- | --- | --- |
| Instrument Sans | `font-sans` | All interface text |
| Instrument Serif (italic) | `font-display` | Editorial accents in headlines and banners |
| System monospace | `font-mono` | Codes, SKUs, technical values |

- Headlines are set in the sans with tight tracking.
- One or two words may switch to the italic serif for emphasis. In admin-edited banner and section titles, wrap them in `_underscores_`.
- Numbers in prices and tables use tabular figures (the `tabular` utility).

## Shape, depth and motion

- **Radii:** `xs` 3px, `sm` 6px (buttons, inputs), `md` 10px (cards), `lg` 14px (panels), `xl` 20px.
- **Shadows:** `hairline` for subtle outlines, `card` for resting cards, `pop` for menus and dialogs, `sheet` for mobile bottom sheets. Prefer borders over shadows.
- **Motion:** short and decelerating, using `ease-out-expo`.
  - Fade 240ms; rise 480ms; drawer slides 380–420ms.
  - Animate opacity and transform only.
  - Respect reduced-motion preferences.

## Photography

- Natural light, real materials and quiet backgrounds.
- Products are shown whole on product cards, with detail crops in galleries.
- **No third-party logos or trademarks** may be visible in images. Demo photos were audited for this, and products whose photos showed another company's branding were removed.
- The demo brands (for example Maison Aurèle, Northline Tailoring, Common Thread, Orovia) are fictional house labels.
- Every image needs meaningful alt text.

## Voice

- Clear, warm and brief. Speak to one person ("your bag", "we'll email you").
- Say what happened and what to do next, especially in errors: "Some items in your bag just sold out. Please review your bag."
- No urgency tricks, fake scarcity or countdowns.

## Accessibility

- Every control is reachable and operable by keyboard, with a visible focus ring (iris).
- Dialogs trap focus and close with Escape.
- Drag-and-drop lists have a keyboard alternative.
- Colour is never the only signal: statuses carry a label or icon.
- Charts offer a table view.
