# Architecture

## Boundaries

`index.client.tsx` registers the settings screen, sidebar shortcut and Command Center action, then starts the web adapter. There is no server entry. Settings components use the public Paseo plugin UI and React Native primitives.

The public plugin API has no host-wide motion hook for existing sidebars or file trees. `client/web.ts` therefore contains a guarded DOM adapter and its minimal DOM types. Native platforms return a no-op. It does not import private React internals or patch the app bundle. All selectors target the Paseo 0.11.2 view structure.

## Capturing changes

Pointer-down captures layout before host gesture handlers commit. Click and keyboard activation cover other paths. A mutation observer and bounded frame polling catch asynchronous commits. Spinner style updates and streamed text changes do not trigger repeated layout scans or message entrances.

Sidebars animate the actual width owner. A retained sidebar keeps its slot during exit; an unmounted Explorer gets an inert copy in that slot so adjacent panes resize. Pane, tab and reorder changes use bounded FLIP geometry. Disclosure animation watches direct membership changes; tree identity follows ancestor names and indentation rather than changing numeric row IDs.

Maximize/restore captures retain ownership for the full gesture, so the ambient membership observer cannot replay the same pane transition. Pane baselines exclude active parent/pane animation frames. Only outer sidebar width owners animate. Tab FLIP requires a real key-order change and uses tab-rail-relative positions; children do not get a second transition from sidebar/pane movement.

Menus preserve host-provided entrances where present. Exit copies have duplicate IDs and interactive media removed. They cannot receive focus or accessibility input. Newly appended message IDs fade once near the tail; initial history and virtualized remounts do not replay.

Workspace sidebar membership uses stable workspace test IDs, including mounted rows outside the viewport. Only visible rows and section headers get bounded snapshots. Creation fades in; removal uses an inert exit copy and scroll-relative FLIP positions for surviving neighbors. Initial list mounts, section toggles and active parent/sidebar animations rebase without row motion. Project trailing creation buttons are excluded from disclosure capture. Workspace row motion shares the sidebar preference.

## Motion lifecycle

Preferences use a small reactive store and client-local storage. Reduce Motion is observed live. Dragging, scrolling, preference changes and teardown cancel active animations. Cleanup removes temporary styles, inert copies, injected CSS, DOM markers, observers, timers and event listeners.

## Compatibility

The manifest limits the plugin to Paseo 0.11.x with a minimum of 0.11.2. The adapter was developed against 0.11.2. A compatible semver range does not establish that every host DOM revision has been reviewed. Inspect changed selectors and their retained/unmounted lifecycle before widening the range.
