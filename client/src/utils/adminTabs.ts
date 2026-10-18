/**
 * Which dashboard tabs each admin tier may open.
 *
 * The active tab can arrive from three places a normal admin controls or
 * inherits — `location.state.tab` (any link can set it), the tab remembered
 * from the last visit (possibly a super admin's, on a shared machine), and a
 * click — and each used to be trusted as-is. A normal admin landing on
 * 'revenue' saw a broken, half-rendered super-admin screen. Every source now
 * goes through resolveAdminTab.
 */

export type AdminRole = 'admin' | 'super_admin';

export type AdminTab =
  | 'analytics'
  | 'doctors'
  | 'admins'
  | 'reviews'
  | 'bankDetails'
  | 'weeklyPayouts'
  | 'revenue'
  | 'enquiries'
  | 'articles';

/** Sidebar order. */
export const ADMIN_TABS: readonly AdminTab[] = [
  'analytics', 'doctors', 'admins', 'reviews', 'bankDetails', 'weeklyPayouts', 'revenue', 'enquiries', 'articles',
];

const SUPER_ADMIN_ONLY: ReadonlySet<AdminTab> = new Set<AdminTab>([
  'admins', 'bankDetails', 'weeklyPayouts', 'revenue', 'enquiries', 'articles',
]);

export const DEFAULT_ADMIN_TAB: AdminTab = 'analytics';

export function tabsForRole(role: AdminRole | string | null | undefined): AdminTab[] {
  if (role === 'super_admin') return [...ADMIN_TABS];
  if (role === 'admin') return ADMIN_TABS.filter((tab) => !SUPER_ADMIN_ONLY.has(tab));
  return [];
}

export function isTabAllowed(tab: unknown, role: AdminRole | string | null | undefined): tab is AdminTab {
  return typeof tab === 'string' && tabsForRole(role).includes(tab as AdminTab);
}

/** The first candidate this role may open, else the default. */
export function resolveAdminTab(role: AdminRole | string | null | undefined, ...candidates: unknown[]): AdminTab {
  for (const candidate of candidates) {
    if (isTabAllowed(candidate, role)) return candidate;
  }
  return DEFAULT_ADMIN_TAB;
}

const REMEMBERED_TAB_KEY = 'veraawell:adminTab';

/** The last tab opened in this browser — unvalidated; pass it through resolveAdminTab. */
export function readRememberedTab(): string | null {
  try {
    return window.localStorage.getItem(REMEMBERED_TAB_KEY);
  } catch {
    return null;
  }
}

export function rememberTab(tab: AdminTab): void {
  try {
    window.localStorage.setItem(REMEMBERED_TAB_KEY, tab);
  } catch {
    /* storage blocked: the dashboard just opens on the default next time */
  }
}
