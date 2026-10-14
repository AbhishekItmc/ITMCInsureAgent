import { chromium } from 'playwright';
import path from 'node:path';
const SHOTS = process.env.SHOTS || '/tmp/shots';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
for (const [w, scheme] of [[1440, 'light'], [390, 'light'], [1440, 'dark']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve('dist/index.html'));
  await p.waitForSelector('text=Insure now');
  await p.screenshot({ path: `${SHOTS}/home-${w}-${scheme}.png` });
  if (w === 1440 && scheme === 'light') {
    await p.getByRole('button', { name: 'Next slide' }).click();
    ok(await p.locator('text=in minutes not weeks.').isVisible(), 'slider advances');
    await p.getByRole('radio', { name: 'SME' }).click();
    ok(await p.locator('text=Fleet insurance').isVisible(), 'SME tabs shown');
    await p.getByRole('button', { name: /Explore motor instead/ }).click();
    await p.uncheck('#home-consent');
    await p.getByRole('button', { name: /Insure now/ }).click();
    ok(await p.locator('text=Please confirm the data consent').isVisible(), 'consent required');
    await p.check('#home-consent');
    await p.getByRole('button', { name: /Insure now/ }).click();
    ok(await p.locator('h1', { hasText: 'Get a motor quote' }).isVisible(), 'Insure now opens quote');
  }
  ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= w, `no horizontal scroll at ${w}`);
  ok(errs.length === 0, 'no errors ' + errs.join(';'));
  await p.close();
}
await b.close();
