'use client'

import { useState, useRef, useEffect } from 'react'
import { setActiveBranch } from '@/app/actions/branch'

type Branch = {
  id: string
  nombre: string
}

type HeaderProps = {
  branches: Branch[]
  activeBranchId: string
  onOpenMobile: () => void
  userInitials: string
}

export default function Header({ branches, activeBranchId, onOpenMobile, userInitials }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeBranch = branches.find((b) => b.id === activeBranchId) || branches[0]

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSelect(branchId: string) {
    setIsOpen(false)
    if (branchId !== activeBranchId) {
      await setActiveBranch(branchId)
      window.location.reload()
    }
  }

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 h-20">
        <button onClick={onOpenMobile} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 transition" aria-label="Abrir menú">
          <svg className="w-6 h-6 text-ink-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>

        <div className="flex items-center gap-2 relative" ref={dropdownRef}>
          <span className="hidden sm:inline text-xs text-ink-500 font-500">Sucursal</span>
          
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl border border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50 transition group"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-500 text-sm">{activeBranch?.nombre || 'Sin sucursal'}</span>
            <svg className={`w-4 h-4 text-ink-400 group-hover:text-brand-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          {isOpen && branches.length > 0 && (
            <div className="absolute top-full left-0 sm:left-12 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-30">
              {branches.map(branch => (
                <button
                  key={branch.id}
                  onClick={() => handleSelect(branch.id)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    branch.id === activeBranchId 
                      ? 'bg-brand-50 text-brand-700 font-500' 
                      : 'text-ink-700 hover:bg-slate-50'
                  }`}
                >
                  {branch.nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1"></div>

        <button className="relative p-2 rounded-lg hover:bg-slate-100 transition mr-2" aria-label="Notificaciones">
          <svg className="w-6 h-6 text-ink-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-brand-600 rounded-full ring-2 ring-white"></span>
        </button>
        <div className="lg:hidden w-9 h-9 rounded-full bg-brand-500 text-white flex items-center justify-center font-600 text-sm">
          {userInitials}
        </div>
      </div>
    </header>
  )
}
