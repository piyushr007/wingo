import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabaseAdmin';
import { createClient } from '../../../lib/supabaseServerAuth';
import { SYMBOLS, WILD_SYMBOL } from '../../../lib/gameRules';

// Weighted random pick: each of the 5 real symbols at 18%, wild at 10%.
// Number and symbol are chosen completely independently - the symbol has
// no relationship to the number's value.
function pickWeightedSymbol() {
  const r = Math.random(); // [0, 1)
  const perSymbol = 0.18;
  let cumulative = 0;
  for (const s of SYMBOLS) {
    cumulative += perSymbol; // 0.18, 0.36, 0.54, 0.72, 0.90
    if (r < cumulative) return { key: s.key, wild: false };
  }
  // Remaining 10% (r >= 0.90) is wild.
  return { key: WILD_SYMBOL.key, wild: true };
}

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

  // Fetch the caller's role and the game row in parallel - they don't
  // depend on each other, so there's no need to wait for one before
  // starting the other. Cuts a full round-trip off the critical path.
  const [{ data: profile }, { data: game, error: gameErr }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).single(),
    admin.from('games').select('*').eq('id', gameId).single(),
  ]);

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

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

  // Number: uniform random 1-90, not yet drawn - completely independent
  // of the symbol.
  const remainingNumbers = [];
  for (let n = 1; n <= 90; n++) {
    if (!drawnNumbers.has(n)) remainingNumbers.push(n);
  }
  const number = remainingNumbers[Math.floor(Math.random() * remainingNumbers.length)];

  // Symbol: independently random - 18% each for the 5 real symbols (90%
  // total) and 10% for Wild. No relationship to the number's value.
  const { key: symbol, wild: isWild } = pickWeightedSymbol();

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
