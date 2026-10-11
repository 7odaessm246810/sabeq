/** Signing in like a person: phone → the code shown by local development → in. */
import { expect, type Page } from '@playwright/test';
import { ADMIN } from './env.js';

let seq = Math.floor(Math.random() * 9_000_000);
/** A fresh Egyptian mobile number per user (015…), so every run starts from scratch. */
export const newPhone = () => `015${String(++seq % 1e8).padStart(8, '0')}`;

async function readCode(page: Page) {
  const hint = page.getByText(/للتجربة على جهازك/);
  await expect(hint).toBeVisible();
  const code = /\d{6}/.exec((await hint.textContent()) ?? '')?.[0];
  if (!code) throw new Error('no local OTP code on the page');
  return code;
}

/** Website: signs in (and, for a new student, fills «أهلًا بيك» with this name). */
export async function signIn(
  page: Page,
  phone: string,
  opts: { mentor?: boolean; name?: string } = {},
) {
  await page.goto('/login');
  if (opts.mentor) await page.getByRole('button', { name: 'أنا مرشد' }).click();
  await page.locator('#ph').fill(phone);
  await page.getByRole('button', { name: 'ابعتلي الكود' }).click();
  const code = await readCode(page);
  await page.getByLabel('رقم 1', { exact: true }).click();
  await page.keyboard.type(code);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  if (page.url().includes('/welcome') && opts.name) {
    await page.getByLabel('اسمك').fill(opts.name);
    await page.getByRole('button', { name: 'علمي علوم' }).click();
    await page.getByRole('button', { name: 'تالتة ثانوي' }).click();
    await page.getByRole('button', { name: 'يلا نبدأ' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/welcome'));
  }
}

/** Admin app (an admin account must exist — `ensureAdmin`). */
export async function signInAdmin(page: Page, phone: string) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('رقم الموبايل').fill(phone);
  await page.getByRole('button', { name: 'ابعتلي الكود' }).click();
  const code = await readCode(page);
  await page.getByRole('textbox').first().fill(code);
  await page.getByRole('button', { name: 'دخول' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
