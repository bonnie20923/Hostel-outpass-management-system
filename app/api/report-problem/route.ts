import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message } = await request.json()
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get user profile
    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('id, name, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // If student, look up their student ID
    let studentId = null
    if ((profile as any).role === 'student') {
      const { data: student, error: studentError } = await (supabase as any)
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single()
      
      if (!studentError && student) {
        studentId = (student as any).id
      }
    }

    // Insert alert into alerts table
    const { data: alertData, error: insertError } = await (supabase as any)
      .from('alerts')
      .insert({
        student_id: studentId,
        type: 'guard_check',
        title: `Problem Reported by ${(profile as any).name || 'User'}`,
        message: message.trim(),
        priority: 1, // standard priority
        status: 'pending',
        metadata: {
          user_id: user.id,
          role: (profile as any).role,
          name: (profile as any).name
        }
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting report problem alert:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, alert: alertData })

  } catch (error: any) {
    console.error('Report problem server error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
