'use server';

import { revalidatePath } from 'next/cache';
import {
  createAdminSession,
  destroyAdminSession,
} from '@/infrastructure/auth/admin-session';
import { serverEnv } from '@/lib/env';
import type { ActionResult } from './suggestions';

export async function signInAction(token: string): Promise<ActionResult> {
  if (!serverEnv().ADMIN_TOKEN) {
    return { ok: false, code: 'forbidden' };
  }

  const created = await createAdminSession(token);
  if (!created) {
    // One failure shape whatever went wrong. Distinguishing "no token
    // configured" from "wrong token" tells an attacker which half to work on.
    return { ok: false, code: 'forbidden' };
  }

  revalidatePath('/[locale]/admin', 'page');
  return { ok: true, data: undefined };
}

export async function signOutAction(): Promise<ActionResult> {
  await destroyAdminSession();
  revalidatePath('/[locale]/admin', 'page');
  return { ok: true, data: undefined };
}
