/* Web-only boundary feedback. Native scrolling owns scrollTop, inertia and
 * virtualized history. No event is cancelled and no content is reparented. */
interface Style {
  getPropertyValue(key: string): string;
  getPropertyPriority(key: string): string;
  setProperty(key: string, value: string, priority?: string): void;
  removeProperty(key: string): void;
}
interface Element {
  nodeType: number; parentElement: Element | null; children: ArrayLike<Element>;
  isConnected: boolean; style: Style;
  scrollTop: number; scrollHeight: number; clientHeight: number;
  closest(selector: string): Element | null;
  querySelectorAll(selector: string): ArrayLike<Element>;
  getAttribute(key: string): string | null;
  setAttribute(key: string, value: string): void;
  removeAttribute(key: string): void;
}
interface Input {
  target: Element | null; deltaY?: number; deltaX?: number; deltaMode?: number;
  ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; pointerType?: string;
  touches?: ArrayLike<{ clientX: number; clientY: number }>;
}
type Listener = (event: Input) => void;
declare const document: {
  body: Element;
  addEventListener(type: string, listener: Listener, options: { capture: boolean; passive: boolean }): void;
  removeEventListener(type: string, listener: Listener, capture: boolean): void;
};
declare const window: {
  CSS?: { supports(property: string, value: string): boolean };
  navigator: { userAgent: string };
  getComputedStyle(el: Element): Style;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(id: number): void;
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
};

const SURFACES = '[data-testid="agent-chat-scroll"], [data-testid="sidebar-project-workspace-list-scroll"], [data-testid="sidebar-status-list-scroll"], [data-testid="file-explorer-tree-scroll"], [data-testid="changes-file-tree"]';
const MARKER = 'data-native-polish-elastic';
const OFFSET = '--native-polish-elastic-offset';
const COEFFICIENT = .55;
interface Spring {
  scroll: Element; content: Element; pull: number; position: number; velocity: number;
  lastInput: number; touching: boolean; top: number; height: number;
  owners: Element[]; children: Element[]; translations: Map<Element, string>; restore(): void; written: string;
}
export function installElasticScroll(options: { enabled(): boolean; quick(): boolean; onRest(): void }) {
  const springs = new Map<Element, Spring>();
  const boundaries = new Map<Element, { value: string; priority: string; written: string }>();
  const wheelGestures = new WeakMap<Element, { time: number; magnitude: number; peak: number; decays: number; momentum: boolean; direction: number; edge: boolean }>();
  let frame = 0;
  let previousTime = 0;
  let disposed = false;
  let touch: { scroll: Element; x: number; y: number } | null = null;
  // macOS browsers already have compositor-driven platform rubber banding.
  // Electron requires a main-process scrollBounce option, outside this plugin.
  const native = /Macintosh|Mac OS X|iPhone|iPad/.test(window.navigator.userAgent) && !/Electron\//.test(window.navigator.userAgent)
    && window.CSS?.supports('overscroll-behavior-y', 'contain') === true;
  const supported = native || (window.CSS?.supports('translate', '0 1px') === true && window.CSS.supports('overflow', 'clip'));
  const scrollable = (el: Element) => /^(auto|scroll)$/.test(window.getComputedStyle(el).getPropertyValue('overflow-y'));
  function boundary(scroll: Element) {
    if (boundaries.has(scroll)) return;
    const written = native ? 'contain' : 'none';
    boundaries.set(scroll, { value: scroll.style.getPropertyValue('overscroll-behavior-y'), priority: scroll.style.getPropertyPriority('overscroll-behavior-y'), written });
    // Native mode retains the platform bounce and stops pane scroll chaining.
    // The fallback suppresses a second compositor bounce underneath its offset.
    scroll.style.setProperty('overscroll-behavior-y', written);
  }
  function restoreBoundary(scroll: Element) {
    const old = boundaries.get(scroll);
    if (old && scroll.style.getPropertyValue('overscroll-behavior-y') === old.written) {
      if (old.value) scroll.style.setProperty('overscroll-behavior-y', old.value, old.priority);
      else scroll.style.removeProperty('overscroll-behavior-y');
    }
    boundaries.delete(scroll);
  }
  function finish(state: Spring) {
    state.restore();
    state.content.removeAttribute(MARKER);
    springs.delete(state.scroll);
    options.onRest();
  }
  function reset() {
    touch = null;
    for (const state of Array.from(springs.values())) finish(state);
    window.cancelAnimationFrame(frame); frame = 0; previousTime = 0;
  }
  function refresh() {
    if (!supported || !options.enabled()) {
      reset();
      for (const scroll of Array.from(boundaries.keys())) restoreBoundary(scroll);
      return;
    }
    const live = new Set(Array.from(document.body.querySelectorAll(SURFACES)).filter(el => !el.closest('[data-native-polish-ghost]') && scrollable(el)));
    for (const scroll of live) boundary(scroll);
    for (const scroll of Array.from(boundaries.keys())) if (!live.has(scroll)) {
      const state = springs.get(scroll);
      if (state) finish(state);
      restoreBoundary(scroll);
    }
  }
  function owner(target: Element | null): Element | null {
    let el = target?.nodeType === 1 ? target : target?.parentElement ?? null;
    const scope = el?.closest(SURFACES);
    if (!scope || scope.closest('[data-native-polish-ghost]')) return null;
    while (el) {
      // An inner code/detail scroller keeps its own boundary behavior.
      if (scrollable(el)) return el === scope ? el : null;
      if (el === scope) break;
      el = el.parentElement;
    }
    return null;
  }
  function boxChildren(content: Element): Element[] {
    const result: Element[] = [];
    function visit(el: Element, depth: number) {
      if (depth > 8 || result.length > 512) return;
      if (window.getComputedStyle(el).getPropertyValue('display') === 'contents') {
        for (const child of Array.from(el.children)) visit(child, depth + 1);
      } else result.push(el);
    }
    for (const child of Array.from(content.children)) visit(child, 0);
    return result.length > 512 ? [] : result;
  }
  function styles(el: Element, values: Record<string, string>) {
    const previous = Object.keys(values).map(key => [key, el.style.getPropertyValue(key), el.style.getPropertyPriority(key)]);
    const written = new Map<string, string>();
    for (const [key, value] of Object.entries(values)) {
      el.style.setProperty(key, value); written.set(key, el.style.getPropertyValue(key));
    }
    return () => {
      for (const [key, value, priority] of previous) {
        if (el.style.getPropertyValue(key) !== written.get(key)) continue;
        if (value) el.style.setProperty(key, value, priority);
        else el.style.removeProperty(key);
      }
    };
  }
  function tick() {
    frame = 0;
    const now = Date.now();
    const dt = Math.min(32, Math.max(1, previousTime ? now - previousTime : 16)) / 1000;
    previousTime = now;
    for (const state of Array.from(springs.values())) {
      if (!options.enabled() || !state.scroll.isConnected || !state.content.isConnected
        || Array.from(state.scroll.children)[0] !== state.content
        || state.children.length !== state.content.children.length || state.children.some((el, index) => state.content.children[index] !== el)
        || Math.abs(state.scroll.scrollTop - state.top) > 2 || Math.abs(state.scroll.scrollHeight - state.height) > 2
        || state.content.style.getPropertyValue(OFFSET) !== state.written
        || state.owners.some(el => !el.isConnected || el.style.getPropertyValue('translate') !== state.translations.get(el))) { finish(state); continue; }
      // Pulling is direct manipulation, with no easing/lag. Only release runs
      // the spring; it is critically damped, so it returns without wobbling.
      const held = state.touching || now - state.lastInput < 24;
      if (held) continue;
      const frequency = options.quick() ? 32 : 28;
      const stiffness = frequency * frequency;
      const damping = 2 * frequency;
      // Bounded substeps keep the spring stable at low frame rates.
      const steps = Math.ceil(dt / .008);
      for (let i = 0; i < steps; i++) {
        state.velocity += (-stiffness * state.position - damping * state.velocity) * dt / steps;
        state.position += state.velocity * dt / steps;
      }
      if (Math.abs(state.position) < .15 && Math.abs(state.velocity) < 1) { finish(state); continue; }
      state.written = `${state.position.toFixed(3)}px`;
      state.content.style.setProperty(OFFSET, state.written);
    }
    if (springs.size) frame = window.requestAnimationFrame(tick);
    else previousTime = 0;
  }
  function pull(scroll: Element, delta: number, touching: boolean) {
    const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const outward = (delta < 0 && scroll.scrollTop <= 1) || (delta > 0 && scroll.scrollTop >= max - 1);
    const current = springs.get(scroll);
    if (!outward) { if (current) finish(current); return; }
    const content = Array.from(scroll.children)[0];
    if (!content || scroll.clientHeight < 2 || !content.isConnected) return;
    let state = current;
    if (!state) {
      if (window.getComputedStyle(content).getPropertyValue('display') === 'contents') return;
      const owners = boxChildren(content);
      if (!owners.length || owners.some(el => {
        const translate = window.getComputedStyle(el).getPropertyValue('translate');
        return translate && translate !== 'none' && !/^0(?:px)?(?: 0(?:px)?){0,2}$/.test(translate);
      })) return;
      boundary(scroll);
      const top = scroll.scrollTop;
      const height = scroll.scrollHeight;
      // Clip inside the unchanged content box, so translated descendants do
      // not extend scrollHeight or disturb virtualizer/follow-output offsets.
      const restoreClip = styles(content, { 'overflow-x': 'clip', 'overflow-y': 'clip' });
      const restoreOwners = owners.map(el => styles(el, { translate: `0 var(${OFFSET})` }));
      const value = content.style.getPropertyValue(OFFSET);
      const priority = content.style.getPropertyPriority(OFFSET);
      state = {
        scroll, content, pull: 0, position: 0, velocity: 0, lastInput: 0, touching,
        top, height,
        owners, children: Array.from(content.children), translations: new Map(owners.map(el => [el, el.style.getPropertyValue('translate')])),
        written: '0px', restore: () => {
          for (const restore of restoreOwners) restore();
          restoreClip();
          if (content.style.getPropertyValue(OFFSET) !== state?.written) return;
          if (value) content.style.setProperty(OFFSET, value, priority);
          else content.style.removeProperty(OFFSET);
        },
      };
      content.style.setProperty(OFFSET, state.written);
      if (Math.abs(scroll.scrollHeight - height) > 2 || Math.abs(scroll.scrollTop - top) > 2) { state.restore(); return; }
      content.setAttribute(MARKER, '');
      springs.set(scroll, state);
    }
    // Reconstruct pull from the current visible offset. New input during a
    // return cannot jump back to an earlier gesture's maximum displacement.
    const extent = Math.min(100, Math.max(36, scroll.clientHeight * .18));
    const offset = Math.min(extent - .01, Math.abs(state.position));
    state.pull = Math.sign(state.position) * extent * offset / (COEFFICIENT * (extent - offset));
    state.pull = Math.max(-extent * 8, Math.min(extent * 8, state.pull - Math.max(-120, Math.min(120, delta))));
    const distance = Math.abs(state.pull);
    state.position = Math.sign(state.pull) * COEFFICIENT * distance * extent / (extent + COEFFICIENT * distance);
    state.velocity = 0;
    state.written = `${state.position.toFixed(3)}px`;
    state.content.style.setProperty(OFFSET, state.written);
    state.lastInput = Date.now(); state.touching = touching;
    if (!frame) { previousTime = 0; frame = window.requestAnimationFrame(tick); }
  }
  const wheel: Listener = event => {
    if (native || !supported || !options.enabled() || event.ctrlKey || event.metaKey || event.shiftKey || Math.abs(event.deltaX ?? 0) >= Math.abs(event.deltaY ?? 0)) return;
    const scroll = owner(event.target);
    if (!scroll) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1;
    const delta = (event.deltaY ?? 0) * unit;
    const magnitude = Math.abs(delta);
    const direction = Math.sign(delta);
    const now = Date.now();
    const previous = wheelGestures.get(scroll);
    const same = previous && now - previous.time < 100 && direction === previous.direction;
    const decays = same && magnitude < previous.magnitude * .98 ? previous.decays + 1 : 0;
    const peak = same ? Math.max(previous.peak, magnitude) : magnitude;
    // DOM wheel events omit macOS momentum phases. A sustained decaying tail
    // is treated as release, rather than repeatedly stretching the content.
    const renewed = same && magnitude > previous.magnitude * 1.25 + 1;
    const momentum = same && !renewed && (previous.momentum || (decays >= 3 && magnitude < peak * .65));
    const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const edge = (delta < 0 && scroll.scrollTop <= 1) || (delta > 0 && scroll.scrollTop >= max - 1);
    wheelGestures.set(scroll, { time: now, magnitude, peak, decays, momentum: Boolean(momentum), direction, edge });
    // A fling may hit the edge during its momentum phase. Give that collision
    // one displacement, then let it return while the remaining tail passes.
    if (momentum && (!edge || previous?.edge)) return;
    pull(scroll, delta, false);
  };
  const touchStart: Listener = event => {
    reset();
    if (native || !supported || !options.enabled() || event.touches?.length !== 1) return;
    const scroll = owner(event.target);
    if (scroll) touch = { scroll, x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const touchMove: Listener = event => {
    if (!touch || !options.enabled() || event.touches?.length !== 1) { reset(); return; }
    const finger = event.touches[0];
    const dy = touch.y - finger.clientY;
    const dx = touch.x - finger.clientX;
    touch.x = finger.clientX; touch.y = finger.clientY;
    if (Math.abs(dy) > Math.abs(dx)) pull(touch.scroll, dy, true);
  };
  const touchEnd: Listener = () => {
    if (touch) {
      const state = springs.get(touch.scroll);
      if (state) { state.touching = false; state.lastInput = 0; }
    }
    touch = null;
  };
  const interrupt: Listener = event => { if (event.pointerType !== 'touch') reset(); };
  const listeners: [string, Listener][] = [
    ['wheel', wheel], ['touchstart', touchStart], ['touchmove', touchMove], ['touchend', touchEnd],
    ['touchcancel', touchEnd], ['pointerdown', interrupt], ['keydown', reset],
  ];
  for (const [type, listener] of listeners) document.addEventListener(type, listener, { capture: true, passive: true });
  window.addEventListener('blur', reset);
  refresh();
  return {
    refresh, reset, isActive: () => springs.size > 0,
    dispose() {
      if (disposed) return;
      disposed = true; reset();
      for (const scroll of Array.from(boundaries.keys())) restoreBoundary(scroll);
      for (const [type, listener] of listeners) document.removeEventListener(type, listener, true);
      window.removeEventListener('blur', reset);
    },
  };
}
