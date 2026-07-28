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
}

export default function AdminLayout({
  children,
  esAdmin = false,
  permisos = [],
  nombreUsuario = '',
  branches = [],
  activeBranchId = ''
}: AdminLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const user = {
    nombre: nombreUsuario,
    email: '',
    initials: nombreUsuario ? nombreUsuario.substring(0, 2).toUpperCase() : 'U',
    roleName: esAdmin ? 'Administrador' : 'Usuario'
  }

  return (
    <div className="min-h-screen lg:flex bg-slate-50 text-ink-900">
      {/* Sidebar Wrapper */}
      <div className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-out lg:translate-x-0 lg:static lg:z-auto ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar user={user} onCloseMobile={() => setIsMobileMenuOpen(false)} permisos={permisos} esAdmin={esAdmin} />
      </div>

      {/* Overlay Mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-ink-900/50 z-30 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header 
          branches={branches} 
          activeBranchId={activeBranchId} 
          onOpenMobile={() => setIsMobileMenuOpen(true)}
          userInitials={user.initials}
        />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
