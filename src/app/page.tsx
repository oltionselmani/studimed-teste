import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { anyUserExists } from '@/lib/auth/session';

export default async function Home() {
  const user = await currentUser();
  if (user) redirect('/dashboard');
  redirect((await anyUserExists()) ? '/login' : '/register');
}
