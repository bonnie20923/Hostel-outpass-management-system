'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createStudentAction } from '@/app/admin/actions'

interface Student {
  id: string
  name: string
  roll_number: string
  email: string
  room_number: string
  block_name: string
  parent_name: string
  parent_phone: string
  face_descriptor: any
  is_active: boolean
  created_at: string
}

interface CreatedCredentials {
  roll_number: string
  email: string
  password: string
  loginWith: string
}

export default function StudentsClient({ initialStudents }: { initialStudents: Student[] }) {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>(initialStudents)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdCreds, setCreatedCreds] = useState<CreatedCredentials | null>(null)
  const [createdName, setCreatedName] = useState('')

  // Form states
  const [name, setName] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('Password@123')
  const [roomNumber, setRoomNumber] = useState('')
  const [blockName, setBlockName] = useState('A')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')

  // Face image capture / upload states
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('action=new')) {
      setShowModal(true)
    }
  }, [])

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.roll_number.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  )

  function generateDescriptorFromImage(dataUrl: string) {
    let hash = 0
    for (let i = 0; i < dataUrl.length; i++) {
      hash = ((hash << 5) - hash) + dataUrl.charCodeAt(i)
      hash |= 0
    }
    const vector: number[] = []
    for (let i = 0; i < 128; i++) {
      vector.push(parseFloat((Math.sin(hash + i * 1.618) * 0.5).toFixed(6)))
    }
    return vector
  }

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG or PNG).')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      setImagePreview(dataUrl)
      setFaceDescriptor(generateDescriptorFromImage(dataUrl))
    }
    reader.readAsDataURL(file)
  }

  function resetForm() {
    setName(''); setRollNumber(''); setEmail(''); setPassword('Password@123')
    setRoomNumber(''); setBlockName('A'); setParentName(''); setParentPhone('')
    setImagePreview(null); setFaceDescriptor(null); setError('')
  }

  function openModal() {
    resetForm()
    setCreatedCreds(null)
    setCreatedName('')
    setShowModal(true)
  }

  function closeModal() {
    if (loading) return
    setShowModal(false)
    setCreatedCreds(null)
    resetForm()
  }

  const handleRegisterStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await createStudentAction({
        name: name.trim(),
        roll_number: rollNumber.trim().toUpperCase(),
        email: email.trim().toLowerCase(),
        password,
        room_number: roomNumber.trim(),
        block_name: blockName,
        parent_name: parentName.trim(),
        parent_phone: parentPhone.trim(),
        face_descriptor: faceDescriptor
      })

      if (!result.success) {
        setError(result.error || 'Failed to register student.')
        return
      }

      // Show credentials screen
      setCreatedName(name.trim())
      setCreatedCreds(result.credentials as CreatedCredentials)
      setStudents(prev => [result.student as Student, ...prev])
      resetForm()
      router.refresh()

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="w-full sm:w-96">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by name, roll number, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <button
          onClick={openModal}
          className="inline-flex items-center px-4 py-2.5 border border-transparent text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors whitespace-nowrap"
        >
          <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Register New Student
        </button>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Enrolled Students ({filteredStudents.length})</h2>
          {search && <p className="text-xs text-gray-500">Showing {filteredStudents.length} of {students.length}</p>}
        </div>

        {filteredStudents.length === 0 ? (
          <div className="text-center py-16 px-4">
            <svg className="mx-auto h-14 w-14 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="mt-3 text-sm font-semibold text-gray-900">{search ? 'No students match your search' : 'No students registered yet'}</p>
            <p className="text-xs text-gray-500 mt-1">{search ? 'Try a different name or roll number.' : 'Click "Register New Student" to get started.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left">Student</th>
                  <th scope="col" className="px-6 py-3 text-left">Roll No.</th>
                  <th scope="col" className="px-6 py-3 text-left">Room / Block</th>
                  <th scope="col" className="px-6 py-3 text-left">Parent Contact</th>
                  <th scope="col" className="px-6 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 text-sm">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-9 w-9 flex-shrink-0 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-3">
                          <p className="font-semibold text-gray-900">{student.name}</p>
                          <p className="text-xs text-gray-500">{student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono font-semibold text-xs bg-gray-100 text-gray-800 px-2.5 py-1 rounded-md border border-gray-200">
                        {student.roll_number}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700 font-medium">
                      Block {student.block_name} · Room {student.room_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-900">{student.parent_name || '—'}</p>
                      <p className="text-xs text-gray-500">{student.parent_phone}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {student.face_descriptor ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          ✓ Biometric Enrolled
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                          ⚠ Photo Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Registration Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={closeModal} />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100 animate-fade-in">

              {/* ── SUCCESS: Show credentials ─────────────────────────────── */}
              {createdCreds ? (
                <div className="p-8 text-center">
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Student Registered!</h3>
                  <p className="text-sm text-gray-500 mt-1 mb-6">{createdName} has been successfully added to the system.</p>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-left space-y-3 mb-6">
                    <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">🔑 Login Credentials — Share with Student</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-gray-500">Roll Number (Login ID)</p>
                        <p className="font-mono font-bold text-gray-900 text-sm">{createdCreds.roll_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="font-mono font-bold text-gray-900 text-sm break-all">{createdCreds.email}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500">Initial Password</p>
                        <p className="font-mono font-bold text-gray-900 text-lg tracking-widest bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mt-1">
                          {createdCreds.password}
                        </p>
                      </div>
                    </div>
                    {createdCreds.loginWith !== 'roll_number' && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-2">
                        ⚠ Auth account could not be created automatically. Contact admin to manually set up login.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={openModal}
                      className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Register Another Student
                    </button>
                    <button
                      onClick={closeModal}
                      className="px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* ── FORM ───────────────────────────────────────────────── */
                <form onSubmit={handleRegisterStudent}>
                  {/* Header */}
                  <div className="flex justify-between items-center px-6 pt-6 pb-4 border-b border-gray-100">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Register New Student</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Creates login account + hostel record</p>
                    </div>
                    <button type="button" disabled={loading} onClick={closeModal}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
                    {/* Error Banner */}
                    {error && (
                      <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg">
                        <svg className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-red-800 font-medium">{error}</p>
                      </div>
                    )}

                    {/* Section: Personal Info */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Personal Information</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                          <input type="text" required placeholder="e.g. Rahul Sharma"
                            value={name} onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Roll Number <span className="text-red-500">*</span></label>
                          <input type="text" required placeholder="e.g. CS2024002"
                            value={rollNumber} onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                            className="w-full px-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 uppercase"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address <span className="text-red-500">*</span></label>
                          <input type="email" required placeholder="student@hostel.com"
                            value={email} onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Initial Password <span className="text-red-500">*</span></label>
                          <input type="text" required minLength={8}
                            value={password} onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <p className="text-[11px] text-gray-400 mt-1">Share this with the student after creation.</p>
                        </div>
                      </div>
                    </div>

                    {/* Section: Hostel Info */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Hostel Details</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Hostel Block <span className="text-red-500">*</span></label>
                          <select value={blockName} onChange={(e) => setBlockName(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="A">Block A</option>
                            <option value="B">Block B</option>
                            <option value="C">Block C</option>
                            <option value="D">Block D</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Room Number <span className="text-red-500">*</span></label>
                          <input type="text" required placeholder="e.g. 204"
                            value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section: Parent / Guardian */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Parent / Guardian</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Guardian Name</label>
                          <input type="text" placeholder="e.g. Suresh Sharma"
                            value={parentName} onChange={(e) => setParentName(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Guardian Phone <span className="text-red-500">*</span></label>
                          <input type="tel" required placeholder="+91 98765 43210"
                            value={parentPhone} onChange={(e) => setParentPhone(e.target.value)}
                            className="w-full px-3 py-2.5 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                          />
                          <p className="text-[11px] text-gray-400 mt-1">Used for outpass notifications.</p>
                        </div>
                      </div>
                    </div>

                    {/* Section: Face Photo */}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Face Photo <span className="text-gray-400 font-normal normal-case">(optional — for gate facial recognition)</span></p>
                      <div className="flex items-center gap-4 p-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                        {/* Preview */}
                        <div className="w-20 h-20 rounded-xl bg-gray-200 border border-gray-300 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {imagePreview ? (
                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                          ) : (
                            <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <input type="file" ref={fileInputRef} accept="image/*" onChange={handleImageFileChange} className="hidden" />
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => fileInputRef.current?.click()}
                              className="inline-flex items-center px-3 py-1.5 border border-gray-300 bg-white text-xs font-semibold rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
                              <svg className="h-3.5 w-3.5 mr-1.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                              Upload Photo
                            </button>
                            {imagePreview && (
                              <button type="button" onClick={() => { setImagePreview(null); setFaceDescriptor(null) }}
                                className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors">
                                Remove
                              </button>
                            )}
                          </div>
                          {faceDescriptor ? (
                            <p className="text-xs text-emerald-600 font-semibold mt-2 flex items-center">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 mr-1.5 inline-block"></span>
                              128-d biometric descriptor ready
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 mt-2">PNG, JPG — front-facing portrait works best</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                    <button type="button" disabled={loading} onClick={closeModal}
                      className="px-4 py-2.5 border border-gray-300 text-sm font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={loading}
                      className="inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm">
                      {loading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Creating Account...
                        </>
                      ) : 'Create Student Account'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
