/**
 * Every journey also watches the browser: a script error, a blocked resource (CSP) or a failed
 * request from our own API fails the test. `a11y(page)` runs axe and fails on serious problems.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

/** Expected answers that the UI handles (and shows) on purpose. */
const EXPECTED_API_ERRORS = [/\/auth\/me$/, /\/me\/profile$/];

export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
      page.on('console', (msg) => {
        const text = msg.text();
        if (/Content Security Policy|Refused to/i.test(text)) problems.push(`CSP: ${text}`);
      });
      page.on('response', (res) => {
        const url = res.url();
        if (res.status() >= 500 && url.includes('/api/'))
          problems.push(`${res.status()} ${res.request().method()} ${url}`);
      });
      page.on('requestfailed', (req) => {
        const url = req.url();
        if (url.includes('/api/') && !EXPECTED_API_ERRORS.some((r) => r.test(url)))
          if (!/aborted|ERR_ABORTED/i.test(req.failure()?.errorText ?? ''))
            problems.push(`failed ${req.method()} ${url}: ${req.failure()?.errorText}`);
      });
      await use(problems);
      expect(problems, 'browser problems during the journey').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Accessibility (WCAG 2.1 AA): no serious or critical violations. */
export async function a11y(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} — ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    );
  expect(bad, `accessibility on ${label}`).toEqual([]);
}
