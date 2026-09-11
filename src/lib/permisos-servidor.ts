import { getMisPermisos } from '@/app/actions/permisos'

// Comprueba en el servidor que el usuario tiene permiso en una sección antes
// de cambiar nada. Casi ninguna acción de configuración lo hacía: solo lo
// escondía la pantalla, así que alguien con "solo lectura" podía cambiar
// datos llamando a la acción directamente. La base de datos también lo
// impide ahora (`auth_puede()`), pero entonces el cambio no se hace y la
// acción no se entera; con esto el usuario recibe un mensaje claro.
//
// Devuelve el mensaje de error, o null si puede.
export async function sinPermiso(seccion: string, nivel: 'lectura' | 'escritura' = 'escritura'): Promise<string | null> {
  const permisos = await getMisPermisos()
  if (!permisos.success) return 'No autorizado'
  if ((permisos as any).esAdmin) return null

  const actual = ((permisos as any).data || []).find((p: any) => p.seccion === seccion)?.nivel
  const puede = nivel === 'lectura' ? actual === 'lectura' || actual === 'escritura' : actual === 'escritura'
  return puede ? null : 'No tienes permiso para hacer cambios en esta sección.'
}
