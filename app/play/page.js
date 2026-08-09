'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import TicketGrid from '../../components/TicketGrid';
import {
  emptyTicket,
  validRowsForPlacement,
  validPlacementsForWild,
  symbolForDraw,
  columnIndexForSymbol,
  NUM_ROWS,
  NUM_COLUMNS,
} from '../../lib/gameRules';

function gridShapeIsStale(grid) {
  if (!Array.isArray(grid) || grid.length !== NUM_ROWS) return true;
  return grid.some((row) => !Array.isArray(row) || row.length !== NUM_COLUMNS);
}

export default function PlayPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState(null);
  const [game, setGame] = useState(null);
  const [ticket, setTicket] = useState({ grid: emptyTicket(), score: 0 });
  const [leaderboard, setLeaderboard] = useState([]);
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(null);
  const [placing, setPlacing] = useState(false);

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login');
      } else {
        setUser(data.user);
      }
    });
  }, [supabase, router]);

  const loadGame = useCallback(async () => {
    const { data: games } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    if (games && games[0]) setGame(games[0]);
  }, [supabase]);

  const loadTicket = useCallback(
    async (gameId, playerId) => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .maybeSingle();
      if (error) {
        console.error('loadTicket error:', error);
        return;
      }
      if (data && gridShapeIsStale(data.grid)) {
        // Old ticket from before a rules change - display a fresh empty
        // grid locally; the server will repair the stored row on next place.
        setTicket({ ...data, grid: emptyTicket() });
        return;
      }
      if (data) {
        setTicket(data);
        return;
      }
      // No ticket yet for this player+game - create one now so the admin
      // sees them as "joined" immediately, not only after their first
      // placement. Ignore a duplicate-row error from a race with another
      // tab/request; just re-fetch in that case.
      const { data: created, error: createErr } = await supabase
        .from('tickets')
        .insert({ game_id: gameId, player_id: playerId, grid: emptyTicket() })
        .select()
        .single();
      if (createErr) {
        const { data: existing } = await supabase
          .from('tickets')
          .select('*')
          .eq('game_id', gameId)
          .eq('player_id', playerId)
          .maybeSingle();
        setTicket(existing || { grid: emptyTicket(), score: 0 });
        return;
      }
      setTicket(created);
    },
    [supabase]
  );

  const loadLeaderboard = useCallback(
    async (gameId) => {
      const { data } = await supabase
        .from('tickets')
        .select('score, player_id, profiles(display_name)')
        .eq('game_id', gameId)
        .order('score', { ascending: false });
      setLeaderboard(data || []);
    },
    [supabase]
  );

  useEffect(() => {
    if (user) loadGame();
  }, [user, loadGame]);

  useEffect(() => {
    if (game && user) {
      loadTicket(game.id, user.id);
      loadLeaderboard(game.id);
    }
  }, [game?.id, user, loadTicket, loadLeaderboard]);

  // Realtime subscriptions
  useEffect(() => {
    if (!game) return;
    const channel = supabase
      .channel(`game-${game.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
        (payload) => setGame(payload.new)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: `game_id=eq.${game.id}` },
        () => {
          loadLeaderboard(game.id);
          if (user) loadTicket(game.id, user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [game?.id, supabase, user, loadLeaderboard, loadTicket]);

  // Fast-path polling fallback: re-fetches just the game row every 2s while
  // a draw is expected soon. Runs alongside the realtime subscription -
  // whichever update arrives first wins, since setGame with the same/newer
  // data is harmless. This keeps the player UI snappy even if the realtime
  // websocket hop is briefly slow, without waiting on it exclusively.
  useEffect(() => {
    if (!game?.id || game.status === 'ended') return;
    const id = setInterval(async () => {
      const { data } = await supabase.from('games').select('*').eq('id', game.id).single();
      if (data) {
        setGame((prev) => {
          if (!prev) return data;
          const prevCount = (prev.drawn_numbers || []).length;
          const nextCount = (data.drawn_numbers || []).length;
          // Only take the polled version if it's actually newer, so we
          // never clobber a fresher local update with a stale poll result.
          return nextCount >= prevCount ? data : prev;
        });
      }
    }, 2000);
    return () => clearInterval(id);
  }, [game?.id, game?.status, supabase]);

  const drawnNumbers = game?.drawn_numbers || [];
  const latestDraw = drawnNumbers[drawnNumbers.length - 1];
  const drawIntervalSeconds = game?.draw_interval_seconds || 15;

  // Countdown synced off the last draw's timestamp - the admin's browser is
  // what actually triggers the next draw; this just tracks the same window.
  useEffect(() => {
    if (!game || game.status !== 'active' || !latestDraw) {
      setCountdown(null);
      return;
    }
    const anchor = new Date(latestDraw.drawnAt).getTime();
    const tick = () => {
      const elapsed = (Date.now() - anchor) / 1000;
      setCountdown(Math.max(0, Math.ceil(drawIntervalSeconds - elapsed)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [game?.status, latestDraw?.number, drawIntervalSeconds]);

  const placedNumbers = useMemo(() => {
    const set = new Set();
    if (ticket?.grid) {
      for (const row of ticket.grid) {
        for (const cell of row) {
          if (cell) set.add(cell.number);
        }
      }
    }
    return set;
  }, [ticket]);

  // Only the CURRENT drawn number is placeable, and only while its window
  // (draw_interval_seconds) hasn't elapsed. Older numbers are expired and
  // are never shown, even if the player never placed them.
  const currentPlaceable = useMemo(() => {
    if (!latestDraw) return null;
    if (placedNumbers.has(latestDraw.number)) return null;
    if (countdown !== null && countdown <= 0) return null;
    return latestDraw;
  }, [latestDraw, placedNumbers, countdown]);

  // Valid placement options for the current number, computed automatically -
  // no click/selection step needed. Cells light up as soon as a number drops.
  const currentOptions = useMemo(() => {
    if (!currentPlaceable || !ticket?.grid) return [];
    if (currentPlaceable.wild) {
      return validPlacementsForWild(ticket.grid, currentPlaceable.number);
    }
    const col = columnIndexForSymbol(currentPlaceable.symbol);
    if (col === -1) return [];
    const rows = validRowsForPlacement(ticket.grid, col, currentPlaceable.number, false);
    return rows.length ? [{ col, rows }] : [];
  }, [currentPlaceable, ticket]);

  const highlightCells = currentOptions.flatMap((o) => o.rows.map((r) => ({ row: r, col: o.col })));

  async function handleCellClick(row, col) {
    if (!currentPlaceable || placing) return;
    const option = currentOptions.find((o) => o.col === col && o.rows.includes(row));
    if (!option) return;

    setPlacing(true);
    setMessage('');
    const res = await fetch('/api/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: game.id,
        number: currentPlaceable.number,
        row,
        col,
        wild: currentPlaceable.wild,
      }),
    });
    const data = await res.json();
    setPlacing(false);
    if (!res.ok) {
      setMessage(data.error || 'Could not place number');
      return;
    }
    setTicket((t) => ({ ...t, grid: data.grid, score: data.score }));
  }

  if (!user || !game) {
    return (
      <main className="flex min-h-screen items-center justify-center text-wgold">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-3 py-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-wgold">🎰 WINGO</h1>
        <span className="rounded-full bg-wmaroon px-3 py-1 text-xs uppercase tracking-wide text-wgold">
          {game.status}
        </span>
      </header>

      {/* Current draw display */}
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-wgold/40 bg-wmaroon/60 p-3">
        {latestDraw ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-wgold bg-black text-2xl">
              {symbolForDraw(latestDraw.symbol)?.emoji}
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-wgold bg-black text-2xl font-bold text-wgold">
              {latestDraw.number}
            </div>
            {latestDraw.wild && (
              <span className="rounded-full bg-purple-700 px-3 py-1 text-xs font-bold">WILD</span>
            )}
            <span className="text-xs text-white/70">
              {drawnNumbers.length} / 90 drawn
            </span>
            {countdown !== null && (
              <span className="ml-auto rounded-full bg-black/50 px-3 py-1 text-xs text-wgold">
                {currentPlaceable ? `Place it! ${countdown}s left` : 'Expired — next draw soon'}
              </span>
            )}
          </>
        ) : (
          <span className="text-white/70">Waiting for the admin to start the game…</span>
        )}
      </div>

      {message && (
        <div className="mb-4 rounded-lg bg-red-900/60 px-4 py-2 text-sm text-red-100">
          {message}
        </div>
      )}

      {currentPlaceable && (
        <div className="mb-4 rounded-lg bg-green-900/60 px-4 py-2 text-sm text-green-100">
          Tap a glowing green cell on your ticket to place{' '}
          <strong>
            {currentPlaceable.number}
            {currentPlaceable.wild ? ' (wild)' : ''}
          </strong>
          .
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div>
          <TicketGrid grid={ticket?.grid} onCellClick={handleCellClick} highlightCells={highlightCells} />
          <p className="mt-1 text-sm text-white/70">
            Score: <span className="font-bold text-wgold">{ticket?.score ?? 0}</span>
          </p>
        </div>

        <div>
          <h2 className="mb-1 text-sm font-bold text-wgold">Leaderboard</h2>
          <ol className="space-y-1 text-sm">
            {leaderboard.map((row, i) => (
              <li
                key={row.player_id}
                className={`flex justify-between rounded px-2 py-1 ${
                  row.player_id === user.id ? 'bg-wgold/20' : ''
                }`}
              >
                <span>
                  {i + 1}. {row.profiles?.display_name || 'Player'}
                </span>
                <span className="font-bold">{row.score}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </main>
  );
}
