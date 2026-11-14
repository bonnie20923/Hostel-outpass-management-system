import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { Database } from '@/types/supabase'

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()

    // 1. Verify caller is an authenticated Admin
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Only administrators can create students' }, { status: 403 })
    }

    // 2. Parse request payload
    const body = await request.json()
    const {
      name,
      email,
      roll_number,
      password,
      room_number,
      block_name,
      parent_name,
      parent_phone,
      face_descriptor
    } = body

    if (!name || !email || !roll_number || !password || !room_number || !block_name || !parent_phone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 3. Initialize Supabase Admin Client with Service Role Key
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Check if roll number already exists
    const { data: existingStudent } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('roll_number', roll_number.trim().toUpperCase())
      .single()

    if (existingStudent) {
      return NextResponse.json({ error: `A student with roll number ${roll_number} already exists.` }, { status: 400 })
    }

    // 4. Create Auth User in Supabase Auth (or fallback if database trigger fails)
    let newUserId: string | null = null

    try {
      const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: password,
        email_confirm: true,
        user_metadata: {
          name: name.trim(),
          role: 'student'
        }
      })

      if (!createAuthError && authData?.user) {
        newUserId = authData.user.id

        // 5. Ensure Profile record is created
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .upsert({
            id: newUserId,
            email: email.trim().toLowerCase(),
            name: name.trim(),
            role: 'student' as const,
            roll_number: roll_number.trim().toUpperCase(),
            room_number: room_number.trim(),
            block_name: block_name.trim(),
            is_active: true
          } as any)

        if (profileError) {
          console.error('Error upserting profile:', profileError)
        }
      } else {
        console.warn('Auth user creation note:', createAuthError?.message || 'Proceeding with student directory record.')
      }
    } catch (authErr) {
      console.warn('Auth service warning:', authErr)
    }

    // 6. Create Student record
    const { data: studentRecord, error: studentError } = await (supabaseAdmin
      .from('students')
      .insert({
        user_id: newUserId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        roll_number: roll_number.trim().toUpperCase(),
        room_number: room_number.trim(),
        block_name: block_name.trim(),
        parent_name: parent_name ? parent_name.trim() : 'Parent',
        parent_phone: parent_phone.trim(),
        face_descriptor: face_descriptor || null,
        is_active: true
      } as any) as any)
      .select()
      .single()

    if (studentError) {
      console.error('Error creating student record:', studentError)
      if (newUserId) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
      }
      return NextResponse.json({ error: studentError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      student: studentRecord,
      message: `Student ${name} successfully registered with Roll No: ${roll_number}`
    })

  } catch (error: any) {
    console.error('Create student error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
