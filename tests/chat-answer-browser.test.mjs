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
  for (const mode of ['together', 'separate', 'history']) {
    const page = await browser.newPage();
    await page.setContent(`
      <div data-testid="agent-chat-scroll" style="height:800px;overflow:auto">
        <div data-history-row-id="history"><div data-testid="assistant-message">Earlier response</div></div>
        <div data-history-row-id="question-call"><div data-testid="tool-call-badge"><div>Pending question</div></div></div>
        <div id="aux"><div data-testid="question-form-card"><button data-testid="question-form-primary-action">Submit</button></div></div>
        <div data-testid="turn-working-indicator">Working</div>
      </div>
    `);
    await page.addScriptTag({ type: 'module', content: `
      import { defaults, setPreferences } from '${preferences}';
      import { installMotion } from '${adapter}';
      setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
      window.messageAnimations = [];
      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function(frames, options) {
        if (this.hasAttribute('data-entry')) window.messageAnimations.push({ target: this.getAttribute('data-entry'), frames });
        return originalAnimate.call(this, frames, options);
      };
      window.disposeMotion = installMotion();
    ` });
    await page.waitForFunction(() => typeof window.disposeMotion === 'function');
    await page.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
    const result = await page.evaluate(async (mode) => {
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const chat = document.querySelector('[data-testid="agent-chat-scroll"]');
      const aux = document.getElementById('aux');
      const row = (id, body) => {
        const node = document.createElement('div');
        node.setAttribute('data-history-row-id', id);
        node.setAttribute('data-entry', id);
        node.innerHTML = body;
        chat.insertBefore(node, aux);
        return node;
      };
      row('normal', '<div data-testid="user-message">Regular message</div>');
      await frame(); await frame();
      await new Promise(resolve => setTimeout(resolve, 300));
      if (mode !== 'history') {
        aux.replaceChildren();
        document.querySelector('[data-history-row-id="question-call"]').remove();
      }
      row('completed-question', '<div data-testid="tool-call-badge"><div>Question completed</div></div>');
      if (mode === 'separate') { await frame(); await frame(); }
      row('answer', '<div data-testid="user-message">Answers to your questions: a test answer</div>');
      await frame(); await frame();
      if (mode !== 'history') await new Promise(resolve => setTimeout(resolve, 1100));
      const hydrating = chat.hasAttribute('data-native-polish-hydrating');
      const animations = [...window.messageAnimations];
      window.disposeMotion();
      return { hydrating, animations };
    }, mode);
    const normal = result.animations.find(item => item.target === 'normal');
    const answer = result.animations.find(item => item.target === 'answer');
    assert.ok(normal, 'the fixture must animate a regular chat message');
    if (mode === 'history') {
      assert.equal(answer, undefined, 'ordinary bulk history still suppresses entrances');
      assert.equal(result.hydrating, true, 'bulk history still enters its quiet window');
    } else {
      assert.ok(answer, `a question answer arriving with its completed tool must animate: ${JSON.stringify(result)}`);
      assert.deepEqual(answer.frames, normal.frames, 'question answers use the regular user-message entrance');
      assert.equal(result.hydrating, false, 'resolving a question is not history hydration');
    }
    await page.close();
  }
  const hydratingPage = await browser.newPage();
  await hydratingPage.setContent(`
    <div data-testid="agent-chat-scroll" style="height:800px;overflow:auto">
      <div data-testid="agent-chat-content">
        <div data-testid="agent-chat-timeline" id="timeline"><div data-history-row-id="history" data-entry="history"><div data-testid="user-message">Restored history</div></div></div>
        <div id="aux"><div data-testid="question-form-card"><button data-testid="question-form-primary-action" id="submit">Submit</button></div></div>
        <div data-testid="turn-working-indicator">Working</div>
      </div>
    </div>
  `);
  await hydratingPage.addScriptTag({ type: 'module', content: `
    import { defaults, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.entries = [];
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      if (this.hasAttribute('data-entry')) window.entries.push(this.getAttribute('data-entry'));
      return originalAnimate.call(this, frames, options);
    };
    document.getElementById('submit').addEventListener('click', () => {
      document.getElementById('aux').replaceChildren();
      const answer = document.createElement('div');
      answer.setAttribute('data-history-row-id', 'local-answer');
      answer.setAttribute('data-entry', 'answer');
      answer.innerHTML = '<div data-testid="user-message" style="height:160px">Submitted answer</div>';
      document.getElementById('timeline').appendChild(answer);
    });
    window.disposeMotion = installMotion();
  ` });
  await hydratingPage.waitForFunction(() => typeof window.disposeMotion === 'function');
  const submitted = await hydratingPage.evaluate(async () => {
    const chat = document.querySelector('[data-testid="agent-chat-scroll"]');
    const wasHydrating = chat.hasAttribute('data-native-polish-hydrating');
    const submit = document.getElementById('submit');
    submit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    submit.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    submit.click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));
    const answer = document.querySelector('[data-history-row-id="local-answer"]');
    const runningBefore = answer.getAnimations().length;
    // A later host commit during hydration must not cancel the local entrance.
    const text = document.createElement('span');
    text.textContent = ' settled';
    answer.querySelector('[data-testid="user-message"]').appendChild(text);
    await new Promise(resolve => requestAnimationFrame(resolve));
    const runningAfter = answer.getAnimations().length;
    const entries = [...window.entries];
    window.disposeMotion();
    return { wasHydrating, runningBefore, runningAfter, entries, clean: !answer.style.opacity && !answer.style.transformOrigin && answer.getAnimations().length === 0 };
  });
  assert.ok(submitted.wasHydrating, 'the question must be submitted inside the history quiet window');
  assert.deepEqual(submitted.entries, ['answer'], `only the explicitly submitted answer enters: ${JSON.stringify(submitted)}`);
  assert.ok(submitted.runningBefore > 0 && submitted.runningAfter > 0, 'hydration commits preserve the local answer entrance');
  assert.ok(submitted.clean, 'disposal removes local-answer motion');
  await hydratingPage.close();

  for (const cancel of [false, true]) {
    const scrollingPage = await browser.newPage();
    await scrollingPage.setContent(`
      <div data-testid="agent-chat-scroll" style="height:300px;overflow:auto">
        <div data-testid="agent-chat-content">
          <div data-testid="agent-chat-timeline" id="timeline"><div data-history-row-id="history" style="height:700px">History</div></div>
          <div id="aux"><div data-testid="question-form-card" style="height:300px">Question</div></div>
          <div data-testid="turn-working-indicator">Working</div>
        </div>
      </div>
    `);
    await scrollingPage.evaluate(() => { const chat = document.querySelector('[data-testid="agent-chat-scroll"]'); chat.scrollTop = chat.scrollHeight; });
    await scrollingPage.addScriptTag({ type: 'module', content: `
      import { defaults, setPreferences } from '${preferences}';
      import { installMotion } from '${adapter}';
      setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
      window.answerAnimations = 0;
      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function(frames, options) {
        if (this.id === 'answer') window.answerAnimations++;
        return originalAnimate.call(this, frames, options);
      };
      window.disposeMotion = installMotion();
    ` });
    await scrollingPage.waitForFunction(() => typeof window.disposeMotion === 'function');
    await scrollingPage.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
    const scrolling = await scrollingPage.evaluate(async (cancel) => {
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const chat = document.querySelector('[data-testid="agent-chat-scroll"]');
      const timeline = document.getElementById('timeline');
      document.getElementById('aux').replaceChildren();
      await frame(); await frame();
      await new Promise(resolve => setTimeout(resolve, 200));
      const answer = document.createElement('div');
      answer.id = 'answer';
      answer.setAttribute('data-history-row-id', 'answer');
      answer.innerHTML = '<div data-testid="user-message" style="height:120px">Answers to your questions</div>';
      timeline.appendChild(answer);
      await Promise.resolve(); await Promise.resolve();
      chat.scrollTop = chat.scrollHeight;
      await frame(); await frame();
      const early = { animations: window.answerAnimations, rise: timeline.style.transform, opacity: getComputedStyle(answer).opacity };
      if (cancel) window.disposeMotion();
      await new Promise(resolve => setTimeout(resolve, 1100));
      const settled = { animations: window.answerAnimations, rise: timeline.style.transform, opacity: getComputedStyle(answer).opacity };
      window.disposeMotion();
      return { early, settled, clean: !answer.style.opacity && !answer.style.transform && answer.getAnimations().length === 0 };
    }, cancel);
    assert.ok(scrolling.early.rise, 'the fixture must exercise follow-output motion');
    assert.equal(scrolling.early.animations, 0, `the answer entrance waits for the timeline to settle: ${JSON.stringify(scrolling)}`);
    assert.equal(scrolling.early.opacity, '0', 'the pending answer stays hidden while its layout moves');
    assert.equal(scrolling.settled.animations, cancel ? 0 : 1, 'the answer enters once after settling, or cancels on disposal');
    assert.equal(scrolling.settled.opacity, '1');
    assert.ok(scrolling.clean, 'disposal releases pending entrance ownership and styles');
    await scrollingPage.close();
  }
} finally {
  await browser.close();
}
