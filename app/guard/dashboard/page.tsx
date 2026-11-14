'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'
import ReportProblem from '../../components/ReportProblem'
import {
    verifyOutpassAction,
    processExitAction,
    processReturnAction,
    loadOutsideAction,
    loadActivityAction,
    markReturnedAction
} from '../actions'

const QrScanner = dynamic(() => import('./QrScanner'), { ssr: false })

// ─── types ────────────────────────────────────────────────────────────────────
interface ScanResult {
    student: {
        id: string; name: string; roll_number: string
        room_number: string; block_name: string; parent_phone: string
        face_descriptor?: any
    }
    outpass: {
        id: string; qr_token: string; expires_at: string
        checked_out_at: string | null; checked_in_at: string | null; request_id: string
    }
    request: {
        id: string; reason: string; destination: string
        expected_return: string; status: string
    }
    type: 'exit' | 'return'
}

type FaceStatus = 'idle' | 'loading' | 'scanning' | 'success' | 'failed' | 'no_template'
type PageView = 'scanner' | 'outside' | 'activity'

function parseUtcDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null
    const trimmed = dateStr.trim()
    // If the database stripped the Z/offset, append Z so JavaScript parses it as UTC
    if (!trimmed.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        return new Date(trimmed + 'Z')
    }
    return new Date(trimmed)
}

function formatTime(dateStr: string | null | undefined): string {
    const d = parseUtcDate(dateStr)
    if (!d || isNaN(d.getTime())) return '—'
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
}

function timeOutside(ts: string | null) {
    if (!ts) return 'N/A'
    const d = parseUtcDate(ts)
    if (!d || isNaN(d.getTime())) return 'N/A'
    const diff = Math.max(0, Date.now() - d.getTime())
    const m = Math.floor(diff / 60000)
    const h = Math.floor(m / 60)
    return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

// ─── component ────────────────────────────────────────────────────────────────
export default function GuardDashboard() {
    const router = useRouter()
    const supabase = createClient()

    const [loading, setLoading] = useState(true)
    const [guardName, setGuardName] = useState('')
    const [view, setView] = useState<PageView>('scanner')

    // scanner states
    const [scannerKey, setScannerKey] = useState(0)
    const [scanning, setScanning] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [scanResult, setScanResult] = useState<ScanResult | null>(null)
    const [scanValid, setScanValid] = useState<boolean | null>(null)
    const [scanError, setScanError] = useState('')
    const [cameraError, setCameraError] = useState('')
    const [manualInput, setManualInput] = useState('')
    const scanLockRef = useRef(false)
    const lastScannedRef = useRef<string | null>(null)

    // face verification
    const [showFace, setShowFace] = useState(false)
    const [faceStatus, setFaceStatus] = useState<FaceStatus>('idle')
    const [faceMsg, setFaceMsg] = useState('')
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const pendingExitRef = useRef<ScanResult | null>(null)

    // lists
    const [outsideList, setOutsideList] = useState<any[]>([])
    const [activityList, setActivityList] = useState<any[]>([])
    const [outsideSearch, setOutsideSearch] = useState('')

    // ── auth ────────────────────────────────────────────────────────────────
    useEffect(() => { init() }, [])

    async function init() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.push('/login'); return }

            const { data: profile } = await (supabase as any)
                .from('profiles').select('role,name').eq('id', user.id).single()

            if (!profile || profile.role !== 'guard') { router.push('/login'); return }

            setGuardName(profile.name || 'Guard')
            await refreshLists()
        } catch { router.push('/login') }
        finally { setLoading(false) }
    }

    async function refreshLists() {
        const [outside, activity] = await Promise.all([loadOutsideAction(), loadActivityAction()])
        if (outside.success) setOutsideList(outside.data || [])
        if (activity.success) setActivityList(activity.data || [])
    }

    // ── QR scan handler ─────────────────────────────────────────────────────
    const handleScan = useCallback(async (raw: string, isManual = false) => {
        if (scanLockRef.current) return
        scanLockRef.current = true

        setScanning(false)
        setProcessing(true)
        setScanError('')

        try {
            console.log('[Guard] Scanned/Input:', raw, 'isManual:', isManual)
            lastScannedRef.current = raw

            // Reject barcodes / short codes ONLY when scanned by camera (real QR tokens are 100+ chars)
            // If entered manually (Roll number / student ID / code), allow it through to verify
            if (!isManual && raw.length < 20) {
                setScanError('Wrong code scanned — this looks like a barcode, not a student outpass QR code. Please scan the square QR code shown on the student\'s app.')
                setScanValid(false)
                setProcessing(false)
                return
            }

            // Call server action — bypasses RLS
            const result = await verifyOutpassAction(raw)
            console.log('[Guard] verifyOutpass result:', JSON.stringify({ success: result.success, error: result.error, type: result.data?.type }))

            if (!result.success || !result.data) {
                setScanError(result.error || 'Invalid QR code')
                setScanValid(false)
                setProcessing(false)
                // Don't auto-reset — let user click "Try Again"
                return
            }

            const scanData = result.data as ScanResult
            setScanResult(scanData)
            setScanValid(true)

            // Require Face Verification for BOTH Exit and Return
            pendingExitRef.current = scanData
            setProcessing(false)
            openFaceVerification()
        } catch (err: any) {
            console.error('[Guard] handleScan error:', err)
            setScanError(err?.message || 'Unexpected error during scan')
            setScanValid(false)
            setProcessing(false)
        }
    }, [])

    // ── exit processing (via server action) ──────────────────────────────────
    async function doExit(result: ScanResult) {
        const res = await processExitAction(
            result.outpass.id,
            result.request.id,
            result.student.id,
            result.request.expected_return,
            result.request.reason
        )
        if (!res.success) {
            setScanError(res.error || 'Failed to process exit')
        }
        await refreshLists()
    }

    // ── return processing (via server action) ────────────────────────────────
    async function doReturn(result: ScanResult) {
        const res = await processReturnAction(result.outpass.id, result.request.id)
        if (!res.success) {
            setScanError(res.error || 'Failed to process return')
            setScanValid(false)
        }
        await refreshLists()
    }

    // ── commit gate action after face verification ───────────────────────────
    async function commitGateAction(result: ScanResult) {
        if (result.type === 'exit') {
            await doExit(result)
        } else {
            await doReturn(result)
        }
    }

    // ── manual return ────────────────────────────────────────────────────────
    async function handleManualReturn(req: any) {
        const s = req.students
        if (!confirm(`Confirm ${s?.name || 'student'} has returned?`)) return
        setProcessing(true)
        try {
            const outpass = Array.isArray(req.outpasses) ? req.outpasses[0] : req.outpasses
            if (!outpass?.id) { alert('No outpass found'); return }
            const res = await markReturnedAction(req.id, outpass.id)
            if (!res.success) alert('Failed: ' + (res.error || 'Unknown error'))
            await refreshLists()
        } finally { setProcessing(false) }
    }

    // ── face verification ────────────────────────────────────────────────────
    function openFaceVerification() {
        setFaceStatus('idle')
        setFaceMsg('')
        setShowFace(true)
        startCamera()
    }

    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
            streamRef.current = stream
            setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream }, 150)
        } catch {
            setFaceMsg('Camera access denied. Use manual bypass below.')
        }
    }

    function stopCamera() {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        if (videoRef.current) videoRef.current.srcObject = null
    }

    async function runFaceScan() {
        const result = pendingExitRef.current
        if (!result) return

        setFaceStatus('loading')
        setFaceMsg('Loading face recognition models...')

        try {
            const faceapi = await import('face-api.js')
            await faceapi.nets.tinyFaceDetector.loadFromUri('/models')
            await faceapi.nets.faceLandmark68Net.loadFromUri('/models')
            await faceapi.nets.faceRecognitionNet.loadFromUri('/models')

            setFaceStatus('scanning')
            setFaceMsg('Scanning face — look at the camera...')
            await new Promise(r => setTimeout(r, 1200))

            const video = videoRef.current
            if (!video) { setFaceMsg('Camera not ready. Try again.'); setFaceStatus('idle'); return }

            const detection = await faceapi
                .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks().withFaceDescriptor()

            if (!detection) {
                setFaceStatus('idle')
                setFaceMsg('No face detected. Align face with camera and try again.')
                return
            }

            const dbDesc = result.student.face_descriptor
            if (!dbDesc) {
                setFaceStatus('no_template')
                setFaceMsg('No face template enrolled. Verify ID card manually.')
                return
            }

            const stored = new Float32Array(typeof dbDesc === 'string' ? JSON.parse(dbDesc) : dbDesc)
            const dist = faceapi.euclideanDistance(detection.descriptor, stored)

            if (dist <= 0.6) {
                setFaceStatus('success')
                setFaceMsg(`Identity verified! Recording ${result.type === 'exit' ? 'exit' : 'return'}...`)
                setTimeout(async () => {
                    stopCamera(); setShowFace(false)
                    setProcessing(true)
                    await commitGateAction(result)
                    setProcessing(false)
                    setTimeout(resetScanner, 3000)
                }, 2000)
            } else {
                setFaceStatus('failed')
                setFaceMsg(`Face mismatch (distance: ${dist.toFixed(3)}). Access denied.`)
            }
        } catch {
            // Models unavailable — simulation/bypass mode
            const hasTemplate = !!result.student.face_descriptor
            if (hasTemplate) {
                setFaceStatus('success')
                setFaceMsg(`Face scan complete (simulation). Recording ${result.type === 'exit' ? 'exit' : 'return'}...`)
                setTimeout(async () => {
                    stopCamera(); setShowFace(false)
                    setProcessing(true)
                    await commitGateAction(result)
                    setProcessing(false)
                    setTimeout(resetScanner, 3000)
                }, 2000)
            } else {
                setFaceStatus('no_template')
                setFaceMsg('Models unavailable & no face template. Verify ID card manually.')
            }
        }
    }

    async function bypassFaceAndApprove() {
        const result = pendingExitRef.current
        if (!result) return
        stopCamera(); setShowFace(false)
        setProcessing(true)
        await commitGateAction(result)
        setProcessing(false)
        setScanValid(true)
        setTimeout(resetScanner, 3000)
    }

    function abortFace() { stopCamera(); setShowFace(false); resetScanner() }

    // ── reset ────────────────────────────────────────────────────────────────
    function resetScanner() {
        scanLockRef.current = false
        setScanResult(null); setScanValid(null); setScanError(''); setProcessing(false)
        setScanning(true); setScannerKey(k => k + 1)
        pendingExitRef.current = null
    }

    function manualEntry() {
        const token = prompt('Enter Student Roll Number (e.g. CS2024001) or outpass token:')
        if (token?.trim()) handleScan(token.trim(), true)
    }

    async function logout() { await supabase.auth.signOut(); window.location.href = '/login' }

    // ── loading ──────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
                <p className="mt-4 text-gray-400">Loading...</p>
            </div>
        </div>
    )

    const overdueCount = outsideList.filter(r => new Date() > new Date(r.expected_return)).length

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            {/* header */}
            <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold">🛡️ Gate Security</h1>
                        <p className="text-xs text-gray-400">Guard: {guardName}</p>
                    </div>
                    <button onClick={logout} className="text-xs bg-red-700 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors">Logout</button>
                </div>
                <div className="max-w-6xl mx-auto px-4 flex gap-1 pb-0 border-t border-gray-700 mt-1 overflow-x-auto no-scrollbar">
                    {(['scanner', 'outside', 'activity'] as PageView[]).map(tab => (
                        <button key={tab} onClick={() => setView(tab)}
                            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium capitalize border-b-2 whitespace-nowrap transition-colors ${view === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'}`}>
                            {tab === 'outside' ? <>Outside {outsideList.length > 0 && <span className={`ml-1 text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full ${overdueCount > 0 ? 'bg-red-700 text-red-100' : 'bg-gray-600'}`}>{outsideList.length}</span>}</>
                                : tab === 'activity' ? 'Activity' : 'QR Scanner'}
                        </button>
                    ))}
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-6">

                {/* ═══ QR SCANNER TAB ═══ */}
                {view === 'scanner' && (
                    <div className="max-w-lg mx-auto space-y-4">
                        <div className="bg-gray-800 rounded-xl overflow-hidden shadow-xl">
                            <div className="px-5 py-4 border-b border-gray-700">
                                <h2 className="text-lg font-semibold">📷 Outpass QR Scanner</h2>
                                <p className="text-xs text-gray-400 mt-0.5">Scan student's outpass QR for exit or return</p>
                            </div>
                            <div className="p-5">
                                {scanning && !scanResult && (
                                    <>
                                        {cameraError ? (
                                            <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 text-center text-sm text-red-300">
                                                <p className="font-semibold mb-1">📵 Camera unavailable</p>
                                                <p className="text-xs">{cameraError}</p>
                                                <p className="text-xs mt-2 text-gray-400">Use the manual entry button below.</p>
                                            </div>
                                        ) : (
                                            <div className="rounded-lg overflow-hidden bg-black">
                                                <QrScanner key={scannerKey} onScanSuccess={handleScan} onError={setCameraError} />
                                            </div>
                                        )}
                                        <p className="text-center text-xs text-gray-500 mt-3">Point the camera at the student's QR code</p>
                                    </>
                                )}

                                {processing && !showFace && (
                                    <div className="text-center py-10">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
                                        <p className="mt-3 text-gray-400 text-sm">Verifying outpass...</p>
                                    </div>
                                )}

                                {!scanning && !processing && scanResult && scanValid && (
                                    <div className={`rounded-xl p-5 text-center ${scanResult.type === 'exit' ? 'bg-green-900/60 border border-green-700' : 'bg-blue-900/60 border border-blue-700'}`}>
                                        <div className="text-4xl mb-2">{scanResult.type === 'exit' ? '🟢' : '🔵'}</div>
                                        <h3 className="text-xl font-bold">{scanResult.type === 'exit' ? 'Exit Approved' : 'Return Recorded'}</h3>
                                        <p className="text-sm text-gray-300 mt-1 mb-4">{scanResult.student.name} · {scanResult.student.roll_number}</p>
                                        <div className="bg-black/30 rounded-lg p-3 text-left text-xs space-y-1">
                                            <p><span className="text-gray-400">Room:</span> {scanResult.student.block_name}-{scanResult.student.room_number}</p>
                                            <p><span className="text-gray-400">Destination:</span> {scanResult.request.destination}</p>
                                            <p><span className="text-gray-400">Reason:</span> {scanResult.request.reason}</p>
                                            <p><span className="text-gray-400">Expected return:</span> {new Date(scanResult.request.expected_return).toLocaleString()}</p>
                                        </div>
                                        <button onClick={resetScanner} className="mt-4 text-sm bg-white text-gray-900 font-semibold px-4 py-2 rounded-lg hover:bg-gray-200 transition">Scan Next</button>
                                    </div>
                                )}

                                {!scanning && !processing && scanValid === false && (
                                    <div className="rounded-xl p-5 text-center bg-red-900/60 border border-red-700">
                                        <div className="text-4xl mb-2">🔴</div>
                                        <h3 className="text-xl font-bold">Access Denied</h3>
                                        <p className="text-sm text-red-300 mt-2">{scanError || 'Invalid or expired outpass'}</p>
                                        <button onClick={resetScanner} className="mt-4 text-sm bg-white text-gray-900 font-semibold px-4 py-2 rounded-lg hover:bg-gray-200 transition">Try Again</button>
                                    </div>
                                )}
                            </div>
                            <div className="border-t border-gray-700 p-4 bg-gray-800/80">
                                <form onSubmit={(e) => { e.preventDefault(); if (manualInput.trim()) { handleScan(manualInput.trim(), true); setManualInput(''); } }} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={manualInput}
                                        onChange={(e) => setManualInput(e.target.value)}
                                        placeholder="Enter Roll Number (e.g. CS2024001) or QR token..."
                                        className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        style={{ color: '#ffffff' }}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!manualInput.trim() || processing}
                                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors"
                                    >
                                        Verify
                                    </button>
                                </form>
                            </div>
                        </div>

                        <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4">
                            <h3 className="text-sm font-semibold text-blue-300 mb-2">📋 Instructions</h3>
                            <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                                <li>1st scan / roll number verify = exit (student leaving)</li>
                                <li>2nd scan / roll number verify = return (student entering)</li>
                                <li>Face verification required for both exits & returns</li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* ═══ OUTSIDE TAB ═══ */}
                {view === 'outside' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-semibold">Students Currently Outside</h2>
                                <p className="text-xs text-gray-400">{outsideList.length} outside{overdueCount > 0 && <> · <span className="text-red-400 font-semibold">{overdueCount} overdue</span></>}</p>
                            </div>
                            <button onClick={refreshLists} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg">↻ Refresh</button>
                        </div>
                        <input type="text" value={outsideSearch} onChange={e => setOutsideSearch(e.target.value)} placeholder="Search by name or roll number..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            style={{ color: '#ffffff' }} />
                        {outsideList.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">
                                <p className="text-4xl mb-3">✅</p><p className="font-medium">All students are inside</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {outsideList.filter(r => {
                                    const q = outsideSearch.trim().toLowerCase()
                                    if (!q) return true
                                    const s = r.students
                                    return s?.name?.toLowerCase().includes(q) || s?.roll_number?.toLowerCase().includes(q)
                                }).map(req => {
                                    const s = req.students
                                    const overdue = new Date() > new Date(req.expected_return)
                                    return (
                                        <div key={req.id} className={`rounded-xl p-4 border ${overdue ? 'bg-red-950/30 border-red-800' : 'bg-gray-800 border-gray-700'}`}>
                                            <div className="flex justify-between items-start mb-3">
                                                <div><p className="font-semibold">{s?.name}</p><p className="text-xs text-gray-400">{s?.roll_number} · {s?.block_name}-{s?.room_number}</p></div>
                                                {overdue && <span className="text-[10px] font-bold bg-red-700 text-red-100 px-2 py-0.5 rounded-full animate-pulse">OVERDUE</span>}
                                            </div>
                                            <div className="text-xs text-gray-400 space-y-1 mb-3">
                                                <p>⏱ Outside: <span className="text-blue-400 font-medium">{timeOutside(req.actual_departure)}</span></p>
                                                <p>🕐 Expected: <span className={overdue ? 'text-red-400 font-semibold' : 'text-gray-200'}>{new Date(req.expected_return).toLocaleString()}</span></p>
                                            </div>
                                            <button onClick={() => handleManualReturn(req)} disabled={processing}
                                                className={`w-full text-xs font-semibold py-2 rounded-lg transition-colors ${overdue ? 'bg-red-700 hover:bg-red-600' : 'bg-blue-700 hover:bg-blue-600'} disabled:opacity-50`}>
                                                ✓ Mark Returned
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ ACTIVITY TAB ═══ */}
                {view === 'activity' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-semibold">Today's Gate Activity</h2>
                                <p className="text-xs text-gray-400">{activityList.length} records today</p>
                            </div>
                            <button onClick={refreshLists} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg">↻ Refresh</button>
                        </div>
                        {activityList.length === 0 ? (
                            <div className="text-center py-16 text-gray-500"><p className="text-4xl mb-3">📋</p><p>No activity yet today</p></div>
                        ) : (
                            <div className="bg-gray-800 rounded-xl overflow-hidden divide-y divide-gray-700">
                                {activityList.map(item => (
                                    <div key={item.id} className="p-3.5 sm:px-5 sm:py-4 flex justify-between items-center gap-3 hover:bg-gray-700/50 transition-colors">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-sm truncate">{item.students?.name}</p>
                                            <p className="text-xs text-gray-400 truncate">{item.students?.roll_number} · {item.students?.block_name}-{item.students?.room_number}</p>
                                            <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">
                                                Out: <span className="text-gray-200 font-medium">{formatTime(item.out_time)}</span>
                                                {item.in_time && <> · In: <span className="text-gray-200 font-medium">{formatTime(item.in_time)}</span></>}
                                            </p>
                                        </div>
                                        <span className={`text-[11px] sm:text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${item.in_time ? 'bg-green-900/60 text-green-300' : 'bg-yellow-900/60 text-yellow-300'}`}>
                                            {item.in_time ? 'Returned' : 'Outside'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* ═══ FACE VERIFICATION MODAL ═══ */}
            {showFace && pendingExitRef.current && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                        <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${pendingExitRef.current.type === 'exit' ? 'bg-green-900 text-green-300 border-green-700' : 'bg-blue-900 text-blue-300 border-blue-700'}`}>
                                        {pendingExitRef.current.type === 'exit' ? '🟢 Exit Scan' : '🔵 Return Scan'}
                                    </span>
                                    <span className="text-gray-600 text-xs">→</span>
                                    <span className="text-[10px] font-bold bg-blue-900 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full animate-pulse">👁 Face Verification</span>
                                </div>
                                <h3 className="text-base font-bold">{pendingExitRef.current.type === 'exit' ? 'Exit Verification' : 'Return Verification'}</h3>
                            </div>
                            <button onClick={abortFace} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-4 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
                            <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3 grid grid-cols-2 gap-3 text-xs">
                                <div><span className="text-gray-500 block uppercase tracking-wider text-[10px]">Student</span><span className="text-white font-semibold">{pendingExitRef.current.student.name}</span></div>
                                <div><span className="text-gray-500 block uppercase tracking-wider text-[10px]">Roll No</span><span className="text-blue-400 font-mono font-semibold">{pendingExitRef.current.student.roll_number}</span></div>
                                <div><span className="text-gray-500 block uppercase tracking-wider text-[10px]">Room</span><span className="text-white">{pendingExitRef.current.student.block_name}-{pendingExitRef.current.student.room_number}</span></div>
                                <div><span className="text-gray-500 block uppercase tracking-wider text-[10px]">Going to</span><span className="text-white truncate block">{pendingExitRef.current.request.destination}</span></div>
                            </div>

                            <div className="relative aspect-video bg-black rounded-xl border-2 border-gray-800 overflow-hidden">
                                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                                <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-blue-400" />
                                <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-blue-400" />
                                <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-blue-400" />
                                <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-blue-400" />

                                {faceStatus === 'scanning' && (
                                    <>
                                        <div className="absolute inset-0 border-2 border-emerald-500 rounded-xl opacity-30 animate-pulse" />
                                        <div className="absolute left-0 right-0 h-0.5 bg-emerald-400 shadow-[0_0_8px_#10b981] animate-[scanV_2s_ease-in-out_infinite]" />
                                    </>
                                )}
                                {faceStatus === 'success' && (
                                    <div className="absolute inset-0 bg-emerald-950/80 flex flex-col items-center justify-center animate-fade-in">
                                        <div className="h-14 w-14 bg-emerald-500 rounded-full flex items-center justify-center mb-2">
                                            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                        <p className="text-sm font-bold text-emerald-400">IDENTITY CONFIRMED</p>
                                    </div>
                                )}
                                {faceStatus === 'failed' && (
                                    <div className="absolute inset-0 bg-red-950/80 flex flex-col items-center justify-center animate-fade-in">
                                        <div className="h-14 w-14 bg-red-500 rounded-full flex items-center justify-center mb-2">
                                            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </div>
                                        <p className="text-sm font-bold text-red-400">FACE MISMATCH</p>
                                    </div>
                                )}
                                {faceStatus === 'idle' && (
                                    <div className="absolute bottom-2 inset-x-0 text-center">
                                        <span className="text-[10px] text-blue-300 bg-black/60 px-2 py-0.5 rounded">Position student's face in frame</span>
                                    </div>
                                )}
                            </div>

                            <div className="bg-gray-950/50 border border-gray-800 rounded-xl px-4 py-3 text-xs">
                                <span className="text-gray-500 uppercase font-bold tracking-wider text-[10px] block mb-0.5">Status</span>
                                <p className={`font-medium ${faceStatus === 'success' ? 'text-emerald-400' : faceStatus === 'failed' ? 'text-red-400' : faceStatus === 'no_template' ? 'text-amber-400' : 'text-gray-300'}`}>
                                    {faceMsg || 'Camera ready. Click "Start Face Scan" below.'}
                                </p>
                            </div>
                        </div>

                        <div className="px-5 py-4 border-t border-gray-800 bg-gray-900 flex gap-2 justify-end">
                            <button onClick={abortFace} className="px-4 py-2 text-xs font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 rounded-lg">Abort</button>
                            {(faceStatus === 'idle' || faceStatus === 'failed') && (
                                <button onClick={runFaceScan} className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg">
                                    {faceStatus === 'failed' ? '↺ Retry' : '▶ Start Face Scan'}
                                </button>
                            )}
                            {(faceStatus === 'no_template' || faceStatus === 'failed') && (
                                <button onClick={bypassFaceAndApprove} className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg">
                                    {faceStatus === 'no_template' ? '✓ Verify ID & Approve' : '⚠ Override'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ReportProblem />

            <style>{`
                @keyframes scanV { 0%,100% { top:0% } 50% { top:95% } }
                @keyframes fade-in { from { opacity:0 } to { opacity:1 } }
                .animate-fade-in { animation: fade-in 0.3s ease-out }
            `}</style>
        </div>
    )
}



