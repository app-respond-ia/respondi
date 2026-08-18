'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/actions/auth'

type VendedorDropdownProps = {
  nombre: string
  email: string
  iniciales: string
}

export default function VendedorDropdown({ nombre, email, iniciales }: VendedorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-600 text-sm hover:bg-brand-200 transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1"
        aria-label="Menú de usuario"
      >
        {iniciales}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-30">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-600 text-ink-900 truncate">{nombre}</p>
            <p className="text-xs text-ink-500 truncate">{email}</p>
          </div>
          
          <div className="py-1">
            <Link 
              href="/vendedor/perfil" 
              onClick={() => setIsOpen(false)}
              className="block w-full text-left px-4 py-2 text-sm text-ink-700 hover:bg-slate-50 hover:text-brand-600 transition-colors"
            >
              Mi perfil
            </Link>
          </div>
          
          <div className="border-t border-slate-100 py-1">
            <form action={signOut}>
              <button 
                type="submit"
                className="block w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
