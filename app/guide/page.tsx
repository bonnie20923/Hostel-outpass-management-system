'use client'

import Link from 'next/link'

export default function GuidePage() {
  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8 print:bg-white print:py-0 print:px-0">
      <div className="max-w-4xl mx-auto">
        
        {/* Navigation / Header - Hidden in Print */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 border-b border-gray-200 pb-6 print:hidden">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">Hostel Outpass System Guide</h1>
            <p className="text-sm text-gray-600 mt-1">Official printable user manual and step-by-step instructions</p>
          </div>
          <div className="flex space-x-3 mt-4 sm:mt-0">
            <Link
              href="/login"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors shadow-sm"
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Login
            </Link>
            <button
              onClick={handlePrint}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all shadow-sm"
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Guide
            </button>
          </div>
        </div>

        {/* Printable Manual Header - Only Visible in Print */}
        <div className="hidden print:block text-center mb-8 border-b-2 border-gray-800 pb-4">
          <h1 className="text-3xl font-extrabold text-black uppercase">Hostel Outpass System Manual</h1>
          <p className="text-sm text-gray-700 mt-1">Official Step-by-Step Operating Instructions for All User Roles</p>
          <p className="text-xs text-gray-500 mt-0.5">Printed on: {new Date().toLocaleDateString()}</p>
        </div>

        {/* Guides Grid / List */}
        <div className="space-y-8 print:space-y-12">
          
          {/* Section 1: Student Guide */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 print:shadow-none print:border-0 print:p-0 print:break-after-page">
            <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-4 print:border-b-2 print:border-black">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-lg print:hidden">
                🎓
              </span>
              <h2 className="text-xl font-bold text-gray-900 print:text-black print:text-2xl">1. Student Role Guide</h2>
            </div>
            
            <p className="text-sm text-gray-600 mb-4 print:text-black">
              Students can request outpasses for home visits, medical visits, family emergencies, or other needs, and track their active request status.
            </p>
            
            <ol className="space-y-3 text-sm text-gray-700 list-decimal list-inside print:text-black">
              <li>
                <strong className="text-gray-900 print:text-black">Login:</strong> Select the <span className="font-semibold">Student</span> tab on the login page and enter your designated Roll Number and password.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Request Submission:</strong> Fill out the outpass request form. Select a pre-defined reason or write a detailed custom description under "Other". Provide your target destination, expected departure date/time, and expected return date/time.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Active Tracking:</strong> Track the real-time status of your request on the right panel. It will transition from <span className="italic font-semibold text-yellow-600">Pending Admin Approval</span> $\rightarrow$ <span className="italic font-semibold text-blue-600">Pending Warden Approval</span> $\rightarrow$ <span className="italic font-semibold text-green-600">QR Issued</span>.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Edit & Resubmit:</strong> If your request is rejected, check the provided rejection reason. You can click <span className="font-semibold text-blue-600">✏️ Edit & Resubmit</span> to prefill and update your details, correcting the highlighted issues.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Using the QR Code:</strong> Once approved, an outpass QR code is displayed on your dashboard. Save or present this QR code to the gate security officer during checkout and check-in.
              </li>
            </ol>
          </section>

          {/* Section 2: Admin Guide */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 print:shadow-none print:border-0 print:p-0 print:break-after-page">
            <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-4 print:border-b-2 print:border-black">
              <span className="p-2 bg-purple-50 text-purple-600 rounded-lg print:hidden">
                💼
              </span>
              <h2 className="text-xl font-bold text-gray-900 print:text-black print:text-2xl">2. Administrator Role Guide</h2>
            </div>
            
            <p className="text-sm text-gray-600 mb-4 print:text-black">
              Administrators manage outpass tracking overview, statistics, initial query routing, analytics, and record exports.
            </p>
            
            <ol className="space-y-3 text-sm text-gray-700 list-decimal list-inside print:text-black">
              <li>
                <strong className="text-gray-900 print:text-black">Login:</strong> Select the <span className="font-semibold">Admin</span> tab on the login page and enter your designated email address and password.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Initial Review:</strong> Browse through all incoming outpass requests under the "Pending Approvals" dashboard.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Routing:</strong> Verify departure time, students block/room details, and purpose. Review and approve the request to forward it to the designated Warden for final signature.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Rejection:</strong> If a request violates guidelines, click Reject and enter a specific reason so the student can update it.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Analytics & Reporting:</strong> Use the "Analytics" link to check historical graphs, overdue counts, peak checkout hours, or export comprehensive outpass logs as standard CSV.
              </li>
            </ol>
          </section>

          {/* Section 3: Warden Guide */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 print:shadow-none print:border-0 print:p-0 print:break-after-page">
            <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-4 print:border-b-2 print:border-black">
              <span className="p-2 bg-green-50 text-green-600 rounded-lg print:hidden">
                🛡️
              </span>
              <h2 className="text-xl font-bold text-gray-900 print:text-black print:text-2xl">3. Warden Role Guide</h2>
            </div>
            
            <p className="text-sm text-gray-600 mb-4 print:text-black">
              Wardens provide final sign-off, trigger parent notifications, issue emergency passes, and extend active expired outpasses.
            </p>
            
            <ol className="space-y-3 text-sm text-gray-700 list-decimal list-inside print:text-black">
              <li>
                <strong className="text-gray-900 print:text-black">Login:</strong> Select the <span className="font-semibold">Warden</span> tab and login with your email and password.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Emergency Outpass:</strong> Click <span className="font-semibold text-red-600">Issue Emergency Pass</span> to bypass the standard admin routing workflow, choose a student, fill out reasons, and immediately generate an outpass QR code for urgent needs.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Parent Notification:</strong> Check the "Parent Notified" confirmation box before final approval to verify contact has been established.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Issue Pass:</strong> Click <span className="font-semibold text-green-600">Issue Pass</span> to approve and officially activate the student's digital outpass QR code, dispatching an automated SMS alert to their parent.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Extension Controls:</strong> Monitor overdue returns. Use the "Extend 1 Hour" action tool on active expired outpasses to securely add time in real-time, updating gate check-in privileges automatically.
              </li>
            </ol>
          </section>

          {/* Section 4: Security Guard Guide */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 print:shadow-none print:border-0 print:p-0">
            <div className="flex items-center space-x-3 border-b border-gray-100 pb-3 mb-4 print:border-b-2 print:border-black">
              <span className="p-2 bg-red-50 text-red-600 rounded-lg print:hidden">
                👮
              </span>
              <h2 className="text-xl font-bold text-gray-900 print:text-black print:text-2xl">4. Gate Security Guard Guide</h2>
            </div>
            
            <p className="text-sm text-gray-600 mb-4 print:text-black">
              Security guards handle physical checkout and check-in verifications using automated QR scanners and biometric/ID checkouts.
            </p>
            
            <ol className="space-y-3 text-sm text-gray-700 list-decimal list-inside print:text-black">
              <li>
                <strong className="text-gray-900 print:text-black">Login:</strong> Select the <span className="font-semibold">Guard</span> tab and log in using your security credentials.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Scanning:</strong> Point your camera at the student's digital outpass QR code to check validity, destination, expiration status, and scan type (Exit vs. Return).
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Face Verification:</strong> For checkout exits, verify student biometrics by capturing a physical snapshot or performing ID validation before permitting gate exit.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Manual Check-In:</strong> If QR scanning fails or a return is delayed, utilize the manual entry tools to search for their roll number or check them in physically via the "Outside Students" log checklist.
              </li>
              <li>
                <strong className="text-gray-900 print:text-black">Problem Logging:</strong> Use the floating "Report Problem" button to flag network issues, scanner failures, or gate incidents immediately to administrators.
              </li>
            </ol>
          </section>

        </div>

        {/* Printable Manual Footer - Only Visible in Print */}
        <div className="hidden print:block text-center mt-12 border-t border-gray-400 pt-4 text-xs text-gray-500">
          <p>© Hostel Management Systems Inc. All Rights Reserved. Confidential & Proprietary Document.</p>
        </div>

      </div>
    </div>
  )
}
