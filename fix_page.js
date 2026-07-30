const fs = require('fs');
const file = '/Users/jorgenovo/Desktop/Respondi 2 copia/src/app/dashboard/precios/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove xlsx import
content = content.replace("import * as XLSX from 'xlsx'\n", "");

// 2. Change accept attribute
content = content.replace(
  '<input type="file" accept=".xlsx,.xls" onChange={handleArchivoExcel} className="sr-only" />',
  '<input type="file" accept=".xlsx,.xls,.csv" onChange={handleArchivoExcel} className="sr-only" />'
);

// 3. Replace handleArchivoExcel
const handleStart = "  const handleArchivoExcel = (e: React.ChangeEvent<HTMLInputElement>) => {";
const handleEndStr = "\n    e.target.value = ''\n  }";
const startIndex = content.indexOf(handleStart);
const endIndex = content.indexOf(handleEndStr, startIndex) + handleEndStr.length;

if (startIndex === -1 || endIndex < startIndex) {
  console.log('Could not find handleArchivoExcel bounds');
  process.exit(1);
}

const newHandle = `  const handleArchivoExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const esCSV = file.name.toLowerCase().endsWith('.csv')

    const procesarFilas = (rows: any[][]) => {
      if (rows.length < 2) {
        setImportPreview({ validos: [], errores: [{ fila: 1, nombre: '—', error: 'El archivo está vacío o solo tiene encabezados' }] })
        setIsImportModalOpen(true)
        return
      }

      const validos: any[] = []
      const errores: { fila: number, nombre: string, error: string }[] = []

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const fila = i + 1
        const nombre = row[0]?.toString().trim()
        const tipo = row[1]?.toString().trim().toLowerCase() || 'producto'
        const precioRaw = row[2]?.toString().trim()
        const precio_tipo = row[3]?.toString().trim().toLowerCase() || 'exacto'
        const categoria = row[4]?.toString().trim() || null
        const subcategoria = row[5]?.toString().trim() || null
        const descripcion = row[6]?.toString().trim() || null

        if (!nombre) {
          errores.push({ fila, nombre: '(vacío)', error: 'El nombre es obligatorio' })
          continue
        }
        if (!['producto', 'servicio'].includes(tipo)) {
          errores.push({ fila, nombre, error: \`Tipo inválido: "\${tipo}". Debe ser "producto" o "servicio"\` })
          continue
        }
        if (!['exacto', 'desde', 'consultar'].includes(precio_tipo)) {
          errores.push({ fila, nombre, error: \`precio_tipo inválido: "\${precio_tipo}". Debe ser "exacto", "desde" o "consultar"\` })
          continue
        }

        let precio: number | null = null
        if (precio_tipo !== 'consultar') {
          if (!precioRaw) {
            errores.push({ fila, nombre, error: 'El precio es obligatorio cuando precio_tipo no es "consultar"' })
            continue
          }
          precio = parseFloat(precioRaw.replace(',', '.'))
          if (isNaN(precio) || precio < 0) {
            errores.push({ fila, nombre, error: \`Precio inválido: "\${precioRaw}". Debe ser un número positivo\` })
            continue
          }
        }

        validos.push({ nombre, tipo, precio, precio_tipo, categoria, subcategoria, descripcion })
      }

      setImportPreview({ validos, errores })
      setIsImportModalOpen(true)
    }

    try {
      if (esCSV) {
        const Papa = (await import('papaparse')).default
        const text = await file.text()
        const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
        procesarFilas(result.data)
      } else {
        const ExcelJS = await import('exceljs')
        const buffer = await file.arrayBuffer()
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buffer)
        const ws = wb.worksheets[0]
        const rows: any[][] = []
        ws.eachRow((row) => {
          const values = (row.values as any[]).slice(1)
          rows.push(values.map(v => v?.toString?.() ?? v ?? ''))
        })
        procesarFilas(rows)
      }
    } catch (err) {
      setImportPreview({ validos: [], errores: [{ fila: 0, nombre: '—', error: 'Error al leer el archivo. Asegúrate de que sea un .xlsx o .csv válido' }] })
      setIsImportModalOpen(true)
    }

    e.target.value = ''
  }`;

content = content.substring(0, startIndex) + newHandle + content.substring(endIndex);

fs.writeFileSync(file, content);
console.log('done');
