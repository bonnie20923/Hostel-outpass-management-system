import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    const supabase = await createClient()

    await supabase.auth.signOut()

    // Dynamically redirect to the current domain (whether Vercel, production domain, or localhost)
    const origin = request.nextUrl.origin || request.headers.get('origin') || 'http://localhost:3000'
    return NextResponse.redirect(new URL('/login', origin), { status: 303 })
}
