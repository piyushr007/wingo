import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabaseAdmin';
import { createClient } from '../../../lib/supabaseServerAuth';
import { SYMBOLS, columnForNumber } from '../../../lib/gameRules';

export async function POST(req) {
  const { gameId } = await req.json();
  if (!gameId) {
    return NextResponse.json({ error: 'gameId required' }, { status: 400 });
  }

  // Verify the caller is an authenticated admin
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

  const { data: game, error: gameErr } = await admin
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (gameErr || !game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  if (game.status === 'ended') {
    return NextResponse.json({ error: 'Game already ended' }, { status: 400 });
  }

  const drawn = game.drawn_numbers || [];
  const drawnNumbers = new Set(drawn.map((d) => d.number));

  if (drawnNumbers.size >= 90) {
    await admin
      .from('games')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', gameId);
    return NextResponse.json({ error: 'All numbers drawn, game ended' }, { status: 400 });
  }

  // Pick a random number 1-90 not yet drawn
  let number;
  do {
    number = Math.floor(Math.random() * 90) + 1;
  } while (drawnNumbers.has(number));

  // ~10% chance of being a "wild" draw - placeable in any column.
  const isWild = Math.random() < 0.1;
  // The symbol always reflects the number's actual column, so the slot
  // machine display matches where the number can legally be placed.
  const symbol = SYMBOLS[columnForNumber(number)].key;

  const entry = {
    number,
    symbol,
    wild: isWild,
    drawnAt: new Date().toISOString(),
  };

  const newDrawn = [...drawn, entry];
  const newStatus = game.status === 'lobby' ? 'active' : game.status;

  const { error: updateErr } = await admin
    .from('games')
    .update({
      drawn_numbers: newDrawn,
      status: newStatus,
      started_at: game.started_at || new Date().toISOString(),
    })
    .eq('id', gameId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ entry, drawnCount: newDrawn.length });
}
