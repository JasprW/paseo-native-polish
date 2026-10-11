# Native Polish for Paseo

[中文说明](README.zh-CN.md)

Motion for Paseo's existing interface. Sidebars, panes, tabs and disclosures transition smoothly while keeping Paseo's views and controls.

## Features

| Area | Behavior |
| --- | --- |
| Sidebars | Animate left sidebar and Explorer expansion/collapse, including adjacent pane resizing. Workspace rows fade in on creation and out on archive; neighboring rows move into place. |
| Panes | Animate split, close, maximize and restore. |
| Tabs | Animate opening, closing and reordering; transition selection colors. |
| Explorer and timeline | Animate tree expansion/collapse, folder arrows, tool calls and thinking details. |
| Overlays and controls | Short menu/dialog transitions, button press feedback and hover changes. |
| Agent activity | Transition status changes and fade newly appended messages once near the conversation tail. |
| Scrolling | Damped edge rebound for agent conversations, workspace lists, Files and Changes. Normal scrolling and inertia stay with Paseo. |

Workspace rows also move smoothly when pinned, unpinned or moved between status groups. Project creation/removal animates the group and surrounding list. These transitions use the sidebar motion setting.

Each motion category can be switched off. Choose **Gentle** (220 ms) or **Quick** (150 ms). System **Reduce Motion** disables added animations; shorter feedback uses its own timings.

**Elastic scrolling** has its own switch. It responds to vertical wheel/trackpad input and single-finger touch in web clients, with a bounded 42 px pull and a spring return. Horizontal scrolling, pinch zoom and nested code/detail scrollers retain their behavior. Spring return uses its own timing, with a faster Quick setting. Native clients keep their existing scrolling.

## Install

Requires **Paseo 0.11.2**, with plugins enabled on the target daemon. The declared range is `>=0.11.2 <0.12.0`; the DOM adapter is based on 0.11.2 and later patch versions have not been audited.

```sh
paseo plugin add git:JasprW/paseo-native-polish
```

Open **Native Polish** in the sidebar, or use **Native Polish: motion settings** in the Command Center.

```sh
paseo plugin update paseo-native-polish
paseo plugin disable paseo-native-polish
paseo plugin enable paseo-native-polish
```

## Compatibility and data

The motion adapter runs in desktop and browser clients. iOS and Android retain their existing native transitions. It observes Paseo's internal DOM structure, which is not a stable public API; new Paseo minor versions require a compatibility review.

The plugin has no daemon backend and makes no external requests. Exit animations can briefly copy visible DOM content locally. Copies are inert, hidden from accessibility and removed after the transition. Streaming text and loaded history do not replay message entrances. Scrolling and dragging interrupt animations.

Settings are stored in the current client's local storage. Disable or unload the plugin to remove its observers, styles, listeners and animation copies.

## Development

Use Node.js 22. Paseo compiles the TypeScript entries; no separate build is needed.

```sh
git clone https://github.com/JasprW/paseo-native-polish.git
cd paseo-native-polish
npm ci --ignore-scripts
npm run typecheck
paseo plugin install "$PWD"
# After editing:
paseo plugin reload paseo-native-polish
```

```text
index.client.tsx       Client registration and lifecycle
client/settings.tsx   Settings UI using Paseo components
client/preferences.ts Reactive preferences
client/web.ts         Web-only DOM and animation adapter
client/elastic-scroll.ts Web scroll boundary spring and cleanup
paseo-plugin.json     Plugin identity and compatibility
OVERVIEW.md           Paseo plugin listing description
docs/architecture.md  Implementation notes
```

GitHub Actions runs the TypeScript check. It does not validate visual behavior in Paseo. See [CONTRIBUTING](CONTRIBUTING.md), [CHANGELOG](CHANGELOG.md) and the [architecture notes](docs/architecture.md).

## License

[Apache-2.0](LICENSE). This is an independent plugin for [Paseo](https://paseo.sh).
