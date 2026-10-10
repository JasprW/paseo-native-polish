import { Platform } from "react-native";
import { defaults, getPreferences, setPreferences, subscribePreferences } from "./preferences";

/* Desktop/Web adapter for Paseo 0.11.2. Host DOM is not a public plugin API.
 * Keep selectors here; native clients never touch these globals. No host events
 * are cancelled, no React internals are accessed, and no agent content is sent.
 */
interface Rect { left: number; top: number; width: number; height: number; right: number; bottom: number }
interface Style {
  getPropertyValue(key: string): string;
  getPropertyPriority(key: string): string;
  setProperty(key: string, value: string, priority?: string): void;
  removeProperty(key: string): void;
}
interface Animation { cancel(): void; finished: Promise<unknown> }
interface Element {
  nodeType: number; parentElement: Element | null; nextElementSibling: Element | null; children: ArrayLike<Element>;
  style: Style; isConnected: boolean; textContent: string | null;
  scrollTop: number; scrollLeft: number; scrollHeight: number; clientHeight: number;
  closest(selector: string): Element | null;
  matches(selector: string): boolean;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): ArrayLike<Element>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getBoundingClientRect(): Rect;
  cloneNode(deep: boolean): Element;
  appendChild(child: Element): void;
  insertBefore(child: Element, next: Element | null): void;
  remove(): void;
  animate(frames: Record<string, string | number>[], options: { duration: number; easing: string; fill?: string; delay?: number }): Animation;
  getAnimations?(): Animation[];
}
interface Event { target: Element | null; key?: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; repeat?: boolean; buttons?: number; clientX?: number; clientY?: number }
type Listener = (event: Event) => void;
interface Media { matches: boolean; addEventListener(type: string, callback: () => void): void; removeEventListener(type: string, callback: () => void): void }
declare const document: {
  body: Element; head: Element; activeElement: Element | null; visibilityState: string;
  hasFocus(): boolean;
  querySelectorAll(selector: string): ArrayLike<Element>;
  createElement(tag: string): Element;
  addEventListener(type: string, callback: Listener, capture?: boolean): void;
  removeEventListener(type: string, callback: Listener, capture?: boolean): void;
};
declare const window: {
  innerWidth: number; innerHeight: number;
  getComputedStyle(element: Element): Style;
  matchMedia(query: string): Media;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(id: number): void;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
  localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  addEventListener(type: string, callback: Listener): void;
  removeEventListener(type: string, callback: Listener): void;
};
interface Mutation { type: string; target: Element; attributeName: string | null }
declare const MutationObserver: new (callback: (records: Mutation[]) => void) => { observe(target: Element, options: { subtree: boolean; childList: boolean; attributes: boolean; attributeFilter: string[] }): void; disconnect(): void };

const TOOL = '[data-testid="tool-call-badge"], [data-testid="tool-call-group"]';
const FILE_TREE = '[data-testid="file-explorer-tree-scroll"]';
const FILE_ROW = '[data-testid^="file-explorer-row-"]:not([data-testid$="-name"])';
const CHANGE_TREE = '[data-testid="changes-file-tree"]';
const CHANGE_ROW = '[data-testid^="diff-folder-"]:not([data-testid$="-toggle"]):not([data-testid$="-name"]):not([data-testid$="-stat"]), [data-testid^="diff-tree-file-"]:not([data-testid$="-name"])';
const PROJECT = '[data-testid^="sidebar-project-row-"]';
const STATUS = '[data-testid^="sidebar-status-group-"]:not([data-testid^="sidebar-status-group-rows-"]):not([data-testid^="sidebar-status-group-show-more-"])';
const PREF_KEY = 'paseo-native-polish:preferences:v1';
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const all = (root: Element, selector: string) => Array.from(root.querySelectorAll(selector));
const rect = (el: Element) => el.getBoundingClientRect();
const visible = (el: Element) => {
  const r = rect(el);
  return el.isConnected && r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < window.innerHeight;
};
const elementOf = (el: Element | null) => el?.nodeType === 1 ? el : el?.parentElement ?? null;

interface Snapshot { element: Element; box: Rect; copy: Element; parent: Element | null; next: Element | null }
interface Disclosure { element: Element; height: number; children: Element[]; details: Snapshot[] }
interface RowSnapshot extends Snapshot { key: string }
interface Tree { element: Element; rows: RowSnapshot[] }
interface PaneBox { element: Element; box: Rect }
interface Capture { panels: Map<string, Snapshot>; panes: Map<string, PaneBox>; paneMotion: boolean; disclosure: Disclosure | null; tree: Tree | null }
const PANE = '[data-testid^="workspace-pane-"]';
const PANE_ACTION = '[data-testid="workspace-maximize-pane"], [data-testid="workspace-restore-pane"]';
const TAB = '[data-testid^="workspace-tab-"][role="button"][aria-selected]';
const TAB_ROW = '[data-testid="workspace-tabs-scroll"]';
const FLOATING = '[data-menu-surface="true"], [role="dialog"], [role="tooltip"]';
const CHAT = '[data-testid="agent-chat-scroll"]';
const HISTORY_ROW = '[data-history-row-id]';
const live = (selector: string) => all(document.body, selector).filter(el => !el.closest('[data-native-polish-ghost]') && visible(el));
function firstBoxChild(el: Element): Element | null {
  const child = Array.from(el.children)[0];
  if (!child) return null;
  return window.getComputedStyle(child).getPropertyValue('display') === 'contents' ? firstBoxChild(child) : child;
}
function tabSlot(tab: Element, scroll: Element): Element {
  let slot = tab;
  while (slot.parentElement && slot.parentElement !== scroll) {
    const parent = slot.parentElement;
    if (window.getComputedStyle(parent).getPropertyValue('flex-direction') === 'row' && parent.querySelectorAll(TAB).length > 1) break;
    // The scroll content is also a row when it only has one tab.
    if (parent.parentElement === scroll) break;
    slot = parent;
  }
  return slot;
}
const chevron = (svg: Element) => Array.from(svg.querySelectorAll('path')).some(path => /^m9\s*18\s*6-6-6-6$/i.test(path.getAttribute('d') ?? ''));
function paneBoxes(): Map<string, PaneBox> {
  return new Map(all(document.body, PANE).filter(visible).map(element => [element.getAttribute('data-testid')!, { element, box: rect(element) }]));
}
function layoutParent(element: Element): Element | null {
  let parent = element.parentElement;
  while (parent && window.getComputedStyle(parent).getPropertyValue('display') === 'contents') parent = parent.parentElement;
  return parent;
}
function panelOwner(element: Element): Element {
  if (element.getAttribute('data-testid') !== 'workspace-explorer-sidebar') return element;
  // Explorer content -> RetainedPanel (flex:1) -> fixed-width dock. Unistyles
  // puts the dock's width in a class, so an inline-style search cannot find it.
  const retained = layoutParent(element);
  return retained ? layoutParent(retained) ?? retained : element;
}

function panels(): Map<string, Element> {
  const result = new Map<string, Element>();
  const resize = document.body.querySelector('[data-testid="left-sidebar-resize-handle"]');
  if (resize?.parentElement) {
    // GestureDetector adds a display:contents wrapper. On touch there is also
    // an absolutely positioned handle layer. The border's parent owns width.
    // This structure remains stable when display:none makes every rect zero.
    let border = layoutParent(resize);
    if (border && window.getComputedStyle(border).getPropertyValue('position') === 'absolute') border = layoutParent(border);
    const owner = border ? layoutParent(border) : null;
    if (owner) result.set('left', owner);
  }
  // Compact headers do not mount the desktop resize handle; only discover the
  // fallback within the sidebar's own list ancestry, never arbitrary app divs.
  if (!result.has('left')) {
    const list = document.body.querySelector('[data-testid="sidebar-project-workspace-list-scroll"], [data-testid="sidebar-status-list-scroll"]');
    let cursor = list;
    while (cursor?.parentElement) {
      const r = rect(cursor);
      if (r.height > 240 && r.width > 120 && r.width < 450 && cursor.querySelector('[data-testid="sidebar-pinned-section"]')) result.set('left', cursor);
      if (rect(cursor.parentElement).width > 500) break;
      cursor = cursor.parentElement;
    }
  }
  for (const [name, selector] of [
    ['explorer', '[data-testid="workspace-explorer-sidebar"]'],
    ['explorer-dock', '[data-testid="native-explorer-sidebar-dock"]'],
    ['settings', '[data-testid="settings-sidebar"]'],
    ['changes-rail', '[data-testid="changes-tree-rail-tree"]'],
  ]) {
    const el = all(document.body, selector).find(visible);
    if (el) result.set(name, panelOwner(el));
  }
  return result;
}

function snapshot(el: Element): Snapshot { return { element: el, box: rect(el), copy: el.cloneNode(true), parent: el.parentElement, next: el.nextElementSibling }; }
function disclosureFor(target: Element): Element | null {
  const tool = target.closest(TOOL);
  if (tool) {
    // Only the header toggles disclosure. Detail links, selection, file-open
    // buttons and nested tools keep their own existing behavior.
    const header = Array.from(tool.children)[0];
    if (header && target.closest('[role="button"]') === header) return tool;
  }
  const project = target.closest(PROJECT);
  if (project) return project.closest('[role="group"]');
  const status = target.closest(STATUS);
  if (status) return status.parentElement?.parentElement ?? null;
  const expanded = target.closest('[role="button"][aria-expanded]');
  if (expanded?.closest('[data-testid^="sidebar-"]')) return expanded.parentElement;
  return null;
}
function captureDisclosure(el: Element | null): Disclosure | null {
  if (!el || !visible(el)) return null;
  const children = Array.from(el.children);
  return { element: el, height: rect(el).height, children, details: children.slice(1).filter(visible).map(snapshot) };
}
function captureTree(target: Element): Tree | null {
  const tree = target.closest(FILE_TREE + ', ' + CHANGE_TREE);
  if (!tree) return null;
  const rows = all(tree, tree.matches(CHANGE_TREE) ? CHANGE_ROW : FILE_ROW);
  // Rows are keyed by hierarchy and name, because the host's numeric test IDs
  // shift on every expand/collapse. Indentation distinguishes nested duplicates.
  const stack: { depth: number; name: string }[] = [];
  const snapshots: RowSnapshot[] = [];
  for (const row of rows) {
    if (!visible(row)) continue;
    const depth = parseFloat(window.getComputedStyle(row).getPropertyValue('padding-left')) || 0;
    const name = row.querySelector('[data-testid$="-name"]')?.textContent ?? row.textContent ?? '';
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const key = JSON.stringify([...stack.map(item => item.name), name]);
    stack.push({ depth, name });
    snapshots.push({ ...snapshot(row), key });
  }
  return { element: tree, rows: snapshots };
}

export function installMotion(): () => void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  document.body.setAttribute("data-native-polish", "0.3.2");

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREF_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      const next = { ...defaults };
      for (const key of ['enabled', 'sidebars', 'trees', 'timeline', 'panes', 'tabs', 'overlays', 'controls', 'states', 'messages', 'nativeChrome'] as const) if (typeof saved[key] === 'boolean') next[key] = saved[key];
      if (saved.pace === 'quick') next.pace = 'quick';
      setPreferences(next);
    }
  } catch { /* A blocked storage area should not disable motion. */ }
  console.info('[Native Polish] loaded', JSON.stringify({ version: '0.3.2', preferences: getPreferences(), reduceMotion: reduceMotion.matches }));
  let disposed = false;
  let pending: Capture | null = null;
  let frame = 0;
  let deadline = 0;
  let layoutPolling = 0;
  let passiveFrame = 0;
  let quietUntil = 0;
  let pointerOrigin: { x: number; y: number } | null = null;
  let nativeFocusTimer = 0;
  let nativeWindowTimer = 0;
  let nativeFocusLock = 0;
  let focusedPane: Element | null = null;
  const panelExits = new Set<Element>();
  const panelEntries = new Set<Element>();
  const active = new Map<Element, () => void>();
  const ghosts = new Set<Element>();
  const canAnimate = () => !disposed && getPreferences().enabled && !reduceMotion.matches;
  const duration = () => getPreferences().pace === 'quick' ? 150 : 220;

  const stopAll = () => {
    for (const stop of Array.from(active.values())) stop();
    for (const ghost of ghosts) ghost.remove();
    ghosts.clear();
  };
  function animate(el: Element, frames: Record<string, string | number>[], cleanup?: () => void, delay = 0, milliseconds = duration()) {
    active.get(el)?.();
    if (!canAnimate() || typeof el.animate !== 'function') { cleanup?.(); return; }
    let animation: Animation;
    try { animation = el.animate(frames, { duration: milliseconds, easing: EASING, fill: 'both', delay }); }
    catch { cleanup?.(); return; }
    let finished = false;
    const stop = () => {
      if (finished) return;
      finished = true;
      animation.cancel();
      if (active.get(el) === stop) active.delete(el);
      cleanup?.();
    };
    active.set(el, stop);
    void animation.finished.then(stop, stop);
  }
  function temporaryStyles(el: Element, values: Record<string, string>): () => void {
    const previous = Object.keys(values).map(key => [key, el.style.getPropertyValue(key), el.style.getPropertyPriority(key)]);
    for (const [key, value] of Object.entries(values)) el.style.setProperty(key, value);
    return () => {
      for (const [key, value, priority] of previous) {
        // Restore only values still owned by us; React may have updated a style.
        if (el.style.getPropertyValue(key) !== values[key]) continue;
        if (value) el.style.setProperty(key, value, priority);
        else el.style.removeProperty(key);
      }
    };
  }
  function exitCopy(before: Snapshot): Element {
    const copy = before.copy;
    copy.setAttribute('data-native-polish-ghost', '');
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('inert', '');
    for (const el of [copy, ...all(copy, '[data-testid], [id], [autofocus], [data-menu-surface], [data-history-row-id], [data-message-id]')]) {
      el.removeAttribute('data-testid'); el.removeAttribute('id'); el.removeAttribute('autofocus');
      el.removeAttribute('data-menu-surface'); el.removeAttribute('data-history-row-id'); el.removeAttribute('data-message-id');
    }
    for (const el of all(copy, 'iframe, video, audio, input, textarea')) el.remove();
    return copy;
  }
  function ghost(before: Snapshot, horizontal = 0) {
    const copy = exitCopy(before);
    const style = window.getComputedStyle(before.element);
    const r = before.box;
    const values: Record<string, string> = {
      position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      margin: '0', 'box-sizing': 'border-box', overflow: 'hidden', 'pointer-events': 'none', 'z-index': '90',
      color: style.getPropertyValue('color'), 'font-family': style.getPropertyValue('font-family'),
    };
    for (const [key, value] of Object.entries(values)) copy.style.setProperty(key, value, 'important');
    document.body.appendChild(copy);
    ghosts.add(copy);
    animate(copy, [{ opacity: 1, transform: 'translate(0,0)', clipPath: 'inset(0 0 0 0)' }, { opacity: 0, transform: `translate(${horizontal}px,-3px)`, clipPath: horizontal ? 'inset(0 0 0 0)' : 'inset(0 0 100% 0)' }], () => { copy.remove(); ghosts.delete(copy); });
  }
  function revealPanel(el: Element) {
    const width = rect(el).width;
    if (width < 2) return;
    const content = Array.from(el.children).find(child => rect(child).width > width / 2);
    const restoreContent = content ? temporaryStyles(content, { 'min-width': `${width}px` }) : () => {};
    const restore = temporaryStyles(el, { overflow: 'hidden', 'min-width': '0', 'box-sizing': 'border-box', 'flex-shrink': '0' });
    panelEntries.add(el);
    animate(el, [{ width: '0px', opacity: 0.4 }, { width: `${width}px`, opacity: 1 }], () => { restoreContent(); restore(); panelEntries.delete(el); });
  }
  function hidePanel(before: Snapshot, key: string) {
    const el = before.element;
    if (!el.isConnected) {
      if (!before.parent?.isConnected) { ghost(before, key === 'left' ? -before.box.width : before.box.width); return; }
      // Explorer is unmounted on close. An inert copy in the original flex
      // slot lets the adjacent panes expand progressively instead of jumping.
      const copy = exitCopy(before);
      const values: Record<string, string> = { display: 'flex', position: 'relative', width: `${before.box.width}px`, height: `${before.box.height}px`, 'min-width': '0', 'flex-shrink': '0', 'box-sizing': 'border-box', overflow: 'hidden', 'pointer-events': 'none' };
      // An !important width would override the Web Animations width frames.
      for (const [property, value] of Object.entries(values)) copy.style.setProperty(property, value, property === 'width' ? '' : 'important');
      const content = Array.from(copy.children)[0];
      content?.style.setProperty('min-width', `${before.box.width}px`);
      before.parent.insertBefore(copy, before.next?.parentElement === before.parent ? before.next : null);
      ghosts.add(copy);
      animate(copy, [{ width: `${before.box.width}px`, opacity: 1 }, { width: '0px', opacity: 0.3 }], () => { copy.remove(); ghosts.delete(copy); });
      return;
    }
    // Left sidebar is retained with display:none. Keep its real layout slot
    // for the duration of the exit, while preserving host aria-hidden/input state.
    panelExits.add(el);
    const restore = temporaryStyles(el, { display: 'flex', overflow: 'hidden', 'min-width': '0', 'box-sizing': 'border-box', 'pointer-events': 'none', 'flex-shrink': '0' });
    el.style.setProperty('display', 'flex', 'important');
    const content = Array.from(el.children)[0];
    const restoreContent = content ? temporaryStyles(content, { 'min-width': `${before.box.width}px` }) : () => {};
    animate(el, [{ width: `${before.box.width}px`, opacity: 1 }, { width: '0px', opacity: 0.3 }], () => { restoreContent(); restore(); panelExits.delete(el); });
  }
  function animatePanes(before: Map<string, PaneBox>, after: Map<string, PaneBox>) {
    let changed = false;
    for (const [key, next] of after) {
      if (active.has(next.element)) continue;
      const old = before.get(key);
      if (!old) {
        // Retained split children can become visible before Reanimated commits
        // their flex sizes. Keep waiting for the existing pane's geometry too.
        animate(next.element, [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }]);
        continue;
      }
      const dx = old.box.left - next.box.left;
      const dy = old.box.top - next.box.top;
      const sx = old.box.width / next.box.width;
      const sy = old.box.height / next.box.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002) continue;
      changed = true;
      const restore = temporaryStyles(next.element, { 'transform-origin': '0 0', overflow: 'hidden' });
      animate(next.element, [{ transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})` }, { transform: 'translate(0,0) scale(1,1)' }], restore);
    }
    return changed;
  }
  function animateDisclosure(before: Disclosure) {
    const el = before.element;
    if (!visible(el)) return;
    const children = Array.from(el.children);
    // Streamed text, syntax highlighting and hover updates must not trigger a
    // new expand animation. Only a change in the direct detail children does.
    if (children.length === before.children.length && children.every((child, index) => child === before.children[index])) return;
    const height = rect(el).height;
    if (Math.abs(height - before.height) < 2) return;
    active.get(el)?.();
    const restore = temporaryStyles(el, { overflow: 'hidden', 'box-sizing': 'border-box', 'min-height': '0' });
    animate(el, [{ height: `${before.height}px` }, { height: `${height}px` }], restore);
    if (height > before.height) {
      for (const detail of children.slice(1)) {
        if (before.children.includes(detail)) continue;
        animate(detail, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'translateY(0)' }]);
      }
    } else for (const detail of before.details) if (!detail.element.isConnected) ghost(detail);
  }
  function animateTree(before: Tree, target: Element) {
    const after = captureTree(target);
    if (!after || after.element !== before.element) return;
    const oldRows = new Map(before.rows.map(row => [row.key, row]));
    const nextKeys = new Set(after.rows.map(row => row.key));
    if (before.rows.length === after.rows.length && before.rows.every((row, index) => row.key === after.rows[index].key)) return;
    // Bound work for very large trees; the viewport's rows still move together.
    for (const row of before.rows.slice(0, 80)) if (!nextKeys.has(row.key)) ghost(row);
    let entered = 0;
    for (const row of after.rows.slice(0, 100)) {
      const old = oldRows.get(row.key);
      if (!old) {
        animate(row.element, [{ opacity: 0, transform: 'translateY(-5px)' }, { opacity: 1, transform: 'translateY(0)' }], undefined, Math.min(entered++ * 8, 48));
      } else {
        const delta = old.box.top - row.box.top;
        if (Math.abs(delta) > 1) animate(row.element, [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }]);
      }
    }
  }

  // Persistent observation adds motion to async updates (new tabs/messages and
  // status changes) without relying on a click being in progress. No content
  // text is compared, and message DOM is never cloned.
  interface TabState { chip: Element; shot: Snapshot }
  let tabRows = new Map<Element, Map<string, TabState>>();
  interface FloatingSnapshot extends Snapshot { opacity: number }
  let floating = new Map<Element, FloatingSnapshot>();
  let paneBaseline = paneBoxes();
  let paneTransition: Map<string, PaneBox> | null = null;
  let paneTransitionUntil = 0;
  let iconStates = new Map<Element, string>();
  let toolStates = new Map<Element, boolean>();
  let agentStates = new Map<Element, string>();
  const tabSettling = new WeakMap<Element, number>();
  const chats = new WeakMap<Element, { seen: Set<string>; pending: Set<string>; running: boolean }>();
  const decorations = new Map<Element, () => void>();
  const stylesheet = document.createElement('style');
  stylesheet.setAttribute('data-native-polish-style', '');
  stylesheet.textContent = `
    body[data-native-polish-controls="true"] :is([role="button"],button,[role="menuitem"],[aria-selected]) {
      transition-property: background-color,color,border-color,outline-color,box-shadow;
      transition-duration: 110ms;
      transition-timing-function: cubic-bezier(0.22,1,0.36,1);
    }
    body[data-native-polish-controls="true"] [data-native-polish-pressable] {
      transition-property: background-color,color,border-color,outline-color,box-shadow,scale;
      transition-duration: 110ms;
    }
    body[data-native-polish-controls="true"] [data-native-polish-pressable]:active:not([aria-disabled="true"]):not(:disabled) { scale: .97; }
    body[data-native-polish-tabs="true"] ${TAB} {
      transition-property: background-color,color,border-color;
      transition-duration: 150ms;
      transition-timing-function: cubic-bezier(0.22,1,0.36,1);
    }
    body[data-native-polish-trees="true"] [data-native-polish-chevron] {
      transition: transform 160ms cubic-bezier(0.22,1,0.36,1);
    }
    body[data-native-polish-states="true"] :is(${TAB},[data-testid^="sidebar-workspace-"]) :is(svg,path,circle) {
      transition: color 150ms,stroke 150ms,fill 150ms;
    }
    @media (any-pointer: fine) {
      body[data-native-polish-chrome="true"] :is(button,[role="button"],[role="menuitem"],[role="tab"]):not(a):not([data-testid*="resize-handle"]) { cursor: default !important; }
      body[data-native-polish-chrome="true"] :is(a[href],[role="link"]) { cursor: pointer !important; }
      body[data-native-polish-chrome="true"] [aria-roledescription="sortable"][aria-pressed="true"] { cursor: grabbing !important; }
    }
    body[data-native-polish-chrome="true"] ${PANE} [data-testid="workspace-tabs-row"] {
      background-color: var(--colors-surface0,transparent);
    }
    body[data-native-polish-chrome="true"][data-native-polish-window-active="true"] [data-native-polish-pane-active="true"] [data-testid="workspace-tabs-row"] {
      background-color: var(--colors-surface1,transparent);
    }
    body[data-native-polish-chrome="true"][data-native-polish-window-active="false"] ${TAB}[aria-selected="true"] {
      background-color: var(--colors-surface1,transparent) !important;
    }
    body[data-native-polish-chrome="true"][data-native-polish-window-active="false"] [data-testid="workspace-tabs-row"] :is(button,[role="button"]) svg { opacity: .6; }
    body[data-native-polish-chrome="true"][data-native-polish-window-active="false"] [data-testid^="sidebar-workspace-row-"][aria-selected="true"] {
      background-color: var(--colors-surface-sidebar-hover,var(--colors-surface1,transparent)) !important;
    }
    body[data-native-polish-chrome="true"][data-native-polish-window-active="true"] :is(button,[role="button"],[role="tab"]):focus-visible {
      outline: 2px solid var(--colors-ring,currentColor);
      outline-offset: 2px;
    }
    body[data-native-polish-motion="true"][data-native-polish-chrome="true"] [data-testid="workspace-tabs-row"] {
      transition: background-color 120ms;
    }
  `;
  document.head.appendChild(stylesheet);
  // Resolve the same theme token used by the host's focused tab. This hidden
  // color probe lets keyboard-driven pane changes follow host state without
  // reading private stores or changing keyboard routing.
  const focusColor = document.createElement('div');
  focusColor.setAttribute('aria-hidden', 'true');
  focusColor.setAttribute('data-native-polish-color-probe', '');
  for (const [key, value] of Object.entries({ position: 'fixed', width: '0', height: '0', overflow: 'hidden', 'pointer-events': 'none', visibility: 'hidden', 'background-color': 'var(--colors-surface2)' })) focusColor.style.setProperty(key, value);
  document.body.appendChild(focusColor);
  function updateMotionFlags() {
    const preferences = getPreferences();
    for (const key of ['controls', 'tabs', 'trees', 'states'] as const) document.body.setAttribute(`data-native-polish-${key}`, String(canAnimate() && preferences[key]));
    document.body.setAttribute('data-native-polish-motion', String(canAnimate()));
    document.body.setAttribute('data-native-polish-chrome', String(preferences.nativeChrome));
    updateNativeChrome();
  }
  function updateNativeChrome(target: Element | null = null) {
    if (disposed) return;
    const windowActive = document.hasFocus() && document.visibilityState !== 'hidden';
    const activeValue = String(windowActive);
    if (document.body.getAttribute('data-native-polish-window-active') !== activeValue) document.body.setAttribute('data-native-polish-window-active', activeValue);
    const panes = live(PANE);
    const requested = target?.closest(PANE);
    if (requested && panes.includes(requested)) { focusedPane = requested; nativeFocusLock = Date.now() + 180; }
    if (Date.now() >= nativeFocusLock && windowActive) {
      const selectedColor = window.getComputedStyle(focusColor).getPropertyValue('background-color');
      const hostFocused = selectedColor && selectedColor !== 'rgba(0, 0, 0, 0)' ? panes.find(pane => {
        const selected = pane.querySelector(TAB + '[aria-selected="true"]');
        return selected && window.getComputedStyle(selected).getPropertyValue('background-color') === selectedColor;
      }) : null;
      if (hostFocused) focusedPane = hostFocused;
    }
    if (!focusedPane || !panes.includes(focusedPane)) focusedPane = document.activeElement?.closest(PANE) ?? panes[0] ?? null;
    for (const pane of panes) {
      const value = String(pane === focusedPane);
      if (pane.getAttribute('data-native-polish-pane-active') !== value) pane.setAttribute('data-native-polish-pane-active', value);
    }
  }
  const onNativeFocus: Listener = event => {
    updateNativeChrome(elementOf(event.target));
    window.clearTimeout(nativeFocusTimer);
    nativeFocusTimer = window.setTimeout(() => updateNativeChrome(), 200);
  };
  const onNativeWindow: Listener = () => {
    window.clearTimeout(nativeWindowTimer);
    // Moving focus into an iframe can blur the outer window even though the
    // app is foreground. hasFocus() includes its child document after commit.
    nativeWindowTimer = window.setTimeout(() => updateNativeChrome(), 0);
  };
  function decorate(el: Element, attribute: string) {
    if (el.getAttribute(attribute) !== null) return;
    el.setAttribute(attribute, '');
    decorations.set(el, () => el.removeAttribute(attribute));
  }
  function decorateControls() {
    for (const button of live('[role="button"],button').slice(0, 250)) {
      const r = rect(button);
      if (r.width <= 100 && r.height <= 56 && !button.matches(TAB) && !button.closest(FILE_TREE + ', ' + CHANGE_TREE + ', ' + TOOL) && !button.matches('[role="separator"]')) decorate(button, 'data-native-polish-pressable');
    }
    for (const row of live(FILE_ROW + ', ' + CHANGE_ROW).slice(0, 180)) {
      const svg = row.querySelector('svg');
      if (!svg || !chevron(svg)) continue;
      const owner = layoutParent(svg);
      if (owner && rect(owner).width <= 24) decorate(owner, 'data-native-polish-chevron');
    }
    for (const [el, cleanup] of decorations) if (!el.isConnected) { cleanup(); decorations.delete(el); }
  }
  function collapseTab(before: Snapshot) {
    if (!before.parent?.isConnected) { ghost(before); return; }
    const copy = exitCopy(before);
    const r = before.box;
    for (const [property, value] of Object.entries({ width: `${r.width}px`, 'max-width': `${r.width}px`, 'min-width': '0', height: `${r.height}px`, overflow: 'hidden', 'flex-shrink': '0', 'pointer-events': 'none' })) copy.style.setProperty(property, value);
    before.parent.insertBefore(copy, before.next?.parentElement === before.parent ? before.next : null);
    ghosts.add(copy);
    animate(copy, [{ width: `${r.width}px`, opacity: 1 }, { width: '0px', opacity: 0 }], () => { copy.remove(); ghosts.delete(copy); }, 0, Math.round(duration() * .75));
  }
  function updateTabs(allow: boolean) {
    const nextRows = new Map<Element, Map<string, TabState>>();
    for (const scroll of live(TAB_ROW)) {
      const old = tabRows.get(scroll);
      const next = new Map<string, TabState>();
      for (const chip of all(scroll, TAB).filter(visible).slice(0, 80)) {
        const key = chip.getAttribute('data-testid')!;
        const slot = tabSlot(chip, scroll);
        const previous = old?.get(key);
        // Reuse an in-flight snapshot: animation rects are not layout changes.
        const shot = active.has(slot) && previous ? previous.shot : snapshot(slot);
        next.set(key, { chip, shot });
      }
      nextRows.set(scroll, next);
      if (!allow || !getPreferences().tabs || !old || Date.now() < quietUntil) continue;
      const removed = Array.from(old).filter(([key]) => !next.has(key));
      const added = Array.from(next).filter(([key]) => !old.has(key));
      if (removed.length || added.length) tabSettling.set(scroll, Date.now() + duration() + 50);
      for (const [, item] of removed) collapseTab(item.shot);
      for (const [, item] of added) {
        const el = item.shot.element;
        const width = item.shot.box.width;
        if (width < 2 || active.has(el)) continue;
        const restore = temporaryStyles(el, { overflow: 'hidden', 'min-width': '0', 'max-width': `${width}px`, 'flex-shrink': '0' });
        animate(el, [{ width: '0px', opacity: 0 }, { width: `${width}px`, opacity: 1 }], restore);
      }
      // Width animation moves siblings in normal flow. Pure reorder uses FLIP.
      if (!removed.length && !added.length && Date.now() >= (tabSettling.get(scroll) ?? 0)) for (const [key, item] of next) {
        const previous = old.get(key);
        if (!previous || active.has(item.shot.element) || item.shot.element.style.getPropertyValue('transform')) continue;
        const dx = previous.shot.box.left - item.shot.box.left;
        if (Math.abs(dx) > 1 && Math.abs(previous.shot.box.width - item.shot.box.width) < 1 && Date.now() >= quietUntil) animate(item.shot.element, [{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }]);
      }
    }
    tabRows = nextRows;
  }
  function floatingExit(before: Snapshot) {
    const copy = exitCopy(before);
    const r = before.box;
    for (const [property, value] of Object.entries({ position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', 'box-sizing': 'border-box', 'pointer-events': 'none', 'z-index': '9999', animation: 'none', transition: 'none', transform: 'none' })) copy.style.setProperty(property, value, 'important');
    document.body.appendChild(copy);
    ghosts.add(copy);
    animate(copy, [{ opacity: 1, scale: 1 }, { opacity: 0, scale: .98 }], () => { copy.remove(); ghosts.delete(copy); }, 0, Math.round(duration() * .65));
  }
  function updateFloating(allow: boolean) {
    const next = new Map<Element, FloatingSnapshot>();
    for (const el of live(FLOATING).filter(el => { const r = rect(el); return r.right > 0 && r.left < window.innerWidth; }).slice(0, 12)) {
      // Nested menu pages/dialog children must not get two entrances.
      if (el.parentElement?.closest(FLOATING)) continue;
      const previous = floating.get(el);
      const opacity = parseFloat(window.getComputedStyle(el).getPropertyValue('opacity'));
      next.set(el, active.has(el) && previous ? previous : { ...snapshot(el), opacity: Number.isFinite(opacity) ? opacity : 1 });
      if (!allow || !getPreferences().overlays || previous) continue;
      // Paseo already animates some menus. Keep its entrance; add our exit.
      if (!el.getAnimations?.().length) animate(el, [{ opacity: 0, scale: .98 }, { opacity: 1, scale: 1 }], undefined, 0, Math.min(duration(), 180));
    }
    if (allow && getPreferences().overlays) for (const [el, before] of floating) if (!next.has(el) && before.opacity > .1) floatingExit(before);
    floating = next;
  }
  function updatePaneLayout(allow: boolean) {
    const next = paneBoxes();
    const shared = Array.from(next.keys()).some(key => paneBaseline.has(key));
    const membershipChanged = next.size !== paneBaseline.size || Array.from(next.keys()).some(key => !paneBaseline.has(key));
    if (!allow || !getPreferences().panes || pending?.paneMotion) paneTransition = null;
    else {
      if (shared && membershipChanged) { paneTransition = paneBaseline; paneTransitionUntil = Date.now() + 700; }
      if (paneTransition && (Date.now() > paneTransitionUntil || animatePanes(paneTransition, next))) paneTransition = null;
    }
    paneBaseline = next;
  }
  function iconSignature(slot: Element): string {
    return all(slot, 'svg,path,circle,polyline,line,rect').slice(0, 16).map(el => ['d', 'points', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'stroke', 'fill'].map(key => el.getAttribute(key) ?? '').join(':')).join('|') || 'loading';
  }
  function updateStates(allow: boolean) {
    const nextIcons = new Map<Element, string>();
    const nextTools = new Map<Element, boolean>();
    const nextAgents = new Map<Element, string>();
    for (const agent of live('[data-status-bucket]').slice(0, 100)) {
      const state = agent.getAttribute('data-status-bucket')!;
      nextAgents.set(agent, state);
      const icon = firstBoxChild(agent);
      if (allow && getPreferences().states && agentStates.has(agent) && agentStates.get(agent) !== state && icon && !active.has(icon)) animate(icon, [{ opacity: .25, scale: .9 }, { opacity: 1, scale: 1 }], undefined, 0, 150);
    }
    const slots: Element[] = [];
    for (const row of live(FILE_ROW + ', ' + CHANGE_ROW).slice(0, 150)) {
      const info = firstBoxChild(row);
      const slot = info ? firstBoxChild(info) : null;
      if (slot && rect(slot).width <= 32) slots.push(slot);
    }
    for (const tool of live(TOOL).slice(0, 80)) {
      const header = firstBoxChild(tool);
      if (!header) continue;
      const running = Boolean(header.querySelector('[style*="--paseo-shimmer"]'));
      nextTools.set(header, running);
      if (allow && getPreferences().states && toolStates.has(header) && toolStates.get(header) !== running && !active.has(header)) animate(header, [{ opacity: .65 }, { opacity: 1 }], undefined, 0, 150);
      const row = firstBoxChild(header);
      const slot = row ? firstBoxChild(row) : null;
      if (slot && !Array.from(slot.querySelectorAll('svg')).some(chevron)) slots.push(slot);
    }
    for (const slot of slots) {
      const signature = iconSignature(slot);
      nextIcons.set(slot, signature);
      if (allow && getPreferences().states && iconStates.has(slot) && iconStates.get(slot) !== signature && !active.has(slot)) animate(slot, [{ opacity: .2, scale: .9 }, { opacity: 1, scale: 1 }], undefined, 0, 150);
    }
    iconStates = nextIcons; toolStates = nextTools; agentStates = nextAgents;
  }
  function updateMessages(allow: boolean) {
    for (const chat of live(CHAT)) {
      const rows = all(chat, HISTORY_ROW);
      const old = chats.get(chat);
      const running = Boolean(chat.querySelector('[data-testid="turn-working-indicator"]'));
      const seen = old?.seen ?? new Set<string>();
      const candidates = allow ? old?.pending ?? new Set<string>() : new Set<string>();
      let lastKnown = -1;
      rows.forEach((row, index) => { if (seen.has(row.getAttribute('data-history-row-id')!)) lastKnown = index; });
      const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 180;
      let entered = 0;
      rows.forEach((row, index) => {
        const id = row.getAttribute('data-history-row-id')!;
        const isNew = !seen.has(id);
        seen.add(id);
        if (allow && old && isNew && lastKnown >= 0 && index > lastKnown && atBottom && Date.now() >= quietUntil) candidates.add(id);
        if (candidates.has(id) && visible(row) && row.querySelector('[data-testid="user-message"], [data-testid="assistant-message"]')) {
          candidates.delete(id);
          if (allow && getPreferences().messages && atBottom && Date.now() >= quietUntil && entered++ < 4) animate(row, [{ opacity: 0 }, { opacity: 1 }], undefined, 0, 150);
        }
      });
      if (allow && getPreferences().states && old && old.running !== running && atBottom) {
        const indicator = chat.querySelector('[data-testid="turn-working-indicator"]') ?? rows[rows.length - 1];
        if (indicator && visible(indicator) && !active.has(indicator)) animate(indicator, [{ opacity: .4 }, { opacity: 1 }], undefined, 0, 150);
      }
      while (seen.size > 5000) seen.delete(seen.values().next().value!);
      const currentIds = new Set(rows.map(row => row.getAttribute('data-history-row-id')!));
      for (const id of candidates) if (!atBottom || !currentIds.has(id)) candidates.delete(id);
      chats.set(chat, { seen, pending: candidates, running });
    }
  }
  function refreshAmbient(allow = canAnimate()) {
    decorateControls();
    updateNativeChrome();
    updateTabs(allow); updateFloating(allow); updatePaneLayout(allow);
    updateStates(allow); updateMessages(allow);
  }
  function scheduleAmbient() {
    if (disposed || passiveFrame) return;
    passiveFrame = window.requestAnimationFrame(() => { passiveFrame = 0; if (!disposed) refreshAmbient(); });
  }
  updateMotionFlags();
  refreshAmbient(false);
  let treeTarget: Element | null = null;
  const capture = (target: Element | null): Capture => ({
    panels: new Map(Array.from(panels()).filter(([, el]) => visible(el)).map(([key, el]) => [key, snapshot(el)])),
    panes: paneBoxes(),
    paneMotion: Boolean(target?.closest(PANE_ACTION)),
    disclosure: target ? captureDisclosure(disclosureFor(target)) : null,
    tree: target ? captureTree(target) : null,
  });
  const flush = () => {
    frame = 0;
    if (!pending || !canAnimate()) return;
    const preferences = getPreferences();
    const currentPanels = panels();
    const currentPanes = paneBoxes();
    // Save the committed layout before our width animations change its rects.
    // Retain entry snapshots while their first frame temporarily has width 0.
    const nextPanels = new Map<string, Snapshot>();
    for (const [key, el] of currentPanels) {
      if (panelExits.has(el)) continue;
      const old = pending.panels.get(key);
      if (panelEntries.has(el) && old?.element === el) nextPanels.set(key, old);
      else if (visible(el)) nextPanels.set(key, old?.element === el ? old : snapshot(el));
    }
    if (preferences.sidebars) {
      for (const [key, before] of pending.panels) {
        const after = currentPanels.get(key);
        if ((!after || !visible(after)) && !panelExits.has(before.element) && !panelEntries.has(before.element)) hidePanel(before, key);
      }
      for (const [key, after] of currentPanels) if (visible(after) && !pending.panels.has(key)) {
        if (!panelExits.has(after) && !panelEntries.has(after)) revealPanel(after);
      }
    }
    // FLIP runs once per maximize/restore commit. Reading transformed rects
    // again in our observer would otherwise restart the same animation.
    const paneChanged = pending.paneMotion && preferences.panes && animatePanes(pending.panes, currentPanes);
    if (pending.disclosure && ((pending.disclosure.element.matches(TOOL) && preferences.timeline) || (!pending.disclosure.element.matches(TOOL) && preferences.sidebars))) animateDisclosure(pending.disclosure);
    if (preferences.trees && pending.tree && treeTarget?.isConnected) animateTree(pending.tree, treeTarget);
    // Refresh after a commit so asynchronous directory loads can animate once
    // without replaying previous rows. Ignore animation-generated ghost nodes.
    const disclosure = pending.disclosure;
    const nextChildren = disclosure ? Array.from(disclosure.element.children) : [];
    const disclosureChanged = disclosure && (nextChildren.length !== disclosure.children.length || nextChildren.some((child, index) => child !== disclosure.children[index]));
    const nextTree = pending.tree && treeTarget?.isConnected ? captureTree(treeTarget) : null;
    pending = {
      panels: nextPanels,
      panes: pending.paneMotion ? currentPanes : pending.panes,
      paneMotion: pending.paneMotion && !paneChanged,
      disclosure: disclosureChanged ? captureDisclosure(disclosure.element) : disclosure,
      tree: nextTree ?? pending.tree,
    };
    if (layoutPolling > 0 && active.size === 0) { layoutPolling--; schedule(); }
    else layoutPolling = 0;
  };
  const schedule = () => { if (pending && canAnimate() && !frame) frame = window.requestAnimationFrame(flush); };
  const observer = new MutationObserver(records => {
    schedule();
    // Host spinners update a transform every frame. Those leaf style writes
    // must not scan/clone tabs or re-measure the entire workspace continuously.
    if (records.some(record => {
      const target = elementOf(record.target);
      if (!target || target.closest('[data-native-polish-ghost]')) return false;
      if (record.type === 'childList' || record.attributeName === 'data-status-bucket') return true;
      if (target.matches(TAB)) {
        window.clearTimeout(nativeFocusTimer);
        nativeFocusTimer = window.setTimeout(() => updateNativeChrome(), 200);
        return true;
      }
      return target.matches(FLOATING + ', ' + PANE) || Boolean(target.querySelector(PANE));
    })) scheduleAmbient();
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'aria-hidden', 'aria-expanded', 'aria-selected', 'aria-busy', 'data-status-bucket'] });
  const begin = (event: Event) => {
    updateNativeChrome(elementOf(event.target));
    if (!canAnimate()) return;
    if (event.key) {
      if (event.repeat) return;
      const shortcut = (event.metaKey || event.ctrlKey) && ['b', 'e', '.', '`'].includes(event.key.toLowerCase());
      if (!shortcut && !['Enter', ' '].includes(event.key)) return;
    }
    const target = elementOf(event.target);
    if (target?.closest('[data-native-polish-ghost]')) return;
    // Finish interrupted motion before measuring the next layout. No delayed
    // input handlers: the host receives the original click/key immediately.
    stopAll();
    refreshAmbient(false);
    if (!event.key && event.clientX !== undefined && event.clientY !== undefined) pointerOrigin = { x: event.clientX, y: event.clientY };
    layoutPolling = 0;
    treeTarget = target;
    pending = capture(target);
    window.clearTimeout(deadline);
    deadline = window.setTimeout(() => { pending = null; treeTarget = null; }, 900);
    schedule();
  };
  const onScroll: Listener = () => { quietUntil = Date.now() + 350; pending = null; treeTarget = null; stopAll(); scheduleAmbient(); };
  const onPointerMove: Listener = event => {
    if (!pointerOrigin || event.buttons !== 1) return;
    if (Math.abs((event.clientX ?? pointerOrigin.x) - pointerOrigin.x) + Math.abs((event.clientY ?? pointerOrigin.y) - pointerOrigin.y) < 6) return;
    quietUntil = Date.now() + 250;
    pending = null; treeTarget = null; stopAll();
  };
  const onReduce = () => { updateMotionFlags(); if (reduceMotion.matches) { pending = null; stopAll(); refreshAmbient(false); } };
  const unsubscribe = subscribePreferences(() => {
    try { window.localStorage.setItem(PREF_KEY, JSON.stringify(getPreferences())); } catch { /* optional persistence */ }
    pending = null; stopAll(); updateMotionFlags(); refreshAmbient(false);
  });
  // RN Pressable / gesture handlers may commit on pointerup, before the DOM
  // click arrives. Measuring in click capture sees the final layout already.
  // Pointerdown establishes the old layout; click is only an AX fallback.
  const onCommit: Listener = (event) => {
    pointerOrigin = null;
    if (Date.now() < quietUntil) { refreshAmbient(false); return; }
    if (!pending) begin(event);
    // Layout may change in a React commit after pointerup or click. Poll for a
    // short bounded interval as well as observing class/style/child changes.
    // This also covers CSS stylesheet updates, which are not DOM mutations.
    layoutPolling = 12;
    schedule(); scheduleAmbient();
  };
  const onClick: Listener = onCommit;
  document.addEventListener('pointerdown', begin, true);
  document.addEventListener('pointerup', onCommit, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', begin, true);
  document.addEventListener('wheel', onScroll, true);
  document.addEventListener('focusin', onNativeFocus, true);
  document.addEventListener('visibilitychange', onNativeWindow);
  window.addEventListener('focus', onNativeWindow);
  window.addEventListener('blur', onNativeWindow);
  reduceMotion.addEventListener('change', onReduce);
  return () => {
    disposed = true;
    document.body.removeAttribute("data-native-polish");
    for (const key of ['controls', 'tabs', 'trees', 'states', 'motion', 'chrome', 'window-active']) document.body.removeAttribute(`data-native-polish-${key}`);
    for (const pane of all(document.body, PANE)) pane.removeAttribute('data-native-polish-pane-active');
    focusColor.remove();
    stylesheet.remove();
    for (const cleanup of decorations.values()) cleanup();
    decorations.clear();
    observer.disconnect(); unsubscribe();
    document.removeEventListener('pointerdown', begin, true);
    document.removeEventListener('pointerup', onCommit, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', begin, true);
    document.removeEventListener('wheel', onScroll, true);
    document.removeEventListener('focusin', onNativeFocus, true);
    document.removeEventListener('visibilitychange', onNativeWindow);
    window.removeEventListener('focus', onNativeWindow);
    window.removeEventListener('blur', onNativeWindow);
    reduceMotion.removeEventListener('change', onReduce);
    window.clearTimeout(deadline); window.cancelAnimationFrame(frame); window.cancelAnimationFrame(passiveFrame);
    window.clearTimeout(nativeFocusTimer); window.clearTimeout(nativeWindowTimer);
    tabRows.clear(); floating.clear(); paneBaseline.clear(); iconStates.clear(); toolStates.clear(); agentStates.clear();
    pending = null; treeTarget = null; stopAll();
  };
}
