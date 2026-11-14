'use client'

import { useEffect, useRef } from 'react'

interface QrScannerProps {
    onScanSuccess: (text: string) => void
    onError?: (err: string) => void
}

declare global {
    interface Window { Html5Qrcode: any }
}

export default function QrScanner({ onScanSuccess, onError }: QrScannerProps) {
    const scannerRef = useRef<any>(null)
    const startedRef = useRef(false)
    const firedRef = useRef(false)
    const domId = 'guard-qr-reader'

    useEffect(() => {
        let mounted = true

        async function start() {
            if (startedRef.current) return
            try {
                const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
                if (!mounted) return
                const el = document.getElementById(domId)
                if (!el) return

                scannerRef.current = new Html5Qrcode(domId, {
                    formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ],
                    verbose: false,
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true
                    }
                })
                await scannerRef.current.start(
                    { facingMode: 'environment' },
                    {
                        fps: 20,
                        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                            const minEdge = Math.min(viewfinderWidth, viewfinderHeight)
                            const size = Math.floor(minEdge * 0.85)
                            return { width: size, height: size }
                        }
                    },
                    (text: string) => {
                        // Fire callback only once, then stop scanner
                        if (firedRef.current) return
                        firedRef.current = true
                        // Stop scanner immediately to prevent repeat fires
                        if (scannerRef.current && startedRef.current) {
                            scannerRef.current.stop().catch(() => {})
                            startedRef.current = false
                        }
                        onScanSuccess(text)
                    },
                    () => { /* ignore frame errors */ }
                )
                startedRef.current = true
            } catch (err: any) {
                console.error('QR scanner error:', err)
                if (onError) onError(err?.message || 'Camera failed to start')
            }
        }

        start()

        return () => {
            mounted = false
            if (scannerRef.current && startedRef.current) {
                scannerRef.current.stop().catch(() => {})
                startedRef.current = false
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div className="relative">
            <div id={domId} className="w-full rounded-lg overflow-hidden" />
            {/* corner brackets overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative w-52 h-52">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-sm" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-sm" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-sm" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-sm" />
                    {/* scanning line */}
                    <div className="absolute left-0 right-0 h-0.5 bg-blue-400 shadow-[0_0_6px_#60a5fa] animate-[scan_2s_ease-in-out_infinite]" />
                </div>
            </div>
            <style>{`
                @keyframes scan {
                    0%   { top: 0% }
                    50%  { top: 100% }
                    100% { top: 0% }
                }
            `}</style>
        </div>
    )
}

