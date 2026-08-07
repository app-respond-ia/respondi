'use client'

import { useState, useRef, useEffect } from 'react'

interface HelpPopoverProps {
  content: string | React.ReactNode
}

export function HelpPopover({ content }: HelpPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative inline-flex items-center" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-5 h-5 rounded-full border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50 hover:border-slate-300 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1"
        aria-label="Ayuda"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 p-3 bg-slate-800 text-white text-xs leading-relaxed rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 rotate-45 rounded-sm"></div>
          <div className="relative z-10 font-500">
            {content}
          </div>
        </div>
      )}
    </div>
  )
}
