import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MotionSettings } from "./client/settings";
import { installMotion } from "./client/web";
export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({ id: "motion", title: "Native Polish", icon: "Sparkles", Component: MotionSettings });
  client.addCommandCenterItem({ id: "motion-settings", title: "Native Polish: motion settings", icon: "Sparkles", context: "global", onSelect({ openSettings }) { openSettings("motion"); } });
  return installMotion();
}
