import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { TableSkeleton } from './Skeletons'
import WardenDashboardClient from './WardenDashboardClient'

interface PendingRequest {
  id: string
  reason: string
  destination: string
  expected_departure: string
  expected_return: string
  emergency: boolean
  student_id: string
  students: {
    name: string
    roll_number: string
    room_number: string
    block_name: string
    parent_name: string
    parent_phone: string
    parent_email: string | null
    phone_number: string | null
  }
}

async function getWardenData(): Promise<{ pendingRequests: PendingRequest[] }> {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) redirect('/login')

  const [profileRes, requestsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single(),
    supabase
      .from('requests')
      .select(`
        id,
        reason,
        destination,
        expected_departure,
        expected_return,
        emergency,
        student_id,
        students!inner (
          name,
          roll_number,
          room_number,
          block_name,
          parent_name,
          parent_phone,
          parent_email,
          phone_number
        )
      `)
      .eq('status', 'pending_warden')
      .order('emergency', { ascending: false })
      .order('expected_departure', { ascending: true })
  ])

  const profile = profileRes.data
  if (profileRes.error || !profile || (profile as any).role !== 'warden') redirect('/login')

  const { data: pendingRequests, error: requestsError } = requestsRes

  if (requestsError) {
    console.error('Error fetching pending requests:', requestsError)
    return { pendingRequests: [] }
  }

  const formattedRequests: PendingRequest[] = (pendingRequests || []).map((req: any) => ({
    id: req.id,
    reason: req.reason,
    destination: req.destination,
    expected_departure: req.expected_departure,
    expected_return: req.expected_return,
    emergency: req.emergency,
    student_id: req.student_id,
    students: Array.isArray(req.students) ? req.students[0] : req.students
  }))

  return { pendingRequests: formattedRequests }
}

export default async function WardenDashboardPage() {
  const { pendingRequests } = await getWardenData()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3 sm:py-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Warden Dashboard</h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5 hidden sm:block">Review approvals · Manage outpasses · Issue emergency passes</p>
            </div>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
              >
                <svg className="h-4 w-4 sm:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Always render the full client component — it contains alerts, extend time, emergency pass etc. */}
        <Suspense fallback={<TableSkeleton />}>
          <WardenDashboardClient initialRequests={pendingRequests} />
        </Suspense>
      </main>
    </div>
  )
}
