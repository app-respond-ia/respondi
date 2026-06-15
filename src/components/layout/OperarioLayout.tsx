'use client'

import { useState } from 'react'
import { signOut } from '@/app/actions/auth'

interface OperarioUser {
  nombre: string
  email: string
  initials: string
  roleName: string
  nombreSucursal: string
}

export default function OperarioLayout({
  children,
  user
}: {
  children: React.ReactNode
  user: OperarioUser
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen lg:flex bg-slate-50 text-ink-900 font-body">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-ink-900 text-white
                   transform transition-transform duration-300 ease-out flex flex-col
                   ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                   lg:translate-x-0 lg:static lg:z-auto`}
      >
        <div className="flex items-center gap-3 px-6 h-20 border-b border-white/10 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600
                      flex items-center justify-center shadow-lg shadow-brand-600/30">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
          </div>
          <div>
            <p className="font-display font-700 text-lg leading-none">Respondi</p>
            <p className="text-[11px] text-brand-300 mt-1 tracking-wide">Novedades del negocio</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-brand-600 text-white font-500 shadow-lg shadow-brand-900/40">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            Novedades del día
          </a>
        </nav>

        <div className="px-3 py-4 border-t border-white/10 shrink-0">
          <div className="flex items-center gap-3 px-3 py-2 group relative">
            <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center font-600 text-sm shrink-0">
              {user.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-500 truncate">{user.nombre}</p>
              <p className="text-[11px] text-ink-400 truncate">{user.roleName} · {user.nombreSucursal}</p>
            </div>
            <form action={signOut} className="shrink-0">
              <button 
                type="submit" 
                className="p-1.5 rounded-lg text-ink-400 hover:text-white hover:bg-white/10 transition" 
                title="Cerrar sesión"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Overlay móvil */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-ink-900/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 h-20">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 transition" 
              aria-label="Abrir menú"
            >
              <svg className="w-6 h-6 text-ink-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-ink-500 font-500">Sucursal</span>
              <div className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-xl border border-slate-200 bg-white cursor-default">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="font-500 text-sm">{user.nombreSucursal}</span>
              </div>
            </div>
            <div className="flex-1"></div>
            <button className="relative p-2 rounded-lg hover:bg-slate-100 transition" aria-label="Notificaciones">
              <svg className="w-6 h-6 text-ink-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-brand-600 rounded-full ring-2 ring-white"></span>
            </button>
            <div className="lg:hidden w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center font-600 text-sm shrink-0">
              {user.initials}
            </div>
          </div>
        </header>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
