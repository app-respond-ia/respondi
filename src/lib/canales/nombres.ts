// Cómo se escribe cada canal en pantalla. En la base de datos van en
// minúsculas ('whatsapp') y cada página los ponía a su manera ("whatsapp",
// "Whatsapp"...).
const NOMBRES_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  email: 'Email',
  desconocido: 'Desconocido'
}

export function nombreCanal(canal?: string | null) {
  if (!canal) return ''
  return NOMBRES_CANAL[canal.toLowerCase()] || canal.charAt(0).toUpperCase() + canal.slice(1)
}
