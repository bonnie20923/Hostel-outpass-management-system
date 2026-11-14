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
        { label: 'Total Requests', sublabel: 'This Month', value: stats.totalRequestsMonth, icon: '📋' },
        { label: 'Approval Rate', sublabel: 'Approved / Submitted', value: `${stats.approvalRate}%`, icon: '✅' },
        { label: 'On-Time Rate', sublabel: 'Returned on Schedule', value: `${stats.onTimeReturnRate}%`, icon: '⏱️' },
        { label: 'Avg Time Outside', sublabel: 'Per Outpass', value: `${stats.avgHoursOutside} hrs`, icon: '⌛' },
        { label: 'Emergency Passes', sublabel: 'Urgent Leaves', value: stats.emergencyPassesMonth, icon: '🚨' },
        { label: 'Most Active Day', sublabel: 'Peak Request Day', value: stats.mostActiveDay, icon: '📅' }
    ]

    // Format date tick from 'YYYY-MM-DD' to 'DD MMM' (e.g. "14 Nov")
    const formatDateTick = (dateStr: string) => {
        try {
            const parts = dateStr.split('-')
            if (parts.length === 3) {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                const monthIndex = parseInt(parts[1], 10) - 1
                const day = parseInt(parts[2], 10)
                return `${day} ${monthNames[monthIndex] || parts[1]}`
            }
        } catch {}
        return dateStr
    }

    const totalReturnCount = returnStatus.reduce((acc, curr) => acc + curr.value, 0)

    return (
        <div className="space-y-6 sm:space-y-8">
            {/* Stat Cards Grid: 2 columns on mobile, 3 on desktop */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                {statCards.map((card, idx) => (
                    <div
                        key={idx}
                        className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200 flex flex-col justify-between hover:border-gray-300 transition-all"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-2xl sm:text-3xl">{card.icon}</span>
                            <span className="text-xl sm:text-2xl font-bold text-gray-900">{card.value}</span>
                        </div>
                        <div className="mt-3">
                            <p className="text-xs sm:text-sm font-semibold text-gray-800 line-clamp-1">{card.label}</p>
                            <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 line-clamp-1">{card.sublabel}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Row: Bar Chart & Pie Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                {/* Bar Chart: Top Students */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                    <div className="mb-4">
                        <h2 className="text-base sm:text-lg font-semibold text-gray-900">Top 10 Students by Frequency</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Most active outpass applicants this month</p>
                    </div>

                    {topStudents.length === 0 ? (
                        <div className="h-[280px] sm:h-[340px] flex items-center justify-center text-sm text-gray-400">
                            No student outpasses recorded this month
                        </div>
                    ) : (
                        <div className="w-full h-[300px] sm:h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={topStudents}
                                    layout="vertical"
                                    margin={{ top: 5, right: 15, left: -10, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <YAxis
                                        type="category"
                                        dataKey="student_name"
                                        width={95}
                                        tick={{ fontSize: 11 }}
                                        tickFormatter={(name: string) => name.length > 11 ? `${name.slice(0, 10)}…` : name}
                                    />
                                    <Tooltip
                                        formatter={(value: any) => [`${value} outpasses`, 'Count']}
                                        labelFormatter={(_: any, payload: any) => {
                                            if (payload && payload[0]) {
                                                const student = payload[0].payload as TopStudent
                                                return `${student.student_name} (${student.roll_number || 'N/A'})`
                                            }
                                            return ''
                                        }}
                                    />
                                    <Bar dataKey="request_count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Outpasses" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Pie Chart: Return Performance */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                    <div className="mb-4">
                        <h2 className="text-base sm:text-lg font-semibold text-gray-900">Return Performance</h2>
                        <p className="text-xs text-gray-500 mt-0.5">On-time returns vs overdue returns</p>
                    </div>

                    {totalReturnCount === 0 ? (
                        <div className="h-[280px] sm:h-[340px] flex items-center justify-center text-sm text-gray-400">
                            No return records available yet
                        </div>
                    ) : (
                        <div className="w-full h-[300px] sm:h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={returnStatus}
                                        cx="50%"
                                        cy="45%"
                                        innerRadius={45}
                                        outerRadius={80}
                                        paddingAngle={4}
                                        dataKey="value"
                                        label={({ percent }: { percent?: number }) =>
                                            percent && percent > 0.05 ? `${((percent || 0) * 100).toFixed(0)}%` : ''
                                        }
                                        labelLine={false}
                                    >
                                        {returnStatus.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: any, name: any) => [`${value} students`, name]} />
                                    <Legend
                                        verticalAlign="bottom"
                                        height={36}
                                        iconType="circle"
                                        wrapperStyle={{ fontSize: '12px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* Line Chart: Daily Requests (Last 30 Days) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
                <div className="mb-4">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Daily Outpass Requests (Last 30 Days)</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Application trends and spikes over time</p>
                </div>

                <div className="w-full h-[260px] sm:h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={dailyRequests}
                            margin={{ top: 10, right: 15, left: -15, bottom: 25 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10 }}
                                tickFormatter={formatDateTick}
                                interval={3}
                                angle={-35}
                                textAnchor="end"
                                height={45}
                            />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                            <Tooltip
                                labelFormatter={(label: any) => formatDateTick(String(label))}
                                formatter={(value: any) => [`${value} requests`, 'Total']}
                            />
                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke="#8b5cf6"
                                strokeWidth={2.5}
                                dot={{ r: 2 }}
                                activeDot={{ r: 5 }}
                                name="Requests"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Live Table & Cards: Students Outside */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-wrap gap-3">
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2">
                            Students Currently Outside
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {currentOutside.length}
                            </span>
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">Students who checked out at gate and have not checked in</p>
                    </div>
                    <button
                        onClick={handleExportCSV}
                        disabled={exporting}
                        className="inline-flex items-center px-3.5 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 active:scale-95 disabled:opacity-50 transition-all shadow-sm"
                    >
                        {exporting ? 'Exporting...' : '📥 Export CSV'}
                    </button>
                </div>

                {currentOutside.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-gray-500">
                        🎉 All students have returned. No students are currently outside.
                    </div>
                ) : (
                    <>
                        {/* Mobile Cards View (Visible on screens < 768px) */}
                        <div className="md:hidden divide-y divide-gray-100">
                            {currentOutside.map((student) => (
                                <div key={student.id} className="p-4 space-y-2.5">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold text-gray-900 text-sm">{student.name}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {student.roll_number} • {student.block_name}-{student.room_number}
                                            </p>
                                        </div>
                                        {student.is_overdue ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200">
                                                ⚠️ Overdue by {student.hours_overdue}h
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-800 border border-green-200">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                                        <div>
                                            <span className="text-gray-400 block text-[10px] uppercase">Out Time</span>
                                            <span className="font-medium text-gray-700">
                                                {new Date(student.out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 block text-[10px] uppercase">Expected Return</span>
                                            <span className="font-medium text-gray-700">
                                                {new Date(student.expected_return).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table View (Visible on screens >= 768px) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Student</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Room</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Out Time</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Expected Return</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {currentOutside.map((student) => (
                                        <tr key={student.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{student.name}</div>
                                                <div className="text-xs text-gray-500">{student.roll_number}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {student.block_name}-{student.room_number}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {new Date(student.out_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {new Date(student.expected_return).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {student.is_overdue ? (
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                                                        ⚠️ Overdue by {student.hours_overdue}h
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                        Active
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
