'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { QRCodeSVG } from 'qrcode.react'
import ReportProblem from '../components/ReportProblem'

type RequestStatus = 'draft' | 'pending_admin' | 'pending_warden' | 'qr_issued' | 'exited' | 'returned' | 'rejected' | 'overdue' | 'cancelled'

interface Request {
    id: string
    reason: string
    destination: string
    expected_departure: string
    expected_return: string
    status: RequestStatus
    emergency: boolean
    rejection_reason: string | null
    created_at: string
    qr_token?: string
    resubmission_of: string | null
}

const statusSteps = {
    pending_admin: ['Submitted', 'Admin Approval', 'Warden Approval', 'QR Ready'],
    pending_warden: ['Submitted', '✓ Admin Approval', 'Warden Approval', 'QR Ready'],
    qr_issued: ['Submitted', '✓ Admin Approval', '✓ Warden Approval', 'QR Ready'],
    exited: ['Submitted', '✓ Admin Approval', '✓ Warden Approval', '✓ QR Ready'],
    returned: ['Submitted', '✓ Admin Approval', '✓ Warden Approval', '✓ QR Ready'],
    rejected: ['Submitted', 'Rejected', '', ''],
    cancelled: ['Submitted', 'Cancelled', '', ''],
    overdue: ['Submitted', '✓ Admin Approval', '✓ Warden Approval', 'Overdue'],
    draft: ['Draft', '', '', '']
}

const statusColors = {
    pending_admin: 'text-yellow-600 bg-yellow-50',
    pending_warden: 'text-blue-600 bg-blue-50',
    qr_issued: 'text-green-600 bg-green-50',
    exited: 'text-purple-600 bg-purple-50',
    returned: 'text-gray-600 bg-gray-50',
    rejected: 'text-red-600 bg-red-50',
    cancelled: 'text-gray-500 bg-gray-50',
    overdue: 'text-red-700 bg-red-100',
    draft: 'text-gray-500 bg-gray-50'
}

export default function StudentDashboard() {
    const router = useRouter()
    const supabase = createClient()

    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [studentName, setStudentName] = useState('')
    const [studentId, setStudentId] = useState<string | null>(null)
    const [requests, setRequests] = useState<Request[]>([])
    const [showSuccess, setShowSuccess] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')

    // Form state
    const [reason, setReason] = useState('')
    const [customReason, setCustomReason] = useState('')
    const [detailedReason, setDetailedReason] = useState('')
    const [destination, setDestination] = useState('')
    const [departureDate, setDepartureDate] = useState('')
    const [returnDate, setReturnDate] = useState('')
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [resubmitMode, setResubmitMode] = useState(false)
    const [originalRequestId, setOriginalRequestId] = useState<string | null>(null)
    const channelRef = useRef<any>(null)

    useEffect(() => {
        checkUserAndLoadData()
        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current)
            }
        }
    }, [])

    async function checkUserAndLoadData() {
        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser()

            if (userError || !user) {
                router.push('/login')
                return
            }

            // Get student profile
            const { data: student, error: studentError } = await supabase
                .from('students')
                .select('id, name')
                .eq('user_id', user.id)
                .single()

            if (studentError || !student) {
                console.error('Student fetch error:', studentError)
                router.push('/login')
                return
            }

            setStudentId(student.id)
            setStudentName(student.name)

            // Load student's requests
            await loadRequests(student.id)
            channelRef.current = supabase
                .channel(`student-requests-${student.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'requests',
                        filter: `student_id=eq.${student.id}`
                    },
                    (payload) => {
                        loadRequests(student.id)
                    }
                )
                .subscribe()

        } catch (error) {
            console.error('Auth check error:', error)
            router.push('/login')
        } finally {
            setLoading(false)
        }
    }

    async function loadRequests(studentId: string) {
        const { data, error } = await supabase
            .from('requests')
            .select('*, outpasses(qr_token)')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false })


        if (error) {
            console.error('Error loading requests:', error)
        } else {
            const formattedRequests = (data || []).map((req: any) => {
                const op = Array.isArray(req.outpasses) ? req.outpasses[0] : req.outpasses
                return {
                    ...req,
                    qr_token: op?.qr_token || undefined
                }
            })
            setRequests(formattedRequests)
        }
    }

    function validateForm(): boolean {
        const newErrors: Record<string, string> = {}

        if (!reason) {
            newErrors.reason = 'Please select a reason'
        }

        if (reason === 'Other' && !customReason.trim()) {
            newErrors.customReason = 'Please enter your reason'
        }

        if (!detailedReason.trim()) {
            newErrors.detailedReason = 'Please describe your reason in detail'
        } else if (detailedReason.trim().length < 20) {
            newErrors.detailedReason = 'Please provide at least 20 characters of detail'
        }

        if (!destination.trim()) {
            newErrors.destination = 'Destination is required'
        }

        if (!departureDate) {
            newErrors.departureDate = 'Departure time is required'
        } else {
            const departure = new Date(departureDate)
            if (departure < new Date()) {
                newErrors.departureDate = 'Departure cannot be in the past'
            }
        }

        if (!returnDate) {
            newErrors.returnDate = 'Return time is required'
        } else {
            const departure = new Date(departureDate)
            const returnTime = new Date(returnDate)
            if (returnTime <= departure) {
                newErrors.returnDate = 'Return time must be after departure time'
            }
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    function hasResubmission(requestId: string): boolean {
        return requests.some(r => r.resubmission_of === requestId)
    }

    function prefillFormForResubmit(request: Request) {
        const dropdownOptions = ['Home Visit', 'Medical', 'Family Emergency', 'Other']
        if (dropdownOptions.includes(request.reason)) {
            setReason(request.reason)
            setCustomReason('')
        } else {
            setReason('Other')
            setCustomReason(request.reason)
        }
        setDetailedReason('')
        setDestination(request.destination)
        setDepartureDate(request.expected_departure.slice(0, 16))
        setReturnDate(request.expected_return.slice(0, 16))
        setResubmitMode(true)
        setOriginalRequestId(request.id)
        document.getElementById('request-form')?.scrollIntoView({ behavior: 'smooth' })
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        if (!validateForm()) return
        if (!studentId) return

        const hasActiveRequest = requests.some(r => 
            ['pending_admin', 'pending_warden', 'qr_issued', 'exited'].includes(r.status)
        )
        if (hasActiveRequest) {
            alert('You already have an active outpass request. Please wait for it to be completed before submitting a new one.')
            return
        }

        setSubmitting(true)

        const finalReason = reason === 'Other' ? customReason : reason
        const fullReason = `${finalReason}: ${detailedReason.trim()}`

        const { error } = await supabase
            .from('requests')
            .insert({
                student_id: studentId,
                reason: fullReason,
                destination: destination.trim(),
                expected_departure: departureDate,
                expected_return: returnDate,
                status: 'pending_admin',
                emergency: reason === 'Family Emergency',
                resubmission_of: resubmitMode ? originalRequestId : null
            })

        if (error) {
            console.error('Submit error:', error)
            alert('Failed to submit request. Please try again.')
        } else {
            // Reset form
            setReason('')
            setCustomReason('')
            setDetailedReason('')
            setDestination('')
            setDepartureDate('')
            setReturnDate('')
            setErrors({})
            setResubmitMode(false)
            setOriginalRequestId(null)
            setSuccessMessage('Request submitted successfully!')
            setShowSuccess(true)

            // Reload requests
            await loadRequests(studentId)

            // Hide success message after 5 seconds
            setTimeout(() => {
                setShowSuccess(false)
            }, 5000)
        }

        setSubmitting(false)
    }

    async function handleLogout() {
        await supabase.auth.signOut()
        window.location.href = '/login'
    }

    function getStatusStepIndex(status: RequestStatus): number {
        const steps = statusSteps[status] || statusSteps.draft
        if (status === 'rejected') return 1
        if (status === 'cancelled') return 1
        if (status === 'overdue') return 3
        if (status === 'exited' || status === 'returned') return 4
        if (status === 'qr_issued') return 3
        if (status === 'pending_warden') return 2
        if (status === 'pending_admin') return 1
        return 0
    }

    const activeRequest = requests.find(r => 
        ['pending_admin', 'pending_warden', 'qr_issued', 'exited', 'overdue'].includes(r.status)
    )
    const historyRequests = requests.filter(r => 
        ['returned', 'rejected', 'cancelled'].includes(r.status) && r.id !== activeRequest?.id
    )

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Student Dashboard</h1>
                            <p className="text-sm text-gray-600 mt-1">Welcome back, {studentName}</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
                        >
                            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                            </svg>
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Success Message */}
                {showSuccess && (
                    <div className="mb-6 rounded-lg bg-green-50 border border-green-200 p-4 animate-fade-in">
                        <div className="flex items-center">
                            <svg className="h-5 w-5 text-green-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-sm text-green-800">{successMessage}</span>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Request Form */}
                    <div id="request-form" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">
                            {resubmitMode ? 'Edit & Resubmit Request' : 'New Outpass Request'}
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Reason Dropdown */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Reason for Outpass *
                                </label>
                                <select
                                    value={reason}
                                    onChange={(e) => {
                                        setReason(e.target.value)
                                        setErrors({ ...errors, reason: '' })
                                    }}
                                    className={`w-full px-3.5 py-2.5 bg-white text-gray-900 font-medium border ${errors.reason ? 'border-red-500' : 'border-gray-300'} rounded-lg shadow-sm focus:bg-white focus:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                                >
                                    <option value="" className="text-gray-500 bg-white">Select a reason</option>
                                    <option value="Home Visit" className="text-gray-900 bg-white">Home Visit</option>
                                    <option value="Medical" className="text-gray-900 bg-white">Medical</option>
                                    <option value="Family Emergency" className="text-gray-900 bg-white">Family Emergency</option>
                                    <option value="Other" className="text-gray-900 bg-white">Other</option>
                                </select>
                                {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason}</p>}
                            </div>

                            {/* Custom Reason Text Area */}
                            {reason === 'Other' && (
                                <div className="animate-fade-in">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Please specify reason *
                                    </label>
                                    <textarea
                                        value={customReason}
                                        onChange={(e) => {
                                            setCustomReason(e.target.value)
                                            setErrors({ ...errors, customReason: '' })
                                        }}
                                        rows={3}
                                        className={`w-full px-3.5 py-2.5 bg-white text-gray-900 border ${errors.customReason ? 'border-red-500' : 'border-gray-300'} rounded-lg shadow-sm placeholder-gray-400 focus:bg-white focus:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                                        placeholder="Please provide detailed reason..."
                                    />
                                    {errors.customReason && <p className="mt-1 text-xs text-red-600">{errors.customReason}</p>}
                                </div>
                            )}

                            {/* Detailed Reason - always shown */}
                            {reason && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Explain in detail *
                                        <span className="ml-1 text-xs text-gray-400 font-normal">(This is what the admin will read to approve your request)</span>
                                    </label>
                                    <textarea
                                        value={detailedReason}
                                        onChange={(e) => {
                                            setDetailedReason(e.target.value)
                                            setErrors({ ...errors, detailedReason: '' })
                                        }}
                                        rows={4}
                                        maxLength={500}
                                        className={`w-full px-3.5 py-2.5 bg-white text-gray-900 border ${errors.detailedReason ? 'border-red-500' : 'border-gray-300'} rounded-lg shadow-sm placeholder-gray-400 focus:bg-white focus:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                                        placeholder={
                                            reason === 'Home Visit' ? 'e.g. Going home for my sister\'s wedding on Nov 20. Will return by Sunday evening...' :
                                            reason === 'Medical' ? 'e.g. Have a doctor appointment at Apollo Hospital for fever treatment at 10am...' :
                                            reason === 'Family Emergency' ? 'e.g. My father has been admitted to hospital. Need to travel to hometown urgently...' :
                                            'Explain clearly why you need this outpass...'
                                        }
                                    />
                                    <div className="flex justify-between mt-1">
                                        {errors.detailedReason
                                            ? <p className="text-xs text-red-600">{errors.detailedReason}</p>
                                            : <p className="text-xs text-gray-400">Be specific — vague reasons may be rejected</p>
                                        }
                                        <p className="text-xs text-gray-400 ml-auto">{detailedReason.length}/500</p>
                                    </div>
                                </div>
                            )}

                            {/* Destination */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Destination *
                                </label>
                                <input
                                    type="text"
                                    value={destination}
                                    onChange={(e) => {
                                        setDestination(e.target.value)
                                        setErrors({ ...errors, destination: '' })
                                    }}
                                    className={`w-full px-3.5 py-2.5 bg-white text-gray-900 border ${errors.destination ? 'border-red-500' : 'border-gray-300'} rounded-lg shadow-sm placeholder-gray-400 focus:bg-white focus:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                                    placeholder="Where are you going?"
                                />
                                {errors.destination && <p className="mt-1 text-xs text-red-600">{errors.destination}</p>}
                            </div>

                            {/* Expected Departure */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Expected Departure Date & Time *
                                </label>
                                <input
                                    type="datetime-local"
                                    value={departureDate}
                                    onChange={(e) => {
                                        setDepartureDate(e.target.value)
                                        setErrors({ ...errors, departureDate: '' })
                                    }}
                                    className={`w-full px-3.5 py-2.5 bg-white text-gray-900 border ${errors.departureDate ? 'border-red-500' : 'border-gray-300'} rounded-lg shadow-sm focus:bg-white focus:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [color-scheme:light]`}
                                />
                                {errors.departureDate && <p className="mt-1 text-xs text-red-600">{errors.departureDate}</p>}
                            </div>

                            {/* Expected Return */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Expected Return Date & Time *
                                </label>
                                <input
                                    type="datetime-local"
                                    value={returnDate}
                                    onChange={(e) => {
                                        setReturnDate(e.target.value)
                                        setErrors({ ...errors, returnDate: '' })
                                    }}
                                    className={`w-full px-3.5 py-2.5 bg-white text-gray-900 border ${errors.returnDate ? 'border-red-500' : 'border-gray-300'} rounded-lg shadow-sm focus:bg-white focus:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [color-scheme:light]`}
                                />
                                {errors.returnDate && <p className="mt-1 text-xs text-red-600">{errors.returnDate}</p>}
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium py-2 px-4 rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? (
                                    <div className="flex items-center justify-center">
                                        <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Submitting...
                                    </div>
                                ) : (
                                    resubmitMode ? 'Resubmit Request' : 'Submit Request'
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Request History & Status Tracker */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">How it Works</h2>
                            <div className="space-y-3">
                                <div className="flex items-center text-sm">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold mr-3">1</div>
                                    <span>Submit your outpass request with reason and timings</span>
                                </div>
                                <div className="flex items-center text-sm">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold mr-3">2</div>
                                    <span>Admin reviews and forwards to warden</span>
                                </div>
                                <div className="flex items-center text-sm">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold mr-3">3</div>
                                    <span>Warden approves and QR code is generated</span>
                                </div>
                                <div className="flex items-center text-sm">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold mr-3">4</div>
                                    <span>Show QR code at gate to exit and enter</span>
                                </div>
                            </div>
                        </div>

                        {/* Active Outpass Card */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold text-gray-900">
                                    {activeRequest ? 'Active Outpass' : 'Campus Status'}
                                </h2>
                                {activeRequest ? (
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[activeRequest.status]}`}>
                                        {activeRequest.status.replace('_', ' ').toUpperCase()}
                                    </span>
                                ) : (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        ● IN HOSTEL
                                    </span>
                                )}
                            </div>

                            {activeRequest ? (
                                <div className="border border-blue-200 bg-blue-50/30 rounded-xl p-5 shadow-sm space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-lg font-bold text-gray-900">{activeRequest.reason}</p>
                                            <p className="text-sm text-gray-700 mt-0.5">Destination: <span className="font-medium text-gray-900">{activeRequest.destination}</span></p>
                                        </div>
                                        {activeRequest.emergency && (
                                            <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded">
                                                EMERGENCY
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 text-xs text-gray-600 bg-white p-3 rounded-lg border border-gray-100">
                                        <div>
                                            <span className="block font-medium text-gray-500">Expected Departure</span>
                                            <span className="text-gray-900 font-semibold">{new Date(activeRequest.expected_departure).toLocaleString()}</span>
                                        </div>
                                        <div>
                                            <span className="block font-medium text-gray-500">Expected Return</span>
                                            <span className="text-gray-900 font-semibold">{new Date(activeRequest.expected_return).toLocaleString()}</span>
                                        </div>
                                    </div>

                                    {/* Status Tracker */}
                                    <div className="pt-2">
                                        <div className="flex items-center justify-between">
                                            {statusSteps[activeRequest.status]?.map((step, idx) => {
                                                if (!step) return null
                                                const isActive = idx <= getStatusStepIndex(activeRequest.status)
                                                const isCurrent = idx === getStatusStepIndex(activeRequest.status)

                                                return (
                                                    <div key={idx} className="flex-1 text-center">
                                                        <div className={`relative ${idx > 0 ? 'ml-[-10px]' : ''}`}>
                                                            <div className={`w-6 h-6 mx-auto rounded-full flex items-center justify-center text-xs font-medium
                                                                ${isActive ? 'bg-green-500 text-white shadow-sm' : 'bg-gray-200 text-gray-500'}`}>
                                                                {isActive ? '✓' : idx + 1}
                                                            </div>
                                                            {idx < statusSteps[activeRequest.status].filter(s => s).length - 1 && (
                                                                <div className={`absolute top-3 left-1/2 w-full h-0.5 ${isActive && idx < getStatusStepIndex(activeRequest.status) ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                                                            )}
                                                        </div>
                                                        <p className={`text-xs mt-2 ${isCurrent ? 'font-bold text-blue-600' : isActive ? 'text-gray-700' : 'text-gray-400'}`}>
                                                            {step}
                                                        </p>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Live QR Code (shown while pass is approved, in transit, or overdue) */}
                                    {['qr_issued', 'exited', 'overdue'].includes(activeRequest.status) && activeRequest.qr_token && (
                                        <div className="mt-4 flex flex-col items-center justify-center p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
                                            <div className="p-2 bg-white rounded-lg shadow-inner border border-gray-100">
                                                <QRCodeSVG value={activeRequest.qr_token} size={240} level="M" />
                                            </div>
                                            <p className="mt-3 text-sm text-gray-900 font-bold">Digital Outpass QR Code</p>
                                            <p className="text-xs text-gray-600 text-center mt-1 max-w-xs">
                                                {activeRequest.status === 'qr_issued'
                                                    ? 'Present this QR code to the gate security officer to CHECK OUT.'
                                                    : 'Keep this QR handy — present it to the gate officer to CHECK IN upon return.'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-6 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                                    <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xl mb-3">
                                        ✓
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900">No active outpass in progress</p>
                                    <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                                        You are currently logged in the hostel. To request leave, fill out and submit the form on the left.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Outpass History (Completed, Returned, Cancelled, and Past Requests) */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold text-gray-900">Outpass History</h2>
                                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                                    {historyRequests.length} past record{historyRequests.length === 1 ? '' : 's'}
                                </span>
                            </div>

                            {historyRequests.length === 0 ? (
                                <p className="text-xs text-gray-500 text-center py-6 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                                    No completed outpass history yet. When your active outpass is completed at the gate, it will be stored here.
                                </p>
                            ) : (
                                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                    {historyRequests.map((pastReq) => (
                                        <div key={pastReq.id} className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50/80 transition-colors">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-semibold text-sm text-gray-900">{pastReq.reason}</p>
                                                    <p className="text-xs text-gray-600 mt-0.5">To: <span className="font-medium">{pastReq.destination}</span></p>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[pastReq.status]}`}>
                                                    {pastReq.status === 'returned' ? '✓ RETURNED' : pastReq.status.toUpperCase()}
                                                </span>
                                            </div>

                                            <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs text-gray-500">
                                                <p>Departure: <span className="text-gray-700">{new Date(pastReq.expected_departure).toLocaleDateString()}</span></p>
                                                <p>Return: <span className="text-gray-700">{new Date(pastReq.expected_return).toLocaleDateString()}</span></p>
                                            </div>

                                            {pastReq.rejection_reason && (
                                                <div className="mt-2.5 p-2 bg-red-50 rounded text-xs text-red-700 border border-red-100">
                                                    <strong>Rejection reason:</strong> {pastReq.rejection_reason}
                                                </div>
                                            )}

                                            {pastReq.status === 'rejected' && (
                                                <div className="mt-2.5">
                                                    {hasResubmission(pastReq.id) ? (
                                                        <span className="text-xs text-yellow-700 bg-yellow-50 px-2.5 py-1 rounded-md inline-block">
                                                            ⏳ Resubmission pending
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => prefillFormForResubmit(pastReq)}
                                                            className="inline-flex items-center px-3 py-1 border border-blue-300 text-xs font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                                                        >
                                                            ✏️ Edit & Resubmit
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <ReportProblem />

            <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      ` }} />
        </div>
    )
}
