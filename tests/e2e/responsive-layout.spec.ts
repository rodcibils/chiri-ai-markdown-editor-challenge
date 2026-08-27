import { expect, test } from '@playwright/test';

test('keeps the application within the viewport on narrow screens', async ({
  page,
}) => {
  await page.goto('/');

  const viewport = page.locator('.app-shell');
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);

  await expect(viewport).toBeVisible();
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
});
