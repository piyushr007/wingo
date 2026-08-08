'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';
import { SYMBOLS } from '../../lib/gameRules';

export default function AdminPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null); // null = loading
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [message, setMessage] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [autoDraw, setAutoDraw] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const drawInFlightRef = useRef(false); // synchronous guard, unlike state

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push('/login');
        return;
      }
      setUser(data.user);
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();
      setIsAdmin(profile?.role === 'admin');
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
    if (isAdmin) loadGame();
  }, [isAdmin, loadGame]);

  useEffect(() => {
    if (game) loadLeaderboard(game.id);
  }, [game?.id, loadLeaderboard]);

  useEffect(() => {
    if (!game) return;
    const channel = supabase
      .channel(`admin-game-${game.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
        (payload) => setGame(payload.new)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: `game_id=eq.${game.id}` },
        () => loadLeaderboard(game.id)
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [game?.id, supabase, loadLeaderboard]);

  async function createGame() {
    setMessage('');
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'WINGO Game' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Could not create game');
      return;
    }
    setGame(data.game);
  }

  async function drawNumber() {
    if (!game || drawInFlightRef.current) return;
    drawInFlightRef.current = true;
    setDrawing(true);
    setMessage('');
    try {
      const res = await fetch('/api/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Could not draw number');
      }
    } finally {
      setDrawing(false);
      drawInFlightRef.current = false;
    }
  }

  async function endGame() {
    if (!game) return;
    setAutoDraw(false);
    await supabase.from('games').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', game.id);
  }

  const drawIntervalSeconds = game?.draw_interval_seconds || 15;
  const drawnNumbersForTimer = game?.drawn_numbers || [];
  const lastDrawnAt = drawnNumbersForTimer.length
    ? new Date(drawnNumbersForTimer[drawnNumbersForTimer.length - 1].drawnAt).getTime()
    : null;

  // Auto-draw countdown: ticks every second, fires drawNumber() when it hits 0.
  // Uses a ref (not state) to guard against double-firing, since state
  // updates are asynchronous and won't block a same-tick re-entry.
  useEffect(() => {
    if (!autoDraw || !game || game.status === 'ended') {
      setCountdown(null);
      return;
    }
    const tick = () => {
      const anchor = lastDrawnAt || Date.now();
      const elapsed = (Date.now() - anchor) / 1000;
      const remaining = Math.max(0, Math.ceil(drawIntervalSeconds - elapsed));
      setCountdown(remaining);
      if (remaining <= 0 && !drawInFlightRef.current) {
        drawNumber();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDraw, game?.status, lastDrawnAt, drawIntervalSeconds]);

  async function resetAllData() {
    const confirmed = window.confirm(
      'This permanently deletes ALL games and player tickets, for everyone. Are you sure?'
    );
    if (!confirmed) return;
    setMessage('');
    const res = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Could not reset data');
      return;
    }
    setGame(null);
    setLeaderboard([]);
    setAutoDraw(false);
  }

  if (isAdmin === null) {
    return <main className="flex min-h-screen items-center justify-center text-wgold">Loading…</main>;
  }
  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center text-red-300">
        You are not an admin for this game.
      </main>
    );
  }

  const drawnNumbers = game?.drawn_numbers || [];
  const latestDraw = drawnNumbers[drawnNumbers.length - 1];
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/play` : '';

  return (
    <main className="mx-auto max-w-4xl px-3 py-4">
      <h1 className="mb-4 text-xl font-bold text-wgold">🎰 WINGO — Admin</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        {(!game || game.status === 'ended') && (
          <button
            onClick={createGame}
            className="rounded-lg bg-wgold px-4 py-2 font-bold text-wmaroon hover:brightness-110"
          >
            {game ? 'Start New Game' : 'Create New Game'}
          </button>
        )}
        <button
          onClick={resetAllData}
          className="rounded-lg border border-red-400 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-900/40"
        >
          Wipe All Old Games &amp; Data
        </button>
      </div>

      {game && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-wgold/40 bg-wmaroon/60 p-4">
            <span className="rounded-full bg-black px-3 py-1 text-xs uppercase tracking-wide text-wgold">
              {game.status}
            </span>
            <span className="text-sm text-white/70">{drawnNumbers.length} / 90 drawn</span>
            {game.status !== 'ended' && (
              <button
                onClick={drawNumber}
                disabled={drawing}
                className="rounded-lg bg-wgold px-4 py-2 font-bold text-wmaroon hover:brightness-110 disabled:opacity-50"
              >
                {drawing ? 'Drawing…' : 'Draw Next Number'}
              </button>
            )}
            {game.status !== 'ended' && (
              <button
                onClick={() => setAutoDraw((v) => !v)}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                  autoDraw
                    ? 'bg-green-700 text-white hover:bg-green-800'
                    : 'border border-wgold/50 text-wgold hover:bg-wgold/10'
                }`}
              >
                {autoDraw ? `Auto-draw ON (next in ${countdown ?? drawIntervalSeconds}s)` : 'Start Auto-draw (every 15s)'}
              </button>
            )}
            {game.status !== 'ended' && (
              <button
                onClick={endGame}
                className="rounded-lg border border-red-400 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-900/40"
              >
                End Game
              </button>
            )}
          </div>

          {message && (
            <div className="mb-4 rounded-lg bg-red-900/60 px-4 py-2 text-sm text-red-100">{message}</div>
          )}

          {latestDraw && (
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-wgold bg-black text-3xl">
                {SYMBOLS.find((s) => s.key === latestDraw.symbol)?.emoji}
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-wgold bg-black text-3xl font-bold text-wgold">
                {latestDraw.number}
              </div>
              {latestDraw.wild && (
                <span className="rounded-full bg-purple-700 px-3 py-1 text-xs font-bold">WILD</span>
              )}
            </div>
          )}

          <div className="mb-6">
            <h2 className="mb-2 font-bold text-wgold">All drawn numbers</h2>
            <div className="flex flex-wrap gap-1">
              {drawnNumbers.map((d) => (
                <span
                  key={d.number}
                  className={`rounded px-2 py-1 text-xs font-bold ${
                    d.wild ? 'bg-purple-800' : 'bg-black/50'
                  }`}
                >
                  {d.number}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h2 className="mb-2 font-bold text-wgold">Leaderboard</h2>
            <ol className="space-y-1 text-sm">
              {leaderboard.map((row, i) => (
                <li key={row.player_id} className="flex justify-between rounded bg-wmaroon/40 px-3 py-1">
                  <span>
                    {i + 1}. {row.profiles?.display_name || 'Player'}
                  </span>
                  <span className="font-bold">{row.score}</span>
                </li>
              ))}
              {leaderboard.length === 0 && <li className="text-white/50">No players yet</li>}
            </ol>
          </div>

          <div className="rounded-xl border border-wgold/30 bg-black/30 p-4 text-sm">
            <p className="mb-1 text-white/70">Share this link with players:</p>
            <code className="text-wgold">{shareUrl}</code>
          </div>
        </>
      )}
    </main>
  );
}
