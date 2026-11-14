import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/supabase'

// Initialize Supabase Client with Service Role Key to bypass RLS in background cron jobs
async function createServiceRoleClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const secretParam = searchParams.get('secret')
    
    // Auth header check
    const authHeader = request.headers.get('Authorization')
    const secretHeader = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    const expectedSecret = process.env.CRON_SECRET || 'super_secret_cron_token_123'
    const cronSecret = secretParam || secretHeader

    if (!cronSecret || cronSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createServiceRoleClient() as any
    const nowStr = new Date().toISOString()

    // 1. Fetch requests with status 'exited' and expected_return < now()
    const { data: overdueRequests, error: fetchError } = await supabase
      .from('requests')
      .select(`
        id,
        expected_return,
        student_id,
        students (
          id,
          name,
          roll_number,
          parent_phone
        ),
        outpasses (
          id
        )
      `)
      .eq('status', 'exited')
      .lt('expected_return', nowStr)

    if (fetchError) {
      console.error('Error fetching overdue requests:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!overdueRequests || overdueRequests.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: 'No overdue returns found.' })
    }

    const results = []
    const origin = new URL(request.url).origin
    const smsUrl = `${origin}/api/notifications/sms`

    for (const req of overdueRequests) {
      const student: any = Array.isArray(req.students) ? req.students[0] : req.students
      const outpass: any = Array.isArray(req.outpasses) ? req.outpasses[0] : req.outpasses
      const outpassId = outpass?.id || null

      if (!student) {
        console.warn(`No student record associated with request ID: ${req.id}`)
        continue
      }

      // A. Update request status to 'overdue'
      const { error: updateError } = await supabase
        .from('requests')
        .update({
          status: 'overdue',
          updated_at: nowStr
        })
        .eq('id', req.id)

      if (updateError) {
        console.error(`Failed to update request ${req.id} status to overdue:`, updateError)
        continue
      }

      // B. Create an alert for the warden dashboard
      const { error: alertError } = await supabase
        .from('alerts')
        .insert({
          student_id: student.id,
          outpass_id: outpassId,
          type: 'overdue_return',
          title: 'Student Late Return',
          message: `Student ${student.name} (Roll: ${student.roll_number}) is overdue. Expected return was ${new Date(req.expected_return).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
          priority: 2,
          status: 'pending'
        })

      if (alertError) {
        console.error(`Failed to insert alert for request ${req.id}:`, alertError)
      }

      // C. Trigger Twilio SMS to Parent
      if (student.parent_phone) {
        try {
          const expectedReturnFormatted = new Date(req.expected_return).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          const smsMessage = `ALERT: Your ward ${student.name} (Roll: ${student.roll_number}) is overdue for return to hostel. Expected return time was ${expectedReturnFormatted}.`
          
          await fetch(smsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: student.parent_phone,
              message: smsMessage
            })
          })
        } catch (smsError) {
          console.error(`Failed to dispatch SMS for request ${req.id}:`, smsError)
        }
      }

      results.push({
        requestId: req.id,
        studentName: student.name,
        expectedReturn: req.expected_return
      })
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      data: results
    })

  } catch (error: any) {
    console.error('Cron check-overdue general error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
