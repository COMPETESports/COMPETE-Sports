'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { isSignedIn } from '@/lib/auth';
import {
  markPlayerConfirmed,
  removePlayer,
  resendPlayerConfirmation,
  updatePlayer,
  type Outcome,
} from '@/lib/admin-players';

/** Staff-only, checked in every action: the page is not a guarantee. */
async function staff() {
  if (!(await isSignedIn())) redirect('/admin');
}

const s = (d: FormData, k: string) => String(d.get(k) ?? '').trim();

function back(id: string, out: Outcome): never {
  revalidatePath('/admin/players');
  redirect(`/admin/players/${id}?${out.ok ? 'ok' : 'err'}=${encodeURIComponent(out.message)}`);
}

export async function savePlayer(id: string, data: FormData) {
  await staff();
  back(id, await updatePlayer(id, {
    displayName: s(data, 'display_name'),
    email: s(data, 'email'),
    zip: s(data, 'home_postal_code'),
    ageBracket: s(data, 'age_bracket'),
    gender: s(data, 'gender'),
    permission: s(data, 'permission'),
  }));
}

export async function resendConfirmation(id: string) {
  await staff();
  back(id, await resendPlayerConfirmation(id));
}

export async function markConfirmed(id: string, data: FormData) {
  await staff();
  back(id, await markPlayerConfirmed(id, s(data, 'permission')));
}

export async function deletePlayer(id: string, data: FormData) {
  await staff();
  if (s(data, 'confirm').toUpperCase() !== 'DELETE')
    back(id, { ok: false, message: 'Type DELETE to confirm.' });
  const out = await removePlayer(id, s(data, 'reason'));
  revalidatePath('/admin/players');
  redirect(`/admin/players?${out.ok ? 'ok' : 'err'}=${encodeURIComponent(out.message)}`);
}

/** The bot clean-up: every ticked account at once. */
export async function deleteSelected(data: FormData) {
  await staff();
  const ids = data.getAll('ids').map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  if (!ids.length) redirect('/admin/players?err=' + encodeURIComponent('Tick at least one account.'));
  if (s(data, 'confirm').toUpperCase() !== 'DELETE')
    redirect('/admin/players?err=' + encodeURIComponent('Type DELETE beside the button to confirm.'));
  let deleted = 0, closed = 0;
  for (const id of ids) {
    const out = await removePlayer(id, 'bulk delete: suspected bots');
    if (out.ok && out.message.includes('closed')) closed++;
    else if (out.ok) deleted++;
  }
  revalidatePath('/admin/players');
  redirect('/admin/players?ok=' + encodeURIComponent(
    `${deleted} deleted${closed ? `, ${closed} closed (legal records kept)` : ''}.`));
}
