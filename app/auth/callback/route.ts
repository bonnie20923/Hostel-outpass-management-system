import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const nextParam = searchParams.get('next')

  // If this is a password recovery, always send to /update-password
  let targetPath = nextParam || (type === 'recovery' ? '/update-password' : '/')

  // Determine correct base URL (handles custom domains and reverse proxies)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const baseUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : origin

  const supabase = await createClient()

  // 1. Handle token_hash verification (standard Supabase email template links)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      return NextResponse.redirect(`${baseUrl}${targetPath}`)
    }
    console.error('OTP verify error in auth callback:', error)
  }

  // 2. Handle PKCE code exchange
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${baseUrl}${targetPath}`)
    }
    console.error('Code exchange error in auth callback:', error)
  }

  // If type is recovery but code exchange had an issue, still send to /update-password
  // so the client-side component can attempt hash or session recovery with user feedback
  if (type === 'recovery' || targetPath.includes('update-password')) {
    return NextResponse.redirect(`${baseUrl}/update-password`)
  }

  // Fallback if no valid code or token
  return NextResponse.redirect(`${baseUrl}/login?error=auth_callback_failed`)
}
