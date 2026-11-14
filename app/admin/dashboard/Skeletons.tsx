export function CardSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white border rounded-lg p-6 animate-pulse">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                            <div className="h-8 bg-gray-200 rounded w-16"></div>
                        </div>
                        <div className="h-12 w-12 bg-gray-200 rounded-full"></div>
                    </div>
                </div>
            ))}
        </div>
    )
}

export function TableSkeleton() {
    return (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden animate-pulse">
            <div className="hidden md:block">
                <div className="bg-gray-50 h-12"></div>
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="border-t border-gray-200">
                        <div className="px-6 py-4">
                            <div className="flex items-center space-x-4">
                                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                                </div>
                                <div className="h-4 bg-gray-200 rounded w-20"></div>
                                <div className="h-4 bg-gray-200 rounded w-40"></div>
                                <div className="flex space-x-2">
                                    <div className="h-8 w-16 bg-gray-200 rounded"></div>
                                    <div className="h-8 w-16 bg-gray-200 rounded"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="md:hidden divide-y divide-gray-200">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="p-4">
                        <div className="flex items-center space-x-3 mb-3">
                            <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                            <div className="flex-1">
                                <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                                <div className="h-3 bg-gray-200 rounded w-24"></div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="h-4 bg-gray-200 rounded w-full"></div>
                            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        </div>
                        <div className="flex space-x-2 mt-4">
                            <div className="flex-1 h-8 bg-gray-200 rounded"></div>
                            <div className="flex-1 h-8 bg-gray-200 rounded"></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}