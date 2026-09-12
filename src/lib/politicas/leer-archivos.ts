// Sacar el texto de los documentos de políticas que sube el negocio.
//
// El PDF se leía con `pdf-parse`, que por debajo usa la versión moderna de
// pdf.js: esa versión necesita cosas del navegador (DOMMatrix) que no existen
// en el servidor, así que TODO PDF fallaba con "DOMMatrix is not defined" y el
// documento se quedaba para siempre en "procesando" sin que la IA lo
// aprendiera. Aquí se usa la versión "legacy" de pdf.js, que es la pensada
// para el servidor.

export const EXTENSIONES_SOPORTADAS = ['pdf', 'docx', 'txt', 'md']

export async function extraerTextoDeArchivo(buffer: Buffer, extension: string): Promise<string> {
  const ext = (extension || '').toLowerCase().replace(/^\./, '')

  if (ext === 'pdf') return extraerTextoPdf(buffer)

  if (ext === 'docx') {
    const mammoth = await import('mammoth')
    const resultado = await (mammoth as any).extractRawText({ buffer })
    return resultado.value || ''
  }

  if (ext === 'txt' || ext === 'md') return buffer.toString('utf8')

  throw new Error(`Extensión de archivo no soportada: ${ext}. Admitimos PDF, Word (.docx), texto (.txt) y Markdown (.md).`)
}

async function extraerTextoPdf(buffer: Buffer): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    // Sin worker aparte: en el servidor va en el mismo proceso
    isEvalSupported: false
  }).promise

  const paginas: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n)
    const contenido = await pagina.getTextContent()
    // Cada trocito de texto trae su posición; se juntan con espacios y se
    // respeta el salto de línea que marca pdf.js
    const texto = contenido.items
      .map((it: any) => (typeof it.str === 'string' ? it.str + (it.hasEOL ? '\n' : '') : ''))
      .join(' ')
    paginas.push(texto)
  }
  await doc.destroy?.()

  return paginas.join('\n\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}
