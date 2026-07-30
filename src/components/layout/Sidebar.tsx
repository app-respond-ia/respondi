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
  permisos: { seccion: string, nivel: string, alcance?: string }[]
  esAdmin: boolean
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ user, onCloseMobile, permisos, esAdmin, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()

  const isActive = (path: string) => pathname === path

  const navItemClass = (path: string) =>
    isActive(path)
      ? `flex items-center gap-3 py-2.5 rounded-xl bg-brand-500/10 border-l-2 border-brand-500 text-white font-500 transition ${collapsed ? 'justify-center px-0 border-l-0' : 'px-3'}`
      : `flex items-center gap-3 py-2.5 rounded-xl text-ink-400 hover:bg-white/5 hover:text-white transition border-l-2 border-transparent ${collapsed ? 'justify-center px-0' : 'px-3'}`

  const getNivel = (seccion: string): 'ninguno' | 'lectura' | 'escritura' => {
    if (esAdmin) return 'escritura'
    const p = permisos.find(p => p.seccion === seccion)
    return (p?.nivel as any) || 'ninguno'
  }

  const navItemWithPermClass = (path: string, seccion: string) => {
    const nivel = getNivel(seccion)
    if (nivel === 'ninguno') {
      return `flex items-center gap-3 py-2.5 rounded-xl text-ink-600/40 cursor-not-allowed border-l-2 border-transparent ${collapsed ? 'justify-center px-0' : 'px-3'}`
    }
    return navItemClass(path)
  }

  return (
    <aside className={`relative ${collapsed ? 'w-20' : 'w-72'} bg-ink-900 text-white flex flex-col h-full transition-all duration-300 ease-out`}>
      <div className={`flex items-center gap-3 h-20 border-b border-white/10 shrink-0 ${collapsed ? 'justify-center px-2' : 'px-6'}`}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/30 shrink-0">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-display font-700 text-lg leading-none truncate">Respondi</p>
            <p className="text-[11px] text-brand-300 mt-1 tracking-wide truncate">Panel de administración</p>
          </div>
        )}
        
        {/* Botón para cerrar en móvil */}
        <button onClick={onCloseMobile} className="lg:hidden ml-auto p-2 text-ink-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto sidebar-scroll">
        {!collapsed && <p className="px-3 pb-2 text-[10px] uppercase tracking-widest text-ink-500/70 font-600">General</p>}
        <Link href="/dashboard" onClick={onCloseMobile} className={navItemClass('/dashboard')} title={collapsed ? 'Dashboard' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
              </span>
              {!collapsed && <span className="truncate">Dashboard</span>}
            </Link>
        {(() => {
          const nivel = getNivel('casos')
          const cls = navItemWithPermClass('/dashboard/metricas', 'casos')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Métricas</span>}
            </span>
          ) : (
            <Link href="/dashboard/metricas" onClick={onCloseMobile} className={cls} title={collapsed ? 'Métricas' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Métricas</span>}
            </Link>
          )
        })()}

        {collapsed ? (
          <div className="flex justify-center pt-5 pb-2">
            <div className="h-px w-8 bg-white/10"></div>
          </div>
        ) : (
          <p className="px-3 pt-5 pb-2 text-[10px] uppercase tracking-widest text-ink-500/70 font-600">Operación</p>
        )}
        {(() => {
          const nivel = getNivel('casos')
          const cls = navItemWithPermClass('/dashboard/casos', 'casos')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-1m0-9V5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9l-4 4V8a2 2 0 012-2h2z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Casos</span>}
            </span>
          ) : (
            <Link href="/dashboard/casos" onClick={onCloseMobile} className={cls} title={collapsed ? 'Casos' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-1m0-9V5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9l-4 4V8a2 2 0 012-2h2z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Casos</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('conversaciones')
          const cls = navItemWithPermClass('/dashboard/conversaciones', 'conversaciones')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Conversaciones</span>}
            </span>
          ) : (
            <Link href="/dashboard/conversaciones" onClick={onCloseMobile} className={cls} title={collapsed ? 'Conversaciones' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Conversaciones</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('chats')
          const cls = navItemWithPermClass('/dashboard/chats', 'chats')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-1M3 9V5a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2H9l-4 4V9z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Chats</span>}
            </span>
          ) : (
            <Link href="/dashboard/chats" onClick={onCloseMobile} className={cls} title={collapsed ? 'Chats' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-1M3 9V5a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2H9l-4 4V9z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Chats</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('novedades')
          const cls = navItemWithPermClass('/dashboard/novedades', 'novedades')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              </span>
              {!collapsed && <span className="truncate">Novedades del día</span>}
            </span>
          ) : (
            <Link href="/dashboard/novedades" onClick={onCloseMobile} className={cls} title={collapsed ? 'Novedades del día' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              </span>
              {!collapsed && <span className="truncate">Novedades del día</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('blacklist')
          const cls = navItemWithPermClass('/dashboard/blacklist', 'blacklist')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
              </span>
              {!collapsed && <span className="truncate">Blacklist</span>}
            </span>
          ) : (
            <Link href="/dashboard/blacklist" onClick={onCloseMobile} className={cls} title={collapsed ? 'Blacklist' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
              </span>
              {!collapsed && <span className="truncate">Blacklist</span>}
            </Link>
          )
        })()}

        {collapsed ? (
          <div className="flex flex-col items-center gap-2 pt-5 pb-2">
            <div className="h-px w-8 bg-white/10"></div>
            <span title="Configuración" className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-ink-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </span>
          </div>
        ) : (
          <p className="px-3 pt-5 pb-2 text-[10px] uppercase tracking-widest text-ink-500/70 font-600">Configuración</p>
        )}
        {(() => {
          const nivel = getNivel('skills')
          const cls = navItemWithPermClass('/dashboard/skills', 'skills')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Skills de IA</span>}
            </span>
          ) : (
            <Link href="/dashboard/skills" onClick={onCloseMobile} className={cls} title={collapsed ? 'Skills de IA' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Skills de IA</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('precios')
          const cls = navItemWithPermClass('/dashboard/precios', 'precios')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Lista de precios</span>}
            </span>
          ) : (
            <Link href="/dashboard/precios" onClick={onCloseMobile} className={cls} title={collapsed ? 'Lista de precios' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Lista de precios</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('reglas')
          const cls = navItemWithPermClass('/dashboard/reglas', 'reglas')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Escalado de casos</span>}
            </span>
          ) : (
            <Link href="/dashboard/reglas" onClick={onCloseMobile} className={cls} title={collapsed ? 'Escalado de casos' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Escalado de casos</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('etiquetas')
          const cls = navItemWithPermClass('/dashboard/etiquetas', 'etiquetas')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Etiquetas</span>}
            </span>
          ) : (
            <Link href="/dashboard/etiquetas" onClick={onCloseMobile} className={cls} title={collapsed ? 'Etiquetas' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Etiquetas</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('canales')
          const cls = navItemWithPermClass('/dashboard/canales', 'canales')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Canales</span>}
            </span>
          ) : (
            <Link href="/dashboard/canales" onClick={onCloseMobile} className={cls} title={collapsed ? 'Canales' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Canales</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('usuarios')
          const cls = navItemWithPermClass('/dashboard/usuarios', 'usuarios')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-6a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Usuarios</span>}
            </span>
          ) : (
            <Link href="/dashboard/usuarios" onClick={onCloseMobile} className={cls} title={collapsed ? 'Usuarios' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-6a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Usuarios</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('usuarios')
          const cls = navItemWithPermClass('/dashboard/roles', 'usuarios')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Roles</span>}
            </span>
          ) : (
            <Link href="/dashboard/roles" onClick={onCloseMobile} className={cls} title={collapsed ? 'Roles' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Roles</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('audit_log')
          const cls = navItemWithPermClass('/dashboard/audit-log', 'audit_log')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              </span>
              {!collapsed && <span className="truncate">Audit log</span>}
            </span>
          ) : (
            <Link href="/dashboard/audit-log" onClick={onCloseMobile} className={cls} title={collapsed ? 'Audit log' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              </span>
              {!collapsed && <span className="truncate">Audit log</span>}
            </Link>
          )
        })()}
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 pt-5 pb-2">
            <div className="h-px w-8 bg-white/10"></div>
            <span title="Organización" className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-ink-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/>
              </svg>
            </span>
          </div>
        ) : (
          <p className="px-3 pt-5 pb-2 text-[10px] uppercase tracking-widest text-ink-500/70 font-600">Organización</p>
        )}
        {(() => {
          const nivel = getNivel('perfil')
          const cls = navItemWithPermClass('/dashboard/perfil-sucursal', 'perfil')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Perfil de la sucursal</span>}
            </span>
          ) : (
            <Link href="/dashboard/perfil-sucursal" onClick={onCloseMobile} className={cls} title={collapsed ? 'Perfil de la sucursal' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
              </span>
              {!collapsed && <span className="truncate">Perfil de la sucursal</span>}
            </Link>
          )
        })()}
        {(() => {
          const nivel = getNivel('sucursales')
          const cls = navItemWithPermClass('/dashboard/sucursales', 'sucursales')
          return nivel === 'ninguno' ? (
            <span title="Sin acceso" className={cls}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>
              </span>
              {!collapsed && <span className="truncate">Sucursales</span>}
            </span>
          ) : (
            <Link href="/dashboard/sucursales" onClick={onCloseMobile} className={cls} title={collapsed ? 'Sucursales' : undefined}>
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>
              </span>
              {!collapsed && <span className="truncate">Sucursales</span>}
            </Link>
          )
        })()}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 shrink-0">
        <div className={`flex items-center gap-3 py-2 group relative ${collapsed ? 'justify-center px-0' : 'px-3'}`}>
          <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center font-600 text-sm shrink-0" title={collapsed ? user.nombre : undefined}>
            {user.initials}
          </div>
          {!collapsed && (
            <>
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
            </>
          )}
        </div>
      </div>
      <button onClick={onToggleCollapse}
        className="hidden lg:flex absolute top-24 -right-3 w-6 h-6 rounded-full bg-ink-800 border border-white/10 shadow-lg items-center justify-center text-ink-400 hover:text-white hover:bg-brand-600 hover:border-brand-600 transition z-10">
        <svg className={`w-3.5 h-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
    </aside>
  )
}
