// Orchestrator Agent test: guardrails, read-only commands, autopilot plan execution, hand-offs, shared state.
import { chromium } from 'playwright';
import path from 'node:path';
const SHOTS = process.env.SHOTS || '/tmp/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };

const PMENU = { 'Get a Quote': 'Products', 'Motor': 'Products', 'Travel': 'Products', 'Medical': 'Products', 'Home': 'Products', 'All products': 'Products', 'Register a Claim': 'Claims', 'Track Claims': 'Claims', 'My Policies': 'My Account', 'Renewal': 'My Account' };
const pnav = async (label) => { await page.locator('header [data-menu]', { hasText: PMENU[label] }).first().click(); await page.locator('[data-portal-nav]', { hasText: label }).first().click(); };
const nav = (l) => page.locator('aside nav button', { hasText: l }).click();
const send = async (t) => { await page.fill('#orch-command', t); await page.getByRole('button', { name: 'Send' }).click(); };
const latest = () => page.locator('main ol > li').first();

await page.goto('file://' + path.resolve('dist/index.html'));
await page.getByRole('tab', { name: 'Operations Console' }).click();
ok(await page.locator('text=Orchestrator Agent ·').isVisible(), 'overview shows orchestrator banner');
await nav('Orchestrator Agent');
ok((await page.locator('text=Orchestrator can act (9)').count()) === 1, 'queue finds 9 actionable items');
ok((await page.locator('text=Waiting on people (2)').count()) === 1, 'queue finds 2 items waiting on people');

await send('Approve CLM-2026-0102');
await page.waitForSelector('text=Declined');
ok(await latest().locator('text=reserved for authorised people').isVisible(), 'approve request refused by guardrail');
await send('Send the renewal email to Daniel');
await page.waitForTimeout(200);
ok(await latest().locator("text=I don't send messages").isVisible(), 'send request refused');
await send('Status');
await page.waitForTimeout(200);
ok(await latest().locator('text=4 claim(s) ready for investigation: CLM-2026-0103').isVisible(), 'status report lists queue');
await send('blah blah');
await page.waitForTimeout(200);
ok(await latest().locator("text=I didn't recognise that instruction.").isVisible(), 'unknown command handled');

await page.getByRole('button', { name: /Run Orchestrator on all pending work/ }).click();
await page.waitForTimeout(2500);
ok(await page.locator('text=Running plan').isVisible(), 'plan running live');
await page.screenshot({ path: `${SHOTS}/orch-running.png` });
await page.waitForSelector('text=Completed 9 of 9 step(s)', { timeout: 60000 });
const card = latest();
ok(await card.locator('text=Routed to Human Approval Queue').first().isVisible(), 'claim investigation dispatched and routed');
ok(await card.locator('text=RNW-0001 drafted').first().isVisible(), 'renewal drafted');
ok(await card.locator('text=Outstanding before conversion').first().isVisible(), 'quote readiness checked');
ok(await card.locator('text=Handed to people').last().isVisible(), 'hand-offs listed');
ok(await card.locator('text=needs approval').first().isVisible(), 'service request assessed and routed to underwriter');
ok(await card.locator('text=MSG-0001 drafted').first().isVisible(), 'customer message drafted');
ok((await page.locator('text=Orchestrator can act (0)').count()) === 1, 'queue now empty for orchestrator');
await page.screenshot({ path: `${SHOTS}/orch-done.png` });

await send('Investigate CLM-2026-0103');
await page.waitForTimeout(300);
ok(await latest().locator("text=won't re-run it until a person decides").isVisible(), 'will not re-run while awaiting human');

// shared state
await nav('Claims Management');
ok(await page.locator('tr', { hasText: 'CLM-2026-0103' }).locator('text=Awaiting Human Review').isVisible(), 'claim status updated in ops');
await page.getByRole('tab', { name: 'Customer Portal' }).click();
await pnav('Track Claims');
ok(await page.locator('text=Awaiting Human Review').first().isVisible(), 'portal shows same status');
await page.getByRole('tab', { name: 'Operations Console' }).click();
await nav('Agent Command Center');
ok(await page.locator('text=Coordinates all agentic work').isVisible(), 'command center lists Orchestrator Agent');
await nav('Audit Trail');
await page.fill('#audit-search', 'Orchestrator');
ok((await page.locator('tbody tr').count()) >= 8, 'orchestrator actions audited');
await nav('Service & Comms');
ok(await page.locator('text=Awaiting underwriter').first().isVisible(), 'service page shows pending request');
await page.getByRole('button', { name: 'Approve & apply' }).first().click();
ok(await page.locator('text=Decided by Omar Saleh').first().isVisible(), 'underwriter approval applied');
await page.locator('li button', { hasText: 'Reminder:' }).first().click();
await page.getByRole('button', { name: 'Approve for sending' }).click();
ok(await page.locator('text=Not sent (demo)').first().isVisible(), 'message approved, not sent');
await page.screenshot({ path: `${SHOTS}/service.png` });
await nav('Quotes & Policies');
await page.getByRole('tab', { name: /Policies/ }).click();
ok(await page.locator('text=SAR').first().isVisible(), 'policies listed');
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('main nav button', { hasText: 'Orchestrator Agent' }).click();
ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, 'mobile layout fits');
await page.screenshot({ path: `${SHOTS}/orch-mobile.png` });
ok(errors.length === 0, 'no runtime errors ' + errors.join('; '));
await browser.close();
