// End-to-end lifecycle test: quote → policy → claim → investigation → approval → docs → re-run → tracking → audit → renewal.
import { chromium } from 'playwright';
import path from 'node:path';
const SHOTS = process.env.SHOTS || '/tmp/shots';
const url = 'file://' + path.resolve('dist/index.html');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL/.test(m.text())) errors.push('console: ' + m.text()); });
const ok = (cond, msg) => { if (!cond) { console.log('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };

const PMENU = { 'Get a Quote': 'Products', 'Motor': 'Products', 'Travel': 'Products', 'Medical': 'Products', 'Home': 'Products', 'All products': 'Products', 'Register a Claim': 'Claims', 'Track Claims': 'Claims', 'My Policies': 'My Account', 'Renewal': 'My Account' };
const pnav = async (label) => { await page.locator('header [data-menu]', { hasText: PMENU[label] }).first().click(); await page.locator('[data-portal-nav]', { hasText: label }).first().click(); };
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const nav = (label) => page.locator('aside nav button', { hasText: label }).click();
const area = (a) => page.getByRole('tab', { name: a }).click();

await page.goto(url);
await page.waitForSelector('text=Insure now');
await shot('01-products');

// Step 1 quote
await pnav('Motor');
await page.getByRole('button', { name: 'Generate Quote' }).click();
await page.waitForSelector('text=Quote QTE-2026-0008');
ok(await page.locator('text=How the premium was calculated').isVisible(), 'quote priced and breakdown shown');
ok(await page.locator('text=VIN / chassis number (required before policy issue)').first().isVisible(), 'missing VIN identified');
await shot('02-quote');
// validation path
await page.getByRole('button', { name: 'Clear' }).click();
await page.getByRole('button', { name: 'Generate Quote' }).click();
ok(await page.locator('text=field(s) need attention').first().isVisible(), 'empty form shows validation errors');
await page.getByRole('button', { name: 'Sample' }).click();
await page.getByRole('button', { name: 'Generate Quote' }).click();
await page.waitForSelector('text=Quote QTE-2026-0009');

// Step 2 policy
await page.getByRole('button', { name: /Convert to demo policy/ }).click();
await page.getByRole('button', { name: 'Run Policy Agent checks' }).click();
ok(await page.locator('text=Outstanding requirements').first().isVisible(), 'policy agent flags outstanding requirements');
await page.fill('#p-vin', '2T3W1RFV8RW012045');
await page.fill('#p-address', '9 Oasis Lane, Al Yasmin, Riyadh');
await page.getByRole('button', { name: 'Run Policy Agent checks' }).click();
ok(await page.getByRole('button', { name: /Create demo policy/ }).isDisabled(), 'create disabled until confirmed');
await page.check('#p-confirm');
await page.getByRole('button', { name: /Create demo policy/ }).click();
await page.waitForSelector('text=Demo policy POL-2026-0007 created');
ok(await page.locator('text=Demo record · not a real contract').first().isVisible(), 'policy marked as demo');
await shot('03-policy');

// Step 3 claim
await page.getByRole('button', { name: /Register a claim/ }).first().click();
await page.getByRole('button', { name: 'Submit claim' }).click();
await page.waitForSelector('text=Claim registered');
const claimId = (await page.locator('main .font-mono.text-\\[22px\\]').innerText()).trim();
ok(claimId === 'CLM-2026-0108', 'claim reference generated ' + claimId);
await page.getByRole('button', { name: /Track this claim/ }).click();
ok(await page.locator('text=Claim Registered').first().isVisible(), 'portal shows Claim Registered');

// Step 4 investigation in ops
await area('Operations Console');
await nav('Claims Management');
await page.locator('tr', { hasText: claimId }).click();
await page.getByRole('button', { name: /Run agentic claims investigation/i }).click();
await page.waitForTimeout(1500);
ok(await page.locator('text=Under Investigation').first().isVisible(), 'status Under Investigation while running');
await shot('04-running');
await page.waitForSelector('text=Consolidated investigation report', { timeout: 20000 });
ok(await page.locator('text=Request missing documents: police / traffic report').first().isVisible(), 'supervisor recommends requesting police report');
const completed = await page.locator('text=Completed').count();
ok(completed >= 5, 'five agent steps completed: ' + completed);
// expand each agent
for (const a of ['Document Intelligence Agent', 'Fraud Investigation Assistant']) await page.locator('button', { hasText: a }).first().click();
ok(await page.locator('text=Structured output').first().isVisible(), 'agent output inspectable');
await shot('05-report');

// Step 5 approve recommended (request docs)
await page.fill('textarea[id^="notes-"]', 'Agree. Police report needed before assessment.');
await page.getByRole('button', { name: /Approve recommended next step/ }).click();
await page.waitForTimeout(300);
ok(await page.locator('text=Documents Required').first().isVisible(), 'ops status Documents Required');

// Step 6 customer uploads
await area('Customer Portal');
await pnav('Track Claims');
await page.locator('main button', { hasText: claimId }).first().click();
ok(await page.locator('text=Additional Documents Required').first().isVisible(), 'portal shows Additional Documents Required');
await page.getByRole('button', { name: /Upload sample police/ }).click();
ok(await page.locator('text=Documents Received').first().isVisible(), 'portal shows Documents Received');
await shot('06-tracker');

// Re-run
await area('Operations Console');
await nav('Claims Management');
await page.locator('tr', { hasText: claimId }).click();
await page.getByRole('button', { name: /Re-run agentic claims investigation/i }).click();
await page.waitForSelector('text=Routed to human review', { timeout: 20000 }).catch(() => {});
await page.waitForFunction(() => document.body.innerText.includes('Awaiting Human Review'), null, { timeout: 20000 });
const rec = await page.locator('text=Recommended next action').locator('..').innerText();
console.log('     second recommendation:', rec.split('\n')[1]);
await page.getByRole('button', { name: /Approve recommended next step/ }).click();
await page.waitForTimeout(300);
ok(await page.locator('text=Assessment Completed').first().isVisible(), 'ops shows Assessment Completed');

await area('Customer Portal');
await pnav('Track Claims');
await page.locator('main button', { hasText: claimId }).first().click();
ok(await page.locator('text=Assessment Completed').first().isVisible(), 'portal shows Assessment Completed');

// Audit trail
await area('Operations Console');
await nav('Audit Trail');
await page.fill('#audit-search', claimId);
const auditCount = await page.locator('tbody tr').count();
ok(auditCount >= 15, 'audit events for claim: ' + auditCount);
await shot('07-audit');

// Seeded hero scenario
await nav('Executive Overview');
await page.locator('text=Ready-to-run scenario').click();
await page.getByRole('button', { name: /Run agentic claims investigation/i }).click();
await page.waitForSelector('text=Consolidated investigation report', { timeout: 20000 });
const anomalies = await page.locator('h3', { hasText: 'Potential anomalies' }).innerText();
ok(/\((\d)\)/.exec(anomalies)?.[1] >= 3, 'scenario anomalies: ' + anomalies);
await page.getByRole('button', { name: /Escalate for review/ }).click();
ok(await page.locator('text=Escalated').first().isVisible(), 'escalate works');

// Approval queue reject path on seeded CLM-0102
await nav('Human Approval Queue');
await page.getByRole('button', { name: /Reject recommendation/ }).first().click();
ok(await page.locator('text=Nothing waiting for review').isVisible(), 'queue cleared after reject');

// Renewal
await nav('Renewals');
await page.getByRole('button', { name: /Run Renewal Agent/ }).click();
ok(await page.locator('text=Estimated renewal premium').first().isVisible(), 'renewal estimate shown');
await page.getByRole('button', { name: /Save renewal draft/ }).click();
ok(await page.locator('text=Draft saved').first().isVisible(), 'renewal draft saved');
await shot('08-renewal');

// Overview metrics link
await nav('Executive Overview');
await shot('09-overview');
await page.locator('button', { hasText: 'Awaiting human approval' }).click();
ok(await page.locator('h1', { hasText: 'Human approval queue' }).isVisible(), 'metric tile links to records');
await nav('Agent Command Center');
await shot('10-command');

// persistence
await page.reload();
await area('Operations Console');
await nav('Claims Management');
ok(await page.locator('tr', { hasText: claimId }).isVisible(), 'state persisted across reload');

// Reset
await page.locator('button[title="Reset Demo"]').click();
await page.getByRole('button', { name: 'Reset', exact: true }).click();
await nav('Claims Management');
ok(!(await page.locator('tr', { hasText: claimId }).isVisible()), 'reset restores original dataset');

// Mobile
await page.setViewportSize({ width: 390, height: 844 });
await area('Ops');
await page.locator('main nav button', { hasText: 'Claims Management' }).click();
await page.locator('tr', { hasText: 'CLM-2026-0103' }).click();
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
ok(sw <= 390, 'no horizontal page scroll on mobile: ' + sw);
await shot('11-mobile');

ok(errors.length === 0, 'no runtime errors ' + JSON.stringify(errors));
await browser.close();
