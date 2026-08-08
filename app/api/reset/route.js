import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabaseAdmin';
import { createClient } from '../../../lib/supabaseServerAuth';

// Deletes ALL games and tickets. Admin-only, irreversible - used to wipe
// old/test games so players start with a completely clean slate.
export async function POST(req) {
  const authClient = createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // tickets reference games with "on delete cascade", so deleting all games
  // removes all tickets too. Using a filter that matches every row.
  const { error: ticketsErr } = await admin
    .from('tickets')
    .delete()
    .not('id', 'is', null);
  if (ticketsErr) {
    return NextResponse.json({ error: ticketsErr.message }, { status: 500 });
  }

  const { error: gamesErr } = await admin
    .from('games')
    .delete()
    .not('id', 'is', null);
  if (gamesErr) {
    return NextResponse.json({ error: gamesErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
