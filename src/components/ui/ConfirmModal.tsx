import { useEffect } from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info' | 'success'
  onConfirm: () => void | Promise<void>
  onClose: () => void
  isLoading?: boolean
}

export function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'info',
  onConfirm, 
  onClose,
  isLoading = false
}: ConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose, isLoading])

  if (!isOpen) return null

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return (
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 shrink-0">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
        )
      case 'warning':
        return (
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4 shrink-0">
            <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
        )
      case 'success':
        return (
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4 shrink-0">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
        )
      case 'info':
      default:
        return (
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4 shrink-0">
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
        )
    }
  }

  const getConfirmButtonClass = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-red-600/30'
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500 shadow-amber-600/30'
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500 shadow-emerald-600/30'
      case 'info':
      default:
        return 'bg-brand-600 hover:bg-brand-700 text-white focus:ring-brand-500 shadow-brand-600/30'
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay oscuro */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => !isLoading && onClose()}
      />
      
      {/* Contenedor del Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
          {getIcon()}
          
          <h3 className="text-lg font-bold text-ink-900 mb-2 font-display">{title}</h3>
          <p className="text-ink-500 text-sm mb-6">{message}</p>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button 
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 h-11 bg-white hover:bg-slate-50 text-ink-700 border border-slate-300 font-semibold rounded-xl transition disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button 
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 h-11 font-semibold rounded-xl shadow-lg transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${getConfirmButtonClass()}`}
            >
              {isLoading ? 'Procesando...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
