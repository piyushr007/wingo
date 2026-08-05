'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.push('/play');
      } else {
        router.push('/login');
      }
    });
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center text-wgold">
      Loading WINGO…
    </main>
  );
}
