import { useEffect, useState } from 'react';
import type { Team, UserProfile } from '@/types';
import { X, Save, RefreshCw, Copy, Shield, UserMinus } from 'lucide-react';

interface Props {
  open: boolean;
  scope: 'team' | 'personal';
  user: UserProfile;
  team: Team | null;
  canSeeInviteCode: boolean;
  canManageCompanyAdmins?: boolean;
  teamMembers?: UserProfile[];
  billingOwnerId?: string | null;
  onClose: () => void;
  onSavePersonal: (updates: { name: string }) => Promise<void>;
  onSaveTeam: (updates: { name: string }) => Promise<void>;
  onRegenerateInvite: () => Promise<string>;
  onSetTeamMemberRole?: (profileId: string, role: 'admin' | 'member') => Promise<void>;
}

export function WorkspaceInfoModal({
  open,
  scope,
  user,
  team,
  canSeeInviteCode,
  canManageCompanyAdmins = false,
  teamMembers = [],
  billingOwnerId = null,
  onClose,
  onSavePersonal,
  onSaveTeam,
  onRegenerateInvite,
  onSetTeamMemberRole,
}: Props) {
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState(team?.invite_code ?? '');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const [roster, setRoster] = useState<UserProfile[]>(teamMembers);

  useEffect(() => {
    setRoster(teamMembers);
  }, [teamMembers]);

  useEffect(() => {
    if (!open) return;
    setName(scope === 'personal' ? user.name : team?.name ?? '');
    setInviteCode(team?.invite_code ?? '');
    setCopyStatus('idle');
    setRoster(teamMembers);
  }, [open, scope, user, team, teamMembers]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      // ignore clipboard issues
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (scope === 'personal') {
        await onSavePersonal({ name });
      } else {
        await onSaveTeam({ name });
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    const code = await onRegenerateInvite();
    setInviteCode(code);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-lg bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700 bg-surface-850/50">
          <div>
            <h2 className="text-sm font-bold text-white">{scope === 'personal' ? 'Personal Space Info' : 'Team Info'}</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {scope === 'personal' ? 'Edit your personal workspace details' : 'Edit team details and invite code'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-surface-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{scope === 'personal' ? 'Display Name' : 'Team Name'}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              placeholder={scope === 'personal' ? 'Your name' : 'Team name'}
            />
          </div>

          {scope === 'personal' ? (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Email</label>
                <input
                  value={user.email}
                  disabled
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-gray-400"
                />
              </div>
            </>
          ) : canSeeInviteCode ? (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Team Slug</label>
                <input
                  value={team?.slug ?? ''}
                  disabled
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-gray-400"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Invite Code</label>
                <div className="flex gap-2">
                  <input
                    value={inviteCode}
                    readOnly
                    className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-3 rounded-xl bg-surface-800 border border-surface-700 text-gray-300 hover:text-white hover:border-brand-500/40"
                    title="Copy invite code"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    className="px-3 py-3 rounded-xl bg-surface-800 border border-surface-700 text-gray-300 hover:text-white hover:border-brand-500/40"
                    title="Regenerate invite code"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  Share this code with new users so they can join the team.
                </p>
                {copyStatus === 'copied' && (
                  <p className="text-[10px] text-emerald-400 mt-1">Copied to clipboard.</p>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-surface-700 bg-surface-800/60 p-4 text-sm text-gray-400">
              Only the billing owner or a company admin can view or regenerate the invite code.
            </div>
          )}

          {scope === 'team' && canManageCompanyAdmins && onSetTeamMemberRole && (
            <div className="space-y-2">
              <label className="block text-xs text-gray-500">Company roles</label>
              <p className="text-[10px] text-gray-500">
                Billing owner → company admin → member. Only you (billing owner) can promote or demote company admins.
              </p>
              <ul className="max-h-48 overflow-y-auto rounded-xl border border-surface-700 divide-y divide-surface-800">
                {roster
                  .filter(m => m.id !== billingOwnerId)
                  .map(member => {
                    const isAdmin = member.team_role === 'admin';
                    const busy = roleUpdatingId === member.id;
                    return (
                      <li key={member.id} className="flex items-center justify-between gap-2 px-3 py-2.5 bg-surface-800/40">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-200 truncate">{member.name || member.email}</p>
                          <p className="text-[10px] text-gray-500 truncate">{member.email}</p>
                        </div>
                        <span className="text-[10px] uppercase tracking-wide text-gray-500 shrink-0">
                          {isAdmin ? 'Admin' : 'Member'}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setRoleUpdatingId(member.id);
                            const nextRole = isAdmin ? 'member' : 'admin';
                            try {
                              await onSetTeamMemberRole(member.id, nextRole);
                              setRoster(prev =>
                                prev.map(m =>
                                  m.id === member.id ? { ...m, team_role: nextRole } : m
                                )
                              );
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : 'Failed to update role';
                              alert(msg);
                            } finally {
                              setRoleUpdatingId(null);
                            }
                          }}
                          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border border-surface-600 text-gray-300 hover:text-white hover:border-brand-500/40 disabled:opacity-50"
                        >
                          {isAdmin ? (
                            <>
                              <UserMinus className="w-3 h-3" aria-hidden />
                              Demote
                            </>
                          ) : (
                            <>
                              <Shield className="w-3 h-3" aria-hidden />
                              Make admin
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-surface-700 text-gray-300 hover:text-white hover:bg-surface-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="flex-1 px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
