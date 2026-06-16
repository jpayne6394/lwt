# TASK 01 — Hero Wrapper

## Section
Hero

## Approved wrapper asset
`lwt-v4-5-6-clean-start/01-source-assets/lwt-about__hero-wrapper-v456-refresh.png`

## Target Shopify asset name later
`lwt-about__hero-wrapper.png`

## Intent
Cinematic first impression. Strong navy/gold signal energy. Highest contrast wrapper on the page.

## Implementation notes
- Use as section-level background only.
- Keep copy/content as real Liquid/HTML above the art.
- Favor main orbit/glow toward the right side when possible.
- Leave a clean readable zone for hero copy.
- Add only a subtle overlay if needed for readability.

## Responsive requirements
- Define desktop/tablet/mobile `background-position` and `background-size`.
- Preserve visible lower wave/seam on desktop.
- Ensure mobile crop does not place text over the brightest signal area.

## QA
Screenshots at 390, 749, 750, 989, 990, 1024, 1440.

Reject if it looks like a generic Dawn hero, if text is hard to read, or if the graphic is cropped into a noisy unreadable area.
