import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the caller is a guard
  const { data: profile, error: profileError } = await (supabase as any)
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile || profile.role !== 'guard') {
    return NextResponse.json({ error: 'Forbidden: Only guards can update request status' }, { status: 403 })
  }

  const { requestId, status, actualDeparture, actualReturn } = await request.json()

  if (!requestId || !status) {
    return NextResponse.json({ error: 'Missing required fields: requestId, status' }, { status: 400 })
  }

  if (!['exited', 'returned'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status value. Must be exited or returned.' }, { status: 400 })
  }

  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (actualDeparture) updateData.actual_departure = actualDeparture
  if (actualReturn) updateData.actual_return = actualReturn

  const { data, error } = await (supabase as any)
    .from('requests')
    .update(updateData)
    .eq('id', requestId)
    .select()

  if (error) {
    console.error('Guard update-request error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}