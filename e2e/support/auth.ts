/** Signing in like a person (ADR-0017): sign up or log in with email + password; admins add the app code. */
import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, accountExists, afterSignUp, emailFor } from './db.js';
import { ADMIN } from './env.js';
import { totp } from './totp.js';

let seq = Math.floor(Math.random() * 9_000_000);
/** A fresh Egyptian mobile number per user (015…): names each journey's people, unique per run. */
export const newPhone = () => `015${String(++seq % 1e8).padStart(8, '0')}`;

/**
 * Website: a new number signs up (and, for a new student, fills «أهلًا بيك»); a known one logs in.
 * New accounts get their email confirmed directly, as booking needs.
 */
export async function signIn(
  page: Page,
  phone: string,
  opts: { mentor?: boolean; name?: string } = {},
) {
  if (await accountExists(phone)) {
    await page.goto('/login');
    await page.locator('#em').fill(emailFor(phone));
    await page.locator('#pw').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'دخول', exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    return;
  }

  await page.goto('/register');
  if (opts.mentor) await page.getByRole('button', { name: 'أنا مستشار' }).click();
  await page.locator('#nm').fill(opts.name ?? (opts.mentor ? 'مستشار الاختبار' : 'طالب الاختبار'));
  await page.locator('#em').fill(emailFor(phone));
  await page.locator('#pw').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'اعمل الحساب' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/register'));
  await afterSignUp(phone);
  if (page.url().includes('/welcome') && opts.name) {
    await expect(page.getByLabel('اسمك')).toHaveValue(opts.name);
    await page.getByRole('button', { name: 'علمي علوم' }).click();
    await page.getByRole('button', { name: 'تالتة ثانوي' }).click();
    await page.getByRole('button', { name: 'يلا نبدأ' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/welcome'));
  }
}

/**
 * Admin app (an admin account must exist — `ensureAdmin`, which leaves the app code unset): the
 * password, then the app set up from the key shown and its current code.
 */
export async function signInAdmin(page: Page, phone: string) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('الإيميل').fill(emailFor(phone));
  await page.getByLabel('الباسورد').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'التالي' }).click();
  const key = page.locator('.adm-totp-setup code');
  await expect(key).toBeVisible();
  await page
    .getByLabel('الكود اللي ظاهر في تطبيق المصادقة')
    .fill(totp((await key.textContent()) ?? ''));
  await page.getByRole('button', { name: 'دخول' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
