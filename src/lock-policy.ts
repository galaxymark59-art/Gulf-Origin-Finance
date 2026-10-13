export const shouldLockOnReturn = (
  hasPin: boolean,
  leftAt: number | null,
  now: number,
) => hasPin && leftAt !== null && now - leftAt >= 30000;
export const shouldLockForInactivity = (
  hasPin: boolean,
  lastActivity: number,
  now: number,
) => hasPin && now - lastActivity >= 120000;
