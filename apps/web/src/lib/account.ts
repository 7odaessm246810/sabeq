/** The signed-in user's own account (`/api/v1/me`, Phase 08). */
import type { StudentTrack } from '@sabeq/types';
import { api } from './api';

export interface StudentProfile {
  track: StudentTrack | null;
  schoolYear: number | null;
  governorate: string | null;
  interests: string[];
}

export interface Profile {
  fullName: string | null;
  phone: string;
  role: 'student' | 'mentor' | 'admin';
  student: StudentProfile | null;
}

export type ProfileUpdate = Partial<{
  fullName: string;
  track: StudentTrack | null;
  schoolYear: number | null;
  governorate: string | null;
  interests: string[];
}>;

export interface Device {
  id: string;
  label: string;
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
}

export const getProfile = () => api<{ profile: Profile }>('/me/profile').then((d) => d.profile);

export const updateProfile = (patch: ProfileUpdate) =>
  api<{ profile: Profile }>('/me/profile', { method: 'PATCH', body: patch }).then((d) => d.profile);

export const listDevices = () => api<{ devices: Device[] }>('/me/devices').then((d) => d.devices);

export const signOutDevice = (id: string) =>
  api(`/me/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
