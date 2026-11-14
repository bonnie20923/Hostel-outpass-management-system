import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createClient()

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return new NextResponse('Unauthorized', { status: 401 })
    }
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    if (!profile || (profile as any).role !== 'admin') {
        return new NextResponse('Forbidden', { status: 403 })
    }

    // Get homebook records for current month
    const now = new Date()
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const { data: records, error } = await supabase
        .from('homebook')
        .select(`
      out_time,
      in_time,
      expected_return,
      students (
        name,
        roll_number,
        room_number,
        block_name
      ),
      outpasses (
        request_id
      )
    `)
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString())
        .order('out_time', { ascending: false })

    if (error) {
        return new NextResponse('Error fetching data', { status: 500 })
    }

    // Convert to CSV
    const headers = ['Student Name', 'Roll Number', 'Room', 'Out Time', 'In Time', 'Expected Return', 'Duration (hours)']
    const rows = ((records as any[]) || []).map((record: any) => {
        const duration = record.in_time
            ? (new Date(record.in_time).getTime() - new Date(record.out_time).getTime()) / (1000 * 60 * 60)
            : null
        const stu = Array.isArray(record.students) ? record.students[0] : record.students
        return [
            stu?.name || 'Unknown',
            stu?.roll_number || '',
            `${stu?.block_name || ''}-${stu?.room_number || ''}`,
            new Date(record.out_time).toLocaleString(),
            record.in_time ? new Date(record.in_time).toLocaleString() : 'Not returned',
            new Date(record.expected_return).toLocaleString(),
            duration ? duration.toFixed(1) : ''
        ]
    })

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    return new NextResponse(blob, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename=homebook_${firstDayOfMonth.toISOString().split('T')[0]}_to_${lastDayOfMonth.toISOString().split('T')[0]}.csv`
        }
    })
}