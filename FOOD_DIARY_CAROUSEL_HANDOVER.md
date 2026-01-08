# Food Diary Carousel + Lightbox Handover

## Summary
Two issues remain on the food diary feature page:
1) Desktop carousel is not visibly auto-scrolling right-to-left.
2) Lightbox close button (top-right “×”) is not clickable.

There is also a styling request: the PublicHeader should match the homepage header exactly (remove light green gradient near the logo).

## Where to Look
- Carousel + lightbox: `components/marketing/MockupCarousel.tsx`
- Banner + carousel placement: `components/marketing/FeaturePage.tsx`
- Food diary content + carousel image list: `data/feature-pages.ts`
- Public header styles: `components/marketing/PublicHeader.tsx`
- Homepage header reference: `app/page.tsx`

## Current Behavior
- Desktop carousel: no visible movement, even though auto-scroll is implemented via `requestAnimationFrame` updating `scrollLeft`.
- Lightbox: opens on desktop click, but the close “×” button does not respond.
- Header: PublicHeader uses a green gradient near the logo; user wants it identical to homepage everywhere.

## Expected Behavior
- Carousel should continuously scroll right-to-left on desktop (not on mobile).
- Hover should pause auto-scroll; leaving resumes.
- Lightbox close “×” should always be clickable; clicking outside image should also close.
- Header should use the same background/gradient as the homepage header.

## Notes on Current Implementation
- Desktop auto-scroll runs inside `useEffect` with `requestAnimationFrame` and `scrollLeft += speed`.
- The scroller uses duplicated images `[...images, ...images]` to loop.
- The scroll container is `overflow-x-auto scrollbar-hide`. Parent wrapper is `overflow-hidden`.
- Hover state (`isHovering`) pauses animation.
- Lightbox close button has a higher z-index and `pointer-events-auto`, but still cannot be clicked.

## Likely Causes / Next Steps
### Carousel auto-scroll
- The scroll container may not be scrollable (check `scrollWidth > clientWidth` in dev tools).
- Hover pause may be active constantly if the cursor starts over the banner region.
- Consider switching to a CSS marquee/translate animation for desktop, which is more reliable than `scrollLeft`.
- If keeping `scrollLeft`, verify that `scrollContainerRef` actually scrolls (no `overflow-hidden` on it).

### Lightbox close button not clickable
- Likely a z-index or overlay issue: another fixed element could be on top of the button.
- Confirm in dev tools which element receives the click (inspect pointer events).
- Try moving close button outside the overlay content or give it the highest z-index in the app.
- Ensure the overlay container does not intercept clicks on the button (verify `pointer-events`).

### Header styling
- Remove or replace gradient in `components/marketing/PublicHeader.tsx`.
- Match the exact classes and background styling from `app/page.tsx`.

## Repro Steps
1. Visit `/features/nutrition-food`.
2. Observe carousel: expected to auto-scroll; currently static.
3. Click a phone mockup: lightbox opens.
4. Click the “×” in top-right: it does not close.

