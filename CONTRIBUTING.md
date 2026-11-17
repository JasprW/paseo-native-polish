# Contributing

Use Node.js 22 and Paseo 0.11.2. The plugin's compatibility range is declared in `paseo-plugin.json`.

```sh
npm ci --ignore-scripts
npm run typecheck
paseo plugin install "$PWD"
# After editing:
paseo plugin reload paseo-native-polish
```

The sidebar timing regression runs the real adapter in Chromium against a small host layout fixture:

```sh
npx playwright install chromium
npm run test:sidebar-browser
# Or use an installed Chrome:
CHROME_CHANNEL=chrome npm run test:sidebar-browser
```

It checks commits before a frame, inside a frame, and after bounded layout polling ends, as well as a single settings-sidebar entrance, pointer-up/click ordering, visible closes, and rapid reversals. Fixtures include retained gesture hosts with and without resize handles, plus the older direct width owner. This catches a full-width frame before the entrance starts; it does not replace checking the actual desktop interface.

Keep runtime imports in their matching directories: `client/` for app code, `server/` for daemon code, and `shared/` for runtime-neutral contracts. Paseo supplies the host modules; do not add app-private imports or bundle a second React instance.

For UI changes, use Paseo's theme colors and document the surface, settings, and interaction you checked. Record any remaining platform or visual checks in the pull request. Include relevant reproduction steps when fixing a bug.

Update README, OVERVIEW and CHANGELOG when behavior changes. Keep package and lockfile versions in sync. See [architecture](docs/architecture.md) for implementation boundaries.

Contributions are licensed under Apache-2.0.
