import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/supabase'

// Define role-based dashboard paths
const roleDashboards = {
  student: '/dashboard',
  admin: '/admin/dashboard',
  warden: '/warden/dashboard',
  guard: '/guard/dashboard',
} as const

// Public routes that don't require authentication
const publicRoutes = ['/', '/login', '/auth/callback', '/forgot-password', '/update-password', '/guide']

// Protected route prefixes
const protectedPrefixes = ['/dashboard', '/admin', '/warden', '/guard']

// Helper to check if a path is protected
function isProtectedRoute(pathname: string): boolean {
  return protectedPrefixes.some(prefix => pathname.startsWith(prefix))
}

// Helper to check if a path matches a role dashboard
function getRoleFromPath(pathname: string): string | null {
  if (pathname.startsWith('/dashboard')) return 'student'
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/warden')) return 'warden'
  if (pathname.startsWith('/guard')) return 'guard'
  return null
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Create a mutable copy of request headers so refreshed session cookies
  // are forwarded to Server Components via RSC headers.
  const requestHeaders = new Headers(request.headers)

  // Create response object
  let response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // Create Supabase server client
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write refreshed cookies to both the forwarded request headers
          // and the outgoing response so the browser receives them.
          cookiesToSet.forEach(({ name, value }) =>
            requestHeaders.append('cookie', `${name}=${value}`)
          )
          response = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  
  // Get session and user
  const { data: { session } } = await supabase.auth.getSession()
  const isAuthenticated = !!session
  
  // Get user role from the profiles table (single source of truth)
  let userRole: string | null = null
  if (session?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
    userRole = (profile as any)?.role || null
  }
  
  // 1. Handle root path - redirect based on auth status
  if (pathname === '/') {
    if (isAuthenticated && userRole) {
      // Redirect authenticated users to their dashboard
      const dashboardPath = roleDashboards[userRole as keyof typeof roleDashboards]
      if (dashboardPath) {
        return NextResponse.redirect(new URL(dashboardPath, request.url))
      }
    }
    // Allow access to root for non-authenticated users (landing page)
    return response
  }
  
  // 2. Handle login page
  if (pathname === '/login') {
    if (isAuthenticated && userRole) {
      // Redirect to dashboard if already logged in
      const dashboardPath = roleDashboards[userRole as keyof typeof roleDashboards]
      if (dashboardPath) {
        return NextResponse.redirect(new URL(dashboardPath, request.url))
      }
    }
    return response
  }
  
  // 3. Handle protected routes
  if (isProtectedRoute(pathname)) {
    // Not authenticated - redirect to login
    if (!isAuthenticated) {
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(redirectUrl)
    }
    
    // Authenticated but no role - something went wrong, redirect to login
    if (!userRole) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    
    // Check role-based access
    const requiredRole = getRoleFromPath(pathname)
    
    if (requiredRole) {
      // Admin can access all dashboards (super admin privileges)
      if (userRole === 'admin') {
        // Admin can go anywhere, but redirect if they're trying to access
        // a specific role dashboard without the /admin prefix
        if (requiredRole !== 'admin' && pathname.startsWith(`/${requiredRole}`)) {
          // Allow admin to access other role dashboards but maybe show a warning
          // You can either allow it or redirect to admin dashboard
          // This allows admin to access everything
          return response
        }
        return response
      }
      
      // For non-admin users, check if role matches the dashboard
      if (userRole !== requiredRole) {
        // Redirect to their correct dashboard
        const correctDashboard = roleDashboards[userRole as keyof typeof roleDashboards]
        if (correctDashboard) {
          return NextResponse.redirect(new URL(correctDashboard, request.url))
        }
      }
    }
  }
  
  // For auth callback routes, allow access
  if (pathname === '/auth/callback') {
    return response
  }
  
  return response
}

// Specify which routes this middleware will run on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (if you want to handle API separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api/auth).*)',
  ],
}