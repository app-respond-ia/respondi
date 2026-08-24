export function superadminHasPermission(
  req: { userPermisos: any[], esPropietario: boolean },
  seccion: string,
  nivelRequerido: 'lectura' | 'escritura' = 'lectura'
) {
  if (req.esPropietario) return true
  
  const perm = req.userPermisos.find((p: any) => p.seccion === seccion)
  if (!perm) return false
  
  if (nivelRequerido === 'lectura') {
    return perm.nivel === 'lectura' || perm.nivel === 'escritura'
  }
  return perm.nivel === 'escritura'
}
