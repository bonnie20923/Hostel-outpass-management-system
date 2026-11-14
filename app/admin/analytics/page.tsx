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
        .eq('id', user.id)  // using id, not user_id, because profiles.id = auth.users.id
        .single()

    if (profileError || !profile || (profile as any).role !== 'admin') {
        redirect('/login')
    }

    // Date ranges
    const now = new Date()
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)

    // 1. Total requests this month
    const { count: totalRequestsMonth } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString())

    // 2. Approval rate (approved requests / total requests, excluding cancelled/draft)
    const { count: totalApproved } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .in('status', ['qr_issued', 'exited', 'returned'])
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString())

    const { count: totalNonDraft } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '("draft","cancelled")')
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString())

    const approvalRate = totalNonDraft && totalNonDraft > 0 ? ((totalApproved || 0) / totalNonDraft) * 100 : 0

    // 3. On-time return rate (returned before expected_return)
    const { data: returnedRequests } = await supabase
        .from('requests')
        .select('id, expected_return, actual_return')
        .eq('status', 'returned')
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString())

    let onTimeCount = 0;
    const reqList = returnedRequests as any[] | null;
    reqList?.forEach((req: any) => {
        if (req.actual_return && new Date(req.actual_return) <= new Date(req.expected_return)) {
            onTimeCount++;
        }
    });
    const onTimeReturnRate = reqList && reqList.length > 0 ? (onTimeCount / reqList.length) * 100 : 0;

    // 4. Average hours outside (from homebook out_time to in_time)
    const { data: homebookEntries } = await supabase
        .from('homebook')
        .select('out_time, in_time')
        .not('in_time', 'is', null)
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString());

    let totalHours = 0;
    const hbList = homebookEntries as any[] | null;
    hbList?.forEach((entry: any) => {
        if (entry.out_time && entry.in_time) {
            const hours = (new Date(entry.in_time).getTime() - new Date(entry.out_time).getTime()) / (1000 * 60 * 60);
            totalHours += hours;
        }
    });
    const avgHoursOutside = hbList && hbList.length > 0 ? totalHours / hbList.length : 0;

    // 5. Emergency passes this month
    const { count: emergencyPassesMonth } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('emergency', true)
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString());

    // 6. Most active day of week (based on request created_at)
    const { data: weekRequests } = await supabase
        .from('requests')
        .select('created_at')
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString());

    const dayCounts: Record<string, number> = {
        Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0
    };
    const weekReqList = weekRequests as any[] | null;
    weekReqList?.forEach((req: any) => {
        const day = new Date(req.created_at).toLocaleDateString('en-US', { weekday: 'long' });
        dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    const mostActiveDay = Object.entries(dayCounts).reduce((a, b) => a[1] > b[1] ? a : b, ['Monday', 0])[0];

    // Top 10 students by request count this month
    const { data: topStudentsRaw } = await supabase
        .from('requests')
        .select('student_id, students(name, roll_number)')
        .eq('status', 'qr_issued') // only successfully issued passes count
        .gte('created_at', firstDayOfMonth.toISOString())
        .lte('created_at', lastDayOfMonth.toISOString());

    const studentCounts: Record<string, { name: string; roll_number: string; count: number }> = {};
    const topRawList = topStudentsRaw as any[] | null;
    topRawList?.forEach((item: any) => {
        const sid = item.student_id;
        const stu = Array.isArray(item.students) ? item.students[0] : item.students;
        if (!studentCounts[sid]) {
            studentCounts[sid] = {
                name: stu?.name || 'Unknown',
                roll_number: stu?.roll_number || '',
                count: 0
            };
        }
        studentCounts[sid].count++;
    });
    const topStudents = Object.values(studentCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(s => ({ student_name: s.name, roll_number: s.roll_number, request_count: s.count }));

    // Pie chart: on-time vs late returns
    const lateCount = (reqList?.length || 0) - onTimeCount;
    const returnStatus: ReturnStatus[] = [
        { name: 'On-Time Returns', value: onTimeCount, color: '#22c55e' },
        { name: 'Late Returns', value: lateCount, color: '#ef4444' }
    ];

    // Line chart: daily requests last 30 days
    const { data: dailyRaw } = await supabase
        .from('requests')
        .select('created_at')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .lte('created_at', now.toISOString());

    const dailyMap: Record<string, number> = {};
    for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        dailyMap[dateStr] = 0;
    }
    const dailyRawList = dailyRaw as any[] | null;
    dailyRawList?.forEach((req: any) => {
        const dateStr = new Date(req.created_at).toISOString().split('T')[0];
        if (dailyMap[dateStr] !== undefined) dailyMap[dateStr]++;
    });
    const dailyRequests: DailyRequests[] = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

    // Current outside students (exited but not returned)
    const { data: outsideRaw } = await supabase
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
        .order('out_time', { ascending: false });

    const outsideList = outsideRaw as any[] | null;
    const currentOutside: CurrentOutside[] = (outsideList || []).map((entry: any) => {
        const expectedReturn = new Date(entry.expected_return);
        const is_overdue = expectedReturn < now;
        const hours_overdue = is_overdue ? (now.getTime() - expectedReturn.getTime()) / (1000 * 60 * 60) : null;
        const stu = Array.isArray(entry.students) ? entry.students[0] : entry.students;
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
        };
    });

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
                    <div className="flex justify-between items-center py-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
                            <p className="text-sm text-gray-600 mt-1">Insights and statistics for outpass management</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link
                                href="/admin/dashboard"
                                className="text-gray-600 hover:text-gray-900 font-medium text-sm flex items-center gap-1"
                            >
                                📋 Approvals
                            </Link>
                            <Link
                                href="/admin/students"
                                className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
                            >
                                🎓 Students
                            </Link>
                            <form action="/api/auth/logout" method="POST">
                                <button
                                    type="submit"
                                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700"
                                >
                                    Logout
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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