'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function createStudentAction(payload: {
  name: string
  roll_number: string
  email: string
  password: string
  room_number: string
  block_name: string
  parent_name?: string
  parent_phone: string
  face_descriptor?: any
}) {
  try {
    // ── 1. Verify caller is a logged-in admin ──────────────────────────────
    const supabaseUser = await createServerClient()
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()

    if (authErr || !user) {
      return { success: false, error: 'You must be logged in as admin to register students.' }
    }

    const { data: callerProfile } = await (supabaseUser as any)
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return { success: false, error: 'Forbidden: Only administrators can register students.' }
    }

    // ── 2. Validate required fields ────────────────────────────────────────
    const {
      name, roll_number, email, password,
      room_number, block_name, parent_name, parent_phone, face_descriptor
    } = payload

    if (!name?.trim()) return { success: false, error: 'Student full name is required.' }
    if (!roll_number?.trim()) return { success: false, error: 'Roll number is required.' }
    if (!email?.trim()) return { success: false, error: 'Email address is required.' }
    if (!password || password.length < 8) return { success: false, error: 'Password must be at least 8 characters.' }
    if (!room_number?.trim()) return { success: false, error: 'Room number is required.' }
    if (!block_name?.trim()) return { success: false, error: 'Hostel block is required.' }
    if (!parent_phone?.trim()) return { success: false, error: 'Parent phone number is required.' }

    const cleanRoll = roll_number.trim().toUpperCase()
    const cleanEmail = email.trim().toLowerCase()
    const cleanName = name.trim()

    const db = createAdminClient()

    // ── 3. Check for duplicates ────────────────────────────────────────────
    const { data: existingRoll } = await (db as any)
      .from('students')
      .select('id, roll_number')
      .eq('roll_number', cleanRoll)
      .single()

    if (existingRoll) {
      return { success: false, error: `Roll number ${cleanRoll} is already registered.` }
    }

    const { data: existingEmail } = await (db as any)
      .from('students')
      .select('id, email')
      .eq('email', cleanEmail)
      .single()

    if (existingEmail) {
      return { success: false, error: `Email ${cleanEmail} is already registered.` }
    }

    // ── 4. Create Supabase auth user ───────────────────────────────────────
    let newUserId: string | null = null

    const { data: authData, error: createAuthError } = await db.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: { name: cleanName, role: 'student' }
    })

    if (createAuthError) {
      // Email already exists in auth but not in students table — still recoverable
      if (createAuthError.message?.toLowerCase().includes('already')) {
        return { success: false, error: `An auth account for ${cleanEmail} already exists. Use a different email.` }
      }
      console.warn('Auth user creation warning:', createAuthError.message)
      // Continue without auth — student record is inserted without user_id
    } else if (authData?.user) {
      newUserId = authData.user.id

      // Upsert profile row (may already exist if trigger created it)
      await (db as any).from('profiles').upsert({
        id: newUserId,
        email: cleanEmail,
        name: cleanName,
        role: 'student',
        roll_number: cleanRoll,
        room_number: room_number.trim(),
        block_name: block_name.trim(),
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
    }

    // ── 5. Insert student record ───────────────────────────────────────────
    const { data: studentRecord, error: studentError } = await (db as any)
      .from('students')
      .insert({
        user_id: newUserId,
        name: cleanName,
        email: cleanEmail,
        roll_number: cleanRoll,
        room_number: room_number.trim(),
        block_name: block_name.trim(),
        parent_name: parent_name?.trim() || 'N/A',
        parent_phone: parent_phone.trim(),
        face_descriptor: face_descriptor || null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (studentError) {
      // If student insert failed but we created an auth user, clean up
      if (newUserId) {
        await db.auth.admin.deleteUser(newUserId).catch(() => {})
      }
      console.error('Student insert error:', studentError)
      return {
        success: false,
        error: `Failed to save student record: ${studentError.message}`
      }
    }

    return {
      success: true,
      student: studentRecord,
      credentials: {
        roll_number: cleanRoll,
        email: cleanEmail,
        password: password,
        loginWith: newUserId ? 'roll_number' : 'pending_auth'
      },
      message: `${cleanName} (${cleanRoll}) registered successfully!${!newUserId ? ' Note: Auth login could not be created — student may need manual password setup.' : ''}`
    }
  } catch (err: any) {
    console.error('createStudentAction error:', err)
    return { success: false, error: err.message || 'An unexpected error occurred.' }
  }
}
