import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { CardSkeleton, TableSkeleton } from './Skeletons'
import ReportProblem from '../../components/ReportProblem'
import { PendingRequestRow, PendingRequestCard } from './RequestRow'

// Types
interface DashboardStats {
  totalRequestsToday: number
  pendingApprovals: number
  studentsOutside: number
  lateReturns: number
}

interface PendingRequest {
  id: string
  student_name: string
  room_number: string
  block_name: string
  reason: string
  expected_departure: string
  created_at: string
  emergency: boolean
  student_id: string
  isUrgent?: boolean    // added for urgency
  hoursWaited?: number  // added for display
}

async function getAdminData(): Promise<{ stats: DashboardStats; pendingRequests: PendingRequest[] }> {
  const supabase = await createClient()

  // Check if user is authenticated and is admin
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  // Verify admin role from profiles table
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile || (profile as any).role !== 'admin') {
    redirect('/login')
  }

  // Get today's date range
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Fetch stats and pending requests concurrently in parallel
  const [
    { count: totalRequestsToday },
    { count: pendingApprovals },
    { count: studentsOutside },
    { count: lateReturns },
    { data: pendingRequests, error: requestsError }
  ] = await Promise.all([
    supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString()),
    supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_admin'),
    supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'exited'),
    supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'overdue'),
    supabase
      .from('requests')
      .select(`
        id,
        reason,
        expected_departure,
        created_at,
        emergency,
        student_id,
        students!inner (
          name,
          room_number,
          block_name
        )
      `)
      .eq('status', 'pending_admin')
      .order('emergency', { ascending: false })
      .order('created_at', { ascending: true })
  ])

  if (requestsError) {
    console.error('Error fetching pending requests:', requestsError)
    return { stats: { totalRequestsToday: 0, pendingApprovals: 0, studentsOutside: 0, lateReturns: 0 }, pendingRequests: [] }
  }

  // Transform the data and add urgency flag for requests waiting >4 hours
  const formattedRequests: PendingRequest[] = pendingRequests.map((req: any) => {
    const createdAt = new Date(req.created_at)
    const now = new Date()
    const hoursWaited = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
    const isUrgent = hoursWaited > 4

    const student = Array.isArray(req.students) ? req.students[0] : req.students
    return {
      id: req.id,
      student_name: student?.name || 'Student',
      room_number: student?.room_number || '',
      block_name: student?.block_name || '',
      reason: req.reason,
      expected_departure: req.expected_departure,
      created_at: req.created_at,
      emergency: req.emergency,
      student_id: req.student_id,
      isUrgent,
      hoursWaited: Math.floor(hoursWaited)
    }
  })

  return {
    stats: {
      totalRequestsToday: totalRequestsToday || 0,
      pendingApprovals: pendingApprovals || 0,
      studentsOutside: studentsOutside || 0,
      lateReturns: lateReturns || 0
    },
    pendingRequests: formattedRequests
  }
}

export default async function AdminDashboardPage() {
  const { stats, pendingRequests } = await getAdminData()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3 sm:py-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Manage outpass requests and approvals</p>
            </div>

            {/* Desktop nav */}
            <div className="hidden sm:flex items-center gap-3">
              <Link
                href="/admin/students?action=new"
                className="inline-flex items-center px-3.5 py-1.5 border border-transparent text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
              >
                <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Register Student
              </Link>
              <Link href="/admin/students" className="text-gray-700 hover:text-blue-600 font-medium text-sm flex items-center gap-1">
                🎓 Students
              </Link>
              <Link href="/admin/analytics" className="text-gray-700 hover:text-blue-600 font-medium text-sm flex items-center gap-1">
                📊 Analytics
              </Link>
              <form action="/api/auth/logout" method="POST">
                <button type="submit" className="inline-flex items-center px-3.5 py-1.5 border border-transparent text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 transition-colors">
                  <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </form>
            </div>

            {/* Mobile: just logout + register */}
            <div className="flex sm:hidden items-center gap-2">
              <Link
                href="/admin/students?action=new"
                className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors"
              >
                <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Register
              </Link>
              <Link href="/admin/students" className="text-gray-500 hover:text-blue-600 p-1.5 rounded-lg" title="Students">
                🎓
              </Link>
              <Link href="/admin/analytics" className="text-gray-500 hover:text-blue-600 p-1.5 rounded-lg" title="Analytics">
                📊
              </Link>
              <form action="/api/auth/logout" method="POST">
                <button type="submit" className="inline-flex items-center p-1.5 border border-transparent rounded-lg text-white bg-red-600 hover:bg-red-700 transition-colors" title="Logout">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <Suspense fallback={<CardSkeleton />}>
          <StatsCards stats={stats} />
        </Suspense>

        {/* Pending Requests Table */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Approvals</h2>
          <Suspense fallback={<TableSkeleton />}>
            <PendingRequestsTable requests={pendingRequests} />
          </Suspense>
        </div>
      </main>
      <ReportProblem />
    </div>
  )
}

// Client components
function StatsCards({ stats }: { stats: DashboardStats }) {
  const cards = [
    {
      title: 'Total Requests Today',
      value: stats.totalRequestsToday,
      icon: (
        <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      color: 'bg-blue-50 border-blue-200',
      textColor: 'text-blue-700'
    },
    {
      title: 'Pending Approvals',
      value: stats.pendingApprovals,
      icon: (
        <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'bg-yellow-50 border-yellow-200',
      textColor: 'text-yellow-700'
    },
    {
      title: 'Students Outside',
      value: stats.studentsOutside,
      icon: (
        <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: 'bg-green-50 border-green-200',
      textColor: 'text-green-700'
    },
    {
      title: 'Late Returns',
      value: stats.lateReturns,
      icon: (
        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'bg-red-50 border-red-200',
      textColor: 'text-red-700'
    }
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <div
          key={index}
          className={`${card.color} border rounded-lg p-6 transition-all duration-200 hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{card.title}</p>
              <p className={`text-3xl font-bold mt-2 ${card.textColor}`}>{card.value}</p>
            </div>
            <div className="p-3 bg-white rounded-full shadow-sm">
              {card.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PendingRequestsTable({ requests }: { requests: PendingRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No pending requests</h3>
        <p className="mt-1 text-sm text-gray-500">All requests have been processed.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Student Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Room
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reason
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Requested Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {requests.map((request) => (
              <PendingRequestRow key={request.id} request={request} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-gray-200">
        {requests.map((request) => (
          <PendingRequestCard key={request.id} request={request} />
        ))}
      </div>
    </div>
  )
}
