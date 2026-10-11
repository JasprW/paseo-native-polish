// Run electron-builder from <paseo-source>/packages/desktop.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const source = path.resolve(process.cwd(), "../..");
const yaml = require(require.resolve("js-yaml", { paths: [source] }));
const config = yaml.load(fs.readFileSync(path.join(source, "packages/desktop/electron-builder.yml"), "utf8"));
const previewName = "Paseo Native Menu Preview";
const userData = path.join(os.homedir(), "Library/Application Support", previewName);
fs.mkdirSync(userData, { recursive: true });
const settings = path.join(userData, "desktop-settings.json");
if (!fs.existsSync(settings)) {
  fs.writeFileSync(settings, JSON.stringify({
    version: 1,
    settings: { releaseChannel: "stable", notifications: { playSound: true },
      daemon: { manageBuiltInDaemon: false, keepRunningAfterQuit: true } },
    migrations: { legacyRendererSettingsImported: true, daemonStopOnQuitDefaultApplied: true },
  }, null, 2) + "\n");
}
module.exports = {
  ...config,
  appId: "sh.paseo.native-menu-preview",
  productName: previewName,
  executableName: previewName,
  protocols: [],
  publish: null,
  afterPack: null,
  afterSign: null,
  extraMetadata: { version: "0.11.2", productName: previewName },
  directories: { output: process.env.PASEO_NATIVE_MENU_OUTPUT || path.resolve(source, "../paseo-native-menu-preview") },
  mac: { ...config.mac, identity: "-", hardenedRuntime: false, notarize: false, target: ["dir"] },
};
