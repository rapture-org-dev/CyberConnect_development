'use client';

import { LoginScreen } from '@/components/LoginScreen';
import { loginAction } from '@/lib/api/client';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UserProfile } from '@/types';
import { Suspense } from 'react';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const context = searchParams.get('context') as 'team' | 'personal' | null;

  const handleLogin = async (user: UserProfile) => {
    // 1. Establish server session cookies
    const activeRole = user.activeWorkspaceRole || user.role;
    const activeTeamSlug = user.activeTeamSlug || 'my-team';
    
    // Establishing session with team slug support
    const { loginAction } = await import('@/lib/api/client');
    await loginAction(user.email, user.role, user.accountKind || 'personal', activeRole, activeTeamSlug);
    
    // 2. Perform a hard redirect to the new specific path
    if (activeRole === 'personal') {
      router.push('/personal/dashboard');
    } else {
      router.push(`/${activeTeamSlug}/${activeRole}/dashboard`);
    }
  };

  return <LoginScreen onLogin={handleLogin} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-950 flex items-center justify-center"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <LoginPageContent />
    </Suspense>
  );
}
