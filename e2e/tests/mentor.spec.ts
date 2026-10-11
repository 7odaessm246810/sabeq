/**
 * A mentor: hears about a new booking (the bell), sees it with their earning, sets how they get
 * paid, and opens their weekly hours.
 */
import { newPhone, signIn } from '../support/auth.js';
import { closeDb, createMentor } from '../support/db.js';
import { bookAndPay } from '../support/flows.js';
import { a11y, expect, test } from '../support/fixtures.js';

test.afterAll(closeDb);

test('a new booking rings the bell; payout method; weekly hours', async ({ page, browser }) => {
  const mentorPhone = newPhone();
  const slug = await createMentor(mentorPhone, 'ياسمين عادل');

  // A student books and pays.
  const studentContext = await browser.newContext({ locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
  const student = await studentContext.newPage();
  await signIn(student, newPhone(), { name: 'مازن حسام' });
  await bookAndPay(student, slug);
  await studentContext.close();

  await signIn(page, mentorPhone, { mentor: true });
  await page.goto('/');
  const bell = page.getByRole('button', { name: /^الإشعارات، \d+ جديدة$/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const panel = page.getByRole('dialog', { name: 'الإشعارات' });
  await expect(panel.getByText('حجز جديد')).toBeVisible();
  await a11y(page, 'notifications panel');
  await panel.getByRole('button', { name: /حجز جديد/ }).click();
  await expect(page).toHaveURL(/\/sessions/);
  const row = page.locator('.sess-row').filter({ hasText: 'مازن حسام' });
  await expect(row).toBeVisible();
  await expect(row.getByText(/ليك/)).toContainText('180');

  // Payout method: stored encrypted, shown back masked.
  await page.goto('/account/mentor');
  await expect(page.getByRole('heading', { name: 'فلوسك' })).toBeVisible();
  await page.getByLabel('طريقة الاستلام').selectOption('vodafone_cash');
  await page.getByLabel('رقم فودافون كاش').pressSequentially('01012345678');
  await page.getByRole('button', { name: 'احفظ', exact: true }).click();
  await expect(page.getByText('فودافون كاش · •••• 5678')).toBeVisible();
  await a11y(page, 'mentor account');

  await page.goto('/account/availability');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await a11y(page, 'availability');

  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'الإشعارات', level: 1 })).toBeVisible();
  await a11y(page, 'notifications page');
});
