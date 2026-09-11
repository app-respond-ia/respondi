// Los colores de las etiquetas se guardan con su nombre ('amber', 'slate-d'...),
// no como código de color. Antes Chats, Casos y Conversaciones los pintaban
// como si fueran un código (#rrggbb) y las etiquetas salían sin color fuera
// de la página de Etiquetas. Esta es la única paleta: la usan el selector de
// color de Etiquetas y todas las pantallas que enseñan etiquetas.
export const COLORES_ETIQUETA = [
  { id: 'amber', bg: 'bg-amber-100', text: 'text-amber-700', square: 'bg-amber-500', ring: 'ring-amber-500' },
  { id: 'purple', bg: 'bg-purple-100', text: 'text-purple-700', square: 'bg-purple-500', ring: 'ring-purple-500' },
  { id: 'blue', bg: 'bg-blue-100', text: 'text-blue-700', square: 'bg-blue-500', ring: 'ring-blue-500' },
  { id: 'emerald', bg: 'bg-emerald-100', text: 'text-emerald-700', square: 'bg-emerald-500', ring: 'ring-emerald-500' },
  { id: 'pink', bg: 'bg-pink-100', text: 'text-pink-700', square: 'bg-pink-500', ring: 'ring-pink-500' },
  { id: 'red', bg: 'bg-red-100', text: 'text-red-700', square: 'bg-red-500', ring: 'ring-red-500' },
  { id: 'orange', bg: 'bg-orange-100', text: 'text-orange-700', square: 'bg-orange-500', ring: 'ring-orange-500' },
  { id: 'indigo', bg: 'bg-indigo-100', text: 'text-indigo-700', square: 'bg-indigo-500', ring: 'ring-indigo-500' },
  { id: 'slate', bg: 'bg-slate-100', text: 'text-slate-700', square: 'bg-slate-500', ring: 'ring-slate-500' },
  { id: 'slate-d', bg: 'bg-slate-200', text: 'text-slate-800', square: 'bg-slate-700', ring: 'ring-slate-700' }
]

export function colorEtiqueta(colorId?: string | null) {
  return COLORES_ETIQUETA.find(c => c.id === colorId) || COLORES_ETIQUETA[8] // gris por defecto
}

export function clasesEtiqueta(colorId?: string | null) {
  const c = colorEtiqueta(colorId)
  return `${c.bg} ${c.text}`
}
