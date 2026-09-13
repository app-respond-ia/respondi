// Clases compartidas de las páginas del panel (decidido con Jorge el
// 13-09-2026, tramo 3: el contenido ocupa el ancho de la pantalla).
//
// El marco (AdminLayout / SuperadminLayout) ya pone el relleno lateral
// (px-4 sm:px-6 lg:px-8) y el superior: las páginas NO añaden más relleno,
// solo un tope de anchura para pantallas muy grandes y aire abajo.

// Listas, tablas, paneles: todo el ancho
export const PAGINA = 'w-full max-w-[1600px] mx-auto pb-16'
// Formularios y fichas: más cómodo con un tope
export const PAGINA_FORMULARIO = 'w-full max-w-4xl mx-auto pb-16'
// Páginas de lectura larga (avisos, condiciones)
export const PAGINA_TEXTO = 'w-full max-w-3xl mx-auto pb-16'
