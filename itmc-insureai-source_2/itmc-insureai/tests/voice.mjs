// Voice input: mocked browser speech recognition → transcript → Maya answers; unsupported and blocked-microphone paths.
import { chromium } from 'playwright';
import path from 'node:path';
const SHOTS = process.env.SHOTS || '/tmp/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const url = 'file://' + path.resolve('dist/index.html');

// Mock recognizer: say what window.__say holds, or fail with window.__fail
const mock = () => {
  class FakeRec {
    constructor() { this.lang = ''; this.interimResults = false; this.continuous = false; }
    start() {
      setTimeout(() => this.onstart?.(), 10);
      if (window.__fail) { setTimeout(() => { this.onerror?.({ error: window.__fail }); this.onend?.(); }, 300); return; }
      const text = window.__say;
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: text.split(' ').slice(0, 2).join(' ') } }] }), 300);
      this._t = setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] }); this.onend?.(); }, 900);
    }
    stop() { this.onend?.(); }
    abort() { clearTimeout(this._t); }
  }
  window.webkitSpeechRecognition = FakeRec; window.SpeechRecognition = FakeRec;
};

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(mock);
await page.goto(url);
await page.getByRole('button', { name: 'Open chat assistant' }).click();
const chat = page.locator('section[role=dialog]');
ok(await page.locator('#chat-mic').isVisible(), 'mic button visible in chat');
await page.evaluate(() => { window.__say = 'Where is my claim'; });
await page.click('#chat-mic');
await page.waitForTimeout(500);
ok(await chat.getByText('Listening… speak now').isVisible(), 'listening indicator shown');
ok((await page.inputValue('#chat-input')).length > 0, 'interim transcript shown in input');
await page.screenshot({ path: `${SHOTS}/voice-listening.png` });
await page.waitForTimeout(1800);
ok(await chat.getByText('Where is my claim', { exact: true }).isVisible(), 'spoken message sent as user turn');
ok(await chat.getByText('CLM-2026-0107 is:').first().isVisible(), 'Maya answers the spoken question');
// voice works inside a guided flow
await page.evaluate(() => { window.__say = 'I had an accident'; });
await page.click('#chat-mic'); await page.waitForTimeout(2200);
ok(await chat.getByText('Report it here in chat').first().isVisible(), 'spoken accident report starts claim guidance');
// blocked mic
await page.evaluate(() => { window.__fail = 'not-allowed'; });
await page.click('#chat-mic'); await page.waitForTimeout(700);
ok(await chat.getByText('Microphone access is blocked').isVisible(), 'blocked microphone explained');
await page.screenshot({ path: `${SHOTS}/voice-blocked.png` });

// unsupported browser
const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
await p2.addInitScript(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
await p2.goto(url);
await p2.getByRole('button', { name: 'Open chat assistant' }).click();
await p2.click('#chat-mic');
ok(await p2.getByText("Voice input isn't supported in this browser").isVisible(), 'unsupported browser explained');
await p2.screenshot({ path: `${SHOTS}/voice-mobile.png` });
ok(errors.length === 0, 'no runtime errors ' + JSON.stringify(errors));
await browser.close();
