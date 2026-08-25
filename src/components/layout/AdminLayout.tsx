'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

interface AdminLayoutProps {
  children: React.ReactNode
  esAdmin?: boolean
  permisos?: any[]
  nombreUsuario?: string
  branches?: { id: string; nombre: string }[]
  activeBranchId?: string
  creditos?: { saldo: number; max: number } | null
  isImpersonating?: boolean
  userId?: string
  apodo?: string
  avatarUrl?: string
  color?: string
}

export default function AdminLayout({
  children,
  esAdmin = false,
  permisos = [],
  nombreUsuario = '',
  branches = [],
  activeBranchId = '',
  creditos = null,
  isImpersonating = false,
  userId = '',
  apodo,
  avatarUrl,
  color,
}: AdminLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const user = {
    nombre: nombreUsuario,
    email: '',
    initials: nombreUsuario ? nombreUsuario.substring(0, 2).toUpperCase() : 'U',
    roleName: isImpersonating ? 'Superadmin (viendo como)' : (esAdmin ? 'Administrador' : 'Usuario'),
    apodo,
    avatarUrl,
    color
  }

  return (
    <div className={`min-h-[100dvh] lg:h-screen lg:overflow-hidden lg:flex bg-slate-50 text-ink-900 ${isImpersonating ? 'pt-10' : ''}`}>
      {/* Sidebar Wrapper */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-out lg:translate-x-0 lg:static lg:z-auto h-full overflow-y-auto ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar user={user} onCloseMobile={() => setIsMobileMenuOpen(false)} permisos={permisos} esAdmin={esAdmin} collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} />
      </div>

      {/* Overlay Mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-ink-900/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header 
          branches={branches} 
          activeBranchId={activeBranchId} 
          onOpenMobile={() => setIsMobileMenuOpen(true)}
          userInitials={user.initials}
          creditos={creditos}
          userId={userId}
          user={user}
        />
        <main className="flex-1 flex flex-col min-h-0 px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
