// Cómo se compara lo que escribe el cliente con los nombres del catálogo, igual
// para buscar productos y para hacer presupuestos. Sin distinguir mayúsculas,
// tildes ni plurales: "tartas de limon" es "Tarta de limón". Antes el buscador
// comparaba el texto tal cual y a un cliente que escribía sin tilde o en
// plural se le decía que el producto no existía.

export function normalizar(texto: string) {
  return (texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const VACIAS = ['de', 'del', 'con', 'sin', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'para', 'por', 'que', 'the', 'and']

// Palabras sin plural sencillo ("tartas" → "tart", "velas" → "vel")
export function raices(texto: string) {
  return normalizar(texto)
    .split(' ')
    .filter(p => p.length > 2 && !VACIAS.includes(p))
    .map(p => p.replace(/(es|s)$/, '').replace(/a$|o$/, ''))
}

// Todas las palabras de lo buscado aparecen en el texto (con o sin plural)
export function contienePalabras(texto: string, buscado: string) {
  const palabras = raices(buscado)
  if (!palabras.length) return false
  const delTexto = raices(texto)
  return palabras.every(w => delTexto.some(d => d.startsWith(w) || w.startsWith(d)))
}
