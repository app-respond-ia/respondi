import { supabaseAdmin } from '@/utils/supabase/admin'

// Las fotos, vídeos y documentos de los mensajes se guardan en un almacén
// privado (nadie puede abrirlos con la dirección a secas). Para enseñarlos en
// Chats se crea un enlace firmado que caduca en una hora: se pide al cargar
// los mensajes y no se guarda en la base de datos, porque un enlace caducado
// rompería el historial.

const DURACION_SEGUNDOS = 60 * 60

// Añade `media_enlace` a los mensajes que tengan archivo. Todos los enlaces se
// piden a la vez.
export async function conEnlacesDeArchivos<T extends { media_url?: string | null; adjuntos?: any }>(mensajes: T[] | null | undefined): Promise<(T & { media_enlace?: string | null })[]> {
  const lista = mensajes || []
  const deUnMensaje = (m: T) => [
    rutaDe(m.media_url),
    ...(Array.isArray(m.adjuntos) ? m.adjuntos.map((a: any) => rutaDe(a?.ruta)) : [])
  ].filter(Boolean) as string[]
  const rutas = [...new Set(lista.flatMap(deUnMensaje))]
  if (rutas.length === 0) return lista

  const { data } = await supabaseAdmin.storage.from('whatsapp_media').createSignedUrls(rutas, DURACION_SEGUNDOS)
  const porRuta = new Map((data || []).map(d => [d.path, d.signedUrl]))
  return lista.map(m => {
    const ruta = rutaDe(m.media_url)
    const adjuntos = Array.isArray(m.adjuntos)
      ? m.adjuntos.map((a: any) => ({ ...a, enlace: porRuta.get(rutaDe(a?.ruta) || '') || null }))
      : m.adjuntos
    return {
      ...m,
      ...(ruta ? { media_enlace: porRuta.get(ruta) || null } : {}),
      ...(Array.isArray(m.adjuntos) ? { adjuntos } : {})
    }
  })
}

// Los mensajes antiguos guardaron la dirección completa; los nuevos, solo la
// ruta dentro del almacén
function rutaDe(valor?: string | null) {
  if (!valor) return null
  return valor.replace(/^.*?\/storage\/v1\/object\/(?:public|sign)\/whatsapp_media\//, '').split('?')[0] || null
}
