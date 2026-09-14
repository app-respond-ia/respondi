// Cómo se compara lo que escribe el cliente con los nombres del catálogo, igual
// para buscar productos y para hacer presupuestos. Sin distinguir mayúsculas,
// tildes ni plurales: "tartas de limon" es "Tarta de limón". Antes el buscador
// comparaba el texto tal cual y a un cliente que escribía sin tilde o en
// plural se le decía que el producto no existía.

export function normalizar(texto: string) {
  // La ñ se conserva (al descomponer, "ñ" es "n" + tilde y se perdía: "uñas"
  // quedaba en "unas", que es palabra vacía, y no se buscaba)
  return (texto || '')
    .normalize('NFD').replace(/[nN]\u0303/g, 'ñ').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const VACIAS = ['de', 'del', 'con', 'sin', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'para', 'por', 'que', 'the', 'and']

// Palabras sin plural sencillo ("tartas" → "tart", "velas" → "vel"). Una raíz
// de menos de 3 letras no sirve para comparar: "más" quedaba en "m" y
// entonces "mechas" (raíz "mech") "empezaba por" ella y contaba como
// mencionada (visto el 14-09-2026: la IA se callaba una promoción porque la
// red creía que ya la había dicho). En ese caso se deja la palabra entera.
export function raices(texto: string) {
  return normalizar(texto)
    .split(' ')
    .filter(p => p.length > 2 && !VACIAS.includes(p))
    // Verbos y pronombres pegados ("cortarme", "cortar") y la e final
    // ("corte") dejan la misma raíz "cort": así «cortarme el pelo» encuentra
    // «Corte de pelo» (14-09-2026)
    .map(p => { const r = p.replace(/(arme|arte|arse|arlo|arla|arlos|arlas|arnos)$/, 'ar').replace(/(es|s)$/, '').replace(/[aeo]$/, '').replace(/ar$/, ''); return r.length >= 3 ? r : p })
}

// Todas las palabras de lo buscado aparecen en el texto (con o sin plural)
export function contienePalabras(texto: string, buscado: string) {
  const palabras = raices(buscado)
  if (!palabras.length) return false
  const delTexto = raices(texto)
  return palabras.every(w => delTexto.some(d => d.startsWith(w) || w.startsWith(d)))
}
