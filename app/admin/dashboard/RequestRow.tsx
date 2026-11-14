'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  isUrgent?: boolean
  hoursWaited?: number
}

const UNDO_SECONDS = 8 // 8-second undo window

// ── Shared approval / reject logic hook ──────────────────────────────────────
function useRequestActions(requestId: string) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [approved, setApproved] = useState(false)   // optimistic: row hidden after approval
  const [undoTimer, setUndoTimer] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const commitRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (commitRef.current) clearTimeout(commitRef.current)
    }
  }, [])

  async function commitApproval() {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (commitRef.current) clearTimeout(commitRef.current)
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('requests')
      .update({
        status: 'pending_warden',
        admin_approved_by: user?.id,
        admin_remarks: 'Approved by admin',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)

    if (error) {
      console.error('Approval error:', error)
      alert('Failed to approve. Please try again.')
      setApproved(false)
    } else {
      router.refresh()
    }
    setLoading(false)
    setUndoTimer(0)
  }

  function handleApprove() {
    if (loading) return
    setApproved(true)
    setUndoTimer(UNDO_SECONDS)

    // countdown
    countdownRef.current = setInterval(() => {
      setUndoTimer(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // commit after UNDO_SECONDS
    commitRef.current = setTimeout(() => {
      commitApproval()
    }, UNDO_SECONDS * 1000)
  }

  function handleUndo() {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (commitRef.current) clearTimeout(commitRef.current)
    setApproved(false)
    setUndoTimer(0)
  }

  async function handleReject() {
    if (loading || !rejectionReason.trim()) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('requests')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)

    if (error) {
      alert('Failed to reject. Please try again.')
    } else {
      setIsRejectOpen(false)
      setRejectionReason('')
      router.refresh()
    }
    setLoading(false)
  }

  return {
    loading, approved, undoTimer,
    isRejectOpen, setIsRejectOpen,
    rejectionReason, setRejectionReason,
    handleApprove, handleUndo, commitApproval, handleReject
  }
}

// ── Reject Modal (shared) ─────────────────────────────────────────────────────
function RejectModal({
  open, studentName, loading, reason, setReason,
  onClose, onConfirm
}: {
  open: boolean; studentName: string; loading: boolean
  reason: string; setReason: (v: string) => void
  onClose: () => void; onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-100">
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Reject Outpass Request</h3>
                <p className="text-sm text-gray-500">Student: <span className="font-semibold text-gray-700">{studentName}</span></p>
              </div>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for rejection <span className="text-red-500">*</span></label>
            <textarea
              rows={3}
              autoFocus
              className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 placeholder-gray-400"
              placeholder="e.g. Insufficient notice period, Parent not reachable..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="bg-gray-50 px-6 py-3 flex justify-end gap-3 border-t border-gray-100 rounded-b-xl">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={onConfirm}
              disabled={!reason.trim() || loading}
              className="px-4 py-2 border border-transparent rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Undo Toast ────────────────────────────────────────────────────────────────
function UndoToast({ timer, onUndo, onApproveNow }: {
  timer: number; onUndo: () => void; onApproveNow: () => void
}) {
  if (timer <= 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-4 border border-gray-700">
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-medium">Approved · <span className="text-yellow-400">Undo in {timer}s</span></span>
      </div>
      <div className="flex gap-2">
        <button onClick={onApproveNow}
          className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
          Apply Now
        </button>
        <button onClick={onUndo}
          className="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
          Undo
        </button>
      </div>
    </div>
  )
}

// ── Desktop Table Row ─────────────────────────────────────────────────────────
export function PendingRequestRow({ request }: { request: PendingRequest }) {
  const {
    loading, approved, undoTimer,
    isRejectOpen, setIsRejectOpen,
    rejectionReason, setRejectionReason,
    handleApprove, handleUndo, commitApproval, handleReject
  } = useRequestActions(request.id)

  if (approved && undoTimer <= 0) return null  // hide row after committed

  return (
    <>
      <tr className={`transition-colors ${approved ? 'bg-green-50 opacity-60' : 'hover:bg-gray-50'}`}>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-700 font-bold text-sm">{request.student_name.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                {request.student_name}
                {request.emergency && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">🚨 EMERGENCY</span>
                )}
                {request.isUrgent && !request.emergency && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">Waiting {request.hoursWaited}h</span>
                )}
              </div>
              <div className="text-xs text-gray-500">Requested {new Date(request.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <span className="text-sm font-medium text-gray-900">{request.block_name}-{request.room_number}</span>
        </td>
        <td className="px-6 py-4">
          <div className="text-sm text-gray-900 max-w-xs">{request.reason}</div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="text-sm text-gray-900">{new Date(request.expected_departure).toLocaleString()}</div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          {approved ? (
            <span className="text-sm text-green-600 font-semibold flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Sending to Warden...
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleApprove} disabled={loading}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-semibold rounded-lg text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm">
                ✓ Approve
              </button>
              <button onClick={() => setIsRejectOpen(true)} disabled={loading}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-semibold rounded-lg text-gray-700 bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:opacity-50 transition-colors">
                Reject
              </button>
            </div>
          )}
        </td>
      </tr>

      <UndoToast timer={undoTimer} onUndo={handleUndo} onApproveNow={commitApproval} />
      <RejectModal
        open={isRejectOpen} studentName={request.student_name} loading={loading}
        reason={rejectionReason} setReason={setRejectionReason}
        onClose={() => setIsRejectOpen(false)} onConfirm={handleReject}
      />
    </>
  )
}

// ── Mobile Card ───────────────────────────────────────────────────────────────
export function PendingRequestCard({ request }: { request: PendingRequest }) {
  const {
    loading, approved, undoTimer,
    isRejectOpen, setIsRejectOpen,
    rejectionReason, setRejectionReason,
    handleApprove, handleUndo, commitApproval, handleReject
  } = useRequestActions(request.id)

  if (approved && undoTimer <= 0) return null

  return (
    <>
      <div className={`p-4 transition-colors ${approved ? 'bg-green-50 opacity-60' : 'hover:bg-gray-50'}`}>
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-700 font-bold">{request.student_name.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{request.student_name}</h3>
              <p className="text-xs text-gray-500">Room {request.block_name}-{request.room_number}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {request.emergency && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">🚨 Emergency</span>
            )}
            {request.isUrgent && !request.emergency && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700">Waiting {request.hoursWaited}h</span>
            )}
          </div>
        </div>

        <div className="space-y-1 mb-3 text-sm text-gray-600">
          <p><span className="font-medium text-gray-700">Reason:</span> {request.reason}</p>
          <p><span className="font-medium text-gray-700">Departure:</span> {new Date(request.expected_departure).toLocaleString()}</p>
          <p className="text-xs text-gray-400">Requested: {new Date(request.created_at).toLocaleString()}</p>
        </div>

        {approved ? (
          <p className="text-sm text-green-600 font-semibold flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Sending to Warden...
          </p>
        ) : (
          <div className="flex gap-2 mt-3">
            <button onClick={handleApprove} disabled={loading}
              className="flex-1 inline-flex justify-center items-center px-3 py-2 border border-transparent text-sm font-semibold rounded-lg text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors">
              ✓ Approve
            </button>
            <button onClick={() => setIsRejectOpen(true)} disabled={loading}
              className="flex-1 inline-flex justify-center items-center px-3 py-2 border border-gray-300 text-sm font-semibold rounded-lg text-gray-700 bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:opacity-50 transition-colors">
              Reject
            </button>
          </div>
        )}
      </div>

      <UndoToast timer={undoTimer} onUndo={handleUndo} onApproveNow={commitApproval} />
      <RejectModal
        open={isRejectOpen} studentName={request.student_name} loading={loading}
        reason={rejectionReason} setReason={setRejectionReason}
        onClose={() => setIsRejectOpen(false)} onConfirm={handleReject}
      />
    </>
  )
}
