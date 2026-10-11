# Native context menu experiment

The plugin switch needs both the desktop preload/main-process bridge and the app menu integration. Reloading a plugin cannot add these to an existing Electron process. Standard Paseo keeps its web menus.

## What to try

In **Paseo Native Menu Preview**, connect to the daemon already running in standard Paseo. The preview disables built-in daemon management in its separate profile. Native Polish 0.4.9 enables native workspace/file right-click menus by default when the bridge is available. Turn the switch off to compare the original menu.

Try right-clicking a workspace and a file or folder, choosing an action, dismissing with Escape/clicking outside, and opening Labels. The native root menu uses macOS text rows and checkmarks. Labels and persistent/custom interactions return to the original web surface. Kebab menus and other popovers keep their current implementation.

This is a context-menu experiment. Window vibrancy and Liquid Glass materials are not included. Native menu materials follow the installed macOS version. Compilation and static checks do not establish visual behavior.

## Build from source

`native-context-menus.patch` contains the host change. It was authored on Paseo commit `546e587ff`; `git apply --check` also succeeds on the official v0.11.2 source. Use Node.js supported by that checkout.

```sh
git clone --depth 1 --branch v0.11.2 https://github.com/getpaseo/paseo.git paseo-native-menu-source
cd paseo-native-menu-source
git apply /absolute/path/to/paseo-native-polish/docs/experimental/native-context-menus.patch
npm ci
npm run build:server
npm run build:web --workspace=@getpaseo/app
npm run build:main --workspace=@getpaseo/desktop
cd packages/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false ../../node_modules/.bin/electron-builder --mac --arm64 --dir --config /absolute/path/to/paseo-native-polish/docs/experimental/native-menu-builder.cjs
```

Use `--x64` on an Intel Mac. Output defaults to a sibling `paseo-native-menu-preview` directory. `PASEO_NATIVE_MENU_OUTPUT` can choose another directory.

The build config creates a new macOS bundle identity and separate client profile, uses local ad hoc signing and disables notarization and release publishing, and does not register the standard Paseo URL scheme. It creates preview desktop settings only when they do not already exist: no built-in daemon management, keep the daemon running on quit. Connect to an existing daemon; do not enable daemon management for this preview. It does not replace `/Applications/Paseo.app`. This configuration is for a local preview, not distribution.

Install/update Native Polish on the existing daemon and open the preview app. A fresh profile probes `localhost:6767`; if needed, add the host address manually. Quit the preview and return to standard Paseo to stop using the experimental host. Remove its output directory and separate profile when no longer needed.

## Contract and fallback

The bridge advertises `menu.nativeContextMenuVersion: 1` on macOS. It accepts at most 100 flat items with bounded labels/IDs, enabled/checked state and finite local coordinates, then returns a selected ID or null. It validates the sending top-level frame; callback functions, arbitrary Electron roles and executable strings never cross IPC. Window close, navigation, renderer teardown and replacement requests cancel pending menus.

Only workspace and file action contexts opt in. Their actual menu components register actions during a hidden root render. Unsupported rich labels, descriptions, hints or input fields fall back to the complete web menu. Custom submenu/persistent actions mount the web surface before dispatching their existing action. Exceptions from the bridge also fall back. The original terminal menu IPC remains intact.

The plugin does not inject CSS to imitate macOS menus. Its local setting controls one guarded host marker, removed on unload. Disable the switch to use the original host menus.

References: [Electron Menu](https://www.electronjs.org/docs/latest/api/menu), [Paseo plugins](https://paseo.sh/docs/plugins/reference).
