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

  // Safety net: refuse to draw again if the last draw happened less than
  // 3 seconds ago, regardless of what triggered this request. Catches any
  // accidental rapid-fire (duplicate tabs, retries, timer bugs) server-side,
  // independent of whatever guard the client is using.
  const MIN_GAP_SECONDS = 3;
  if (drawn.length > 0) {
    const lastDrawnAt = new Date(drawn[drawn.length - 1].drawnAt).getTime();
    const secondsSinceLastDraw = (Date.now() - lastDrawnAt) / 1000;
    if (secondsSinceLastDraw < MIN_GAP_SECONDS) {
      return NextResponse.json(
        { error: 'A number was just drawn - please wait a moment' },
        { status: 429 }
      );
    }
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

  // Optimistic concurrency check: only apply this update if drawn_count
  // still matches what we read. If a concurrent request already drew a
  // number in between, this update matches zero rows and we reject rather
  // than silently drawing a second number too fast.
  const { data: updated, error: updateErr } = await admin
    .from('games')
    .update({
      drawn_numbers: newDrawn,
      drawn_count: newDrawn.length,
      status: newStatus,
      started_at: game.started_at || new Date().toISOString(),
    })
    .eq('id', gameId)
    .eq('drawn_count', drawn.length)
    .select()
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: 'Another draw just happened - try again' },
      { status: 409 }
    );
  }

  return NextResponse.json({ entry, drawnCount: newDrawn.length });
}
