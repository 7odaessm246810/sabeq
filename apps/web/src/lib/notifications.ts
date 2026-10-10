/** Notifications (Phase 19): the bell, the list, and the account's email address. */
import { api } from './api';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  /** Where it leads on the website. */
  link: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  unread: number;
  nextBefore: string | null;
}

export const listNotifications = (before?: string, limit = 20) =>
  api<NotificationPage>(
    `/me/notifications?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`,
  );

export const unreadNotifications = () =>
  api<{ unread: number }>('/me/notifications/unread').then((d) => d.unread);

/** These, or all of them. */
export const markNotificationsRead = (ids?: string[]) =>
  api<{ marked: number }>('/me/notifications/read', {
    method: 'POST',
    body: ids ? { ids } : {},
  });

export interface EmailState {
  email: string | null;
  verified: boolean;
  /** Local development only: the confirmation link (no email leaves the machine). */
  devLink?: string;
}

export const getEmail = () => api<EmailState>('/me/email');
export const setEmail = (email: string) =>
  api<EmailState>('/me/email', { method: 'PUT', body: { email } });
export const resendEmail = () => api<EmailState>('/me/email/resend', { method: 'POST' });
export const removeEmail = () => api<EmailState>('/me/email', { method: 'DELETE' });
export const verifyEmail = (token: string) =>
  api<EmailState>('/email/verify', { method: 'POST', body: { token } });

const RELATIVE = new Intl.RelativeTimeFormat('ar-EG', { numeric: 'auto' });

/** «من 5 دقايق», «امبارح» … — `now` is passed in so rendering stays pure. */
export function timeAgo(iso: string, now: number): string {
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, 'hour');
  return RELATIVE.format(Math.round(hours / 24), 'day');
}
