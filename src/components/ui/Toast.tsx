'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastState {
  message: string
  type: ToastType
  id: number
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const [isClosing, setIsClosing] = useState(false)

  const closeToast = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => {
      setToast(null)
      setIsClosing(false)
    }, 300) // Timeout matches the duration of slide-out/fade-out animation
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    setIsClosing(false)
    setToast({ message, type, id: Date.now() })
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        closeToast()
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [toast, closeToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] max-w-sm w-full shadow-2xl rounded-2xl p-4 flex items-start gap-3 border ${
          isClosing ? 'animate-out slide-out-to-right fade-out duration-300' : 'animate-in slide-in-from-right fade-in duration-300'
        } ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200' : 
          toast.type === 'error' ? 'bg-red-50 border-red-200' : 
          'bg-blue-50 border-blue-200'
        }`}>
          <div className="shrink-0 mt-0.5">
            {toast.type === 'success' && (
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </div>
            )}
            {toast.type === 'error' && (
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
            )}
            {toast.type === 'info' && (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-600 ${
              toast.type === 'success' ? 'text-emerald-800' :
              toast.type === 'error' ? 'text-red-800' :
              'text-blue-800'
            }`}>
              {toast.message}
            </p>
          </div>
          <button 
            onClick={closeToast}
            className={`shrink-0 p-1 rounded-lg transition ${
              toast.type === 'success' ? 'text-emerald-600 hover:bg-emerald-100' :
              toast.type === 'error' ? 'text-red-600 hover:bg-red-100' :
              'text-blue-600 hover:bg-blue-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
