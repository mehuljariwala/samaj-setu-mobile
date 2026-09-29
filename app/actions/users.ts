'use server';

import { revalidatePath } from 'next/cache';

import { AppError, actionResult, type ActionResult } from '@/lib/data/errors';
import * as users from '@/lib/data/users';

/**
 * Switching accounts on and off, and resetting passwords. Both RPCs check the
 * caller's role, refuse self-service and staff accounts (unless superadmin),
 * and write the change to the account's activity log in the same transaction.
 */

const STATUSES = ['active', 'disabled', 'blocked'] as const;

export async function setAccountStatusAction(
  accountId: string,
  status: string,
  reason?: string,
): Promise<ActionResult<{ status: users.ManagedStatus; changed: boolean }>> {
  return actionResult(async () => {
    if (!STATUSES.includes(status as users.ManagedStatus)) {
      throw new AppError('invalid', 'Choose active, disabled or blocked.', ['status']);
    }
    if (status === 'blocked' && !reason?.trim()) {
      throw new AppError('invalid', 'Say why the account is being blocked.', ['reason']);
    }
    const result = await users.setAccountStatus(accountId, status as users.ManagedStatus, reason);
    revalidatePath('/admin/users', 'layout');
    return result;
  });
}

export async function resetPasswordAction(
  accountId: string,
  password: string,
): Promise<ActionResult> {
  return actionResult(async () => {
    if (password.length < 8) {
      throw new AppError('invalid', 'Use at least 8 characters.', ['password']);
    }
    if (new TextEncoder().encode(password).length > 72) {
      throw new AppError('invalid', 'Use at most 72 characters.', ['password']);
    }
    await users.resetPassword(accountId, password);
    revalidatePath(`/admin/users/${accountId}`);
    return null;
  });
}
