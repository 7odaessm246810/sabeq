/**
 * The session itself: the room opens shortly before, both sides come in, the mentor closes the
 * session after it ends, and the student rates it — the rating shows on the mentor's profile.
 */
import { newPhone, signIn } from '../support/auth.js';
import { closeDb, createMentor, latestBooking, moveSession } from '../support/db.js';
import { API } from '../support/env.js';
import { bookAndPay } from '../support/flows.js';
import { a11y, expect, test } from '../support/fixtures.js';

test.afterAll(closeDb);

test('enter the room, the mentor completes it, the student rates it', async ({ page, browser }) => {
  const mentorPhone = newPhone();
  const slug = await createMentor(mentorPhone, 'نور الهدى');
  const studentPhone = newPhone();

  await signIn(page, studentPhone, { name: 'كريم فاروق' });
  await bookAndPay(page, slug);
  const booking = await latestBooking(studentPhone);

  // Starts in five minutes: the room is open (it opens ten minutes before).
  await moveSession(booking.id, 5);
  await page.goto('/sessions');
  await page.getByRole('link', { name: 'ادخل الجلسة' }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${booking.id}`));
  await expect(page.getByRole('heading', { name: 'إنت في الجلسة' })).toBeVisible();
  await expect(page.getByText('نور لسه ما دخلش')).toBeVisible();
  await a11y(page, 'session room');

  // The mentor, on another device, sees the student came in.
  const mentorContext = await browser.newContext({ locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
  const mentor = await mentorContext.newPage();
  await signIn(mentor, mentorPhone, { mentor: true });
  await mentor.goto(`/sessions/${booking.id}`);
  await expect(mentor.getByRole('heading', { name: 'إنت في الجلسة' })).toBeVisible();
  await expect(mentor.getByText('كريم دخل الجلسة')).toBeVisible();
  await expect(mentor.getByText('أسئلة الطالب')).toBeVisible();

  // An hour later the session is over: the mentor closes it.
  await moveSession(booking.id, -60);
  await mentor.reload();
  await mentor.getByRole('button', { name: 'الجلسة خلصت' }).click();
  await expect(mentor.getByText('اتسجلت الجلسة مكتملة')).toBeVisible();
  await mentorContext.close();

  // The student rates it, once.
  await page.goto('/sessions');
  await page.getByRole('tab', { name: 'السابقة' }).click();
  const row = page.locator('.sess-row').filter({ hasText: 'نور الهدى' });
  await row.getByRole('button', { name: 'قيّم الجلسة' }).click();
  const dialog = page.getByRole('dialog', { name: 'الجلسة كانت مفيدة؟' });
  await dialog.getByRole('radio', { name: '5 من 5' }).click();
  const text = 'فهمت الفرق بين الأقسام وإزاي أذاكر أول سنة.';
  await dialog.getByLabel('إيه أكتر حاجة فادتك؟').pressSequentially(text);
  await a11y(page, 'rating dialog');
  await dialog.getByRole('button', { name: 'ابعت التقييم' }).click();
  await expect(row.getByText('شكرًا على تقييمك')).toBeVisible();

  // The profile page caches the mentor for a minute (lib/mentors.ts); the reviews API is live.
  const res = await page.request.get(`${API}/api/v1/mentors/${slug}/reviews`);
  expect(res.ok()).toBe(true);
  const { data } = (await res.json()) as {
    data: { rating: number; ratingCount: number; reviews: { text: string; name: string }[] };
  };
  expect(data).toMatchObject({ rating: 5, ratingCount: 1 });
  expect(data.reviews[0]).toMatchObject({ text, name: 'كريم' });
});
