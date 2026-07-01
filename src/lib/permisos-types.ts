export type SeccionPermiso = 
  | 'casos' | 'conversaciones' | 'chats' | 'novedades' | 'blacklist'
  | 'skills' | 'precios' | 'reglas' | 'etiquetas' | 'canales'
  | 'usuarios' | 'sucursales' | 'perfil' | 'audit_log'

export type NivelPermiso = 'ninguno' | 'lectura' | 'escritura'
export type AlcancePermiso = 'todos' | 'propios'

export interface PermisoSeccion {
  seccion: SeccionPermiso
  nivel: NivelPermiso
  alcance?: AlcancePermiso
}

export const SECCIONES_CON_ALCANCE: SeccionPermiso[] = ['casos', 'conversaciones', 'chats']
