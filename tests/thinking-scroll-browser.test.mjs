import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const modules = new Map([
  ['react-native', moduleUrl('export const Platform = { OS: "web" };')],
  ['react', moduleUrl('export function useSyncExternalStore() {}')],
]);
async function compile(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let source = ts.transpileModule(await readFile(url, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const match of [...source.matchAll(/from ["']([^"']+)["']/g)]) {
    const specifier = match[1];
    const dependency = modules.get(specifier) ?? await compile(new URL(`${specifier}.ts`, url));
    source = source.replace(match[0], `from "${dependency}"`);
  }
  const compiled = moduleUrl(source);
  modules.set(url.href, compiled);
  return compiled;
}
const adapter = await compile(new URL('../client/web.ts', import.meta.url));
const preferences = await compile(new URL('../client/preferences.ts', import.meta.url));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {}),
});
try {
  const page = await browser.newPage();
  await page.setContent(`
    <div data-testid="agent-chat-scroll" style="height:500px;overflow:auto">
      <div data-history-row-id="thinking"><div data-testid="tool-call-badge">
        <div><div><span>icon</span><div><span style="--paseo-shimmer:1">Thinking</span></div></div></div>
        <div id="detail"><div><div><div id="box" style="max-height:100px;overflow-y:auto;width:400px;overflow-anchor:none">
          <div id="content" style="white-space:pre-wrap;line-height:20px"><span>one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n</span><span id="anchor">anchor</span><span id="tail"></span></div>
        </div></div></div></div>
      </div></div><div data-testid="turn-working-indicator">Working</div>
    </div>
  `);
  await page.addScriptTag({ type: 'module', content: `
    import { defaults, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.disposeMotion = installMotion();
  ` });
  await page.waitForFunction(() => typeof window.disposeMotion === 'function');
  await page.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
  const result = await page.evaluate(async () => {
    const box = document.getElementById('box');
    const content = document.getElementById('content');
    const anchor = document.getElementById('anchor');
    const tail = document.getElementById('tail');
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    box.scrollTop = box.scrollHeight - box.clientHeight;
    await frame(); await frame();
    const snapshot = () => ({ anchor: anchor.getBoundingClientRect().top, scrollTop: box.scrollTop, scrollHeight: box.scrollHeight, contentHeight: content.getBoundingClientRect().height, transform: content.style.transform });
    const before = snapshot();
    tail.append('\nnew line one\nnew line two');
    await Promise.resolve(); await Promise.resolve();
    const afterFirst = snapshot();
    await frame();
    const beforeSecond = snapshot();
    tail.append('\nnew line three\nnew line four');
    await Promise.resolve(); await Promise.resolve();
    const afterSecond = snapshot();
    await frame();
    const nextFrame = snapshot();
    await new Promise(resolve => setTimeout(resolve, 650));
    tail.append('\n' + Array.from({ length: 20 }, (_, index) => `extra ${index}`).join('\n'));
    await new Promise(resolve => setTimeout(resolve, 650));
    box.scrollTop = Math.max(0, box.scrollHeight - box.clientHeight - 100);
    box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -80 }));
    await new Promise(resolve => setTimeout(resolve, 400));
    const manualBefore = box.scrollTop;
    tail.append('\nlatest one');
    await Promise.resolve(); await Promise.resolve();
    const manualAfterFirst = box.scrollTop;
    tail.append('\nlatest two');
    await Promise.resolve(); await Promise.resolve();
    const manualAfterSecond = box.scrollTop;
    window.disposeMotion();
    return { before, afterFirst, beforeSecond, afterSecond, nextFrame, manualBefore, manualAfterFirst, manualAfterSecond };
  });
  assert.ok(result.afterFirst.scrollTop > result.before.scrollTop + 1 && result.afterFirst.transform, `the live detail must follow new output: ${JSON.stringify(result)}`);
  assert.ok(result.manualBefore > 100, `the manual-scroll fixture must overflow: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.afterFirst.anchor - result.before.anchor) < 2, `first chunk jumps: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.afterSecond.anchor - result.beforeSecond.anchor) < 2, `second chunk jumps: ${JSON.stringify(result)}`);
  assert.ok(result.nextFrame.anchor <= result.afterSecond.anchor + 1, `old text reverses direction: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.manualAfterFirst - result.manualBefore) < 2 && Math.abs(result.manualAfterSecond - result.manualBefore) < 2, `updates must not pull a manually scrolled detail back to the bottom: ${JSON.stringify(result)}`);
  await page.close();

  const growthPage = await browser.newPage();
  await growthPage.setContent(`
    <style>.scrollbox { max-height: 200px; overflow-y: auto; width: 400px }</style>
    <div data-testid="agent-chat-scroll" style="height:500px;overflow:auto">
      <div data-history-row-id="thinking"><div data-testid="tool-call-badge">
        <div><div><span>icon</span><div><span style="--paseo-shimmer:1">Thinking</span></div></div></div>
        <div><div id="box" class="scrollbox"><div id="content" style="height:40px">First thought</div></div></div>
      </div></div><div data-testid="turn-working-indicator">Working</div>
    </div>
  `);
  await growthPage.addScriptTag({ type: 'module', content: `
    import { defaults, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.disposeMotion = installMotion();
  ` });
  await growthPage.waitForFunction(() => typeof window.disposeMotion === 'function');
  await growthPage.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
  const growth = await growthPage.evaluate(async () => {
    const box = document.getElementById('box');
    const content = document.getElementById('content');
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    content.style.height = '80px';
    content.textContent += ' second thought';
    for (let i = 0; i < 8 && !box.getAnimations().length; i++) await frame();
    const first = box.getAnimations()[0];
    if (!first) throw new Error('First height animation did not start');
    first.pause(); first.currentTime = 80;
    const before = { height: box.getBoundingClientRect().height, overflow: getComputedStyle(box).overflowY };
    content.style.height = '120px';
    content.textContent += ' third thought';
    await frame(); await frame();
    const replacement = box.getAnimations()[0];
    const after = { height: box.getBoundingClientRect().height, overflow: getComputedStyle(box).overflowY, replaced: Boolean(replacement && replacement !== first) };
    if (!replacement) throw new Error('Replacement height animation did not start');
    replacement.pause(); replacement.currentTime = 80;
    content.style.height = '160px';
    content.textContent += ' fourth thought';
    await frame(); await frame();
    const secondReplacement = box.getAnimations()[0];
    const afterSecond = { overflow: getComputedStyle(box).overflowY, replaced: Boolean(secondReplacement && secondReplacement !== replacement) };
    if (!secondReplacement) throw new Error('Second replacement height animation did not start');
    await Promise.race([
      secondReplacement.finished,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Height animation did not finish')), 1500)),
    ]);
    const settled = { height: box.getBoundingClientRect().height, overflow: getComputedStyle(box).overflowY };
    window.disposeMotion();
    return { before, after, afterSecond, settled };
  });
  assert.ok(growth.after.replaced, `streaming height must retarget: ${JSON.stringify(growth)}`);
  assert.equal(growth.after.overflow, 'hidden', `retargeting must keep the growing text clipped: ${JSON.stringify(growth)}`);
  assert.ok(growth.afterSecond.replaced, `successive updates must retarget: ${JSON.stringify(growth)}`);
  assert.equal(growth.afterSecond.overflow, 'hidden', `successive retargets must keep the growing text clipped: ${JSON.stringify(growth)}`);
  assert.equal(growth.settled.overflow, 'auto', 'the original scrolling style returns after the transition');
  await growthPage.close();
} finally {
  await browser.close();
}
