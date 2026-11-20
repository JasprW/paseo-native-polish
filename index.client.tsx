import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { z } from "zod";
import { MotionSettings } from "./client/settings";
import { getPreferences, subscribePreferences } from "./client/preferences";
import { StreamingAssistant } from "./client/streaming-markdown";
import { installMotion } from "./client/web";
export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addSettingsScreen({ id: "motion", title: "Native Polish", icon: "Sparkles", Component: MotionSettings }),
    client.addCommandCenterItem({ id: "motion-settings", title: "Native Polish: motion settings", icon: "Sparkles", context: "global", onSelect({ openSettings }) { openSettings("motion"); } }),
    installMotion(),
  ];
  if (Platform.OS === "web") {
    cleanups.push(client.addTimelineRenderer({
      kind: "smooth-streaming-assistant",
      version: 1,
      schema: z.object({ text: z.string() }),
      Component: StreamingAssistant,
    }));
    let removeTransformer: (() => void) | undefined;
    const syncTransformer = () => {
      const { enabled, messages } = getPreferences();
      if (!enabled || !messages) {
        removeTransformer?.();
        removeTransformer = undefined;
      } else if (!removeTransformer) {
        removeTransformer = client.addTimelineTransformer({
          id: "smooth-streaming-assistant",
          query: { itemType: "assistant_message" },
          transform: ({ item, phase }) => phase === "streaming" ? {
            items: [{
              type: "plugin",
              kind: "smooth-streaming-assistant",
              version: 1,
              data: { text: item.text },
            }],
          } : undefined,
        });
      }
    };
    // Changing the registration gives Paseo a new transformer for the
    // current row even if the cached source item has not received a delta.
    syncTransformer();
    const unsubscribe = subscribePreferences(syncTransformer);
    cleanups.push(() => {
      unsubscribe();
      removeTransformer?.();
    });
  }
  return () => {
    for (let index = cleanups.length - 1; index >= 0; index -= 1) cleanups[index]();
  };
}
