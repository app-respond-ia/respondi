'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/actions/auth'

type SidebarProps = {
  user: {
    nombre: string
    email: string
    initials: string
    roleName: string
  }
  onCloseMobile?: () => void
}

export default function Sidebar({ user, onCloseMobile }: SidebarProps) {
  const pathname = usePathname()

  const isActive = (path: string) => pathname === path

  const navItemClass = (path: string) =>
    isActive(path)
      ? "flex items-center gap-3 px-3 py-2.5 rounded-xl bg-brand-600 text-white font-500 shadow-lg shadow-brand-900/40"
      : "flex items-center gap-3 px-3 py-2.5 rounded-xl text-ink-400 hover:bg-white/5 hover:text-white transition"

  return (
    <aside className="w-72 bg-ink-900 text-white flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 h-20 border-b border-white/10 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/30">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
        </div>
        <div>
          <p className="font-display font-700 text-lg leading-none">Respondi</p>
          <p className="text-[11px] text-brand-300 mt-1 tracking-wide">Panel de administración</p>
        </div>
        
        {/* Botón para cerrar en móvil */}
        <button onClick={onCloseMobile} className="lg:hidden ml-auto p-2 text-ink-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        <p className="px-3 pb-2 text-[11px] uppercase tracking-wider text-ink-400 font-600">General</p>
        <Link href="/dashboard" onClick={onCloseMobile} className={navItemClass('/dashboard')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
          Dashboard
        </Link>
        <Link href="/dashboard/metricas" onClick={onCloseMobile} className={navItemClass('/dashboard/metricas')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>
          Métricas
        </Link>

        <p className="px-3 pt-5 pb-2 text-[11px] uppercase tracking-wider text-ink-400 font-600">Operación</p>
        <Link href="/dashboard/casos" onClick={onCloseMobile} className={navItemClass('/dashboard/casos')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-1m0-9V5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9l-4 4V8a2 2 0 012-2h2z"/></svg>
          Casos
        </Link>
        <Link href="/dashboard/conversaciones" onClick={onCloseMobile} className={navItemClass('/dashboard/conversaciones')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          Conversaciones
        </Link>
        <Link href="/dashboard/chats" onClick={onCloseMobile} className={navItemClass('/dashboard/chats')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-1M3 9V5a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2H9l-4 4V9z"/></svg>
          Chats
        </Link>
        <Link href="/dashboard/novedades" onClick={onCloseMobile} className={navItemClass('/dashboard/novedades')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
          Novedades del día
        </Link>
        <Link href="/dashboard/blacklist" onClick={onCloseMobile} className={navItemClass('/dashboard/blacklist')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
          Blacklist
        </Link>

        <p className="px-3 pt-5 pb-2 text-[11px] uppercase tracking-wider text-ink-400 font-600">Configuración</p>
        <Link href="/dashboard/perfil-comercio" onClick={onCloseMobile} className={navItemClass('/dashboard/perfil-comercio')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
          Perfil del comercio
        </Link>
        <Link href="/dashboard/sucursales" onClick={onCloseMobile} className={navItemClass('/dashboard/sucursales')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>
          Sucursales
        </Link>
        <Link href="/dashboard/skills" onClick={onCloseMobile} className={navItemClass('/dashboard/skills')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          Skills de IA
        </Link>
        <Link href="/dashboard/precios" onClick={onCloseMobile} className={navItemClass('/dashboard/precios')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
          Lista de precios
        </Link>
        <Link href="/dashboard/reglas" onClick={onCloseMobile} className={navItemClass('/dashboard/reglas')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          Reglas de casos
        </Link>
        <Link href="/dashboard/etiquetas" onClick={onCloseMobile} className={navItemClass('/dashboard/etiquetas')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
          Etiquetas
        </Link>
        <Link href="/dashboard/canales" onClick={onCloseMobile} className={navItemClass('/dashboard/canales')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          Canales
        </Link>
        <Link href="/dashboard/usuarios" onClick={onCloseMobile} className={navItemClass('/dashboard/usuarios')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-6a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          Usuarios
        </Link>
        <Link href="/dashboard/audit-log" onClick={onCloseMobile} className={navItemClass('/dashboard/audit-log')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          Audit log
        </Link>
      </nav>

      <div className="px-3 py-4 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-3 px-3 py-2 group relative">
          <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center font-600 text-sm">
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-500 truncate">{user.nombre}</p>
            <p className="text-[11px] text-ink-400 truncate">{user.roleName}</p>
          </div>
          
          <form action={signOut}>
            <button title="Cerrar sesión" className="p-1.5 text-ink-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
