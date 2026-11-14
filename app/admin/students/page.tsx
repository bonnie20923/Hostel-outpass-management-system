import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import StudentsClient from './StudentsClient'

export default async function AdminStudentsPage() {
  const supabase = await createClient()

  // Verify Admin
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as any).role !== 'admin') {
    redirect('/login')
  }

  // Fetch all students
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Student Directory & Onboarding</h1>
              <p className="text-sm text-gray-600 mt-1">Register new students and manage biometric face profiles</p>
            </div>

            {/* Navigation Links */}
            <div className="flex items-center gap-4">
              <Link
                href="/admin/dashboard"
                className="text-gray-600 hover:text-gray-900 font-medium text-sm flex items-center gap-1"
              >
                📋 Approvals
              </Link>
              <Link
                href="/admin/analytics"
                className="text-gray-600 hover:text-gray-900 font-medium text-sm flex items-center gap-1"
              >
                📊 Analytics
              </Link>
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 transition-colors"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StudentsClient initialStudents={students || []} />
      </main>
    </div>
  )
}
