'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession, updateActiveRoleAction } from '@/lib/api/client';
import { getMyTeamMembershipsAction, getMyProfileAction } from '@/lib/api/client';
import { isTeamOwnerAction } from '@/lib/api/client';
import { joinTeamByInviteCodeAction } from '@/lib/api/client';
import type { TeamMembership, UserProfile } from '@/types';
import { Building2, UserRound, Sparkles, Loader, ArrowRight, Plus, X } from 'lucide-react';

function SelectWorkspaceContent() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        const session = await getSession();
        if (!session) {
          router.push('/login');
          return;
        }

        const profileData = await getMyProfileAction();

        if (profileData) {
          setProfile(profileData);
          try {
            const [teams, ownerStatus] = await Promise.all([
              getMyTeamMembershipsAction(),
              isTeamOwnerAction(),
            ]);
            setMemberships(teams);
            setIsOwner(ownerStatus);
          } catch (actionError) {
            console.error('Error fetching memberships/owner status:', actionError);
          }
        }
      } catch (err) {
        console.error('Unexpected error in init:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  const handleSelectPersonal = async () => {
    await updateActiveRoleAction('personal');
    router.push('/personal/dashboard');
    router.refresh();
  };

  const handleSelectTeam = async (slug: string) => {
    if (!slug) return;
    await updateActiveRoleAction('admin', slug);
    router.push(`/${slug}/admin/dashboard`);
    router.refresh();
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError('');

    const res = await joinTeamByInviteCodeAction(joinCode);
    if (!res.success || !res.teamSlug) {
      setJoinError(res.error || 'Failed to join team');
      setJoining(false);
      return;
    }

    await updateActiveRoleAction('admin', res.teamSlug);
    setShowJoinModal(false);
    setJoinCode('');
    router.push(`/${res.teamSlug}/admin/dashboard`);
    router.refresh();
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
      <div className="max-w-4xl w-full animate-fade-in">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Select Workspace</h1>
          </div>
          <p className="text-gray-400">Choose where you want to work today</p>
        </div>

        <div className="flex justify-center mb-6">
          <button
            onClick={() => setShowJoinModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-700 bg-surface-900 text-gray-300 hover:text-white hover:border-brand-500/40 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Join Team by Code
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Space Card */}
          <button
            onClick={handleSelectPersonal}
            className="group relative text-left bg-surface-900 border border-surface-700 rounded-3xl p-8 transition-all hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform">
              <UserRound className="w-7 h-7 text-white" />
            </div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-white group-hover:text-indigo-300 transition-colors">
                Personal Space
                <span className="block text-xs text-gray-500 font-normal mt-1">個人用スペース</span>
              </h3>
              <ArrowRight className="w-5 h-5 text-gray-700 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-8">
              Your private workspace for individual projects, learning, and drafts.
            </p>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-widest w-fit">
              <Sparkles className="w-3 h-3" />
              Private & Free
            </div>
          </button>

          {/* Team Workspaces */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-4 mb-2">Team Workspaces</h4>
            
            {memberships.length === 0 ? (
              <div className="bg-surface-900/50 border border-dashed border-surface-800 rounded-3xl p-8 text-center">
                <Building2 className="w-10 h-10 text-gray-700 mx-auto mb-4" />
                <p className="text-gray-500 text-sm">You haven't joined any teams yet.</p>
              </div>
            ) : (
              memberships.map((m) => (
                <button
                  key={m.team_id}
                  onClick={() => handleSelectTeam(m.team?.slug || '')}
                  className="w-full group flex items-center gap-4 bg-surface-900 border border-surface-700 rounded-2xl p-4 transition-all hover:border-brand-500/50 hover:bg-surface-850"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shrink-0 group-hover:scale-105 transition-transform">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold truncate group-hover:text-brand-300 transition-colors">
                      {m.team?.name}
                    </h3>
                    <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">{m.role}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-700 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
                </button>
              ))
            )}

            {!isOwner && (
              <button
                onClick={() => router.push('/personal/dashboard?upgrade=true')}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600/10 border border-emerald-500/20 hover:bg-emerald-600/20 text-emerald-400 py-4 rounded-2xl text-sm font-bold transition-all mt-4"
              >
                <Plus className="w-4 h-4" />
                Create a Team Plan
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs mt-12">
          Signed in as <span className="text-gray-400">{profile?.email}</span>
        </p>
      </div>

      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setShowJoinModal(false)}>
          <div className="w-full max-w-md bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Join Team by Code</h2>
                <p className="text-xs text-gray-500 mt-0.5">Enter the invite code from your team owner</p>
              </div>
              <button onClick={() => setShowJoinModal(false)} className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-surface-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleJoinByCode} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Invite Code</label>
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  placeholder="TEAM-XXXXXX"
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white uppercase tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              {joinError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {joinError}
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-surface-700 text-gray-300 hover:text-white hover:bg-surface-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joining || !joinCode.trim()}
                  className="flex-1 px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {joining ? <Loader className="w-4 h-4 animate-spin" /> : null}
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SelectWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <SelectWorkspaceContent />
    </Suspense>
  );
}
