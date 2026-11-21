import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { compileBrowserModule as compile } from './browser-module-loader.mjs';

const adapter = await compile(new URL('../client/web.ts', import.meta.url));
const preferences = await compile(new URL('../client/preferences.ts', import.meta.url));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {}),
});
try {
  for (const { tagged, order } of [
    { tagged: false, order: 'same-commit' },
    { tagged: false, order: 'composer-after-row' },
    { tagged: false, order: 'host-scroll-first' },
    { tagged: true, order: 'same-commit' },
  ]) {
    const page = await browser.newPage();
    await page.setContent(`
      <div id="chat" data-testid="agent-chat-scroll" style="height:240px;overflow:auto;overflow-anchor:none">
        <div id="content" style="padding-bottom:16px">
          <div data-testid="older-history-slot"></div>
          <div id="timeline" ${tagged ? 'data-testid="agent-chat-timeline"' : ''} style="position:relative">
            <div data-history-row-id="old" style="height:650px">Earlier messages</div>
          </div>
          <div style="height:24px"><div data-testid="turn-working-indicator">Working</div></div>
        </div>
      </div>
    `);
    await page.addScriptTag({ type: 'module', content: `
      import { defaults, setPreferences } from '${preferences}';
      import { installMotion } from '${adapter}';
      const chat = document.getElementById('chat');
      chat.scrollTop = chat.scrollHeight;
      setPreferences({ ...defaults, elasticScroll: false, edgePeek: false });
      window.disposeMotion = installMotion();
    ` });
    await page.waitForFunction(() => typeof window.disposeMotion === 'function' &&
      !document.getElementById('chat').hasAttribute('data-native-polish-hydrating'));
    const result = await page.evaluate(async (order) => {
      const chat = document.getElementById('chat');
      const content = document.getElementById('content');
      const timeline = document.getElementById('timeline');
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));

      if (order !== 'composer-after-row') chat.style.height = '300px';
      const row = document.createElement('div');
      row.setAttribute('data-history-row-id', 'new');
      row.innerHTML = '<div data-testid="user-message" style="height:180px">A sent message</div>';
      timeline.appendChild(row);
      // The host can scroll in its layout effect or follow up in a queued frame.
      if (order === 'host-scroll-first') chat.scrollTop = chat.scrollHeight;
      await Promise.resolve();
      const preparedRise = timeline.style.transform;
      if (order === 'composer-after-row') chat.style.height = '300px';
      const naturalBottom = content.offsetHeight - chat.clientHeight;
      const hostBottom = await new Promise(resolve => requestAnimationFrame(() => {
        chat.scrollTop = chat.scrollHeight;
        resolve(chat.scrollTop);
      }));

      const deadline = performance.now() + 2000;
      while (timeline.style.transform && performance.now() < deadline) await frame();
      const settledBottom = chat.scrollTop;
      const settled = timeline.style.transform === '' && content.style.overflowY === '';
      window.disposeMotion();
      return { preparedRise, naturalBottom, hostBottom, settledBottom, settled };
    }, order);
    const scenario = `${tagged ? 'tagged' : 'untagged'} ${order}`;
    assert.ok(result.preparedRise, `${scenario} must exercise scroll compensation`);
    assert.ok(result.settled, `${scenario} removes its transform and temporary clip`);
    assert.equal(result.settledBottom, result.naturalBottom, `${scenario} settles at the natural bottom`);
    assert.equal(result.hostBottom, result.naturalBottom, `${scenario} overshot the natural bottom: ${JSON.stringify(result)}`);
    await page.close();
  }
} finally {
  await browser.close();
}
