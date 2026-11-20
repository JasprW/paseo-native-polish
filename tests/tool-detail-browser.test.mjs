import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createBrowserModuleLoader } from './browser-module-loader.mjs';

const compile = createBrowserModuleLoader((source, url) => {
  if (!url.pathname.endsWith('/client/web.ts')) return source;
  const seam = '    function timelineFor(chat, rows) {';
  assert.ok(source.includes(seam));
  return source.replace(seam, '    globalThis.testContentRise = { create: createContentRise, active: contentRises, riseFor, timelineRises, footerRises };\n' + seam);
});
const adapter = await compile(new URL('../client/web.ts', import.meta.url));
const preferences = await compile(new URL('../client/preferences.ts', import.meta.url));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {}),
});
try {
  const page = await browser.newPage();
  await page.setContent(`
    <div data-testid="tool-call-badge">
      <div>Tool</div><div><div id="box" style="overflow-y:auto;max-height:300px">
        <div id="content" style="height:40px">Initial</div>
      </div></div>
    </div>
  `);
  await page.addScriptTag({ type: 'module', content: `
    import { defaults, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.disposeMotion = installMotion();
  ` });
  await page.waitForFunction(() => typeof window.disposeMotion === 'function');
  const result = await page.evaluate(async () => {
    const box = document.getElementById('box');
    const content = document.getElementById('content');
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    content.style.height = '100px';
    content.textContent = 'Expanded';
    for (let i = 0; i < 10 && !box.getAnimations().length; i++) await frame();
    const animation = box.getAnimations()[0];
    if (!animation) throw new Error('Height animation did not start');
    animation.pause();
    animation.currentTime = 110;
    const inFlight = box.getBoundingClientRect().height;
    content.textContent = 'Updated with same height';
    await frame(); await frame();
    const sameTargetState = animation.playState;
    content.style.height = `${inFlight}px`;
    content.textContent = 'Updated to visible height';
    await frame(); await frame();
    const changedTargetState = animation.playState;
    const finalHeight = box.getBoundingClientRect().height;
    window.disposeMotion();
    return { inFlight, sameTargetState, changedTargetState, finalHeight };
  });
  assert.equal(result.sameTargetState, 'paused', 'unchanged destination keeps the current tween');
  assert.equal(result.changedTargetState, 'idle', 'a destination at the current height cancels the obsolete tween');
  assert.ok(Math.abs(result.finalHeight - result.inFlight) < 1, JSON.stringify(result));
  await page.close();

  const risePage = await browser.newPage();
  await risePage.setContent('<div id="content">Text</div>');
  await risePage.addScriptTag({ type: 'module', content: `
    import { defaults, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.disposeMotion = installMotion();
  ` });
  await risePage.waitForFunction(() => typeof window.disposeMotion === 'function');
  const rises = await risePage.evaluate(async () => {
    const content = document.getElementById('content');
    const { create, active } = window.testContentRise;
    const rise = create(content);
    const initial = active.size;
    rise.start(30);
    const running = active.has(rise);
    const deadline = performance.now() + 2000;
    while (active.has(rise) && performance.now() < deadline) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const settled = active.has(rise);
    rise.prepare(30);
    const restarted = active.has(rise);
    rise.cancel();
    const cancelled = active.has(rise);
    rise.start(30);
    content.remove();
    await new Promise(resolve => requestAnimationFrame(resolve));
    const detached = active.has(rise);
    window.disposeMotion();
    return { initial, running, settled, restarted, cancelled, detached };
  });
  assert.deepEqual(rises, { initial: 0, running: true, settled: false, restarted: true, cancelled: false, detached: false });
  await risePage.close();

  const summaryPage = await browser.newPage();
  await summaryPage.setContent(`
    <div data-testid="agent-chat-scroll" style="height:400px;overflow:auto">
      <div data-history-row-id="history">
        <div data-testid="tool-call-group" data-summary="history"><div><div><span>Icon</span><div><span>Earlier summary</span></div></div></div></div>
      </div>
      <div data-history-row-id="current">Thinking</div>
      <div data-testid="turn-working-indicator">Working</div>
    </div>
  `);
  await summaryPage.addScriptTag({ type: 'module', content: `
    import { defaults, getPreferences, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false, messages: false });
    window.summaryPreferences = { getPreferences, setPreferences };
    window.summaryAnimations = [];
    window.labelAnimations = [];
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      if (this.hasAttribute('data-summary')) window.summaryAnimations.push(this.getAttribute('data-summary'));
      if (this.hasAttribute('data-row-entry')) window.summaryAnimations.push('row');
      if (this.hasAttribute('data-label') || this.getAttribute('data-native-polish-shimmer-text') === 'primary') {
        window.labelAnimations.push({
          target: this.hasAttribute('data-label') ? 'label' : 'shimmer',
          duration: options.duration,
          path: frames.map(frame => frame.transform),
        });
      }
      return originalAnimate.call(this, frames, options);
    };
    window.disposeMotion = installMotion();
  ` });
  await summaryPage.waitForFunction(() => typeof window.disposeMotion === 'function');
  await summaryPage.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
  const summary = await summaryPage.evaluate(async () => {
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const row = document.querySelector('[data-history-row-id="current"]');
    const insertGroup = () => {
      const group = document.createElement('div');
      group.dataset.testid = 'tool-call-group';
      group.dataset.summary = 'live';
      group.innerHTML = '<div><div><span>Icon</span><div><span data-label="live">Ran 1 command</span></div></div></div>';
      row.appendChild(group);
      return group;
    };
    const group = insertGroup();
    await frame(); await frame();
    const entered = [...window.summaryAnimations];
    group.remove();
    await frame(); await frame();
    insertGroup();
    await frame(); await frame();
    const remounted = [...window.summaryAnimations];
    row.querySelector('[data-label="live"]').textContent = 'Ran 2 commands';
    await frame(); await frame();
    const labelUpdates = [...window.labelAnimations];
    const { getPreferences, setPreferences } = window.summaryPreferences;
    setPreferences({ ...getPreferences(), timeline: false });
    const disabledRow = document.createElement('div');
    disabledRow.setAttribute('data-history-row-id', 'disabled');
    disabledRow.innerHTML = '<div data-testid="tool-call-group" data-summary="disabled"><div><div><span>Icon</span><div><span>Ran 2 commands</span></div></div></div></div>';
    row.parentElement.insertBefore(disabledRow, document.querySelector('[data-testid="turn-working-indicator"]'));
    await frame(); await frame();
    setPreferences({ ...getPreferences(), timeline: true });
    await frame(); await frame();
    const afterDisabled = [...window.summaryAnimations];
    setPreferences({ ...getPreferences(), messages: true });
    const newRow = document.createElement('div');
    newRow.setAttribute('data-history-row-id', 'new-row');
    newRow.setAttribute('data-row-entry', '');
    newRow.innerHTML = '<div data-testid="tool-call-group" data-summary="new-row-group"><div><div><span>Icon</span><div><span>Ran 3 commands</span></div></div></div></div>';
    row.parentElement.insertBefore(newRow, document.querySelector('[data-testid="turn-working-indicator"]'));
    await frame(); await frame();
    const withRowEntrance = [...window.summaryAnimations];
    return { entered, remounted, labelUpdates, afterDisabled, withRowEntrance };
  });
  assert.deepEqual(summary.entered, ['live'], 'only the new live summary eases in');
  assert.deepEqual(summary.remounted, ['live'], 'a remounted summary does not replay its entrance');
  assert.deepEqual(summary.labelUpdates, [
    { target: 'label', duration: 320, path: ['translateY(6px)', 'translateY(0)'] },
    { target: 'shimmer', duration: 320, path: ['translateY(6px)', 'translateY(0)'] },
  ], 'summary text and shimmer rise together at the slower pace');
  assert.deepEqual(summary.afterDisabled, ['live'], 'disabled timeline motion does not replay when re-enabled');
  assert.deepEqual(summary.withRowEntrance, ['live', 'row'], 'the row entrance owns motion when both arrive together');
  const occlusion = await summaryPage.evaluate(async () => {
    const chat = document.querySelector('[data-testid="agent-chat-scroll"]');
    const [coveredLabel, uncoveredLabel] = Array.from(chat.querySelectorAll('[data-summary]'))
      .slice(0, 2).map(tool => tool.querySelector('span + div'));
    const hasShimmer = label => Boolean(label.querySelector('[data-native-polish-shimmer-overlay]'));
    for (const label of [coveredLabel, uncoveredLabel]) {
      label.firstElementChild.style.setProperty('--paseo-shimmer', '1');
    }
    chat.setAttribute('aria-modal', 'true');
    const descendant = document.createElement('span');
    descendant.setAttribute('aria-modal', 'true');
    descendant.style.cssText = 'display:inline-block;width:30px;height:12px';
    uncoveredLabel.appendChild(descendant);
    const sheet = document.createElement('div');
    const bounds = coveredLabel.getBoundingClientRect();
    sheet.style.cssText = `position:fixed;top:${bounds.top}px;left:${bounds.left}px;width:20px;height:12px`;
    sheet.innerHTML = '<div><button data-testid="tool-call-sheet-close" style="width:10px;height:10px;padding:0"></button></div>';
    const originalQuery = document.body.querySelectorAll;
    let sheetScans = 0;
    document.body.querySelectorAll = function(selector) {
      if (selector.includes('[data-testid="tool-call-sheet-close"]')) sheetScans++;
      return originalQuery.call(this, selector);
    };
    try {
      chat.appendChild(sheet);
      await Promise.resolve();
      return { covered: hasShimmer(coveredLabel), uncovered: hasShimmer(uncoveredLabel), sheetScans };
    } finally {
      delete document.body.querySelectorAll;
      window.disposeMotion();
    }
  });
  assert.deepEqual(occlusion, { covered: false, uncovered: true, sheetScans: 1 },
    'the tool update scans sheets once and excludes ancestor and descendant surfaces');
  await summaryPage.close();

  for (const { wrappedHeader, badge, nested, omitAria, displayContents } of [
    { wrappedHeader: false, badge: false, nested: false },
    { wrappedHeader: true, badge: false, nested: false },
    { wrappedHeader: false, badge: true, nested: false },
    { wrappedHeader: true, badge: true, nested: false },
    { wrappedHeader: true, badge: true, nested: true },
    { wrappedHeader: true, badge: false, nested: false, omitAria: true },
    { wrappedHeader: true, badge: false, nested: false, omitAria: true, displayContents: true },
  ]) {
    const disclosurePage = await browser.newPage();
    await disclosurePage.setContent(`
      <style id="unistyles-web">.unistyles_abc123 { color: rgb(1, 2, 3); }</style>
      <div data-testid="agent-chat-scroll" style="height:400px;overflow:auto">
        <div data-history-row-id="group">
          ${nested ? '<div data-testid="tool-call-group"><div role="button" aria-expanded="true">Expanded group</div><div>' : ''}
          <div data-testid="${badge ? 'tool-call-badge' : 'tool-call-group'}" id="group">
            ${wrappedHeader ? '<div id="header">' : ''}${displayContents ? '<div style="display:contents">' : ''}<div role="button" ${omitAria ? '' : 'aria-expanded="false"'} id="toggle"><div><span>Icon</span><div><span>${badge ? 'Thinking' : 'Ran 1 command'}</span></div></div></div>${displayContents ? '</div>' : ''}${wrappedHeader ? '<button data-testid="tool-call-open-file">Open file</button></div>' : ''}
          </div>
          ${nested ? '</div></div>' : ''}
        </div>
      </div>
    `);
    await disclosurePage.addScriptTag({ type: 'module', content: `
      import { defaults, setPreferences } from '${preferences}';
      import { installMotion } from '${adapter}';
      setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
      window.disclosureAnimations = [];
      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function(frames, options) {
        if (this.id === 'group') window.disclosureAnimations.push(frames.map(frame => frame.height));
        return originalAnimate.call(this, frames, options);
      };
      const group = document.getElementById('group');
      const toggle = document.getElementById('toggle');
      toggle.addEventListener('click', () => {
        const expanded = group.children.length > 1;
        if (toggle.hasAttribute('aria-expanded')) toggle.setAttribute('aria-expanded', String(!expanded));
        if (expanded) {
          group.lastElementChild.remove();
          document.getElementById('unistyles-web').textContent = '';
        }
        else {
          const details = document.createElement('div');
          details.innerHTML = '<input value="excluded"><div class="scroller" style="height:60px;overflow:auto"><div class="unistyles_abc123" style="height:200px">Tool details</div></div>';
          details.style.height = '100px';
          group.appendChild(details);
        }
      });
      window.disposeMotion = installMotion();
    ` });
    await disclosurePage.waitForFunction(() => typeof window.disposeMotion === 'function');
    await disclosurePage.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
    const disclosure = await disclosurePage.evaluate(async () => {
      const toggle = document.getElementById('toggle');
      const click = () => {
        toggle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        toggle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      };
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      click();
      await frame(); await frame();
      await new Promise(resolve => setTimeout(resolve, 300));
      document.querySelector('#group .scroller').scrollTop = 90;
      click();
      await frame(); await frame();
      const animations = [...window.disclosureAnimations];
      const copy = document.querySelector('#group > [data-native-polish-ghost]');
      const hasInertCopy = Boolean(copy?.hasAttribute('inert') && copy.getAttribute('aria-hidden') === 'true');
      const scrollTop = copy?.querySelector('.scroller')?.scrollTop;
      const color = copy ? getComputedStyle(copy.querySelector('.unistyles_abc123')).color : null;
      const stripped = Boolean(copy && !copy.querySelector('input, [id], [data-testid]'));
      await new Promise(resolve => setTimeout(resolve, 300));
      const cleaned = !document.querySelector('#group > [data-native-polish-ghost]') && !document.querySelector('[data-native-polish-style="exit"]');
      click();
      await new Promise(resolve => setTimeout(resolve, 300));
      click();
      await frame(); await frame();
      click();
      await frame(); await frame();
      const reopenedCleanly = !document.querySelector('#group > [data-native-polish-ghost]') && document.getElementById('group').children.length > 1;
      window.disposeMotion();
      return { animations, hasInertCopy, scrollTop, color, stripped, cleaned, reopenedCleanly };
    });
    assert.equal(disclosure.animations.length, 2, `opening and closing should animate: ${JSON.stringify(disclosure)}`);
    assert.ok(parseFloat(disclosure.animations[0][0]) < parseFloat(disclosure.animations[0][1]));
    assert.ok(parseFloat(disclosure.animations[1][0]) > parseFloat(disclosure.animations[1][1]));
    assert.ok(disclosure.hasInertCopy, 'closing keeps inert details within the collapsing group');
    assert.equal(disclosure.scrollTop, 90, 'the closing copy retains nested scroll position');
    assert.equal(disclosure.color, 'rgb(1, 2, 3)', 'the closing copy keeps styles removed by the host');
    assert.ok(disclosure.stripped, 'the closing copy has no interactive inputs or duplicate identifiers');
    assert.ok(disclosure.cleaned, 'the copy and restored styles are removed after collapse');
    assert.ok(disclosure.reopenedCleanly, 'reopening cancels the closing copy');
    await disclosurePage.close();
  }

  const messagePage = await browser.newPage();
  await messagePage.setContent(`
    <div data-testid="agent-chat-scroll" style="height:300px;overflow:auto">
      <div data-history-row-id="long"><div data-testid="user-message"><div id="bubble"><div id="preview"><div style="height:420px"><div data-message-text="true">Full user message</div></div></div></div></div></div>
      <div data-history-row-id="legacy"><div data-testid="user-message"><div><div data-native-polish-precondense-preview="true"><span>Legacy host content</span><div data-native-polish-precondense-fade="true" data-native-polish-ghost></div></div><div data-native-polish-precondense-toggle="true" data-native-polish-ghost>Show more</div><button id="legacy-host-toggle">Host control</button></div></div></div>
    </div>
  `);
  await messagePage.addScriptTag({ type: 'module', content: `
    import { defaults, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.disposeMotion = installMotion();
  ` });
  await messagePage.waitForFunction(() => typeof window.disposeMotion === 'function');
  const message = await messagePage.evaluate(async () => {
    const preview = document.getElementById('preview');
    const before = { height: preview.getBoundingClientRect().height, marker: preview.hasAttribute('data-native-polish-precondense-preview'), injected: document.querySelectorAll('[data-native-polish-precondense-toggle], [data-native-polish-precondense-fade]').length };
    const toggle = document.createElement('button');
    toggle.textContent = 'Host toggle';
    document.getElementById('bubble').appendChild(toggle);
    const other = document.createElement('div');
    other.setAttribute('data-history-row-id', 'without-toggle');
    other.innerHTML = '<div data-testid="user-message"><div><div id="second-preview"><div style="height:420px"><div data-message-text="true">Another full message</div></div></div></div></div>';
    document.querySelector('[data-testid="agent-chat-scroll"]').appendChild(other);
    await new Promise(resolve => requestAnimationFrame(resolve));
    window.disposeMotion();
    return { before, hostText: document.querySelector('[data-message-text]').textContent, hostToggle: toggle.isConnected, legacyHost: document.getElementById('legacy-host-toggle')?.textContent, otherHeight: document.getElementById('second-preview').getBoundingClientRect().height, markers: document.querySelectorAll('[data-native-polish-precondense-preview], [data-native-polish-precondense-toggle], [data-native-polish-precondense-fade]').length };
  });
  assert.ok(message.before.height >= 420 && !message.before.marker && message.before.injected === 0, 'long messages stay readable without a host toggle');
  assert.deepEqual({ text: message.hostText, toggle: message.hostToggle, markers: message.markers }, { text: 'Full user message', toggle: true, markers: 0 });
  assert.equal(message.legacyHost, 'Host control', 'legacy plugin markers are removed without removing host controls');
  assert.ok(message.otherHeight >= 420, 'disposal leaves messages without a host toggle readable');
  await messagePage.close();

  const revealPage = await browser.newPage();
  await revealPage.setContent(`
    <div data-testid="native-polish-streaming-assistant" id="stream">Alpha</div>
    <div data-testid="tool-call-badge">
      <div><span style="--paseo-shimmer:1">Thinking</span></div>
      <div id="thinking"><div id="thought">First thought</div></div>
    </div>
  `);
  await revealPage.addScriptTag({ type: 'module', content: `
    import { defaults, getPreferences, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(...args) {
      const animation = animate.apply(this, args);
      const overlay = this.parentElement;
      if (overlay?.hasAttribute('data-native-polish-ghost') && overlay.children[1] === this) {
        // Hold the tint from creation. Its completion owns overlay cleanup.
        animation.pause();
        animation.currentTime = 0;
      }
      return animation;
    };
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.disposeMotion = installMotion();
    window.setRevealPreferences = values => setPreferences({ ...getPreferences(), ...values });
  ` });
  await revealPage.waitForFunction(() => typeof window.disposeMotion === 'function');
  const reveal = await revealPage.evaluate(async () => {
    const host = document.getElementById('stream');
    const thinking = document.getElementById('thinking');
    const thought = document.getElementById('thought');
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const roots = (surface = host) => Array.from(surface.querySelectorAll(':scope > [data-native-polish-ghost]'));
    const timings = surface => {
      const [blur, tint] = roots(surface)[0].children;
      return [blur.firstElementChild, tint].map(el => el.getAnimations()[0].effect.getTiming().duration);
    };
    host.append(' bravo');
    thought.append(' continues');
    for (let i = 0; i < 10 && roots().length < 1; i++) await frame();
    const gentle = [timings(host), timings(thinking)];
    host.append(' charlie');
    for (let i = 0; i < 10 && roots().length < 2; i++) await frame();
    const overlays = roots();
    if (overlays.length !== 2) throw new Error(`Expected overlapping reveals, got ${overlays.length}`);
    overlays[0].children[1].getAnimations()[0].finish();
    await Promise.resolve();
    const firstFinished = { position: getComputedStyle(host).position, remaining: roots().length };
    overlays[1].children[1].getAnimations()[0].finish();
    await Promise.resolve();
    const lastFinished = { position: getComputedStyle(host).position, remaining: roots().length };
    host.append(' delta');
    for (let i = 0; i < 10 && roots().length < 1; i++) await frame();
    host.append(' echo');
    for (let i = 0; i < 10 && roots().length < 2; i++) await frame();
    const changedOverlays = roots();
    if (changedOverlays.length !== 2) throw new Error('Expected two reveals before host position change');
    host.style.position = 'absolute';
    for (const overlay of changedOverlays) overlay.children[1].getAnimations()[0].finish();
    await Promise.resolve();
    const hostPosition = host.style.position;
    host.style.position = '';
    window.setRevealPreferences({ pace: 'quick' });
    host.append(' foxtrot');
    thought.append(' on Quick');
    for (let i = 0; i < 10 && roots().length < 1; i++) await frame();
    const quick = [timings(host), timings(thinking)];
    const switches = [];
    for (const [messages, timeline] of [[false, false], [false, true], [true, false], [true, true]]) {
      window.setRevealPreferences({ messages, timeline });
      host.append(' new words');
      thought.append(' more thought');
      await frame(); await frame();
      switches.push([roots().length > 0, roots(thinking).length > 0]);
    }
    window.setRevealPreferences({ messages: true, timeline: true });
    host.append(' golf');
    for (let i = 0; i < 10 && roots().length < 1; i++) await frame();
    host.append(' hotel');
    for (let i = 0; i < 10 && roots().length < 2; i++) await frame();
    if (roots().length !== 2) throw new Error('Expected two reveals before disposal');
    window.disposeMotion();
    return { gentle, quick, switches, firstFinished, lastFinished, hostPosition, disposedPosition: getComputedStyle(host).position, disposedRoots: roots().length };
  });
  assert.deepEqual(reveal.gentle, [[400, 400], [400, 400]], 'Gentle uses 400 ms for both layers in assistant and Thinking text');
  assert.deepEqual(reveal.quick, [[200, 200], [200, 200]], 'switching to Quick uses 200 ms for both layers on the next text update');
  assert.deepEqual(reveal.switches, [[false, false], [false, true], [true, false], [true, true]],
    'New messages controls assistant text and Tool calls and thinking controls Thinking text');
  assert.deepEqual(reveal.firstFinished, { position: 'relative', remaining: 1 });
  assert.deepEqual(reveal.lastFinished, { position: 'static', remaining: 0 });
  assert.equal(reveal.hostPosition, 'absolute', 'release preserves a host position change');
  assert.equal(reveal.disposedPosition, 'static', 'disposal releases the shared position override');
  assert.equal(reveal.disposedRoots, 0, 'disposal removes all active reveals');
  await revealPage.close();

  const scrollPage = await browser.newPage();
  await scrollPage.setContent(`
    <div data-testid="agent-chat-scroll" id="chat" style="height:300px;overflow:auto">
      <div data-testid="agent-chat-content"><div data-testid="agent-chat-timeline" id="timeline"><div data-history-row-id="one">Message</div></div>
        <div id="footer"><div data-testid="turn-working-indicator">Working</div></div>
      </div>
    </div>
  `);
  await scrollPage.addScriptTag({ type: 'module', content: `
    import { defaults, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    const chat = document.getElementById('chat');
    let top = 500;
    Object.defineProperties(chat, {
      scrollTop: { configurable: true, get: () => top, set: value => { top = value; } },
      scrollHeight: { configurable: true, get: () => 800 },
      clientHeight: { configurable: true, get: () => 300 },
    });
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.disposeMotion = installMotion();
  ` });
  await scrollPage.waitForFunction(() => typeof window.disposeMotion === 'function');
  await scrollPage.waitForFunction(() => !document.getElementById('chat').hasAttribute('data-native-polish-hydrating'));
  const scroll = await scrollPage.evaluate(() => {
    const chat = document.getElementById('chat');
    const { riseFor, timelineRises, footerRises } = window.testContentRise;
    const timeline = riseFor(timelineRises, document.getElementById('timeline'));
    const footer = riseFor(footerRises, document.getElementById('footer'));
    timeline.start(30);
    footer.start(20);
    chat.dispatchEvent(new Event('scroll'));
    const bottom = [timeline.getOffset(), footer.getOffset()];
    chat.scrollTop = 495;
    chat.dispatchEvent(new Event('scroll'));
    const upward = [timeline.getOffset(), footer.getOffset()];
    window.disposeMotion();
    return { bottom, upward };
  });
  assert.deepEqual(scroll.bottom, [30, 20], 'bottom-follow scrolling retains active rises');
  assert.deepEqual(scroll.upward, [0, 0], 'scrolling upward cancels both rises');
  await scrollPage.close();
} finally {
  await browser.close();
}
