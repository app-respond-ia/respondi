'use client'
import { createContext, useContext } from 'react'

type PermisosContextType = {
  permisos: any[]
  esPropietario: boolean
  hasPermission: (seccion: string, nivelRequerido?: 'lectura' | 'escritura') => boolean
}

export const SuperadminPermisosContext = createContext<PermisosContextType>({
  permisos: [],
  esPropietario: false,
  hasPermission: () => true
})

export function useSuperadminPermisos() {
  return useContext(SuperadminPermisosContext)
}

export function SuperadminPermisosProvider({
  children,
  permisos,
  esPropietario
}: {
  children: React.ReactNode
  permisos: any[]
  esPropietario: boolean
}) {
  const hasPermission = (seccion: string, nivelRequerido: 'lectura' | 'escritura' = 'lectura') => {
    if (esPropietario) return true
    const perm = permisos.find(p => p.seccion === seccion)
    if (!perm) return false
    if (nivelRequerido === 'lectura') {
      return perm.nivel === 'lectura' || perm.nivel === 'escritura'
    }
    return perm.nivel === 'escritura'
  }

  return (
    <SuperadminPermisosContext.Provider value={{ permisos, esPropietario, hasPermission }}>
      {children}
    </SuperadminPermisosContext.Provider>
  )
}
