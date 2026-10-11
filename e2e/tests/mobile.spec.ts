/** On a phone (Pixel 7): no sideways scrolling, the menu works, and a student can book and pay. */
import { newPhone, signIn } from '../support/auth.js';
import { closeDb, createMentor } from '../support/db.js';
import { bookAndPay } from '../support/flows.js';
import { a11y, expect, test } from '../support/fixtures.js';
import type { Page } from '@playwright/test';

test.afterAll(closeDb);

async function noSideScroll(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} scrolls sideways`).toBeLessThanOrEqual(1);
}

test('pages fit the screen and the menu opens', async ({ page }) => {
  for (const path of ['/', '/explore', '/mentors', '/login', '/become-mentor']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await noSideScroll(page, path);
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'القائمة' }).click();
  const menu = page.locator('#mobile-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'استكشف الكليات' }).first()).toBeVisible();
  await a11y(page, 'mobile menu');
});

test('a student books and pays on a phone', async ({ page }) => {
  const slug = await createMentor(newPhone(), 'مرشد الموبايل');
  await signIn(page, newPhone(), { name: 'ليلى منصور' });
  await bookAndPay(page, slug);
  await noSideScroll(page, 'booking confirmed');
  await page.goto('/sessions');
  await expect(page.locator('.sess-row').filter({ hasText: 'مرشد الموبايل' })).toBeVisible();
  await noSideScroll(page, 'sessions');
  await a11y(page, 'sessions on a phone');
});
