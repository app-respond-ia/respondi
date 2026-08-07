'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface HelpPopoverProps {
  content: string | React.ReactNode
}

export function HelpPopover({ content }: HelpPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom')
  const [align, setAlign] = useState<'center' | 'left' | 'right'>('center')

  // Prevent closing when clicking inside the portal
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isOpen &&
        buttonRef.current && 
        !buttonRef.current.contains(event.target as Node) &&
        popoverRef.current && 
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return

    function updatePosition() {
      const rect = buttonRef.current!.getBoundingClientRect()
      
      // Default dimensions (approximate if not yet rendered)
      const popoverWidth = popoverRef.current ? popoverRef.current.offsetWidth : 256 // w-64 = 256px
      const popoverHeight = popoverRef.current ? popoverRef.current.offsetHeight : 100 

      const spacing = 8 // Space between button and popover

      let newTop = rect.bottom + spacing
      let newPlacement: 'bottom' | 'top' = 'bottom'
      
      // Vertical collision
      if (newTop + popoverHeight > window.innerHeight) {
        newTop = rect.top - popoverHeight - spacing
        newPlacement = 'top'
      }

      let newLeft = rect.left + (rect.width / 2)
      let newAlign: 'center' | 'left' | 'right' = 'center'

      // Horizontal collision
      if (newLeft + (popoverWidth / 2) > window.innerWidth - 10) {
        // Doesn't fit on the right, align to the right edge of the button
        newLeft = rect.right - popoverWidth
        newAlign = 'right'
      } else if (newLeft - (popoverWidth / 2) < 10) {
        // Doesn't fit on the left, align to the left edge of the button
        newLeft = rect.left
        newAlign = 'left'
      }

      setCoords({ top: newTop, left: newLeft })
      setPlacement(newPlacement)
      setAlign(newAlign)
    }

    updatePosition()
    
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true) // Capture phase for container scrolling

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-5 h-5 rounded-full border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50 hover:border-slate-300 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1"
        aria-label="Ayuda"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div 
          ref={popoverRef}
          style={{ 
            top: coords.top, 
            left: align === 'center' ? coords.left : undefined,
            transform: align === 'center' ? 'translateX(-50%)' : undefined,
            ...(align === 'left' ? { left: coords.left } : {}),
            ...(align === 'right' ? { left: coords.left } : {})
          }}
          className="fixed w-64 p-3 bg-slate-800 text-white text-xs leading-relaxed rounded-xl shadow-xl z-[100] animate-in fade-in zoom-in-95 duration-200"
        >
          {/* Triangulito (flecha) dinámico */}
          <div 
            className={`absolute w-3 h-3 bg-slate-800 rotate-45 rounded-sm ${
              placement === 'bottom' ? '-top-1.5' : '-bottom-1.5'
            }`}
            style={{
              left: align === 'center' ? '50%' : align === 'left' ? '12px' : 'auto',
              right: align === 'right' ? '12px' : 'auto',
              transform: align === 'center' ? 'translateX(-50%) rotate(45deg)' : 'rotate(45deg)'
            }}
          ></div>
          <div className="relative z-10 font-500">
            {content}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
