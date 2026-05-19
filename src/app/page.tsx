'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/api/client';
import { getMyProfileAction } from '@/lib/api/client';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      try {
        const session = await getSession();
        if (!session) {
          router.push('/login');
          return;
        }
        
        await getMyProfileAction();

        const teamSlug = session.activeTeamSlug;
        const workspaceRole = session.activeWorkspaceRole;
        const isPersonal =
          workspaceRole === 'personal' || session.accountKind === 'personal';

        if (isPersonal) {
          router.push('/personal/dashboard');
        } else if (teamSlug) {
          router.push(`/${teamSlug}/admin/dashboard`);
        } else {
          router.push('/select-workspace');
        }
      } catch (err) {
        console.error('Unexpected error in HomePage init:', err);
        router.push('/login');
      }
    };
    init();
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-surface-950">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
