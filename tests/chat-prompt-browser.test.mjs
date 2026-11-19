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
    <div data-testid="agent-chat-scroll" style="height:800px;overflow:auto">
      <div data-history-row-id="history">Earlier message</div>
      <div id="prompts"><div data-prompt="existing" style="transform:scale(1)"><span data-testid="permission-request-question">Earlier approval</span><button>Accept</button></div></div>
      <div data-testid="turn-working-indicator">Working</div>
    </div>
  `);
  await page.addScriptTag({ type: 'module', content: `
    import { defaults, getPreferences, setPreferences } from '${preferences}';
    import { installMotion } from '${adapter}';
    setPreferences({ ...defaults, edgePeek: false, elasticScroll: false });
    window.preferences = { getPreferences, setPreferences };
    window.promptAnimations = [];
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      if (this.hasAttribute('data-prompt')) window.promptAnimations.push({ target: this.getAttribute('data-prompt'), frames });
      return originalAnimate.call(this, frames, options);
    };
    window.disposeMotion = installMotion();
  ` });
  await page.waitForFunction(() => typeof window.disposeMotion === 'function');
  await page.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
  const result = await page.evaluate(async () => {
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const settle = async () => { await frame(); await frame(); };
    const container = document.getElementById('prompts');
    const append = (name, kind) => {
      const card = document.createElement('div');
      card.setAttribute('data-prompt', name);
      card.style.transform = 'scale(1)';
      if (kind === 'question') card.setAttribute('data-testid', 'question-form-card');
      if (kind === 'plan') card.setAttribute('data-testid', 'permission-plan-card');
      card.innerHTML = kind === 'question'
        ? '<div data-testid="question-form-current-question">Choose an option</div><button>Option one</button>'
        : '<span data-testid="permission-request-question">Allow this action?</span><button data-testid="permission-request-accept">Accept</button><button data-testid="permission-request-deny">Deny</button>';
      container.appendChild(card);
      return card;
    };
    const initial = window.promptAnimations.length;
    const approval = append('approval', 'approval');
    let accepts = 0;
    approval.querySelector('button').addEventListener('click', () => accepts++);
    await settle();
    approval.querySelector('button').click();
    approval.querySelector('[data-testid="permission-request-question"]').textContent = 'Updated approval';
    await settle();
    const question = append('question', 'question');
    await settle();
    question.querySelector('div').textContent = 'Next question';
    await settle();
    question.remove();
    await settle();
    container.appendChild(question);
    await settle();
    append('plan', 'plan');
    await settle();
    const { getPreferences, setPreferences } = window.preferences;
    setPreferences({ ...getPreferences(), messages: false });
    append('disabled', 'question');
    await settle();
    setPreferences({ ...getPreferences(), messages: true });
    await settle();
    window.disposeMotion();
    return { initial, animations: window.promptAnimations, accepts, clean: [...container.children].every(card => card.getAnimations().length === 0 && !card.style.translate && card.style.transform === 'scale(1)') };
  });
  assert.equal(result.initial, 0, 'existing prompts remain still during hydration');
  assert.deepEqual(result.animations.map(item => item.target), ['approval', 'question', 'plan'], 'new approval, question and plan prompts ease in once; edits and disabled arrivals do not replay');
  assert.ok(result.animations.every(item => item.frames[0].opacity === 0 && item.frames[1].opacity === 1 && item.frames[0].translate === '0 6px'));
  assert.equal(result.accepts, 1, 'prompt controls keep their host actions');
  assert.ok(result.clean, 'disposal removes prompt motion and preserves host transforms');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    window.promptAnimations.length = 0;
    window.disposeMotion = null;
  });
  await page.addScriptTag({ type: 'module', content: `
    import { installMotion } from '${adapter}';
    window.disposeMotion = installMotion();
  ` });
  await page.waitForFunction(() => typeof window.disposeMotion === 'function');
  await page.waitForFunction(() => !document.querySelector('[data-testid="agent-chat-scroll"]').hasAttribute('data-native-polish-hydrating'));
  const reduced = await page.evaluate(async () => {
    const card = document.createElement('div');
    card.setAttribute('data-prompt', 'reduced');
    card.setAttribute('data-testid', 'question-form-card');
    card.textContent = 'Reduced motion question';
    document.getElementById('prompts').appendChild(card);
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));
    window.disposeMotion();
    return window.promptAnimations.length;
  });
  assert.equal(reduced, 0, 'Reduce Motion suppresses prompt entrances');
  await page.close();
} finally {
  await browser.close();
}
