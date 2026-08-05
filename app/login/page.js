'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;

        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            display_name: displayName || email.split('@')[0],
            role: 'player',
          });
          if (profileError) throw profileError;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
      router.push('/play');
      router.refresh();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-wgold/40 bg-wmaroon/60 p-8 shadow-xl">
        <h1 className="mb-1 text-center text-3xl font-bold text-wgold">WINGO</h1>
        <p className="mb-6 text-center text-sm text-white/70">
          {mode === 'login' ? 'Sign in to play' : 'Create your account'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="mb-1 block text-xs text-white/70">Display name</label>
              <input
                className="w-full rounded-lg border border-wgold/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-wgold"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-white/70">Email</label>
            <input
              type="email"
              required
              className="w-full rounded-lg border border-wgold/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-wgold"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/70">Password</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full rounded-lg border border-wgold/30 bg-white/10 px-3 py-2 text-white outline-none focus:border-wgold"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-wgold py-2 font-bold text-wmaroon transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <button
          className="mt-4 w-full text-center text-xs text-white/60 underline"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </main>
  );
}
