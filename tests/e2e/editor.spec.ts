import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const isLocalApp =
      requestUrl.protocol === 'http:' &&
      requestUrl.hostname === '127.0.0.1' &&
      requestUrl.port === '4173';

    if (isLocalApp) {
      await route.continue();
      return;
    }

    await route.abort('blockedbyclient');
  });
});

test('renders the raw editor and updates the real Markdown preview', async ({
  page,
}) => {
  await page.goto('/');

  const source = page.getByRole('textbox', { name: 'Raw Markdown source' });
  const preview = page.getByLabel('Rendered Markdown preview');

  await expect(source).toBeVisible();
  await expect(preview).toBeVisible();
  await source.fill('### Browser test heading\n\n**bold browser text**');

  await expect(preview).toContainText('Browser test heading');
  await expect(preview).toContainText('bold browser text');
});

test('downloads the exact current raw Markdown without external requests', async ({
  page,
}) => {
  await page.goto('/');

  const source = page.getByRole('textbox', { name: 'Raw Markdown source' });
  const markdown = '# Café\n\n- first\n- second\n';
  await source.fill(markdown);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown document' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('chiri-document.md');
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  await expect.poll(async () => readFile(downloadPath!, 'utf8')).toBe(markdown);
});

test('opens help and empty document history without external requests', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Open editor help' }).click();
  await expect(page.getByRole('dialog', { name: 'How AI suggestions work' })).toBeVisible();
  await page.getByRole('button', { name: 'Close editor help' }).click();

  await page.getByRole('button', { name: /Open document history/ }).click();
  await expect(page.getByRole('dialog', { name: 'Document History' })).toContainText(
    'Accepted AI changes will appear here',
  );
});
