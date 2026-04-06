'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The root page just redirects to the main dashboard
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  // Brief loading state while redirect happens
  return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center">
      <div className="text-white/40 text-sm font-semibold tracking-widest animate-pulse">
        Cargando CogniMirror...
      </div>
    </div>
  );
}
