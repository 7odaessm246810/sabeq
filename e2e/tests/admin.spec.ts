/**
 * Support and finance in the admin app: the numbers, a full refund that settles a dispute,
 * suspending an account (signed out at once), paying a mentor — and the audit log.
 */
import { newPhone, signIn, signInAdmin } from '../support/auth.js';
import { addEarning, closeDb, createMentor, ensureAdmin } from '../support/db.js';
import { ADMIN } from '../support/env.js';
import { bookAndPay } from '../support/flows.js';
import { a11y, expect, test } from '../support/fixtures.js';

test.afterAll(closeDb);

const context = { locale: 'ar-EG', timezoneId: 'Africa/Cairo' } as const;

test('refund a booking, suspend an account, pay a mentor — all audited', async ({
  page,
  browser,
}) => {
  const mentorPhone = newPhone();
  const slug = await createMentor(mentorPhone, 'هبة سليمان');
  const studentPhone = newPhone();
  const studentContext = await browser.newContext(context);
  const student = await studentContext.newPage();
  await signIn(student, studentPhone, { name: 'عمرو سعيد' });
  await bookAndPay(student, slug);

  const adminPhone = newPhone();
  await ensureAdmin(adminPhone);
  await signInAdmin(page, adminPhone);
  await page.goto(`${ADMIN}/overview`);
  await expect(page.getByRole('heading', { name: 'نظرة عامة' })).toBeVisible();
  await a11y(page, 'admin overview');

  // A dispute: support refunds the whole booking.
  await page.goto(`${ADMIN}/bookings`);
  // By phone: unique to this run (names repeat across runs).
  await page.getByRole('searchbox', { name: 'دوّر' }).fill(studentPhone);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row')).toHaveCount(2); // header + this booking
  await page.getByRole('row').filter({ hasText: 'عمرو سعيد' }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'تفاصيل الحجز' })).toBeVisible();
  await a11y(page, 'booking detail');
  await page.getByRole('button', { name: 'رجّع المبلغ كله' }).click();
  const refund = page.getByRole('dialog');
  await refund.getByLabel('سبب الاسترداد').pressSequentially('المرشد اعتذر في آخر لحظة');
  await refund.getByRole('button', { name: /^رجّع/ }).click();
  await expect(page.getByText('اترجع المبلغ كله للطالب')).toBeVisible();
  await expect(page.getByText(/ملغاة · تم الاسترداد/)).toBeVisible();

  // An account breaking the rules: suspended, signed out on the spot.
  await page.goto(`${ADMIN}/users`);
  await page.getByRole('searchbox', { name: 'دوّر' }).fill(studentPhone);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row')).toHaveCount(2); // header + this account
  const userRow = page.getByRole('row').filter({ hasText: 'عمرو سعيد' });
  await userRow.getByRole('button', { name: 'وقّف الحساب' }).click();
  const suspend = page.getByRole('dialog');
  await suspend.getByLabel('السبب').pressSequentially('سبام متكرر');
  await suspend.getByRole('button', { name: 'وقّف الحساب' }).click();
  await expect(page.getByText('اتوقف الحساب')).toBeVisible();
  await student.goto('/sessions');
  await expect(student).toHaveURL(/\/login/);
  await studentContext.close();

  // Finance pays the mentor what they earned.
  await addEarning(mentorPhone, 36_000);
  const mentorContext = await browser.newContext(context);
  const mentor = await mentorContext.newPage();
  await signIn(mentor, mentorPhone, { mentor: true });
  await mentor.goto('/account/mentor');
  await mentor.getByLabel('طريقة الاستلام').selectOption('instapay');
  await mentor.getByLabel('عنوان InstaPay').pressSequentially('heba@instapay');
  await mentor.getByRole('button', { name: 'احفظ', exact: true }).click();
  await expect(mentor.getByText(/InstaPay · he•••@instapay/)).toBeVisible();

  await page.goto(`${ADMIN}/payouts`);
  const owed = page.getByRole('row').filter({ hasText: 'هبة سليمان' });
  await expect(owed).toContainText('360');
  await owed.getByRole('button', { name: 'سجّل تحويل' }).click();
  const transfer = page.getByRole('dialog');
  await expect(transfer.getByText('heba@instapay')).toBeVisible();
  await transfer.getByLabel('رقم العملية').pressSequentially('IP-E2E-0001');
  await transfer.getByRole('button', { name: 'سجّل التحويل' }).click();
  await expect(page.getByText(/اتسجل تحويل 360/)).toBeVisible();
  await a11y(page, 'payouts');

  // The mentor sees it.
  await mentor.goto('/account/mentor');
  await expect(mentor.locator('.money-row')).toContainText('360');
  await mentorContext.close();

  // Every one of those actions is in the log.
  await page.goto(`${ADMIN}/audit`);
  for (const action of [
    'استرداد كامل من الدعم',
    'اتوقف حساب',
    'اتفتحت بيانات تحويل مرشد',
    'اتسجل تحويل لمرشد',
  ])
    await expect(page.getByText(action).first()).toBeVisible();
  await a11y(page, 'audit log');
});
