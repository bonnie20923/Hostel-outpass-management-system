'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import Link from 'next/link'

type UserRole = 'student' | 'admin' | 'warden' | 'guard'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [role, setRole] = useState<UserRole>('student')
  const [rollNumber, setRollNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      let loginEmail = email
      let loginPassword = password

      // For students, look up email from profiles table using roll number
      if (role === 'student') {
        if (!rollNumber.trim()) {
          setError('Please enter your roll number')
          setLoading(false)
          return
        }

        // Look up student by roll number to get email
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select('email, user_id')
          .eq('roll_number', rollNumber.trim())
          .single()

        if (studentError || !student) {
          console.error('Student lookup error:', studentError)
          setError('Invalid roll number. Please check and try again.')
          setLoading(false)
          return
        }

        loginEmail = student.email

        // Get the associated profile to ensure role matches
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', student.user_id)
          .single()

        if (profileError || !profile || profile.role !== 'student') {
          setError('Account not properly configured. Please contact admin.')
          setLoading(false)
          return
        }
      } else {
        // For staff, email is required
        if (!email.trim()) {
          setError('Please enter your email address')
          setLoading(false)
          return
        }
        loginEmail = email.trim()
      }

      // Password is required for all roles
      if (!password) {
        setError('Please enter your password')
        setLoading(false)
        return
      }

      // Attempt sign in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      })

      if (signInError) {
        console.error('Sign in error:', signInError)
        setError(signInError.message)

        setLoading(false)
        return
      }

      if (!signInData.user) {
        setError('Login failed. Please try again.')
        setLoading(false)
        return
      }

      // Verify role matches after login
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', signInData.user.id)
        .single()

      if (profileError || !profile) {
        await supabase.auth.signOut()
        setError('User profile not found. Please contact admin.')
        setLoading(false)
        return
      }

      if (profile.role !== role) {
        await supabase.auth.signOut()
        setError(`You are registered as a ${profile.role}. Please select the correct role.`)
        setLoading(false)
        return
      }

      // Redirect based on role
      const dashboards = {
        student: '/dashboard',
        admin: '/admin/dashboard',
        warden: '/warden/dashboard',
        guard: '/guard/dashboard',
      }

      router.push(dashboards[role])
      router.refresh() // Refresh to update middleware session

    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white rounded-2xl shadow-xl p-8 transition-all duration-300">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 relative mb-4">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl transform rotate-6"></div>
            <div className="absolute inset-0 bg-white rounded-xl flex items-center justify-center">
              <svg className="h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Hostel Outpass System
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to manage your outpass requests
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-red-800">{error}</span>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {/* Role Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Role
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['student', 'admin', 'warden', 'guard'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRole(r)
                    setError('')
                    // Reset form fields based on role
                    if (r === 'student') {
                      setEmail('')
                    } else {
                      setRollNumber('')
                    }
                  }}
                  className={`
                    relative flex items-center justify-center px-3 py-2 text-sm font-semibold rounded-lg
                    transition-all duration-200 transform hover:scale-105
                    ${role === r
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                >
                  <span className="capitalize">{r}</span>
                  {role === r && (
                    <svg className="absolute top-1 right-1 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Student Roll Number Field */}
          {role === 'student' && (
            <div>
              <label htmlFor="rollNumber" className="block text-sm font-medium text-gray-700 mb-1">
                Roll Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9h6m-6 3h6m-6 3h6M3 9h6m-6 3h6m-6 3h6M9 5v16" />
                  </svg>
                </div>
                <input
                  id="rollNumber"
                  name="rollNumber"
                  type="text"
                  required
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg placeholder-gray-400 focus:bg-white focus:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm font-medium"
                  placeholder="e.g., CS2024001"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {/* Staff Email Field */}
          {role !== 'student' && (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg placeholder-gray-400 focus:bg-white focus:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm font-medium"
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none block w-full pl-10 pr-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg placeholder-gray-400 focus:bg-white focus:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm font-medium"
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>
          </div>

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </div>
              ) : (
                <div className="flex items-center">
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign in
                </div>
              )}
            </button>
          </div>

          {/* Additional Info */}
          <div className="text-center text-xs text-gray-500">
            <p>Demo credentials:</p>
            <p className="mt-1">Student: Roll number + password</p>
            <p>Staff: Email + password</p>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-blue-600 hover:text-blue-500 transition-colors"
          >
            Forgot your password?
          </Link>
        </div>
      </div>
    </div>
  )
}