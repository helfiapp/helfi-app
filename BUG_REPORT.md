### Bug Report

This file tracks bugs we discover so we can fix them later. Simple, plain-English descriptions only.

1) Cannot edit vitamins on Health Onboarding (Page 6)
   - Where: Onboarding → Page 6 (Supplements/Vitamins list)
   - What happens: Tapping "Edit" opens the re‑analyse pop‑up. Even if I tap "Not now", it does not go to an edit screen.
   - What should happen: It should open an edit screen for that vitamin/supplement without triggering re‑analysis.
   - Notes: Reproducible on Production. Seen on multiple items in the list.

2) Slow/no feedback when tapping "Add Supplement Photos"
   - Where: Onboarding → Page 6 (Supplements/Vitamins), button: "Add Supplement Photos"
   - What happens: After tapping, there is a noticeable delay before the re‑analyse modal appears. During the delay, there is no spinner/disabled state, so it feels like nothing happened.
   - What should happen: Show immediate feedback (disable button + spinner or inline loader) until the modal opens.
   - Notes: This is more of a UX improvement than a bug, but logging here so it’s tracked.


