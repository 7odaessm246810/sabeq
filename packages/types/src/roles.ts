/**
 * One account = one role. A student cannot also be a mentor on the same account (ADR-0008).
 */
export const USER_ROLES = ['student', 'mentor', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Admin permissions are scoped; not every admin can touch money or verification. */
export const ADMIN_ROLES = ['super_admin', 'verifier', 'support', 'finance'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ACCOUNT_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
