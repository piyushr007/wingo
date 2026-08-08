import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabaseAdmin';
import { createClient } from '../../../lib/supabaseServerAuth';
import {
  emptyTicket,
  validRowsForPlacement,
  calculateScore,
  columnForNumber,
  NUM_COLUMNS,
  NUM_ROWS,
} from '../../../lib/gameRules';

// Returns true if a stored grid doesn't match the current board shape
// (e.g. left over from before a rules change). Guards against silently
// operating on a stale/misaligned grid.
function gridShapeIsStale(grid) {
  if (!Array.isArray(grid) || grid.length !== NUM_ROWS) return true;
  return grid.some((row) => !Array.isArray(row) || row.length !== NUM_COLUMNS);
}

export async function POST(req) {
  const { gameId, number, col, row, wild } = await req.json();

  if (!gameId || number == null || col == null || row == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const authClient = createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Confirm the number was actually drawn in this game
  const { data: game } = await admin
    .from('games')
    .select('drawn_numbers, status')
    .eq('id', gameId)
    .single();

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  if (game.status === 'ended') {
    return NextResponse.json({ error: 'Game has ended' }, { status: 400 });
  }

  const drawnEntry = (game.drawn_numbers || []).find((d) => d.number === number);
  if (!drawnEntry) {
    return NextResponse.json({ error: 'That number has not been drawn' }, { status: 400 });
  }

  // Validate column: must match symbol's column unless it's a wild draw
  if (!drawnEntry.wild) {
    const expectedCol = columnForNumber(number);
    if (col !== expectedCol) {
      return NextResponse.json(
        { error: 'This number does not belong in that column' },
        { status: 400 }
      );
    }
  } else if (col < 0 || col >= NUM_COLUMNS) {
    return NextResponse.json({ error: 'Invalid column' }, { status: 400 });
  }

  // Fetch or create the player's ticket
  let { data: ticketRow, error: ticketFetchErr } = await admin
    .from('tickets')
    .select('*')
    .eq('game_id', gameId)
    .eq('player_id', user.id)
    .maybeSingle();

  if (ticketFetchErr) {
    return NextResponse.json({ error: ticketFetchErr.message }, { status: 500 });
  }

  if (!ticketRow) {
    const { data: created, error: createErr } = await admin
      .from('tickets')
      .insert({ game_id: gameId, player_id: user.id, grid: emptyTicket() })
      .select()
      .single();
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    ticketRow = created;
  } else if (gridShapeIsStale(ticketRow.grid)) {
    // Ticket was created under an older board layout (different row/column
    // count) - reset it to a fresh, correctly-shaped empty grid rather than
    // risk misaligned placements.
    const { data: fixed, error: fixErr } = await admin
      .from('tickets')
      .update({ grid: emptyTicket(), score: 0, score_details: {} })
      .eq('id', ticketRow.id)
      .select()
      .single();
    if (fixErr) {
      return NextResponse.json({ error: fixErr.message }, { status: 500 });
    }
    ticketRow = fixed;
  }

  const grid = ticketRow.grid;

  // Reject if this number is already placed anywhere on the ticket
  for (const r of grid) {
    for (const cell of r) {
      if (cell && cell.number === number) {
        return NextResponse.json({ error: 'Number already placed' }, { status: 400 });
      }
    }
  }

  if (grid[row][col] !== null) {
    return NextResponse.json({ error: 'Cell already occupied' }, { status: 400 });
  }

  const valid = validRowsForPlacement(grid, col, number, !!drawnEntry.wild);
  if (!valid.includes(row)) {
    return NextResponse.json(
      { error: 'Placement violates ascending-order rule for this column' },
      { status: 400 }
    );
  }

  grid[row][col] = { number, wild: !!drawnEntry.wild };

  const { total, details } = calculateScore(grid);

  const { error: updateErr } = await admin
    .from('tickets')
    .update({ grid, score: total, score_details: details, updated_at: new Date().toISOString() })
    .eq('id', ticketRow.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ grid, score: total, details });
}
