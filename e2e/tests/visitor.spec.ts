/** A visitor without an account: home → search → explore → a faculty → mentors → a mentor. */
import { a11y, expect, test } from '../support/fixtures.js';

test('home: search suggestions lead to a faculty', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await a11y(page, 'home');

  const search = page.getByRole('combobox').first();
  await search.click();
  await search.fill('هندسة');
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).not.toHaveURL(/\/$/);
});

test('explore: filters narrow the faculties and open one', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: 'استكشف الكليات' })).toBeVisible();
  await a11y(page, 'explore');

  await page.getByRole('searchbox').first().fill('طب القاهرة');
  await page.keyboard.press('Enter');
  await page.waitForURL(/q=/);
  await page.waitForLoadState('networkidle');
  const first = page.locator('a[href^="/college/"]').first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(/\/college\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await a11y(page, 'college');
});

test('mentors: the list, filters and a profile with real slots', async ({ page }) => {
  await page.goto('/mentors');
  const card = page.locator('a[href^="/mentor/"]').first();
  await expect(card).toBeVisible();
  await a11y(page, 'mentors');
  await card.click();
  await expect(page).toHaveURL(/\/mentor\//);
  await expect(page.getByRole('heading', { name: 'التقييمات' })).toBeVisible();
  // A client-side navigation sets the title a moment after the content; check once it is there.
  await expect(page).toHaveTitle(/سابق/);
  await a11y(page, 'mentor profile');
});

test('signed-out pages send you to sign in and back', async ({ page }) => {
  await page.goto('/sessions');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'دخول', exact: true })).toBeVisible();
  await a11y(page, 'login');

  // A wrong password: one answer whatever was wrong.
  await page.locator('#em').fill('nobody@test.sabeq');
  await page.locator('#pw').fill('not the password');
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await expect(page.getByText('الإيميل أو الباسورد غلط.')).toBeVisible();

  await page.getByRole('link', { name: 'اعمل حساب' }).click();
  await expect(page).toHaveURL(/\/register/);
  await expect(page.getByRole('button', { name: 'اعمل الحساب' })).toBeVisible();
  await a11y(page, 'register');

  // Without a real email sender (local, CI, staging for now) password links are not offered.
  await page.goto('/forgot-password');
  await expect(
    page.getByText('تغيير الباسورد بالإيميل مش متاح دلوقتي.', { exact: false }),
  ).toBeVisible();
  await a11y(page, 'forgot password');
});
