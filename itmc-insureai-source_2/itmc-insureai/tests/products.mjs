// Travel, Medical and Home lifecycles: quote → policy → claim → investigation → approval → tracking → servicing → renewal, plus chat.
import { chromium } from 'playwright';
import path from 'node:path';
const SHOTS = process.env.SHOTS || '/tmp/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL/.test(m.text())) errors.push('console: ' + m.text()); });
const ok = (cond, msg) => { if (!cond) { console.log('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
const PMENU = { Motor: 'Products', Travel: 'Products', Medical: 'Products', Home: 'Products', 'Register a Claim': 'Claims', 'Track Claims': 'Claims', 'My Policies': 'My Account', Renewal: 'My Account' };
const pnav = async (label) => { await page.locator('header [data-menu]', { hasText: PMENU[label] }).first().click(); await page.locator('[data-portal-nav]', { hasText: label }).first().click(); };
const nav = (label) => page.locator('aside nav button', { hasText: label }).click();
const area = (a) => page.getByRole('tab', { name: a }).click();
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const main = () => page.locator('main').innerText();

await page.goto('file://' + path.resolve('dist/index.html'));
await page.waitForSelector('text=Insure now');

// Products page: all four personal products are live
for (const p of ['Travel', 'Medical', 'Home']) {
  await page.getByRole('tab', { name: p }).first().click();
  ok(await page.getByRole('button', { name: /Insure now/ }).isVisible(), `${p} tab offers Insure now`);
}
await page.getByRole('button', { name: 'Get a medical quote' }).click();
ok(await page.locator('h1', { hasText: 'Get a medical quote' }).isVisible(), 'showcase card opens the medical quote');

async function quoteAndConvert(label, fill) {
  await pnav(label);
  await page.waitForSelector(`h1:has-text("Get a ${label.toLowerCase()} quote")`);
  await page.getByRole('button', { name: 'Sample' }).click();
  await page.getByRole('button', { name: 'Generate Quote' }).click();
  await page.waitForSelector(`text=${label} quote QTE-`);
  const qid = (await main()).match(new RegExp(`${label} quote (QTE-\\d{4}-\\d{4})`))[1];
  ok(await page.locator('text=How the premium was calculated').isVisible(), `${label}: quote ${qid} priced with breakdown`);
  await shot(`p-${label.toLowerCase()}-quote`);
  await page.getByRole('button', { name: /Convert to demo policy/ }).click();
  await page.getByRole('button', { name: 'Run Policy Agent checks' }).click();
  if (!(await page.inputValue('#p-address'))) await page.fill('#p-address', '8 Olive Court, Al Yasmin, Riyadh');
  await fill();
  await page.getByRole('button', { name: 'Run Policy Agent checks' }).click();
  await page.check('#p-confirm');
  await page.getByRole('button', { name: /Create demo policy/ }).click();
  await page.waitForSelector('text=/Demo policy POL-\\d{4}-\\d{4} created/');
  const pid = (await main()).match(/Demo policy (POL-\d{4}-\d{4}) created/)[1];
  ok(!!pid, `${label}: policy ${pid} issued`);
  return pid;
}

// ── Quote validation per product
await pnav('Travel');
await page.getByRole('button', { name: 'Clear' }).click();
await page.getByRole('button', { name: 'Generate Quote' }).click();
ok(await page.locator('text=field(s) need attention').first().isVisible(), 'travel: empty form validated');

// ── Travel
const travelPol = await quoteAndConvert('Travel', async () => {
  ok(await page.locator('#p-passport').isVisible(), 'travel: passport requested');
  await page.fill('#p-passport', 'K4839201');
});
// ── Medical
const medPol = await quoteAndConvert('Medical', async () => {
  await page.check('#p-declaration');
});
// ── Home
const homePol = await quoteAndConvert('Home', async () => {
  ok((await page.locator('#p-vin').count()) === 0, 'home: no vehicle fields');
});
await shot('p-home-policy');

// Ops shows product column
await area('Operations Console');
await nav('Quotes & Policies');
await page.getByRole('tab', { name: /Policies/ }).click();
for (const id of [travelPol, medPol, homePol]) ok(await page.locator('tr', { hasText: id }).isVisible(), `ops lists ${id}`);
await area('Customer Portal');

// ── Claims: medical + home on new policies, travel on the active seeded trip
async function fileClaim(policyId, expectType) {
  await pnav('Register a Claim');
  await page.selectOption('#c-policy', policyId);
  const opts = await page.locator('#c-type option').allInnerTexts();
  ok(opts.includes(expectType), `claim form offers “${expectType}” for ${policyId}`);
  await page.getByRole('button', { name: 'Submit claim' }).click();
  await page.waitForSelector('text=Claim registered');
  return (await page.locator('main .font-mono.text-\\[22px\\]').innerText()).trim();
}
const HANA = await page.evaluate(() => [...document.querySelectorAll('#viewer option')].find((o) => o.textContent.includes('Hana'))?.value);
ok(!!HANA, 'quote created customer record for Hana ' + HANA);
const medClaim = await fileClaim(medPol, 'Outpatient treatment');
ok(/CLM-2026-01\d\d/.test(medClaim), 'medical claim registered ' + medClaim);
const homeClaim = await fileClaim(homePol, 'Water damage');
// Future-dated trip cannot have a claim yet
await pnav('Register a Claim');
await page.selectOption('#c-policy', travelPol);
await page.getByRole('button', { name: 'Submit claim' }).click();
await page.waitForTimeout(300);
ok((await page.locator('[aria-invalid=true]').count()) > 0, 'claim before trip start is rejected');
await page.selectOption('#viewer', 'CUS-1003');
const travelClaim = await fileClaim('POL-2026-0006', 'Medical emergency abroad');
await shot('p-claim-registered');

// ── Investigations
async function investigate(claimId, product) {
  await area('Operations Console');
  await nav('Claims Management');
  await page.locator('tr', { hasText: claimId }).click();
  ok(await page.locator('main').getByText(product, { exact: true }).first().isVisible(), `${claimId}: workbench shows ${product}`);
  await page.getByRole('button', { name: /Run agentic claims investigation/i }).click();
  await page.waitForSelector('text=Consolidated investigation report', { timeout: 30000 });
  const rec = (await page.locator('text=Recommended next action').locator('..').innerText()).split('\n')[1];
  console.log(`     ${product} recommendation:`, rec);
  await shot(`p-${product.toLowerCase()}-report`);
  await page.getByRole('button', { name: /Approve recommended next step/ }).click();
  await page.waitForTimeout(300);
  return rec;
}
const travelRec = await investigate(travelClaim, 'Travel');
ok(/boarding pass/i.test(travelRec), 'travel: missing boarding pass requested');
await investigate(medClaim, 'Medical');
await investigate(homeClaim, 'Home');

// Seeded product scenarios
await nav('Executive Overview');
ok(await page.locator('text=Home water damage').isVisible(), 'overview lists home scenario');
await investigate('CLM-2026-0106', 'Home');
const homeText = await main();
ok(/flood|Gradual|HM-0/i.test(homeText) || /photos/i.test(homeText), 'home scenario flags photos / exclusion wording');

// ── Tracking in portal
await area('Customer Portal');
await pnav('Track Claims');
await page.locator('main button', { hasText: travelClaim }).first().click();
ok(await page.locator('text=Medical emergency abroad').first().isVisible(), 'tracker shows travel incident label');
ok(await page.locator('text=Additional Documents Required').first().isVisible(), 'tracker shows document request');
await page.getByRole('button', { name: /Upload sample boarding pass/ }).click();
ok(await page.locator('text=Documents Received').first().isVisible(), 'customer uploads boarding pass');

// ── Servicing per product
await pnav('My Policies');
async function change(policyId, type, values) {
  const scope = page.locator(`main [data-policy="${policyId}"]`);
  await scope.getByRole('button', { name: 'Request a change' }).first().click();
  await page.selectOption(`#chg-type-${policyId}`, type);
  for (const [k, v] of Object.entries(values)) await page.fill(`#chg-${k}-${policyId}`, v);
  await page.getByRole('button', { name: 'Submit request' }).first().click();
  await page.waitForTimeout(300);
}
await change('POL-2026-0006', 'trip_extension', { newEndDate: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10) });
await page.selectOption('#viewer', HANA);
await page.waitForTimeout(200);
await change(medPol, 'add_member', { memberName: 'Omar Haddad', memberAge: '2', relation: 'child' });
await change(homePol, 'sum_insured_change', { newContentsValue: '220000' });
await area('Operations Console');
await nav('Service & Comms');
const svc = await main();
ok(/Add a family member/.test(svc) && /Change sum insured/.test(svc) && /Extend my trip/.test(svc), 'servicing agent received medical, home and travel changes');
await shot('p-service');

// ── Renewal
await nav('Renewals');
await page.selectOption('#ops-renew-policy', homePol);
ok(await page.locator('text=Updated rebuild value').first().isVisible(), 'home renewal asks for rebuild value');
await page.getByRole('button', { name: /Run Renewal Agent/ }).click();
ok(await page.locator('text=Rebuild-cost indexation').first().isVisible(), 'home renewal indexes sum insured');
await page.selectOption('#ops-renew-policy', medPol);
await page.getByRole('button', { name: /Run Renewal Agent/ }).click();
ok(await page.locator('text=Medical cost trend').first().isVisible(), 'medical renewal applies cost trend');
await page.selectOption('#ops-renew-policy', 'POL-2026-0006');
ok(await page.locator('text=Single-trip policy').first().isVisible(), 'single-trip travel flagged as not renewable');

// ── Chat
await area('Customer Portal');
await page.selectOption('#viewer', 'CUS-1003');
await page.getByRole('button', { name: 'Open chat assistant' }).click();
const chat = page.locator('section[role=dialog]');
const ask = async (q) => { await page.fill('#chat-input', q); await page.keyboard.press('Enter'); await page.waitForTimeout(900); };
const sees = async (t) => (await chat.getByText(t, { exact: false }).count()) > 0;
await ask('Am I covered for lost baggage?');
ok(await sees('Lost or delayed baggage is covered'), 'chat: travel baggage cover with limit');
await ask('Am I covered for a burst pipe at home?');
ok(await sees("don't have home cover"), 'chat: no home policy for Layla → quote offer');
await ask('My suitcase was lost at the airport');
ok(await sees('lost or delayed baggage claim on your travel policy'), 'chat: travel FNOL guidance');
await chat.getByRole('button', { name: 'Report it here in chat' }).last().click();
await page.waitForTimeout(400);
for (const a of ['yesterday', 'Rome Fiumicino airport', 'My checked suitcase did not arrive on the connecting flight to Rome.', '2600', 'Not yet']) await ask(a);
await chat.getByRole('button', { name: 'Submit claim' }).last().click();
await page.waitForTimeout(400);
ok(await sees('lost or delayed baggage claim CLM-'), 'chat: travel claim registered');
ok(await sees('Upload sample'), 'chat: outstanding documents offered');
await ask('Extend my trip');
await page.waitForTimeout(400);
ok(await sees('There is already an open') || await sees('new return date'), 'chat: trip extension flow');
await chat.getByRole('button', { name: 'Close chat' }).click();
await page.selectOption('#viewer', 'CUS-1002');
await page.getByRole('button', { name: 'Open chat assistant' }).click();
await page.waitForTimeout(300);
await ask('Add my newborn to medical');
await page.waitForTimeout(400);
for (const a of ['Noor Raman', '0', 'daughter']) await ask(a);
ok(await sees('Shall I go ahead?'), 'chat: add member flow collected');
await chat.getByRole('button', { name: 'Submit request' }).last().click();
await page.waitForTimeout(300);
ok(await sees('underwriter will review'), 'chat: new member routed to underwriter');
await page.screenshot({ path: `${SHOTS}/p-chat.png` });

// mobile quote form
await chat.getByRole('button', { name: 'Close chat' }).click();
await pnav('Medical');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
ok(sw <= 390, 'no horizontal scroll on mobile medical quote: ' + sw);
await shot('p-mobile-medical');

ok(errors.length === 0, 'no runtime errors ' + JSON.stringify(errors));
await browser.close();
