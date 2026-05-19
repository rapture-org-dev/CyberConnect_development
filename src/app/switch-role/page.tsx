'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { loginAction, getSession } from '@/lib/api/client';
import type { UserProfile } from '@/types';
import { Loader, ArrowLeft } from 'lucide-react';

/**
 * Legacy entry point: team workspaces no longer use global PM/Dev/Client selection.
 * With ?team=slug we sync cookies and send everyone to the shared Admin (team) dashboard.
 */
function SwitchRoleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamSlug = searchParams.get('team');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const session = await getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', session.email)
        .single();

      if (profileData) {
        setProfile(profileData as UserProfile);
        const slug = teamSlug || session.activeTeamSlug;
        if (slug) {
          await loginAction(profileData.email, profileData.role, 'team', 'admin', slug);
          router.replace(`/${slug}/admin/dashboard`);
          return;
        }
      }
      setLoading(false);
    };
    init();
  }, [teamSlug, router]);

  const handlePersonal = async () => {
    if (!profile) return;
    await loginAction(profile.email, profile.role, 'personal', 'personal', undefined);
    router.push('/personal/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <Loader className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full animate-fade-in text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Open a workspace</h1>
        <p className="text-gray-400 text-sm mb-8">
          Choose Personal Space or pick a team from the workspace selector after signing in.
        </p>
        <button
          type="button"
          onClick={handlePersonal}
          className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold mb-6"
        >
          Continue to Personal Space
        </button>
        <button
          type="button"
          onClick={() => router.push('/select-workspace')}
          className="inline-flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to workspace selection
        </button>
      </div>
    </div>
  );
}

export default function SwitchRolePage() {
  return (
    <Suspense fallback={null}>
      <SwitchRoleContent />
    </Suspense>
  );
}
