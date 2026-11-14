'use client'

import { useState } from 'react'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line
} from 'recharts'

interface Stats {
    totalRequestsMonth: number
    approvalRate: number
    onTimeReturnRate: number
    avgHoursOutside: number
    emergencyPassesMonth: number
    mostActiveDay: string
}

interface TopStudent {
    student_name: string
    roll_number: string
    request_count: number
}

interface ReturnStatus {
    name: string
    value: number
    color: string
}

interface DailyRequests {
    date: string
    count: number
}

interface CurrentOutside {
    id: string
    name: string
    roll_number: string
    room_number: string
    block_name: string
    out_time: string
    expected_return: string
    is_overdue: boolean
    hours_overdue: number | null
}

interface AnalyticsClientProps {
    stats: Stats
    topStudents: TopStudent[]
    returnStatus: ReturnStatus[]
    dailyRequests: DailyRequests[]
    currentOutside: CurrentOutside[]
}

export default function AnalyticsClient({
    stats,
    topStudents,
    returnStatus,
    dailyRequests,
    currentOutside
}: AnalyticsClientProps) {
    const [exporting, setExporting] = useState(false)

    const handleExportCSV = async () => {
        setExporting(true)
        try {
            const response = await fetch('/api/admin/export-csv')
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `homebook_${new Date().toISOString().split('T')[0]}.csv`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Export failed:', error)
            alert('Failed to export CSV')
        } finally {
            setExporting(false)
        }
    }

    const statCards = [
        { label: 'Total Requests (This Month)', value: stats.totalRequestsMonth, icon: '📋' },
        { label: 'Approval Rate', value: `${stats.approvalRate}%`, icon: '✅' },
        { label: 'On-Time Return Rate', value: `${stats.onTimeReturnRate}%`, icon: '⏱️' },
        { label: 'Avg Time Outside', value: `${stats.avgHoursOutside} hrs`, icon: '⌛' },
        { label: 'Emergency Passes', value: stats.emergencyPassesMonth, icon: '🚨' },
        { label: 'Most Active Day', value: stats.mostActiveDay, icon: '📅' }
    ]

    return (
        <div className="space-y-8">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {statCards.map((card, idx) => (
                    <div key={idx} className="bg-white rounded-lg shadow p-6 border border-gray-200">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">{card.label}</p>
                                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
                            </div>
                            <span className="text-3xl">{card.icon}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Bar Chart: Top Students */}
                <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Students (Outpass Frequency)</h2>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={topStudents} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis type="category" dataKey="student_name" width={120} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="request_count" fill="#3b82f6" name="Outpasses" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Pie Chart: On-Time vs Late Returns */}
                <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Return Performance</h2>
                    <ResponsiveContainer width="100%" height={400}>
                        <PieChart>
                            <Pie
                                data={returnStatus}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''}: ${((percent || 0) * 100).toFixed(0)}%`}
                                outerRadius={120}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {returnStatus.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Line Chart: Daily Requests (Last 30 Days) */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Requests Per Day (Last 30 Days)</h2>
                <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={dailyRequests}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={70} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="count" stroke="#8b5cf6" name="Requests" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Live Table: Students Outside */}
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-wrap gap-4">
                    <h2 className="text-lg font-semibold text-gray-900">Students Currently Outside</h2>
                    <button
                        onClick={handleExportCSV}
                        disabled={exporting}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                    >
                        {exporting ? 'Exporting...' : '📥 Export CSV (This Month)'}
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Out Time</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected Return</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {currentOutside.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">No students currently outside</td>
                                </tr>
                            ) : (
                                currentOutside.map((student) => (
                                    <tr key={student.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.block_name}-{student.room_number}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(student.out_time).toLocaleString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(student.expected_return).toLocaleString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {student.is_overdue ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                    ⚠️ Overdue by {student.hours_overdue}h
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    Active
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}