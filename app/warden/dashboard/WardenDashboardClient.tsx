'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { QRCodeSVG } from 'qrcode.react'
import ReportProblem from '../../components/ReportProblem'

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

interface QRData {
  outpass_id: string
  student_id: string
  student_name: string
  issued_at: string
  expires_at: string
  request_id: string
}

export default function WardenDashboardClient({ initialRequests }: { initialRequests: PendingRequest[] }) {
  const router = useRouter()
  const supabase = createClient()

  const [requests, setRequests] = useState(initialRequests)
  const [parentNotified, setParentNotified] = useState<Record<string, boolean>>({})
  const [editedReturnTime, setEditedReturnTime] = useState<Record<string, string>>(() => {
    // Initialize with original expected_return for each request
    const initial: Record<string, string> = {}
    initialRequests.forEach(req => {
      initial[req.id] = req.expected_return
    })
    return initial
  })
  const [issuing, setIssuing] = useState<string | null>(null)
  const [showQRModal, setShowQRModal] = useState(false)
  const [qrToken, setQrToken] = useState<string | null>(null)
  const [currentRequest, setCurrentRequest] = useState<PendingRequest | null>(null)

  const [alerts, setAlerts] = useState<any[]>([])
  const [expiredOutpasses, setExpiredOutpasses] = useState<any[]>([])
  const [loadingExpired, setLoadingExpired] = useState(false)
  const [extendingId, setExtendingId] = useState<string | null>(null)

  // Emergency pass states
  const [showEmergencyModal, setShowEmergencyModal] = useState(false)
  const [studentsList, setStudentsList] = useState<any[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [emergencyReason, setEmergencyReason] = useState('')
  const [emergencyDestination, setEmergencyDestination] = useState('')
  const [emergencyDeparture, setEmergencyDeparture] = useState('')
  const [emergencyReturn, setEmergencyReturn] = useState('')
  const [emergencySubmitting, setEmergencySubmitting] = useState(false)

  // Warden rejection states
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectingRequest, setRejectingRequest] = useState<PendingRequest | null>(null)
  const [wardenRejectionReason, setWardenRejectionReason] = useState('')
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  useEffect(() => {
    loadAlerts()
    loadExpiredOutpasses()

    // Subscribe to new alerts in real-time
    const channel = supabase
      .channel('realtime-alerts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'alerts'
      }, (payload) => {
        if (payload.new && payload.new.status === 'pending') {
          setAlerts(prev => [payload.new, ...prev])
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function loadAlerts() {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setAlerts(data)
    }
  }

  async function loadExpiredOutpasses() {
    setLoadingExpired(true)
    try {
      const { data, error } = await supabase
        .from('outpasses')
        .select(`
          id,
          expires_at,
          request_id,
          requests!inner (
            id,
            expected_return,
            status,
            student_id,
            students!inner (
              name,
              roll_number
            )
          )
        `)
        .is('checked_in_at', null)

      if (error) {
        console.error('Error loading outpasses for extension:', error)
      } else {
        const now = new Date()
        const expiredList = (data || []).filter((op: any) => {
          const req = Array.isArray(op.requests) ? op.requests[0] : op.requests
          if (!req) return false
          const expiresAt = new Date(op.expires_at)
          return expiresAt < now || req.status === 'overdue'
        }).map((op: any) => {
          const req = Array.isArray(op.requests) ? op.requests[0] : op.requests
          const student = Array.isArray(req.students) ? req.students[0] : req.students
          return {
            id: op.id,
            expires_at: op.expires_at,
            request_id: op.request_id,
            expected_return: req.expected_return,
            student_name: student?.name || 'Unknown Student',
            roll_number: student?.roll_number || '',
            status: req.status
          }
        })
        setExpiredOutpasses(expiredList)
      }
    } catch (err) {
      console.error('Exception loading outpasses:', err)
    } finally {
      setLoadingExpired(false)
    }
  }

  async function handleExtendOutpass(op: any) {
    setExtendingId(op.id)
    try {
      const currentExpires = new Date(op.expires_at)
      const currentReturn = new Date(op.expected_return)

      const newExpiresAt = new Date(currentExpires.getTime() + 60 * 60 * 1000).toISOString()
      const newExpectedReturn = new Date(currentReturn.getTime() + 60 * 60 * 1000).toISOString()

      const { error: outpassError } = await supabase
        .from('outpasses')
        .update({ expires_at: newExpiresAt })
        .eq('id', op.id)

      if (outpassError) {
        console.error('Error extending outpass expires_at:', outpassError)
        alert('Failed to extend outpass expiry. Please try again.')
        setExtendingId(null)
        return
      }

      const { error: requestError } = await supabase
        .from('requests')
        .update({
          expected_return: newExpectedReturn,
          status: 'exited',
          updated_at: new Date().toISOString()
        })
        .eq('id', op.request_id)

      if (requestError) {
        console.error('Error extending request expected_return:', requestError)
        alert('Outpass extended but failed to update original request. Please notify admin.')
      } else {
        alert(`Successfully extended outpass for ${op.student_name} by 1 hour!`)
      }

      await loadExpiredOutpasses()

    } catch (err) {
      console.error('Extension error:', err)
      alert('An unexpected error occurred during extension.')
    } finally {
      setExtendingId(null)
    }
  }

  async function handleAcknowledgeAlert(alertId: string) {
    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'acknowledged',
        read_at: new Date().toISOString()
      })
      .eq('id', alertId)

    if (!error) {
      setAlerts(prev => prev.filter(a => a.id !== alertId))
    }
  }

  async function loadStudents() {
    const { data, error } = await supabase
      .from('students')
      .select('id, name, roll_number, room_number, block_name, parent_phone')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (!error && data) {
      setStudentsList(data)
    }
  }

  async function handleCreateEmergencyPass(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStudentId) {
      alert('Please select a student.')
      return
    }
    if (!emergencyReason || !emergencyDestination || !emergencyDeparture || !emergencyReturn) {
      alert('Please fill out all fields.')
      return
    }

    setEmergencySubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const selectedStudent = studentsList.find(s => s.id === selectedStudentId)

      if (!selectedStudent) {
        alert('Selected student details not found.')
        setEmergencySubmitting(false)
        return
      }

      // 1. Create Request
      const { data: requestData, error: requestError } = await supabase
        .from('requests')
        .insert({
          student_id: selectedStudentId,
          reason: emergencyReason,
          destination: emergencyDestination.trim(),
          expected_departure: emergencyDeparture,
          expected_return: emergencyReturn,
          status: 'qr_issued',
          emergency: true,
          parent_notified: true,
          parent_notified_at: new Date().toISOString(),
          warden_approved_by: user?.id,
          warden_remarks: 'Emergency Outpass issued directly by Warden.'
        })
        .select()
        .single()

      if (requestError || !requestData) {
        console.error('Request insert error:', requestError)
        alert('Failed to create outpass request. Please try again.')
        setEmergencySubmitting(false)
        return
      }

      // 2. Generate QR token
      const qrData = {
        outpass_id: crypto.randomUUID(),
        student_id: selectedStudentId,
        student_name: selectedStudent.name,
        issued_at: new Date().toISOString(),
        expires_at: emergencyReturn,
        request_id: requestData.id
      }
      const token = btoa(JSON.stringify(qrData))

      // 3. Create Outpass
      const { data: outpassData, error: outpassError } = await supabase
        .from('outpasses')
        .insert({
          request_id: requestData.id,
          qr_token: token,
          expires_at: emergencyReturn,
          issued_at: new Date().toISOString()
        })
        .select()
        .single()

      if (outpassError || !outpassData) {
        console.error('Outpass insert error:', outpassError)
        alert('Failed to generate outpass QR code record.')
        setEmergencySubmitting(false)
        return
      }

      // 4. Insert Admin Alert
      const { error: alertError } = await supabase
        .from('alerts')
        .insert({
          student_id: selectedStudentId,
          outpass_id: outpassData.id,
          type: 'emergency',
          title: 'Emergency Pass Issued',
          message: `Warden has issued an emergency pass for student ${selectedStudent.name} (Roll: ${selectedStudent.roll_number}) directly bypassing admin approval.`,
          priority: 3,
          status: 'pending'
        })

      if (alertError) {
        console.error('Failed to create admin alert:', alertError)
      }

      // 5. Send Parent Twilio SMS
      try {
        const returnFormatted = new Date(emergencyReturn).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        await fetch('/api/notifications/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: selectedStudent.parent_phone,
            message: `ALERT: An emergency outpass has been issued for your ward ${selectedStudent.name} (Roll: ${selectedStudent.roll_number}) by Warden. Expected return: ${returnFormatted}.`
          })
        })
      } catch (smsError) {
        console.error('SMS notification error:', smsError)
      }

      // Success - update states
      setCurrentRequest({
        id: requestData.id,
        reason: emergencyReason,
        destination: emergencyDestination,
        expected_departure: emergencyDeparture,
        expected_return: emergencyReturn,
        emergency: true,
        student_id: selectedStudentId,
        students: {
          name: selectedStudent.name,
          roll_number: selectedStudent.roll_number,
          room_number: selectedStudent.room_number,
          block_name: selectedStudent.block_name,
          parent_name: 'Parent',
          parent_phone: selectedStudent.parent_phone,
          parent_email: null,
          phone_number: null
        }
      })
      setQrToken(token)
      setShowQRModal(true)

      // Close Emergency Modal & Reset Fields
      setShowEmergencyModal(false)
      setSelectedStudentId('')
      setStudentSearch('')
      setEmergencyReason('')
      setEmergencyDestination('')
      setEmergencyDeparture('')
      setEmergencyReturn('')

    } catch (err) {
      console.error('Emergency pass issue failed:', err)
      alert('An unexpected error occurred while generating the emergency outpass.')
    } finally {
      setEmergencySubmitting(false)
    }
  }

  const handleWardenReject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectingRequest || !wardenRejectionReason.trim()) {
      alert('Please provide a reason for rejection.')
      return
    }
    setRejectSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('requests')
        .update({
          status: 'rejected',
          rejection_reason: `Rejected by Warden: ${wardenRejectionReason.trim()}`,
          warden_approved_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', rejectingRequest.id)

      if (error) {
        alert('Failed to reject request: ' + error.message)
      } else {
        setRequests(prev => prev.filter(r => r.id !== rejectingRequest.id))
        setRejectModalOpen(false)
        setRejectingRequest(null)
        setWardenRejectionReason('')
        router.refresh()
      }
    } catch (err: any) {
      alert('Error rejecting request: ' + err.message)
    } finally {
      setRejectSubmitting(false)
    }
  }

  const handleCallParent = (phoneNumber: string) => {
    window.location.href = `tel:${phoneNumber}`
  }

  const handleParentNotified = (requestId: string) => {
    setParentNotified(prev => ({ ...prev, [requestId]: true }))
  }

  const handleReturnTimeChange = (requestId: string, newTime: string) => {
    setEditedReturnTime(prev => ({ ...prev, [requestId]: newTime }))
  }

  const generateQRToken = async (request: PendingRequest, expiresAt: string): Promise<string> => {
    const qrData: QRData = {
      outpass_id: crypto.randomUUID(),
      student_id: request.student_id,
      student_name: request.students.name,
      issued_at: new Date().toISOString(),
      expires_at: expiresAt,
      request_id: request.id
    }
    const token = btoa(JSON.stringify(qrData))
    return token
  }

  const handleIssuePass = async (request: PendingRequest) => {
    if (!parentNotified[request.id]) {
      alert('Please mark "Parent Notified" before issuing the pass.')
      return
    }

    setIssuing(request.id)

    try {
      // Use the edited return time, falling back to original if not changed
      const finalReturnTime = editedReturnTime[request.id] || request.expected_return
      const expiresAt = new Date(finalReturnTime)

      // First update the request's expected_return to the edited value
      const { error: updateRequestError } = await supabase
        .from('requests')
        .update({
          expected_return: finalReturnTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id)

      if (updateRequestError) {
        console.error('Error updating request return time:', updateRequestError)
        alert('Failed to update return time. Please try again.')
        setIssuing(null)
        return
      }

      // Generate QR token and image
      const qrToken = await generateQRToken(request, finalReturnTime)

      // Create outpass record with the new expiry
      const { data: outpass, error: outpassError } = await supabase
        .from('outpasses')
        .insert({
          request_id: request.id,
          qr_token: qrToken,
          expires_at: expiresAt.toISOString(),
          issued_at: new Date().toISOString()
        })
        .select()
        .single()

      if (outpassError) {
        console.error('Error creating outpass:', outpassError)
        alert('Failed to issue outpass. Please try again.')
        setIssuing(null)
        return
      }

      // Update request status to 'qr_issued'
      const { error: updateStatusError } = await supabase
        .from('requests')
        .update({
          status: 'qr_issued',
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id)

      if (updateStatusError) {
        console.error('Error updating request status:', updateStatusError)
        alert('Outpass created but status update failed. Please contact admin.')
      }

      // Update parent notification flag
      await supabase
        .from('requests')
        .update({
          parent_notified: true,
          parent_notified_at: new Date().toISOString()
        })
        .eq('id', request.id)

      // Trigger parent SMS notification
      try {
        const finalReturnFormatted = new Date(finalReturnTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        await fetch('/api/notifications/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: request.students.parent_phone,
            message: `Hostel Outpass issued for your ward ${request.students.name}. Valid until: ${finalReturnFormatted}.`
          })
        })
      } catch (smsError) {
        console.error('Error triggering parent SMS:', smsError)
      }

      // Remove from pending list
      setRequests(prev => prev.filter(r => r.id !== request.id))

      // Show QR code modal
      setCurrentRequest({ ...request, expected_return: finalReturnTime })
      setQrToken(qrToken)
      setShowQRModal(true)

    } catch (error) {
      console.error('Error issuing pass:', error)
      alert('Failed to generate QR code. Please try again.')
    } finally {
      setIssuing(null)
    }
  }

  const closeModal = () => {
    setShowQRModal(false)
    setQrToken(null)
    setCurrentRequest(null)
    router.refresh()
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pending Approvals</h2>
          <p className="text-sm text-gray-500 mt-0.5">Requests awaiting your review ({requests.length})</p>
        </div>
        <button
          onClick={() => {
            loadStudents()
            setShowEmergencyModal(true)
          }}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-lg text-white bg-red-600 hover:bg-red-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
        >
          <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Issue Emergency Pass
        </button>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <svg className="h-6 w-6 text-red-600 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <h3 className="text-md font-bold text-red-900">Active Security Alerts ({alerts.length})</h3>
            </div>
            <button
              onClick={async () => {
                for (const alert of alerts) {
                  await handleAcknowledgeAlert(alert.id)
                }
              }}
              className="text-xs text-red-700 hover:text-red-900 font-semibold underline"
            >
              Acknowledge All
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="bg-white border border-red-200 rounded-lg p-3 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${alert.priority >= 3 ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                      {alert.priority >= 3 ? 'CRITICAL' : 'WARNING'}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(alert.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">{alert.title}</h4>
                  <p className="text-xs text-gray-600 mt-1">{alert.message}</p>
                </div>
                <button
                  onClick={() => handleAcknowledgeAlert(alert.id)}
                  className="mt-3 w-full inline-flex justify-center items-center px-2.5 py-1 border border-transparent text-xs font-semibold rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                >
                  Mark Acknowledged
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when no pending requests */}
      {requests.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center shadow-sm mb-6">
          <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-700">No pending approvals</h3>
          <p className="text-xs text-gray-400 mt-1">All outpass requests have been processed.</p>
        </div>
      )}

      {/* Desktop Table View */}
      {requests.length > 0 && <div className="hidden md:block overflow-x-auto">
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
                Reason / Destination
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Departure Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expected Return
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Parent Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {requests.map((request) => (
              <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {request.students.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {request.students.roll_number}
                    </div>
                    {request.emergency && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 mt-1">
                        Emergency
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {request.students.block_name}-{request.students.room_number}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900 font-medium">{request.reason}</div>
                  <div className="text-xs text-gray-500">To: {request.destination}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {new Date(request.expected_departure).toLocaleString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="datetime-local"
                    value={editedReturnTime[request.id]?.slice(0, 16) || request.expected_return.slice(0, 16)}
                    onChange={(e) => handleReturnTimeChange(request.id, e.target.value)}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">{request.students.parent_name}</span>
                      <br />
                      <span className="text-gray-600">{request.students.parent_phone}</span>
                    </div>
                    <button
                      onClick={() => handleCallParent(request.students.parent_phone)}
                      className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Call Parent
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={parentNotified[request.id] || false}
                        onChange={() => handleParentNotified(request.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">Parent Notified</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleIssuePass(request)}
                        disabled={!parentNotified[request.id] || issuing === request.id}
                        className="flex-1 inline-flex justify-center items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {issuing === request.id ? (
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          'Issue Pass'
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setRejectingRequest(request)
                          setWardenRejectionReason('')
                          setRejectModalOpen(true)
                        }}
                        className="inline-flex justify-center items-center px-2.5 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {/* Mobile Card View */}
      {requests.length > 0 && <div className="md:hidden divide-y divide-gray-200 bg-white border border-gray-200 rounded-lg shadow-sm mb-6">
        {requests.map((request) => (
          <div key={request.id} className="p-4 hover:bg-gray-50 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{request.students.name}</h3>
                <p className="text-xs text-gray-500">{request.students.roll_number}</p>
                {request.emergency && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 mt-1">
                    Emergency
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Room</p>
                <p className="text-sm font-medium">{request.students.block_name}-{request.students.room_number}</p>
              </div>
            </div>

            <div className="space-y-2 mb-3">
              <div>
                <p className="text-xs text-gray-500">Reason</p>
                <p className="text-sm text-gray-900">{request.reason}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Destination</p>
                <p className="text-sm text-gray-900">{request.destination}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-500">Departure</p>
                  <p className="text-sm">{new Date(request.expected_departure).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Return (editable)</p>
                  <input
                    type="datetime-local"
                    value={editedReturnTime[request.id]?.slice(0, 16) || request.expected_return.slice(0, 16)}
                    onChange={(e) => handleReturnTimeChange(request.id, e.target.value)}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1 w-full"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Parent: {request.students.parent_name}</p>
                  <p className="text-sm text-gray-700">{request.students.parent_phone}</p>
                </div>
                <button
                  onClick={() => handleCallParent(request.students.parent_phone)}
                  className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                >
                  <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call
                </button>
              </div>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={parentNotified[request.id] || false}
                  onChange={() => handleParentNotified(request.id)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Parent Notified</span>
              </label>

              <div className="flex space-x-2">
                <button
                  onClick={() => handleIssuePass(request)}
                  disabled={!parentNotified[request.id] || issuing === request.id}
                  className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {issuing === request.id ? 'Issuing...' : 'Issue Pass'}
                </button>
                <button
                  onClick={() => {
                    setRejectingRequest(request)
                    setWardenRejectionReason('')
                    setRejectModalOpen(true)
                  }}
                  className="inline-flex justify-center items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>}

      {/* Expired / Overdue Outpasses Section */}
      <div className="mt-8 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Expired & Overdue Outpasses</h2>
            <p className="text-xs text-gray-500 mt-0.5">Active outpasses that are past their scheduled return time</p>
          </div>
          <button
            onClick={loadExpiredOutpasses}
            disabled={loadingExpired}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            type="button"
            title="Refresh list"
          >
            <svg className={`h-5 w-5 ${loadingExpired ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
            </svg>
          </button>
        </div>

        {loadingExpired ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading expired outpasses...</div>
        ) : expiredOutpasses.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg bg-gray-50">
            No expired or overdue active outpasses currently.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Roll Number</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Scheduled Return</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {expiredOutpasses.map((op) => (
                  <tr key={op.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{op.student_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{op.roll_number}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{new Date(op.expected_return).toLocaleString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">
                      <span className={`px-2 py-0.5 rounded-full ${op.status === 'overdue' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                        {op.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleExtendOutpass(op)}
                        disabled={extendingId === op.id}
                        type="button"
                        className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                      >
                        {extendingId === op.id ? 'Extending...' : 'Extend 1 Hour'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQRModal && currentRequest && qrToken && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={closeModal} />

            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100">
              <div className="bg-white px-6 pt-6 pb-4">
                <div className="text-center">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>

                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
                    Outpass Issued Successfully!
                  </h3>

                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="mb-3">
                      <p className="text-sm text-gray-600">Student: <span className="font-semibold text-gray-900">{currentRequest.students.name}</span></p>
                      <p className="text-sm text-gray-600">Valid until: <span className="font-semibold text-gray-900">{new Date(currentRequest.expected_return).toLocaleString()}</span></p>
                    </div>

                    <div className="flex justify-center mb-4">
                      <div className="bg-white p-4 rounded-lg shadow-sm">
                        <QRCodeSVG value={qrToken || ''} size={200} />
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 text-center">
                      Student must show this QR code at the gate for verification
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-6 py-4 flex space-x-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm"
                >
                  Done
                </button>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Pass Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={() => setShowEmergencyModal(false)} />

            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-100">
              <form onSubmit={handleCreateEmergencyPass}>
                <div className="bg-white px-6 pt-6 pb-4">
                  <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-bold text-gray-900 flex items-center">
                      <svg className="h-6 w-6 text-red-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Issue Emergency Outpass
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowEmergencyModal(false)}
                      className="text-gray-400 hover:text-gray-500"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    {/* Student Selection */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Select Student
                      </label>
                      <input
                        type="text"
                        placeholder="Type student name or roll number to search..."
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-red-500 focus:border-red-500 mb-2"
                      />
                      <select
                        size={5}
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-red-500 focus:border-red-500 max-h-32 overflow-y-auto animate-pulse-subtle"
                        required
                      >
                        <option value="">-- Choose Student --</option>
                        {studentsList
                          .filter(s =>
                            s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                            s.roll_number.toLowerCase().includes(studentSearch.toLowerCase())
                          )
                          .map((student) => (
                            <option key={student.id} value={student.id}>
                              {student.name} ({student.roll_number}) - Room: {student.block_name}-{student.room_number}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Emergency Reason */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Emergency Reason
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Medical emergency at home, Family emergency"
                        value={emergencyReason}
                        onChange={(e) => setEmergencyReason(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-red-500 focus:border-red-500"
                        required
                      />
                    </div>

                    {/* Destination */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Destination
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Home address, Hospital"
                        value={emergencyDestination}
                        onChange={(e) => setEmergencyDestination(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-red-500 focus:border-red-500"
                        required
                      />
                    </div>

                    {/* Departure & Return */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Departure Time
                        </label>
                        <input
                          type="datetime-local"
                          value={emergencyDeparture}
                          onChange={(e) => setEmergencyDeparture(e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-red-500 focus:border-red-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Expected Return Time
                        </label>
                        <input
                          type="datetime-local"
                          value={emergencyReturn}
                          onChange={(e) => setEmergencyReturn(e.target.value)}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-red-500 focus:border-red-500"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-6 py-4 flex space-x-3 justify-end border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowEmergencyModal(false)}
                    className="inline-flex justify-center rounded-md border border-gray-300 px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={emergencySubmitting}
                    className="inline-flex justify-center rounded-md border border-transparent px-4 py-2 bg-red-600 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {emergencySubmitting ? 'Generating...' : 'Issue Outpass'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Warden Reject Modal */}
      {rejectModalOpen && rejectingRequest && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={() => setRejectModalOpen(false)} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-100">
              <form onSubmit={handleWardenReject}>
                <div className="bg-white px-6 pt-5 pb-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Reject Outpass Request</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Student: <span className="font-semibold text-gray-900">{rejectingRequest.students.name}</span> ({rejectingRequest.students.roll_number})
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reason for Rejection *
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={wardenRejectionReason}
                      onChange={(e) => setWardenRejectionReason(e.target.value)}
                      placeholder="e.g., Parent did not give consent via phone call..."
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-red-500 focus:border-red-500"
                    />
                  </div>
                </div>
                <div className="bg-gray-50 px-6 py-3 flex space-x-3 justify-end border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setRejectModalOpen(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={rejectSubmitting || !wardenRejectionReason.trim()}
                    className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                  >
                    {rejectSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <ReportProblem />
    </>
  )
}