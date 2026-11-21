import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { compileBrowserModule as compile } from './browser-module-loader.mjs';

const adapter = await compile(new URL('../client/web.ts', import.meta.url));
const preferences = await compile(new URL('../client/preferences.ts', import.meta.url));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {}),
});
let releaseImage;
let releaseUserImage;
let releaseReducedImage;
const imageGate = new Promise(resolve => { releaseImage = resolve; });
try {
  const page = await browser.newPage();
  await page.route('https://image.test/*.png', async route => {
    if (route.request().url().endsWith('/failed.png')) { await route.abort('failed'); return; }
    await imageGate;
    await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5uoAAAAASUVORK5CYII=', 'base64') });
  });
  await page.setContent(`
    <div data-testid="agent-chat-scroll" style="height:900px;overflow:auto">
      <div data-history-row-id="history"><div data-testid="assistant-message"><div role="img" data-image="history" style="width:120px;height:80px"><img alt="Earlier image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" /></div></div></div>
      <div data-history-row-id="live"><div data-testid="native-polish-streaming-assistant" id="stream">Output</div></div>
      <div data-testid="turn-working-indicator">Working</div>
    </div>
  `);
  await page.addScriptTag({ type: 'module', content: `
    import { defaults, getPreferences, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.imagePreferences = { getPreferences, setPreferences };
    window.imageAnimations = [];
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      if (this.hasAttribute('data-image')) window.imageAnimations.push(this.getAttribute('data-image'));
      return originalAnimate.call(this, frames, options);
    };
    window.disposeMotion = installMotion();
  ` });
  await page.waitForFunction(() => typeof window.disposeMotion === 'function');
  await page.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
  const pending = await page.evaluate(async () => {
    const surface = document.createElement('div');
    surface.setAttribute('role', 'img');
    surface.setAttribute('data-image', 'live');
    surface.style.width = '120px';
    surface.style.height = '80px';
    const image = document.createElement('img');
    image.alt = 'New image';
    image.src = 'https://image.test/pending.png';
    surface.appendChild(image);
    document.getElementById('stream').appendChild(surface);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    return { loading: !image.complete, skeleton: Boolean(surface.querySelector('[data-native-polish-image-placeholder]')), animations: [...window.imageAnimations] };
  });
  assert.ok(pending.loading, 'the fixture holds the new image in its loading state');
  assert.ok(pending.skeleton, 'a loading image has a visible placeholder');
  assert.deepEqual(pending.animations, ['live'], 'the new image enters without replaying history');
  const nativeWebImage = await page.evaluate(async () => {
    const surface = document.createElement('div');
    surface.setAttribute('data-image', 'native-web');
    surface.style.width = '120px'; surface.style.height = '80px'; surface.style.position = 'relative';
    const painted = document.createElement('div');
    painted.style.position = 'absolute';
    painted.style.backgroundImage = 'url("https://image.test/native.png")';
    const image = document.createElement('img');
    image.style.opacity = '0';
    image.src = 'https://image.test/native.png';
    surface.append(painted, image);
    document.getElementById('stream').appendChild(surface);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    return { skeleton: Boolean(surface.querySelector('[data-native-polish-image-placeholder]')), animations: [...window.imageAnimations] };
  });
  assert.deepEqual(nativeWebImage, { skeleton: true, animations: ['live', 'native-web'] }, 'React Native Web image surfaces enter and show the placeholder');
  const hostSpinner = await page.evaluate(async () => {
    const surface = document.createElement('div');
    surface.setAttribute('role', 'img');
    surface.setAttribute('data-image', 'spinner');
    surface.style.width = '120px'; surface.style.height = '80px';
    const image = document.createElement('img');
    image.src = 'https://image.test/spinner.png';
    surface.appendChild(image);
    const spinner = document.createElement('div');
    spinner.setAttribute('role', 'progressbar');
    surface.appendChild(spinner);
    document.getElementById('stream').appendChild(surface);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    return { skeleton: Boolean(surface.querySelector('[data-native-polish-image-placeholder]')), spinner: spinner.isConnected, animations: [...window.imageAnimations] };
  });
  assert.deepEqual(hostSpinner, { skeleton: false, spinner: true, animations: ['live', 'native-web', 'spinner'] }, 'the host spinner is preserved without a duplicate placeholder');
  const waiting = await page.evaluate(async () => {
    const frame = document.createElement('div');
    frame.setAttribute('data-image', 'waiting');
    frame.style.cssText = 'width:120px;height:160px;min-height:160px;display:flex;align-items:center;justify-content:center';
    frame.innerHTML = '<div role="progressbar"></div>';
    document.getElementById('stream').appendChild(frame);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const before = [...window.imageAnimations];
    const surface = document.createElement('div');
    surface.setAttribute('role', 'img'); surface.setAttribute('data-image', 'waiting-image');
    surface.style.width = '120px'; surface.style.height = '80px';
    surface.innerHTML = '<img src="https://image.test/waiting.png" alt="Waiting image">';
    frame.replaceWith(surface);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    return { before, after: [...window.imageAnimations] };
  });
  assert.deepEqual(waiting, { before: ['live', 'native-web', 'spinner', 'waiting'], after: ['live', 'native-web', 'spinner', 'waiting'] }, 'the host image spinner enters once and hands off without replay');
  const unrelated = await page.evaluate(async () => {
    const spinner = document.createElement('div');
    spinner.setAttribute('role', 'progressbar');
    spinner.setAttribute('data-image', 'unrelated');
    spinner.style.width = '20px'; spinner.style.height = '20px';
    document.getElementById('stream').appendChild(spinner);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    return [...window.imageAnimations];
  });
  assert.deepEqual(unrelated, ['live', 'native-web', 'spinner', 'waiting'], 'unrelated progress indicators are not treated as image frames');
  releaseImage();
  await page.waitForFunction(() => document.querySelector('[data-image="live"] img')?.complete);
  await page.waitForFunction(() => !document.querySelector('[data-image="live"] [data-native-polish-image-placeholder]'));
  const remount = await page.evaluate(async () => {
    const original = document.querySelector('[data-image="live"]');
    const clone = original.cloneNode(true);
    clone.setAttribute('data-image', 'remounted');
    original.replaceWith(clone);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const animations = [...window.imageAnimations];
    const extra = document.createElement('div');
    extra.setAttribute('role', 'img');
    extra.setAttribute('data-image', 'second');
    extra.style.width = '120px'; extra.style.height = '80px';
    extra.innerHTML = '<img alt="Second image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">';
    document.getElementById('stream').appendChild(extra);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    return { animations, second: [...window.imageAnimations] };
  });
  assert.deepEqual(remount.animations, ['live', 'native-web', 'spinner', 'waiting'], 'remounting a known image does not replay its entrance');
  assert.deepEqual(remount.second, ['live', 'native-web', 'spinner', 'waiting', 'second'], 'another live image receives its own entrance');
  const disabled = await page.evaluate(async () => {
    const { getPreferences, setPreferences } = window.imagePreferences;
    setPreferences({ ...getPreferences(), messages: false });
    const surface = document.createElement('div');
    surface.setAttribute('role', 'img'); surface.setAttribute('data-image', 'disabled');
    surface.style.width = '120px'; surface.style.height = '80px';
    const image = document.createElement('img');
    image.src = 'https://image.test/failed.png';
    surface.appendChild(image);
    document.getElementById('stream').appendChild(surface);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    return { animations: [...window.imageAnimations], placeholder: Boolean(surface.querySelector('[data-native-polish-image-placeholder]')) };
  });
  assert.deepEqual(disabled, { animations: ['live', 'native-web', 'spinner', 'waiting', 'second'], placeholder: false }, 'the message preference disables added image motion');
  await page.evaluate(() => window.disposeMotion());
  await page.close();

  const userPage = await browser.newPage();
  const userGate = new Promise(resolve => { releaseUserImage = resolve; });
  await userPage.route('https://image.test/user.png', async route => {
    await userGate;
    await route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64') });
  });
  await userPage.setContent(`
    <div data-testid="agent-chat-scroll" style="height:400px;overflow:auto">
      <div data-history-row-id="history"><div data-testid="assistant-message">History</div></div>
      <div data-testid="turn-working-indicator">Working</div>
    </div>
  `);
  await userPage.addScriptTag({ type: 'module', content: `
    import { defaults, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.imageAnimations = [];
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      if (this.hasAttribute('data-image') || this.hasAttribute('data-row')) window.imageAnimations.push(this.getAttribute('data-image') ?? this.getAttribute('data-row'));
      return originalAnimate.call(this, frames, options);
    };
    window.disposeMotion = installMotion();
  ` });
  await userPage.waitForFunction(() => typeof window.disposeMotion === 'function');
  await userPage.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
  const userImage = await userPage.evaluate(async () => {
    const row = document.createElement('div');
    row.setAttribute('data-history-row-id', 'new-user'); row.setAttribute('data-row', 'row');
    row.innerHTML = '<div data-testid="user-message"><button type="button"><div role="img" data-image="user" style="width:120px;height:80px"><img alt="User image" src="https://image.test/user.png"></div></button></div>';
    const chat = document.querySelector('[data-testid="agent-chat-scroll"]');
    chat.insertBefore(row, document.querySelector('[data-testid="turn-working-indicator"]'));
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const placeholder = row.querySelector('[data-native-polish-image-placeholder]');
    return { animations: [...window.imageAnimations], placeholder: Boolean(placeholder), inert: Boolean(placeholder?.hasAttribute('inert')), button: Boolean(row.querySelector('button')) };
  });
  assert.deepEqual(userImage, { animations: ['row'], placeholder: true, inert: true, button: true }, 'a user message entrance owns its image without duplicating motion or controls');
  await userPage.evaluate(() => {
    window.imageClicks = 0;
    document.querySelector('[data-history-row-id="new-user"] button').addEventListener('click', () => { window.imageClicks++; });
  });
  await userPage.locator('[data-history-row-id="new-user"] button').click();
  assert.equal(await userPage.evaluate(() => window.imageClicks), 1, 'the placeholder does not intercept host image controls');
  releaseUserImage();
  await userPage.waitForFunction(() => !document.querySelector('[data-history-row-id="new-user"] [data-native-polish-image-placeholder]'));
  await userPage.evaluate(() => window.disposeMotion());
  await userPage.close();

  const reducedPage = await browser.newPage();
  await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
  const reducedGate = new Promise(resolve => { releaseReducedImage = resolve; });
  await reducedPage.route('https://image.test/reduced*.png', async route => {
    await reducedGate;
    await route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64') });
  });
  await reducedPage.setContent(`
    <div data-testid="agent-chat-scroll" style="height:400px;overflow:auto">
      <div data-history-row-id="live"><div data-testid="native-polish-streaming-assistant" id="stream">Output</div></div>
      <div data-testid="turn-working-indicator">Working</div>
    </div>
  `);
  await reducedPage.addScriptTag({ type: 'module', content: `
    import { defaults, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.imageAnimations = [];
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      if (this.hasAttribute('data-image')) window.imageAnimations.push('image');
      return originalAnimate.call(this, frames, options);
    };
    window.disposeMotion = installMotion();
  ` });
  await reducedPage.waitForFunction(() => typeof window.disposeMotion === 'function');
  await reducedPage.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
  const reduced = await reducedPage.evaluate(async () => {
    const surface = document.createElement('div');
    surface.setAttribute('role', 'img'); surface.setAttribute('data-image', 'reduced');
    surface.style.width = '120px'; surface.style.height = '80px';
    surface.innerHTML = '<img src="https://image.test/reduced.png" alt="Pending image">';
    document.getElementById('stream').appendChild(surface);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const before = { animations: [...window.imageAnimations], placeholder: Boolean(surface.querySelector('[data-native-polish-image-placeholder]')) };
    surface.querySelector('img').dispatchEvent(new Event('error'));
    const afterError = { placeholder: Boolean(surface.querySelector('[data-native-polish-image-placeholder]')), position: surface.style.position };
    const another = document.createElement('div');
    another.setAttribute('role', 'img'); another.setAttribute('data-image', 'another');
    another.style.width = '120px'; another.style.height = '80px';
    another.innerHTML = '<img src="https://image.test/reduced2.png" alt="Another pending image">';
    document.getElementById('stream').appendChild(another);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const secondPlaceholder = Boolean(another.querySelector('[data-native-polish-image-placeholder]'));
    another.style.position = 'absolute';
    const unsized = document.createElement('div');
    unsized.setAttribute('role', 'img');
    unsized.innerHTML = '<img style="position:absolute;width:0;height:0" src="https://image.test/reduced3.png" alt="Unsized pending image">';
    document.getElementById('stream').appendChild(unsized);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const reservedHeight = unsized.getBoundingClientRect().height;
    const direct = document.createElement('img');
    direct.style.width = '0px'; direct.style.height = '0px';
    direct.src = 'https://image.test/reduced4.png';
    document.getElementById('stream').appendChild(direct);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const directLoading = direct.hasAttribute('data-native-polish-image-placeholder') && direct.getBoundingClientRect().height === 48;
    window.disposeMotion();
    return { before, afterError, secondPlaceholder, reservedHeight, directLoading, directAfterDispose: direct.hasAttribute('data-native-polish-image-placeholder') || Boolean(direct.style.minHeight), unsizedAfterDispose: unsized.style.minHeight, placeholderAfterDispose: Boolean(another.querySelector('[data-native-polish-image-placeholder]')), positionAfterDispose: another.style.position };
  });
  assert.deepEqual(reduced, { before: { animations: [], placeholder: true }, afterError: { placeholder: false, position: '' }, secondPlaceholder: true, reservedHeight: 48, directLoading: true, directAfterDispose: false, unsizedAfterDispose: '', placeholderAfterDispose: false, positionAfterDispose: 'absolute' }, 'Reduce Motion keeps a static placeholder and error/disposal clean up without overwriting host changes');
  releaseReducedImage();
  await reducedPage.close();
} finally {
  releaseImage();
  releaseUserImage?.();
  releaseReducedImage?.();
  await browser.close();
}
