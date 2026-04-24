import { chromium } from 'playwright-core';
import path from 'path';

const BASE = 'http://localhost:5000';
const DIR = '/tmp/screenshots-tabs';

const pagesToCheck = [
  { name: 'emprunts', path: '/asset-management/emprunts' },
  { name: 'valorisation', path: '/asset-management/valorisation' },
  { name: 'controle-gestion', path: '/asset-management/controle-gestion' },
  { name: 'arbitrages', path: '/asset-management/arbitrages' },
  { name: 'simulateur', path: '/asset-management/simulateur' },
  { name: 'reporting', path: '/asset-management/reporting' },
  { name: 'scis-associes', path: '/asset-management/scis-associes' },
  { name: 'patrimoine', path: '/asset-management/patrimoine' },
  { name: 'gl-kpi', path: '/gestion-locative/kpi' },
  { name: 'gl-projections', path: '/gestion-locative/projections' },
  { name: 'gl-controle-bailleur', path: '/gestion-locative/controle-bailleur' },
  { name: 'gl-indices', path: '/gestion-locative/indices' },
];

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  const page = await ctx.newPage();

  // Login
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', 'admin@test.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  for (const route of pagesToCheck) {
    console.log(`Capturing: ${route.name}`);
    await page.goto(BASE + route.path, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${DIR}/${route.name}.png`, fullPage: true });

    // Click all tabs
    const tabs = await page.$$('[role="tab"]');
    if (tabs.length > 1) {
      for (let i = 0; i < tabs.length; i++) {
        const tabText = await tabs[i].textContent();
        await tabs[i].click();
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: `${DIR}/${route.name}-tab${i}-${(tabText || '').replace(/[^a-zA-Z0-9àéèêëïîôùûüç]/gi, '_').substring(0, 25)}.png`,
          fullPage: true,
        });
      }
    }
  }

  await browser.close();
  console.log('Done!');
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
