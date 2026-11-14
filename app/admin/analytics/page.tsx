import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AnalyticsClient from './AnalyticsClient'

interface Stats {
    totalRequestsMonth: number
    approvalRate: number
    onTimeReturnRate: number
    avgHoursOutside: number
    emergencyPassesMonth: number
    mostActiveDay: string
}

interface TopStudent {
    student_name: string
    roll_number: string
    request_count: number
}

interface ReturnStatus {
    name: string
    value: number
    color: string
}

interface DailyRequests {
    date: string
    count: number
}

interface CurrentOutside {
    id: string
    name: string
    roll_number: string
    room_number: string
    block_name: string
    out_time: string
    expected_return: string
    is_overdue: boolean
    hours_overdue: number | null
}

async function getAnalyticsData(): Promise<{
    stats: Stats
    topStudents: TopStudent[]
    returnStatus: ReturnStatus[]
    dailyRequests: DailyRequests[]
    currentOutside: CurrentOutside[]
}> {
    const supabase = await createClient()

    // Check if user is authenticated and is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        redirect('/login')
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || !profile || (profile as any).role !== 'admin') {
        redirect('/login')
    }

    // Date ranges
    const now = new Date()
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)

    const firstDayIso = firstDayOfMonth.toISOString()
    const lastDayIso = lastDayOfMonth.toISOString()
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()
    const nowIso = now.toISOString()

    // Execute ALL independent DB queries in parallel for ultra-fast loading speed
    const [
        totalRequestsRes,
        totalApprovedRes,
        totalNonDraftRes,
        returnedRequestsRes,
        homebookEntriesRes,
        emergencyPassesRes,
        weekRequestsRes,
        topStudentsRawRes,
        dailyRawRes,
        outsideRawRes
    ] = await Promise.all([
        // 1. Total requests this month
        supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', firstDayIso)
            .lte('created_at', lastDayIso),

        // 2a. Approved requests this month
        supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .in('status', ['qr_issued', 'exited', 'returned'])
            .gte('created_at', firstDayIso)
            .lte('created_at', lastDayIso),

        // 2b. Total non-draft requests this month
        supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .not('status', 'in', '("draft","cancelled")')
            .gte('created_at', firstDayIso)
            .lte('created_at', lastDayIso),

        // 3. Returned requests (on-time rate)
        supabase
            .from('requests')
            .select('id, expected_return, actual_return')
            .eq('status', 'returned')
            .gte('created_at', firstDayIso)
            .lte('created_at', lastDayIso),

        // 4. Completed homebook entries (avg hours outside)
        supabase
            .from('homebook')
            .select('out_time, in_time')
            .not('in_time', 'is', null)
            .gte('created_at', firstDayIso)
            .lte('created_at', lastDayIso),

        // 5. Emergency passes this month
        supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .eq('emergency', true)
            .gte('created_at', firstDayIso)
            .lte('created_at', lastDayIso),

        // 6. Day-of-week activity
        supabase
            .from('requests')
            .select('created_at')
            .gte('created_at', firstDayIso)
            .lte('created_at', lastDayIso),

        // 7. Top students by issued outpasses
        supabase
            .from('requests')
            .select('student_id, students(name, roll_number)')
            .eq('status', 'qr_issued')
            .gte('created_at', firstDayIso)
            .lte('created_at', lastDayIso),

        // 8. Daily requests for last 30 days
        supabase
            .from('requests')
            .select('created_at')
            .gte('created_at', thirtyDaysAgoIso)
            .lte('created_at', nowIso),

        // 9. Current outside students (exited but not returned)
        supabase
            .from('homebook')
            .select(`
                id,
                out_time,
                expected_return,
                students (
                    id,
                    name,
                    roll_number,
                    room_number,
                    block_name
                )
            `)
            .is('in_time', null)
            .order('out_time', { ascending: false })
    ])

    // 1. Total requests
    const totalRequestsMonth = totalRequestsRes.count || 0

    // 2. Approval rate
    const totalApproved = totalApprovedRes.count || 0
    const totalNonDraft = totalNonDraftRes.count || 0
    const approvalRate = totalNonDraft > 0 ? (totalApproved / totalNonDraft) * 100 : 0

    // 3. On-time return rate
    const reqList = returnedRequestsRes.data as any[] | null
    let onTimeCount = 0
    reqList?.forEach((req: any) => {
        if (req.actual_return && new Date(req.actual_return) <= new Date(req.expected_return)) {
            onTimeCount++
        }
    })
    const onTimeReturnRate = reqList && reqList.length > 0 ? (onTimeCount / reqList.length) * 100 : 0

    // 4. Average hours outside
    const hbList = homebookEntriesRes.data as any[] | null
    let totalHours = 0
    hbList?.forEach((entry: any) => {
        if (entry.out_time && entry.in_time) {
            const hours = (new Date(entry.in_time).getTime() - new Date(entry.out_time).getTime()) / (1000 * 60 * 60)
            totalHours += hours
        }
    })
    const avgHoursOutside = hbList && hbList.length > 0 ? totalHours / hbList.length : 0

    // 5. Emergency passes
    const emergencyPassesMonth = emergencyPassesRes.count || 0

    // 6. Most active day of week
    const dayCounts: Record<string, number> = {
        Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0
    }
    const weekReqList = weekRequestsRes.data as any[] | null
    weekReqList?.forEach((req: any) => {
        const day = new Date(req.created_at).toLocaleDateString('en-US', { weekday: 'long' })
        dayCounts[day] = (dayCounts[day] || 0) + 1
    })
    const mostActiveDay = Object.entries(dayCounts).reduce((a, b) => a[1] > b[1] ? a : b, ['Monday', 0])[0]

    // 7. Top 10 students
    const studentCounts: Record<string, { name: string; roll_number: string; count: number }> = {}
    const topRawList = topStudentsRawRes.data as any[] | null
    topRawList?.forEach((item: any) => {
        const sid = item.student_id
        const stu = Array.isArray(item.students) ? item.students[0] : item.students
        if (!studentCounts[sid]) {
            studentCounts[sid] = {
                name: stu?.name || 'Unknown',
                roll_number: stu?.roll_number || '',
                count: 0
            }
        }
        studentCounts[sid].count++
    })
    const topStudents = Object.values(studentCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(s => ({ student_name: s.name, roll_number: s.roll_number, request_count: s.count }))

    // 8. Return status (Pie chart)
    const lateCount = (reqList?.length || 0) - onTimeCount
    const returnStatus: ReturnStatus[] = [
        { name: 'On-Time Returns', value: onTimeCount, color: '#22c55e' },
        { name: 'Late Returns', value: lateCount, color: '#ef4444' }
    ]

    // 9. Daily requests (Last 30 days Line chart)
    const dailyMap: Record<string, number> = {}
    for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0]
        dailyMap[dateStr] = 0
    }
    const dailyRawList = dailyRawRes.data as any[] | null
    dailyRawList?.forEach((req: any) => {
        const dateStr = new Date(req.created_at).toISOString().split('T')[0]
        if (dailyMap[dateStr] !== undefined) dailyMap[dateStr]++
    })
    const dailyRequests: DailyRequests[] = Object.entries(dailyMap).map(([date, count]) => ({ date, count }))

    // 10. Students currently outside
    const outsideList = outsideRawRes.data as any[] | null
    const currentOutside: CurrentOutside[] = (outsideList || []).map((entry: any) => {
        const expectedReturn = new Date(entry.expected_return)
        const is_overdue = expectedReturn < now
        const hours_overdue = is_overdue ? (now.getTime() - expectedReturn.getTime()) / (1000 * 60 * 60) : null
        const stu = Array.isArray(entry.students) ? entry.students[0] : entry.students
        return {
            id: stu?.id || entry.id,
            name: stu?.name || 'Unknown',
            roll_number: stu?.roll_number || 'N/A',
            room_number: stu?.room_number || 'N/A',
            block_name: stu?.block_name || 'N/A',
            out_time: entry.out_time,
            expected_return: entry.expected_return,
            is_overdue,
            hours_overdue: hours_overdue ? Math.round(hours_overdue) : null
        }
    })

    return {
        stats: {
            totalRequestsMonth: totalRequestsMonth || 0,
            approvalRate: Math.round(approvalRate),
            onTimeReturnRate: Math.round(onTimeReturnRate),
            avgHoursOutside: Math.round(avgHoursOutside * 10) / 10,
            emergencyPassesMonth: emergencyPassesMonth || 0,
            mostActiveDay
        },
        topStudents,
        returnStatus,
        dailyRequests,
        currentOutside
    }
}

export default async function AdminAnalyticsPage() {
    const data = await getAnalyticsData()

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-3 sm:py-4 gap-3">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
                            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Insights and statistics for outpass management</p>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
                            <div className="flex items-center gap-2">
                                <Link
                                    href="/admin/dashboard"
                                    className="px-2.5 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100 font-medium text-xs sm:text-sm flex items-center gap-1 border border-gray-200 sm:border-transparent transition-colors"
                                >
                                    📋 Approvals
                                </Link>
                                <Link
                                    href="/admin/students"
                                    className="px-2.5 py-1.5 rounded-lg text-blue-700 hover:bg-blue-50 font-medium text-xs sm:text-sm flex items-center gap-1 border border-blue-200 sm:border-transparent transition-colors"
                                >
                                    🎓 Students
                                </Link>
                            </div>
                            <form action="/api/auth/logout" method="POST">
                                <button
                                    type="submit"
                                    className="inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 border border-transparent text-xs sm:text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
                                >
                                    Logout
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <AnalyticsClient
                    stats={data.stats}
                    topStudents={data.topStudents}
                    returnStatus={data.returnStatus}
                    dailyRequests={data.dailyRequests}
                    currentOutside={data.currentOutside}
                />
            </main>
        </div>
    )
}
