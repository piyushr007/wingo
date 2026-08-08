'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import TicketGrid from '../../components/TicketGrid';
import {
  emptyTicket,
  validRowsForPlacement,
  validPlacementsForWild,
  SYMBOLS,
  columnForNumber,
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
  const [pendingCol, setPendingCol] = useState(null); // for wild-number column choice
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(null);

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
      setTicket(data || { grid: emptyTicket(), score: 0 });
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

  const drawnNumbers = game?.drawn_numbers || [];
  const latestDraw = drawnNumbers[drawnNumbers.length - 1];
  const drawIntervalSeconds = game?.draw_interval_seconds || 15;

  // Informational countdown synced off the last draw's timestamp - the
  // admin's browser is what actually triggers the next draw.
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

  // Numbers drawn but not yet placed by this player, most recent first
  const unplacedDrawn = drawnNumbers
    .filter((d) => !placedNumbers.has(d.number))
    .slice()
    .reverse();

  async function placeNumber(entry, row, col) {
    setMessage('');
    const res = await fetch('/api/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: game.id, number: entry.number, row, col, wild: entry.wild }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Could not place number');
      return;
    }
    setTicket((t) => ({ ...t, grid: data.grid, score: data.score }));
    setPendingCol(null);
  }

  function handleDrawClick(entry) {
    if (!ticket?.grid) {
      setMessage('Your ticket is still loading — try again in a moment.');
      return;
    }
    if (entry.wild) {
      // Let the player choose which column, then which row via highlighted cells
      setPendingCol({ entry, options: validPlacementsForWild(ticket.grid, entry.number) });
    } else {
      const col = columnForNumber(entry.number);
      const rows = validRowsForPlacement(ticket.grid, col, entry.number, false);
      if (rows.length === 0) {
        setMessage('No valid row available in that column (ascending rule).');
        return;
      }
      setPendingCol({ entry, options: [{ col, rows }] });
    }
  }

  function handleCellClick(row, col) {
    if (!pendingCol) return;
    const option = pendingCol.options.find((o) => o.col === col && o.rows.includes(row));
    if (!option) return;
    placeNumber(pendingCol.entry, row, col);
  }

  const highlightCells = pendingCol
    ? pendingCol.options.flatMap((o) => o.rows.map((r) => ({ row: r, col: o.col })))
    : [];

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
              {SYMBOLS.find((s) => s.key === latestDraw.symbol)?.emoji}
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
                Next in {countdown}s
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

      {pendingCol && (
        <div className="mb-4 rounded-lg bg-green-900/60 px-4 py-2 text-sm text-green-100">
          Placing <strong>{pendingCol.entry.number}</strong> — tap a glowing green cell on your
          ticket below.
          <button
            onClick={() => setPendingCol(null)}
            className="ml-3 underline text-green-300 hover:text-white"
          >
            Cancel
          </button>
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
          <h2 className="mb-1 text-sm font-bold text-wgold">Numbers to place</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {unplacedDrawn.length === 0 && (
              <span className="text-sm text-white/50">No pending numbers</span>
            )}
            {unplacedDrawn.map((entry) => (
              <button
                key={entry.number}
                onClick={() => handleDrawClick(entry)}
                className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
                  pendingCol?.entry.number === entry.number
                    ? 'border-green-400 bg-green-700'
                    : 'border-wgold/50 bg-black/40 hover:bg-black/70'
                }`}
              >
                {entry.number}
                {entry.wild ? '*' : ''}
              </button>
            ))}
          </div>

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
