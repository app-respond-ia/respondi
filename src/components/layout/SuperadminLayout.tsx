'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/actions/auth'

import SuperadminDropdown from './SuperadminDropdown'
import SuperadminNotificationBell from './SuperadminNotificationBell'
import { SuperadminPermisosProvider } from './SuperadminPermisosContext'

export default function SuperadminLayout({
  children,
  nombreUsuario,
  iniciales,
  ticketsAbiertos,
  ticketsClientesAbiertos,
  email,
  avatarUrl,
  userId,
  permisos,
  esPropietario
}: {
  children: React.ReactNode
  nombreUsuario: string
  iniciales: string
  ticketsAbiertos?: number
  ticketsClientesAbiertos?: number
  email: string
  avatarUrl?: string
  userId: string
  permisos: any[]
  esPropietario: boolean
}) {
  const pathname = usePathname()
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>('Soporte')

  const closeSidebar = () => setSidebarOpen(false)

  const links = [
    { href: '/superadmin', seccion: 'vision_general', label: 'Visión general', exact: true, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
    )},
    { href: '/superadmin/organizaciones', seccion: 'organizaciones', label: 'Organizaciones', exact: false, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
    )},
    { href: '/superadmin/planes', seccion: 'planes', label: 'Planes', exact: false, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
    )},
    { href: '/superadmin/vendedores', seccion: 'vendedores', label: 'Vendedores', exact: false, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-6a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
    )},
    { href: '/superadmin/skills', seccion: 'skills', label: 'Skills de IA', exact: false, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
    )},
    { href: '/superadmin/comisiones', seccion: 'comisiones', label: 'Comisiones', exact: false, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    )},
    { href: '/superadmin/errores', seccion: 'errores', label: 'Errores del sistema', exact: false, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
    )},
    {
      label: 'Soporte',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      ),
      subLinks: [
        { href: '/superadmin/tickets', seccion: 'soporte_vendedores', label: 'Vendedores', exact: false, badge: ticketsAbiertos },
        { href: '/superadmin/tickets-clientes', seccion: 'soporte_clientes', label: 'Clientes', exact: false, badge: ticketsClientesAbiertos }
      ]
    },
    { href: '/superadmin/roles', seccion: 'gestion_superadmins', label: 'Roles y permisos', exact: false, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
    )}
  ]

  const hasPermission = (seccion?: string) => {
    if (!seccion) return true
    if (esPropietario) return true
    const perm = permisos.find(p => p.seccion === seccion)
    return perm && perm.nivel !== 'ninguno'
  }

  // Filter links
  const visibleLinks = links.map(link => {
    if (link.subLinks) {
      const visibleSubs = link.subLinks.filter(sub => hasPermission(sub.seccion))
      if (visibleSubs.length === 0) return null
      return { ...link, subLinks: visibleSubs }
    }
    return hasPermission(link.seccion) ? link : null
  }).filter(Boolean)


  return (
    <div className="min-h-[100dvh] lg:h-screen lg:overflow-hidden lg:flex bg-slate-50 text-ink-900">
      {/* SIDEBAR SUPER-ADMIN */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 ${collapsed ? 'w-20' : 'w-72'} bg-ink-900 text-white transform transition-all duration-300 ease-out flex flex-col h-full ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}
      >
        <div className={`flex items-center gap-3 h-20 border-b border-white/10 shrink-0 overflow-hidden transition-all ${collapsed ? 'justify-center px-2' : 'px-6'}`}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/30 shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display font-700 text-lg leading-none truncate">Respondi</p>
              <p className="inline-flex items-center gap-1 text-[11px] text-brand-300 mt-1 tracking-wide truncate">
                <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>
                Panel maestro · Atsura
              </p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {visibleLinks.map((link: any) => {
            if (link.subLinks) {
              const isGroupActive = link.subLinks.some((sub: any) => sub.exact ? pathname === sub.href : (pathname === sub.href || pathname.startsWith(sub.href + '/')))
              const isExpanded = expandedGroup === link.label || (isGroupActive && expandedGroup === null)
              
              return (
                <div key={link.label} className="space-y-1">
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : link.label)}
                    className={`w-full flex items-center justify-between py-2.5 rounded-xl transition ${isGroupActive ? 'bg-brand-600/10 text-brand-500 font-600' : 'text-ink-400 hover:bg-white/5 hover:text-white'} ${collapsed ? 'px-0 justify-center' : 'px-3'}`}
                    title={collapsed ? link.label : undefined}
                  >
                    <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
                      {link.icon}
                      {!collapsed && <span className="truncate">{link.label}</span>}
                    </div>
                    {!collapsed && (
                      <svg className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                  
                  {!collapsed && isExpanded && (
                    <div className="pl-11 pr-3 space-y-1 py-1">
                      {link.subLinks.map((sub: any) => {
                        const isSubActive = sub.exact ? pathname === sub.href : (pathname === sub.href || pathname.startsWith(sub.href + '/'))
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={closeSidebar}
                            className={`flex items-center justify-between py-2 px-3 rounded-lg text-sm transition ${isSubActive ? 'bg-brand-600 text-white font-500 shadow-md shadow-brand-900/20' : 'text-ink-400 hover:text-white hover:bg-white/5'}`}
                          >
                            <span className="truncate">{sub.label}</span>
                            {!!sub.badge && (
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-600 ${isSubActive ? 'bg-white text-brand-600' : 'bg-red-500 text-white'}`}>
                                {sub.badge}
                              </span>
                            )}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeSidebar}
                className={`flex items-center justify-between py-2.5 rounded-xl transition ${isActive ? `bg-brand-600 text-white font-500 shadow-lg shadow-brand-900/40 ${collapsed ? 'px-0 justify-center' : 'px-3'}` : `text-ink-400 hover:bg-white/5 hover:text-white ${collapsed ? 'px-0 justify-center' : 'px-3'}`}`}
                title={collapsed ? link.label : undefined}
              >
                <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
                  {link.icon}
                  {!collapsed && <span className="truncate">{link.label}</span>}
                </div>
                {!collapsed && !!link.badge && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-600 ${isActive ? 'bg-white text-brand-600' : 'bg-red-500 text-white'}`}>
                    {link.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <button onClick={() => setCollapsed(c => !c)}
          className="hidden lg:flex absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-14 rounded-full bg-brand-600 border border-brand-500 shadow-lg items-center justify-center text-white hover:bg-brand-700 transition z-20">
          <svg className={`w-3.5 h-3.5 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
      </aside>

      {/* OVERLAY MÓVIL */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-ink-900/50 z-30 lg:hidden" onClick={closeSidebar}></div>
      )}

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 h-20">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 transition" aria-label="Abrir menú">
              <svg className="w-6 h-6 text-ink-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 text-xs font-600 border border-brand-100">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/></svg>
              Panel maestro
            </span>
            <div className="flex-1"></div>
            <SuperadminNotificationBell userId={userId} />
            <div>
              <SuperadminDropdown 
                nombre={nombreUsuario} 
                email={email} 
                iniciales={iniciales} 
                avatarUrl={avatarUrl} 
              />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-7xl w-full mx-auto">
          <SuperadminPermisosProvider permisos={permisos} esPropietario={esPropietario}>
            {children}
          </SuperadminPermisosProvider>
        </main>
      </div>
    </div>
  )
}
