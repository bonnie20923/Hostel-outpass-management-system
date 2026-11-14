'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables are missing')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

// ── Verify guard is logged in ──────────────────────────────────────────────
async function getGuardUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const admin = createAdminClient()
    const { data: profile } = await (admin as any)
      .from('profiles').select('role').eq('id', user.id).single()

    return profile?.role === 'guard' ? user.id : null
  } catch {
    return null
  }
}

// ── Verify outpass by QR token, Outpass ID, Request ID, or Student Roll Number ──
export async function verifyOutpassAction(token: string) {
  try {
    const cleanToken = token.trim()
    console.log('[verifyOutpass] Called with token:', cleanToken, 'length:', cleanToken.length)

    const guardId = await getGuardUserId()
    if (!guardId) return { success: false, error: 'Unauthorized — guard session not found' }

    const db = createAdminClient()
    let outpass: any = null

    // 1. Try finding by direct qr_token match
    const { data: opByToken } = await (db as any)
      .from('outpasses')
      .select('id, qr_token, expires_at, checked_out_at, checked_in_at, request_id')
      .eq('qr_token', cleanToken)
      .single()

    if (opByToken) {
      outpass = opByToken
    }

    // 2. If not found, try decoding base64 if it might be encoded JSON
    if (!outpass) {
      try {
        const decoded = Buffer.from(cleanToken, 'base64').toString('utf-8')
        const parsed = JSON.parse(decoded)
        const opId = parsed.outpass_id || parsed.id
        if (opId) {
          const { data: opById } = await (db as any)
            .from('outpasses')
            .select('id, qr_token, expires_at, checked_out_at, checked_in_at, request_id')
            .eq('id', opId)
            .single()
          if (opById) outpass = opById
        }
      } catch {
        // Not base64 JSON
      }
    }

    // 3. Try finding by outpass id directly
    if (!outpass) {
      const { data: opById } = await (db as any)
        .from('outpasses')
        .select('id, qr_token, expires_at, checked_out_at, checked_in_at, request_id')
        .eq('id', cleanToken)
        .single()
      if (opById) outpass = opById
    }

    // 4. Try finding by request id
    if (!outpass) {
      const { data: opByReq } = await (db as any)
        .from('outpasses')
        .select('id, qr_token, expires_at, checked_out_at, checked_in_at, request_id')
        .eq('request_id', cleanToken)
        .single()
      if (opByReq) outpass = opByReq
    }

    // 5. Try finding by student roll number or student ID
    if (!outpass) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanToken)
      let studentQuery = (db as any).from('students').select('id, name, roll_number')
      if (isUuid) {
        studentQuery = studentQuery.eq('id', cleanToken)
      } else {
        studentQuery = studentQuery.ilike('roll_number', cleanToken)
      }
      const { data: studentMatchList } = await studentQuery.limit(1)
      const studentMatch = studentMatchList?.[0]

      if (studentMatch) {
        // Find their latest active request that has an outpass
        const { data: activeReqList } = await (db as any)
          .from('requests')
          .select('id, status, outpasses(id, qr_token, expires_at, checked_out_at, checked_in_at, request_id)')
          .eq('student_id', studentMatch.id)
          .in('status', ['qr_issued', 'exited'])
          .order('created_at', { ascending: false })
          .limit(1)

        const activeReq = activeReqList?.[0]
        if (activeReq) {
          const opList = activeReq.outpasses ? (Array.isArray(activeReq.outpasses) ? activeReq.outpasses : [activeReq.outpasses]) : []
          const op = opList.find((o: any) => !o.checked_in_at) || opList[0]
          if (op) {
            outpass = op
          } else {
            return {
              success: false,
              error: `Student ${studentMatch.name} (${studentMatch.roll_number}) has an approved request, but no gate pass QR record was generated.`
            }
          }
        } else {
          return {
            success: false,
            error: `Student ${studentMatch.name} (${studentMatch.roll_number}) found, but has no active approved outpass ready for gate exit or return.`
          }
        }
      }
    }

    if (!outpass) {
      return {
        success: false,
        error: `Outpass not found for "${cleanToken}". Please check the Roll Number or scan the student's QR code.`
      }
    }

    if (outpass.checked_in_at) {
      return { success: false, error: 'This outpass has already been fully used (completed).' }
    }

    if (!outpass.checked_out_at && new Date(outpass.expires_at) < new Date()) {
      return { success: false, error: 'This outpass has expired.' }
    }

    // Step 2: Fetch request + student
    const { data: req, error: rErr } = await (db as any)
      .from('requests')
      .select('id, reason, destination, expected_return, status, student_id')
      .eq('id', outpass.request_id)
      .single()

    if (rErr || !req) return { success: false, error: 'Associated request record not found' }

    const { data: stu, error: sErr } = await (db as any)
      .from('students')
      .select('id, name, roll_number, room_number, block_name, parent_phone, face_descriptor')
      .eq('id', req.student_id)
      .single()

    if (sErr || !stu) return { success: false, error: 'Student profile not found' }

    const type = outpass.checked_out_at ? 'return' : 'exit'

    return {
      success: true,
      data: {
        student: {
          id: stu.id,
          name: stu.name,
          roll_number: stu.roll_number,
          room_number: stu.room_number,
          block_name: stu.block_name,
          parent_phone: stu.parent_phone,
          face_descriptor: stu.face_descriptor
        },
        outpass: {
          id: outpass.id,
          qr_token: outpass.qr_token,
          expires_at: outpass.expires_at,
          checked_out_at: outpass.checked_out_at,
          checked_in_at: outpass.checked_in_at,
          request_id: outpass.request_id
        },
        request: {
          id: req.id,
          reason: req.reason,
          destination: req.destination,
          expected_return: req.expected_return,
          status: req.status
        },
        type
      }
    }
  } catch (err: any) {
    console.error('verifyOutpassAction error:', err)
    return { success: false, error: err.message || 'Verification failed' }
  }
}

// ── Process exit (checkout) ────────────────────────────────────────────────
export async function processExitAction(outpassId: string, requestId: string, studentId: string, expectedReturn: string, reason: string) {
  try {
    const guardId = await getGuardUserId()
    if (!guardId) return { success: false, error: 'Unauthorized' }

    const db = createAdminClient()
    const now = new Date().toISOString()

    // Update outpass
    await (db as any).from('outpasses').update({
      checked_out_at: now, checked_out_by: guardId, is_used: true
    }).eq('id', outpassId)

    // Create homebook entry
    await (db as any).from('homebook').insert({
      student_id: studentId, outpass_id: outpassId,
      out_time: now, expected_return: expectedReturn,
      checked_out_by: guardId, purpose: reason
    })

    // Update request status
    await (db as any).from('requests').update({
      status: 'exited', actual_departure: now, updated_at: now
    }).eq('id', requestId)

    return { success: true }
  } catch (err: any) {
    console.error('processExitAction error:', err)
    return { success: false, error: err.message }
  }
}

// ── Process return (checkin) ───────────────────────────────────────────────
export async function processReturnAction(outpassId: string, requestId: string) {
  try {
    const guardId = await getGuardUserId()
    if (!guardId) return { success: false, error: 'Unauthorized' }

    const db = createAdminClient()
    const now = new Date().toISOString()

    // Update outpass
    await (db as any).from('outpasses').update({
      checked_in_at: now, checked_in_by: guardId
    }).eq('id', outpassId)

    // Update homebook
    await (db as any).from('homebook').update({
      in_time: now, checked_in_by: guardId
    }).eq('outpass_id', outpassId).is('in_time', null)

    // Update request status
    await (db as any).from('requests').update({
      status: 'returned', actual_return: now, updated_at: now
    }).eq('id', requestId)

    return { success: true }
  } catch (err: any) {
    console.error('processReturnAction error:', err)
    return { success: false, error: err.message }
  }
}

// ── Load outside students ──────────────────────────────────────────────────
export async function loadOutsideAction() {
  try {
    const db = createAdminClient()
    const { data, error } = await (db as any)
      .from('requests')
      .select('id, expected_return, actual_departure, student_id, students(id,name,roll_number,room_number,block_name,parent_phone), outpasses(id)')
      .eq('status', 'exited')
      .order('expected_return', { ascending: true })

    if (error) return { success: false, error: error.message }
    return { success: true, data: data || [] }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ── Load today's activity ──────────────────────────────────────────────────
export async function loadActivityAction() {
  try {
    const db = createAdminClient()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { data, error } = await (db as any)
      .from('homebook')
      .select('id, out_time, in_time, created_at, students(name,roll_number,room_number,block_name)')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) return { success: false, error: error.message }
    return { success: true, data: data || [] }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ── Manual mark returned ───────────────────────────────────────────────────
export async function markReturnedAction(requestId: string, outpassId: string) {
  return processReturnAction(outpassId, requestId)
}
