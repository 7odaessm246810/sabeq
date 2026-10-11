/** Steps several journeys share, done the way a student does them. */
import { expect, type Page } from '@playwright/test';

/** From a mentor's profile to the payment step with the first offered slot held. */
export async function holdFirstSlot(page: Page, mentorSlug: string) {
  await page.goto(`/mentor/${mentorSlug}`);
  await page.getByRole('link', { name: 'احجز الموعد ده' }).click();
  await page.waitForURL(/\/book\//);
  await page.getByRole('button', { name: /^كمّل/ }).first().click();
  await page.getByRole('button', { name: 'كمّل للدفع' }).click();
  await expect(page.getByRole('heading', { name: 'الدفع' })).toBeVisible();
}

/** On the payment step: pay with `method` and answer the (local) test checkout. */
export async function pay(page: Page, method: 'card' | 'wallet', outcome: 'success' | 'fail') {
  await page
    .getByRole('radio', { name: method === 'card' ? /بطاقة بنكية/ : /محفظة إلكترونية/ })
    .click();
  await page.getByRole('button', { name: /^ادفع .* وأكّد الحجز$/ }).click();
  await page.waitForURL(/\/payments\/fake\/checkout\//);
  await page
    .getByRole('button', { name: outcome === 'success' ? 'الدفع نجح' : 'البنك رفض العملية' })
    .click();
  await page.waitForURL(/\/done\?booking=/);
}

/** Holds the first slot and pays for it by card. */
export async function bookAndPay(page: Page, mentorSlug: string) {
  await holdFirstSlot(page, mentorSlug);
  await pay(page, 'card', 'success');
  await expect(page.getByRole('heading', { name: 'تم حجز جلستك' })).toBeVisible();
}
