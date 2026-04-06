'use client';
import { useRouter } from 'next/navigation';
import ReactionGameView from '../../components/ReactionGameView';

export default function ReactionGamePage() {
  const router = useRouter();
  return <ReactionGameView onExit={() => router.push('/dashboard')} />;
}
