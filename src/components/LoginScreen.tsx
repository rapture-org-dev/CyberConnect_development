import { useState, useMemo, useLayoutEffect, useEffect, Suspense } from 'react';
import type { UserRole, UserProfile } from '@/types';
import { Shield, Briefcase, Code, Users, ArrowLeft, Loader, LogOut, AlertCircle, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { peekResumeRoleSnapshot, consumeResumeRoleFlag, saveDemoGateEmail } from '@/lib/loginSession';
import { getUserAccessRolesAction } from '@/lib/api/client';
import { useSearchParams } from 'next/navigation';

interface Props {
  onLogin: (user: UserProfile) => void;
}

const roleCards: { role: string; label: string; labelJa: string; desc: string; icon: typeof Shield; color: string }[] = [
  { role: 'admin', label: 'Administrator', labelJa: '管理者', desc: 'Monitor all projects across every PM. Global dashboard and full access.', icon: Shield, color: 'from-red-600 to-red-800' },
  { role: 'pm', label: 'Project Manager', labelJa: 'プロジェクトマネージャー', desc: 'Manage your own projects, create tasks, assign developers to work.', icon: Briefcase, color: 'from-brand-600 to-brand-800' },
  { role: 'dev', label: 'Developer', labelJa: '開発者', desc: 'Access tech stack, screen list, function list, and assigned tasks.', icon: Code, color: 'from-emerald-600 to-emerald-800' },
  { role: 'client', label: 'Client / Guest', labelJa: 'クライアント / ゲスト', desc: 'View all sheets, comment on task remarks only.', icon: Users, color: 'from-amber-600 to-amber-800' },
  { role: 'personal', label: 'Personal Space', labelJa: 'Personal Space', desc: 'Manage your personal projects and upgrade to a team plan.', icon: UserRound, color: 'from-indigo-600 to-indigo-800' },
];

type Flow = 'signin' | 'signup' | 'team_role';

function LoginScreenContent({ onLogin }: Props) {
  const searchParams = useSearchParams();
  const context = searchParams.get('context');

  const [flow, setFlow] = useState<Flow>(context === 'team' ? 'team_role' : 'signin');
  const [gateUser, setGateUser] = useState<UserProfile | null>(null);
  const [accessRoles, setAccessRoles] = useState<{ isAdmin: boolean; projectRoles: string[] } | null>(null);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [loginEmail, setLoginEmail] = useState(() => {
    const snap = peekResumeRoleSnapshot();
    return snap.goRole && snap.email ? snap.email : '';
  });
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(missing)';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    console.info('[CyberConnect] Supabase URL in this dev build:', url);
    console.info(
      '[CyberConnect] Anon key prefix:',
      key ? `${key.slice(0, 20)}… (len ${key.length})` : '(missing)'
    );
  }, []);

  useLayoutEffect(() => {
    const snap = peekResumeRoleSnapshot();
    if (snap.goRole && snap.email) {
      setLoginEmail(snap.email);
      supabase.from('profiles').select('*').eq('email', snap.email).single().then(({ data }) => {
        if (data) {
          const profileData = data as UserProfile;
          setGateUser(profileData);
          setFlow('team_role');
          fetchAccessRoles(profileData.id);
        } else {
          setFlow('signin');
          consumeResumeRoleFlag();
        }
      });
    } else if (context === 'team') {
      // If we are in team context but don't have gateUser, we need to handle it.
      // Usually, session should already be active.
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data: profile }) => {
            if (profile) {
              setGateUser(profile as UserProfile);
              fetchAccessRoles(profile.id);
            } else {
              setFlow('signin');
            }
          });
        } else {
          setFlow('signin');
        }
      });
    }
  }, [context]);

  const fetchAccessRoles = async (userId: string) => {
    setIsLoadingRoles(true);
    const teamSlug = searchParams.get('team');
    const roles = await getUserAccessRolesAction(userId, teamSlug || undefined);
    setAccessRoles(roles as any);
    setIsLoadingRoles(false);
  };

  const resetToSignin = () => {
    consumeResumeRoleFlag();
    setFlow('signin');
    setGateUser(null);
    setLoginEmail('');
    setLoginPassword('');
    setAuthError('');
  };

  const handleRoleSelect = (role: string) => {
    if (!gateUser) return;
    consumeResumeRoleFlag();
    const accountKind = role === 'personal' ? 'personal' : 'team';
    const teamSlug = searchParams.get('team') || 'my-team';
    
    onLogin({ 
      ...gateUser, 
      role: (role === 'personal' ? 'pm' : role) as UserRole, 
      accountKind, 
      activeWorkspaceRole: role,
      activeTeamSlug: teamSlug
    });
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) return;
    setAuthenticating(true);
    setAuthError('');

    try {
      const email = loginEmail.trim().toLowerCase();
      const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: loginPassword,
      });

      if (authError || !user) {
        const msg = authError?.message || 'Failed to sign in.';
        if (process.env.NODE_ENV === 'development') {
          console.error('[CyberConnect] signInWithPassword failed', {
            message: authError?.message,
            code: (authError as { code?: string })?.code,
            status: (authError as { status?: number })?.status,
          });
        }
        if (msg.toLowerCase().includes('invalid login credentials')) {
          setAuthError(
            'Invalid email or password. On localhost: confirm DevTools → Network shows the same supabase.co host as Vercel, restart dev after .env changes, and re-type the password (not autofill).'
          );
        } else {
          setAuthError(msg);
        }
        setAuthenticating(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        setAuthError('Profile not found in database.');
        setAuthenticating(false);
        return;
      }

      const teamSlug = searchParams.get('team');
      const accountKind = teamSlug ? 'team' : 'personal';
      const workspaceRole = teamSlug ? 'admin' : 'personal';

      const { syncAppLoginSession } = await import('@/lib/api/client');
      await syncAppLoginSession(
        (profile as UserProfile).email,
        'pm',
        accountKind,
        workspaceRole,
        teamSlug || undefined
      );

      setAuthenticating(false);
      saveDemoGateEmail(loginEmail);

      // Personal-First Login
      onLogin({ 
        ...profile as UserProfile, 
        role: 'pm',
        accountKind,
        activeWorkspaceRole: workspaceRole,
        activeTeamSlug: teamSlug || undefined
      });
    } catch {
      setAuthError('An unexpected error occurred.');
      setAuthenticating(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (signupPassword !== signupConfirm) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthenticating(true);

    try {
      const signupEmailNorm = signupEmail.trim().toLowerCase();
      const { data: { user }, error: signUpError } = await supabase.auth.signUp({
        email: signupEmailNorm,
        password: signupPassword,
        options: {
          data: {
            full_name: signupName,
          }
        }
      });

      if (signUpError || !user) {
        setAuthError(signUpError?.message || 'Failed to create account.');
        setAuthenticating(false);
        return;
      }

      const displayName = signupName.trim() || signupEmailNorm.split('@')[0] || 'User';
      const profilePayload = {
        id: user.id,
        email: signupEmailNorm,
        name: displayName,
        role: 'client' as const,
      };

      const { error: profileUpsertError } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (profileUpsertError) {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();

        if (existingProfile) {
          setAuthenticating(false);
          setAuthError('Account created! You can now sign in.');
          setFlow('signin');
          return;
        }

        console.error('Profile upsert after signup:', profileUpsertError);
        setAuthError(
          `Account created in Auth, but profile row failed: ${profileUpsertError.message}. Check Supabase RLS or create the profile manually.`
        );
        setAuthenticating(false);
        return;
      }

      setAuthenticating(false);
      setAuthError('Account created! You can now sign in.');
      setFlow('signin');
    } catch {
      setAuthError('An unexpected error occurred during signup.');
      setAuthenticating(false);
    }
  };

  const availableRoles = useMemo(() => {
    if (flow !== 'team_role' || !accessRoles) return [];
    
    return roleCards.filter(card => {
      // In team context, remove Personal Space selection
      if (card.role === 'personal') return context !== 'team';
      
      if (accessRoles.isAdmin) return true;
      
      if (card.role === 'admin') return false;
      if (card.role === 'pm') return accessRoles.projectRoles.includes('pm');
      if (card.role === 'dev') return accessRoles.projectRoles.includes('dev');
      if (card.role === 'client') return accessRoles.projectRoles.includes('client');
      
      return false;
    });
  }, [flow, accessRoles, context]);

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <div className="max-w-5xl w-full animate-fade-in">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">CyberConnect Platform</h1>
          </div>
          <p className="text-gray-400 text-lg">Bilingual Requirements & Task Management</p>
          <p className="text-gray-500 mt-1">バイリンガル要件・タスク管理プラットフォーム</p>
        </div>

        {flow === 'signin' && (
          <div className="animate-fade-in max-w-md mx-auto">
            <div className="bg-surface-900 border border-surface-700 rounded-3xl p-8 shadow-xl shadow-black/10">
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-semibold text-white">Sign in</h2>
                <p className="text-gray-400 mt-2 text-sm">Welcome back to CyberConnect</p>
              </div>
              <form onSubmit={handleSignInSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className="w-full bg-surface-800 border border-surface-700 rounded-2xl px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="Your password"
                    className="w-full bg-surface-800 border border-surface-700 rounded-2xl px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40 transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authenticating || !loginEmail.trim() || !loginPassword.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-white font-medium transition hover:bg-brand-500 disabled:opacity-50"
                >
                  {authenticating ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </form>
              {authError ? (
                <p className="text-center text-rose-400 text-sm mt-4">{authError}</p>
              ) : (
                <p className="text-center text-gray-600 text-xs mt-6 leading-relaxed">
                  Use your registered email and password to sign in.
                </p>
              )}
              <div className="mt-8 pt-6 border-t border-surface-800 text-center">
                <p className="text-sm text-gray-500">
                  New to the platform?{' '}
                  <button type="button" className="text-brand-400 hover:text-brand-300 font-medium" onClick={() => { setAuthError(''); setFlow('signup'); }}>
                    Create account
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}

        {flow === 'signup' && (
          <div className="animate-fade-in max-w-md mx-auto">
            <div className="bg-surface-900 border border-surface-700 rounded-3xl p-8 shadow-xl shadow-black/10">
              <button type="button" onClick={() => { setAuthError(''); setFlow('signin'); }} className="text-gray-500 hover:text-white text-sm mb-6 flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </button>
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-semibold text-white">Create account</h2>
                <p className="text-gray-400 mt-2 text-sm">Join the platform to manage bilingual requirements.</p>
              </div>
              <form onSubmit={handleSignupSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Display name</label>
                  <input
                    value={signupName}
                    onChange={e => setSignupName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={e => setSignupEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                  <input
                    type="password"
                    value={signupPassword}
                    onChange={e => setSignupPassword(e.target.value)}
                    placeholder="At least 4 characters"
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Confirm password</label>
                  <input
                    type="password"
                    value={signupConfirm}
                    onChange={e => setSignupConfirm(e.target.value)}
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authenticating || !signupName.trim() || !signupEmail.trim() || !signupPassword}
                  className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-white font-medium transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {authenticating ? <Loader className="w-4 h-4 animate-spin" /> : 'Register'}
                </button>
              </form>
              {authError && <p className="text-center text-rose-400 text-sm mt-4">{authError}</p>}
            </div>
          </div>
        )}

        {flow === 'team_role' && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <p className="text-gray-400">
                {gateUser ? `Signed in as ${gateUser.name}. Choose a role for this session.` : 'Select a role to explore the platform'}
              </p>
              <button type="button" onClick={resetToSignin} className="flex items-center gap-2 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-gray-300 hover:text-white hover:border-surface-200 text-sm font-medium transition-all">
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>

            {isLoadingRoles ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader className="w-8 h-8 text-brand-500 animate-spin" />
                <p className="text-gray-500 text-sm">Loading your access permissions...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {availableRoles.map(({ role, label, labelJa, desc, icon: Icon, color }) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleRoleSelect(role)}
                    className="group relative bg-surface-900 border border-surface-700 rounded-2xl p-6 text-left hover:border-brand-500/50 hover:bg-surface-850 transition-all duration-200 cursor-pointer flex flex-col h-full"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-white font-semibold text-lg leading-tight">{label}</h3>
                    <p className="text-gray-500 text-sm mb-2">{labelJa}</p>
                    <p className="text-gray-400 text-xs leading-relaxed mt-auto">{desc}</p>
                    <div className="absolute inset-0 rounded-2xl ring-2 ring-brand-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-gray-600 text-xs mt-8">
          CyberConnect &copy; 2026 &mdash; All data shown is for demonstration purposes
        </p>
      </div>
    </div>
  );
}

export function LoginScreen(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-950 flex items-center justify-center"><Loader className="w-8 h-8 text-brand-500 animate-spin" /></div>}>
      <LoginScreenContent {...props} />
    </Suspense>
  );
}
