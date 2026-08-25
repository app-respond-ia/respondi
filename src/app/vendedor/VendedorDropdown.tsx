'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/actions/auth'
// import Image from 'next/image'
import { getUserColorObject } from '@/lib/userColor'

type VendedorDropdownProps = {
  nombre: string
  email: string
  iniciales: string
  avatarUrl?: string
  apodo?: string
  color?: string
  userId?: string
}

export default function VendedorDropdown({ nombre, email, iniciales, avatarUrl, apodo, color, userId }: VendedorDropdownProps) {
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

  const displayName = apodo || nombre || 'Usuario'
  const userColor = getUserColorObject(userId || nombre, color)
  const hasAvatar = Boolean(avatarUrl && avatarUrl.trim() !== '')

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 pr-3 rounded-full hover:bg-slate-100 transition border border-transparent hover:border-slate-200"
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-600 text-sm overflow-hidden relative shadow-sm ${hasAvatar ? 'bg-transparent' : `${userColor.bg} text-white`}`}>
          {hasAvatar ? (
            <img src={avatarUrl!} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            iniciales
          )}
        </div>
        <div className="hidden sm:block text-left min-w-0 max-w-[120px]">
          {apodo ? (
            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-600 truncate max-w-full ${userColor.bgLight} ${userColor.text}`}>
              {apodo}
            </span>
          ) : (
            <p className="text-sm font-500 text-ink-900 truncate">{displayName}</p>
          )}
        </div>
        <svg className={`w-4 h-4 text-ink-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 transform origin-top-right transition-all">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-600 text-ink-900 truncate">{nombre}</p>
            <p className="text-xs text-ink-500 truncate">{email}</p>
          </div>
          
          <div className="py-1">
            <Link 
              href="/vendedor/perfil" 
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-ink-700 hover:bg-slate-50 transition hover:text-brand-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              Mi perfil
            </Link>
            
            <Link 
              href="/vendedor/notificaciones" 
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-ink-700 hover:bg-slate-50 transition hover:text-brand-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              Notificaciones
            </Link>

            <Link 
              href="/vendedor/soporte" 
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-ink-700 hover:bg-slate-50 transition hover:text-brand-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              Ayuda y soporte
            </Link>

            <Link 
              href="/vendedor/configuracion" 
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-ink-700 hover:bg-slate-50 transition hover:text-brand-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              Configuración de cuenta
            </Link>
          </div>
          
          <div className="pt-1 mt-1 border-t border-slate-100">
            <form action={signOut} className="w-full">
              <button 
                type="submit"
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
