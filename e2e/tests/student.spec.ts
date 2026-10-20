/**
 * A new student: signs up, books a mentor, the bank refuses the card, pays by wallet, finds the
 * session in «جلساتي», and cancels it (the refund goes back).
 */
import { newPhone, signIn } from '../support/auth.js';
import { closeDb, createMentor } from '../support/db.js';
import { holdFirstSlot, pay } from '../support/flows.js';
import { a11y, expect, test } from '../support/fixtures.js';

test.afterAll(closeDb);

test('book, a refused card, pay by wallet, then cancel with a refund', async ({ page }) => {
  const slug = await createMentor(newPhone(), 'مستشار الطالب');

  await signIn(page, newPhone(), { name: 'سما يوسف' });
  await expect(page.getByRole('link', { name: 'جلساتي' }).first()).toBeVisible();

  await holdFirstSlot(page, slug);
  await expect(page.getByText(/الموعد محجوز ليك/)).toBeVisible();
  await a11y(page, 'payment step');

  // The bank says no: nothing is taken, the slot is still held, try another way.
  await pay(page, 'card', 'fail');
  await expect(page.getByText('الدفع ما تمش')).toBeVisible();
  await a11y(page, 'payment refused');
  await pay(page, 'wallet', 'success');
  await expect(page.getByRole('heading', { name: 'تم حجز جلستك' })).toBeVisible();
  await a11y(page, 'booking confirmed');

  await page.getByRole('link', { name: 'روح لجلساتي' }).click();
  const row = page.locator('.sess-row').filter({ hasText: 'مستشار الطالب' });
  await expect(row).toBeVisible();
  await expect(row.getByText('قادمة')).toBeVisible();
  await a11y(page, 'sessions');

  // Cancel: the dialog states the refund, then the money goes back.
  await row.getByRole('button', { name: 'إلغاء' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/هيرجعلك/)).toBeVisible();
  // Typed key by key: focus must stay in the field (the Modal focus bug, Phase 20).
  await dialog.getByLabel('سبب الإلغاء').pressSequentially('ظرف طارئ');
  await expect(dialog.getByLabel('سبب الإلغاء')).toHaveValue('ظرف طارئ');
  await dialog.getByRole('button', { name: 'إلغاء الجلسة' }).click();
  await expect(page.getByText('اتلغت الجلسة')).toBeVisible();

  await page.getByRole('tab', { name: 'السابقة' }).click();
  const past = page.locator('.sess-row').filter({ hasText: 'مستشار الطالب' });
  await expect(past.getByText(/تم الاسترداد/)).toBeVisible();
});
