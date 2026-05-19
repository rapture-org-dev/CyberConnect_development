import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // This will refresh the session if expired and sync cookies to the browser
  const { data: { user } } = await supabase.auth.getUser()

  const activeRole = request.cookies.get('active_workspace_role')?.value
  const activeTeamSlug = request.cookies.get('active_team_slug')?.value
  const hasAppSession = Boolean(request.cookies.get('cyberconnect_email')?.value)
  const { pathname } = request.nextUrl

  // Protected routes check
  const isLoginPage = pathname === '/login'
  const isAuthApi = pathname.startsWith('/api/auth')
  
  if (!user && !isLoginPage && !isAuthApi && pathname !== '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Supabase session exists but the app login flow (HTTP-only cookies from POST /api/auth/login) has not
  // finished yet — keep the user on /login instead of skipping straight to select-workspace.
  if (user && !hasAppSession) {
    if (isLoginPage || pathname.startsWith('/api')) {
      return response
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // After app login: home /login → workspace
  if (user && hasAppSession) {
    if (pathname === '/' || isLoginPage) {
      const accountKind = request.cookies.get('cyberconnect_account_kind')?.value
      // Personal space is not under /[team]/[role]; login also sets a default team slug — do not use it here.
      if (activeRole === 'personal' || accountKind === 'personal') {
        return NextResponse.redirect(new URL('/personal/dashboard', request.url))
      }
      if (activeTeamSlug) {
        const role = activeRole || 'admin'
        return NextResponse.redirect(new URL(`/${activeTeamSlug}/${role}/dashboard`, request.url))
      } else {
        return NextResponse.redirect(new URL('/select-workspace', request.url))
      }
    }

    if (activeRole && activeTeamSlug) {
      // Normalize role for routing
      let role = activeRole
      if (role === 'administrator') role = 'admin'
      if (role === 'developer') role = 'dev'

      // 1. Generic path redirection
      if (pathname === '/dashboard') {
        if (role === 'personal') {
          return NextResponse.redirect(new URL('/personal/dashboard', request.url))
        }
        return NextResponse.redirect(new URL(`/${activeTeamSlug}/${role}/dashboard`, request.url))
      }
      
      if (pathname === '/projects' || pathname === '/project') {
        if (role === 'personal') {
          return NextResponse.redirect(new URL('/personal/dashboard', request.url))
        }
        return NextResponse.redirect(new URL(`/${activeTeamSlug}/${role}/dashboard`, request.url))
      }

      // 2. Role and Team validation
      const pathSegments = pathname.split('/').filter(Boolean)
      if (pathSegments.length >= 2) {
        const teamSlug = pathSegments[0]
        const urlRole = pathSegments[1]
        const roles = ['admin', 'pm', 'dev', 'client']

        if (roles.includes(urlRole)) {
          // Legacy URLs: global PM/Dev/Client perspectives are removed — normalize to /admin/ routes.
          if (urlRole === 'pm' || urlRole === 'dev' || urlRole === 'client') {
            const tail = pathSegments.slice(2).join('/')
            const targetPath = tail ? `/${teamSlug}/admin/${tail}` : `/${teamSlug}/admin/dashboard`
            return NextResponse.redirect(new URL(targetPath, request.url))
          }

          // Strict multi-tenant validation (team URLs always use /admin/...; legacy pm/dev/client cookies still match until the client syncs cookies)
          const legacyWorkspaceCookies = ['pm', 'dev', 'client']
          const workspaceAligned =
            urlRole === role ||
            (urlRole === 'admin' && legacyWorkspaceCookies.includes(role || '') && teamSlug === activeTeamSlug)
          if (!workspaceAligned || teamSlug !== activeTeamSlug) {
            return NextResponse.redirect(new URL(`/${activeTeamSlug}/${role}/dashboard`, request.url))
          }

          // Team "/admin/*" routes are the shared team workspace; any member of the company may access them.
          if (urlRole === 'admin') {
            const { data: teamRow, error: teamErr } = await supabase
              .from('teams')
              .select('id')
              .eq('slug', teamSlug)
              .maybeSingle()

            if (teamErr || !teamRow?.id) {
              return NextResponse.redirect(new URL(`/${activeTeamSlug}/${role}/dashboard`, request.url))
            }

            let profileId = user.id
            const appEmail = request.cookies.get('cyberconnect_email')?.value
            if (appEmail) {
              const { data: prof } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', appEmail)
                .maybeSingle()
              if (prof?.id) profileId = prof.id
            }

            const { data: membership } = await supabase
              .from('team_members')
              .select('role')
              .eq('profile_id', profileId)
              .eq('team_id', teamRow.id)
              .maybeSingle()

            if (!membership) {
              return NextResponse.redirect(new URL('/select-workspace', request.url))
            }
          }
        }
      } else if (pathSegments[0] === 'personal' && role !== 'personal') {
         return NextResponse.redirect(new URL(`/${activeTeamSlug}/${role}/dashboard`, request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - any image file
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
