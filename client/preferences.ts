import { useSyncExternalStore } from "react";
export interface Preferences {
  enabled: boolean; sidebars: boolean; trees: boolean; timeline: boolean; panes: boolean;
  tabs: boolean; overlays: boolean; controls: boolean; states: boolean; messages: boolean; elasticScroll: boolean; nativeMenus: boolean;
  pace: "gentle" | "quick";
}
export const defaults: Preferences = { enabled: true, sidebars: true, trees: true, timeline: true, panes: true, tabs: true, overlays: true, controls: true, states: true, messages: true, elasticScroll: true, nativeMenus: true, pace: "gentle" };
let current = defaults;
const listeners = new Set<() => void>();
export function getPreferences() { return current; }
export function setPreferences(next: Preferences) {
  current = next;
  for (const listener of listeners) listener();
}
export function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function usePreferences() { return useSyncExternalStore(subscribePreferences, getPreferences, getPreferences); }
