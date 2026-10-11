# Changelog

## 0.4.7 · 2026-10-11

- Allow deliberate same-direction pulls at an existing top/bottom boundary before the previous wheel tail has fully expired.
- Distinguish sustained renewed pressure and spaced/discrete wheel impulses from isolated momentum fluctuations; retain confirming input and resume from the visible offset.
- Adapt the release gap to observed event cadence (40–120 ms), so sparse wheel input does not prematurely start the return. Momentum release still bypasses this hold.

## 0.4.6 · 2026-10-11

- Latch wheel release for the entire gesture: momentum fluctuations and short tail gaps cannot repeatedly restart the rebound. A quiet gap or direction change starts a new gesture.
- Allow one edge collision during a fling, then keep the return independent of its remaining wheel events. Cancelling feedback on content/layout changes also closes that gesture.
- Coalesce ambient work by surface. Chat streaming refreshes tool/message state without cloning workspace/project snapshots or measuring pane/tab layouts.
- Ignore adapter-owned elastic style writes and ghost-only mutations. Rebase workspace/tab/message snapshots after a wheel burst instead of on every wheel event.

## 0.4.5 · 2026-10-11

- Make elastic pull respond directly to input, removing spring-follow lag and the 80 ms release hold.
- Use viewport-dependent rubber-band resistance and a faster critically damped return without oscillation.
- Detect sustained decaying wheel input as momentum release; give edge collisions one displacement instead of repeatedly extending the pull.
- Resume input from the current visible offset instead of jumping back to an earlier maximum.
- Use platform overscroll in supported macOS/iOS browsers; document the Electron native-scrollBounce limitation.

## 0.4.4 · 2026-10-11

- Add optional elastic scrolling to agent chat, project/status workspace lists, Files and Changes.
- Bound wheel/trackpad and web touch edge feedback to 42 px, with resistance and a damped spring return. Keep native scrolling/inertia and virtualized row transforms.
- Clip translated descendants inside the unchanged content box; guard scroll metrics and cancel feedback on content growth, real scrolling, interaction, blur, preference changes and unload.
- Prevent native boundary feedback from duplicating the added rebound; restore the original overscroll/translate/clip styles on disable/unload.
- Add an Elastic scrolling setting; respect Reduce Motion and provide a faster spring return in Quick mode.

## 0.4.3 · 2026-10-11

- Move workspace rows smoothly when pinned, unpinned or moved between status groups, preserving their stable identity across remounts.
- Animate project creation/removal and surrounding rows moving into place. Fully visible groups use one animation owner; clipped groups use visible row/header motion.
- Animate section headers appearing/disappearing with list changes, including the Pinned section.
- Continue interrupted list motion from its current position on a new structural commit; exclude initial mount, filter/grouping changes, scrolling and dragging.

## 0.4.2 · 2026-10-11

- Animate workspace row creation and archive removal, including neighboring rows and section headers moving into place.
- Track stable workspace keys across offscreen rows and use scroll-relative positions for project/status sidebar lists.
- Rebase on initial mount, section toggles, scrolling, dragging and active parent/sidebar animations to avoid duplicate row motion.
- Keep project new-workspace buttons separate from section disclosure detection.

## 0.4.1 · 2026-10-11

- Keep maximize/restore under one animation owner throughout the gesture, including hidden-pane commits.
- Avoid measuring active pane/sidebars into the ambient pane layout baseline.
- Animate tab reordering only when key order changes, using positions relative to the tab rail.
- Exclude nested sidebar width owners and child tab motion while a parent is animating.

## 0.4.0 · 2026-10-11

- Keep the plugin limited to animations.
- Remove pane header backgrounds, inactive window colors and opacity, added focus outlines and desktop cursor overrides.
- Remove Desktop feel settings, focus detection and related timers/listeners. Existing animation preferences remain supported.

## 0.3.2 · 2026-10-11

- Remove the added composer focus ring and its DOM decoration.
- Prepare the public repository, documentation and typecheck CI.

## 0.3.1 · 2026-10-10

- Remove added tab and pane header underlines.

## 0.3.0 · 2026-10-10

- Add a separate Desktop feel preference for pane focus, window activity and desktop cursors.

## 0.2.0 · 2026-10-10

- Add tab, pane split/close, overlay, button, status and new-message motion.
- Handle asynchronous commits, drag/scroll interruption and virtualized message history.

## 0.1.1 · 2026-10-10

- Correct left and Explorer sidebar width-owner detection.
- Add pane maximize/restore motion.

## 0.1.0 · 2026-10-10

- Initial sidebar, file-tree, tool-call and thinking motion with per-category settings.
