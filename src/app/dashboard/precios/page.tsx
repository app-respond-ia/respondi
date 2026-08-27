'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import { getPrecios, crearPrecio, actualizarPrecio, eliminarPrecio, importarPreciosMasivo, PrecioData } from '@/app/actions/precios'
import { getCategorias, crearCategoria, actualizarCategoria, eliminarCategoria } from '@/app/actions/categorias-precios'
import { getMisPermisos } from '@/app/actions/permisos'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { HelpPopover } from '@/components/ui/HelpPopover'

export default function ListaPreciosPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'producto' | 'servicio'>('todos')
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'añadir' | 'editar'>('añadir')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importando, setImportando] = useState(false)
  const [importPreview, setImportPreview] = useState<{
    validos: any[],
    errores: { fila: number, nombre: string, error: string }[]
  } | null>(null)

  const [categorias, setCategorias] = useState<any[]>([])
  const [isCategoriasModalOpen, setIsCategoriasModalOpen] = useState(false)
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null)
  const [nuevoNombreCategoria, setNuevoNombreCategoria] = useState('')
  const [nuevoNombreSubcategoria, setNuevoNombreSubcategoria] = useState('')
  const [editandoCatId, setEditandoCatId] = useState<string | null>(null)
  const [editandoCatNombre, setEditandoCatNombre] = useState('')

  const [itemAEliminar, setItemAEliminar] = useState<string | null>(null)
  const [catAEliminar, setCatAEliminar] = useState<string | null>(null)

  const [formData, setFormData] = useState<PrecioData>({
    nombre: '',
    tipo: 'producto',
    precio: null,
    precio_tipo: 'exacto',
    descripcion: '',
    categoria: null,
    subcategoria: null
  } as any)

  const cargar = async () => {
    setLoading(true)
    const res = await getPrecios()
    if (res.success && res.data) {
      setItems(res.data)
    }

    const permisosRes = await getMisPermisos()
    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'precios')
        setNivelPermiso(p?.nivel || 'ninguno')
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    cargar()
    cargarCategorias()
  }, [])

  const itemsFiltrados = items.filter(item => {
    if (filtroTipo === 'todos') return true
    return item.tipo === filtroTipo
  })

  const openAñadir = () => {
    setModalMode('añadir')
    setEditingId(null)
    setFormData({
      nombre: '',
      tipo: 'producto',
      precio: null,
      precio_tipo: 'exacto',
      descripcion: '',
      categoria: null,
      subcategoria: null
    } as any)
    setIsModalOpen(true)
  }

  const openEditar = (item: any) => {
    setModalMode('editar')
    setEditingId(item.id)
    setFormData({
      nombre: item.nombre,
      tipo: item.tipo,
      precio: item.precio,
      precio_tipo: item.precio_tipo,
      descripcion: item.descripcion || '',
      categoria: item.categoria || null,
      subcategoria: item.subcategoria || null
    } as any)
    setIsModalOpen(true)
  }

  const handleDelete = (id: string) => {
    setItemAEliminar(id)
  }

  const handleConfirmDelete = async () => {
    if (!itemAEliminar) return
    
    const res = await eliminarPrecio(itemAEliminar)
    if (res.success) {
      setItems(prev => prev.filter(it => it.id !== itemAEliminar))
      showToast('Ítem eliminado correctamente ✓', 'success')
    } else {
      showToast(res.error || 'Error al eliminar el ítem', 'error')
    }
    setItemAEliminar(null)
  }

  const cargarCategorias = async () => {
    const res = await getCategorias()
    if (res.success && res.data) setCategorias(res.data)
  }

  const abrirGestionCategorias = () => {
    cargarCategorias()
    setCategoriaSeleccionada(null)
    setIsCategoriasModalOpen(true)
  }

  const handleCrearCategoria = async () => {
    if (!nuevoNombreCategoria.trim()) return
    const res = await crearCategoria({ nombre: nuevoNombreCategoria.trim(), parent_id: null })
    if (res.success) {
      setNuevoNombreCategoria('')
      cargarCategorias()
    }
  }

  const handleCrearSubcategoria = async () => {
    if (!nuevoNombreSubcategoria.trim() || !categoriaSeleccionada) return
    const res = await crearCategoria({ nombre: nuevoNombreSubcategoria.trim(), parent_id: categoriaSeleccionada })
    if (res.success) {
      setNuevoNombreSubcategoria('')
      cargarCategorias()
    }
  }

  const handleEliminarCategoria = (id: string) => {
    setCatAEliminar(id)
  }

  const handleConfirmEliminarCategoria = async () => {
    if (!catAEliminar) return
    const res = await eliminarCategoria(catAEliminar)
    if (res.success) {
      if (categoriaSeleccionada === catAEliminar) setCategoriaSeleccionada(null)
      cargarCategorias()
    }
    setCatAEliminar(null)
  }

  const iniciarEdicion = (cat: any) => {
    setEditandoCatId(cat.id)
    setEditandoCatNombre(cat.nombre)
  }

  const guardarEdicion = async () => {
    if (!editandoCatId || !editandoCatNombre.trim()) return
    const res = await actualizarCategoria(editandoCatId, { nombre: editandoCatNombre.trim() })
    if (res.success) {
      setEditandoCatId(null)
      cargarCategorias()
    }
  }

  const categoriasRaiz = categorias.filter(c => !c.parent_id)
  const subcategoriasDe = (parentId: string) => categorias.filter(c => c.parent_id === parentId)

  const descargarPlantilla = async () => {
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Precios')

    ws.columns = [
      { header: 'nombre', key: 'nombre', width: 30 },
      { header: 'tipo', key: 'tipo', width: 14 },
      { header: 'precio_tipo', key: 'precio_tipo', width: 14 },
      { header: 'precio', key: 'precio', width: 10 },
      { header: 'categoria', key: 'categoria', width: 20 },
      { header: 'subcategoria', key: 'subcategoria', width: 20 },
      { header: 'descripcion', key: 'descripcion', width: 40 },
    ]

    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } }

    if (items.length > 0) {
      items.forEach(item => {
        ws.addRow({
          nombre: item.nombre,
          tipo: item.tipo,
          precio_tipo: item.precio_tipo,
          precio: item.precio ?? '',
          categoria: item.categoria || '',
          subcategoria: item.subcategoria || '',
          descripcion: item.descripcion || ''
        })
      })
    }

    const wsData = wb.addWorksheet('DatosOcultos', { state: 'hidden' })
    const categoriasNombres = categoriasRaiz.map(c => c.nombre)
    
    let maxSubcats = 0
    categoriasRaiz.forEach((cat, index) => {
      const subs = subcategoriasDe(cat.id)
      if (subs.length > maxSubcats) maxSubcats = subs.length
      const colLetter = wsData.getColumn(index + 1).letter
      const col = wsData.getColumn(index + 1)
      col.values = [cat.nombre, ...subs.map(s => s.nombre)]
      
      const numRows = Math.max(subs.length, 1)
      wb.definedNames.add(`'DatosOcultos'!$${colLetter}$2:$${colLetter}$${numRows + 1}`, `SUBCAT_${index + 1}`)
    })

    const startRow = items.length > 0 ? items.length + 2 : 2
    for (let i = 2; i <= (startRow + 500); i++) {
      ws.getCell(`B${i}`).dataValidation = {
        type: 'list', allowBlank: false, formulae: ['"producto,servicio"'],
        showErrorMessage: true, errorTitle: 'Valor inválido',
        error: 'Selecciona "producto" o "servicio" de la lista.'
      }
      ws.getCell(`C${i}`).dataValidation = {
        type: 'list', allowBlank: false, formulae: ['"exacto,desde,consultar"'],
        showErrorMessage: true, errorTitle: 'Valor inválido',
        error: 'Selecciona "exacto", "desde" o "consultar" de la lista.'
      }
      ws.getCell(`D${i}`).dataValidation = {
        type: 'custom',
        allowBlank: true,
        formulae: [`C${i}<>"consultar"`],
        showErrorMessage: true,
        errorTitle: 'Valor inválido',
        error: 'No puedes indicar un precio si el tipo es "consultar".'
      }
      
      if (categoriasNombres.length > 0) {
        const lastColLetter = wsData.getColumn(categoriasNombres.length).letter
        ws.getCell(`E${i}`).dataValidation = {
          type: 'list', allowBlank: true, formulae: [`'DatosOcultos'!$A$1:$${lastColLetter}$1`],
          showErrorMessage: false
        }
        
        if (maxSubcats > 0) {
          const headerRange = `'DatosOcultos'!$A$1:$${lastColLetter}$1`
          ws.getCell(`F${i}`).dataValidation = {
            type: 'list', allowBlank: true, formulae: [`INDIRECT("SUBCAT_"&MATCH($E${i}, ${headerRange}, 0))`],
            showErrorMessage: false
          }
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_precios_respondi.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleArchivoExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const precio_tipo = row[2]?.toString().trim().toLowerCase() || 'exacto'
        const precioRaw = row[3]?.toString().trim()
        const categoria = row[4]?.toString().trim() || null
        const subcategoria = row[5]?.toString().trim() || null
        const descripcion = row[6]?.toString().trim() || null

        if (!nombre) {
          errores.push({ fila, nombre: '(vacío)', error: 'El nombre es obligatorio' })
          continue
        }
        if (!['producto', 'servicio'].includes(tipo)) {
          errores.push({ fila, nombre, error: `Tipo inválido: "${tipo}". Debe ser "producto" o "servicio"` })
          continue
        }
        if (!['exacto', 'desde', 'consultar'].includes(precio_tipo)) {
          errores.push({ fila, nombre, error: `precio_tipo inválido: "${precio_tipo}". Debe ser "exacto", "desde" o "consultar"` })
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
            errores.push({ fila, nombre, error: `Precio inválido: "${precioRaw}". Debe ser un número positivo` })
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
  }

  const handleConfirmarImport = async () => {
    if (!importPreview || importPreview.validos.length === 0) return
    setImportando(true)
    const res = await importarPreciosMasivo(importPreview.validos)
    if (res.success) {
      setIsImportModalOpen(false)
      setImportPreview(null)
      showToast(`${res.total} producto${res.total === 1 ? '' : 's'} importado${res.total === 1 ? '' : 's'} correctamente ✓`, 'success')
      cargar()
    } else {
      showToast(res.error || 'Error al importar', 'error')
    }
    setImportando(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    // Preparar los datos y sanitizar según precio_tipo
    const dataToSave: PrecioData = { ...formData }
    if (dataToSave.precio_tipo === 'consultar') {
      dataToSave.precio = null
      dataToSave.moneda = 'USD'
    } else {
      // Si el precio viene como string desde el input, convertirlo a number
      if (typeof dataToSave.precio === 'string') {
        dataToSave.precio = dataToSave.precio ? parseFloat(dataToSave.precio) : null
      }
    }

    let res
    if (modalMode === 'añadir') {
      res = await crearPrecio(dataToSave)
    } else {
      res = await actualizarPrecio(editingId!, dataToSave)
    }

    if (res.success) {
      if (modalMode === 'añadir') {
        setItems(prev => [res.data, ...prev])
      } else {
        setItems(prev => prev.map(it => it.id === editingId ? res.data : it))
      }
      setIsModalOpen(false)
      showToast(modalMode === 'añadir' ? 'Ítem añadido correctamente ✓' : 'Ítem actualizado correctamente ✓', 'success')
    } else {
      showToast(res.error || 'Error al guardar el ítem', 'error')
    }
    setSaving(false)
  }

  const formatearPrecio = (item: any) => {
    if (item.precio_tipo === 'consultar') return 'A consultar'
    const numeroStr = item.precio != null ? Number(item.precio).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'
    if (item.precio_tipo === 'desde') return `Desde ${numeroStr}`
    return numeroStr
  }

  if (loading || nivelPermiso === null) {
    return <Loading />
  }

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <p className="text-ink-500 font-500">No tienes acceso a esta sección.</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-10 max-w-6xl w-full mx-auto pb-20">

      {/* Encabezado + acciones */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Lista de precios</h1>
            <HelpPopover content={
              <div className="space-y-3">
                <p><strong className="text-brand-300">Formatos aceptados:</strong> .xlsx o .csv. Recomendamos descargar y usar nuestra plantilla.</p>
                <div className="space-y-1.5 opacity-90">
                  <p><strong>nombre:</strong> Obligatorio. Texto libre.</p>
                  <p><strong>tipo:</strong> producto o servicio.</p>
                  <p><strong>precio / precio_tipo:</strong> exacto, desde o consultar.</p>
                  <p><strong>categoria / subcategoria:</strong> Opcionales.</p>
                  <p><strong>descripcion:</strong> Ayuda a la IA a responder mejor sobre este ítem.</p>
                </div>
              </div>
            } />
          </div>
          <p className="text-ink-500 mt-1">Productos y servicios que tu agente conoce.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={abrirGestionCategorias}
            className="inline-flex items-center gap-2 px-4 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
            Categorías
          </button>
          <button onClick={descargarPlantilla}
            className="inline-flex items-center gap-2 px-4 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Plantilla Excel
          </button>
          <label className={`inline-flex items-center gap-2 px-4 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition cursor-pointer ${nivelPermiso !== 'escritura' ? 'opacity-50 pointer-events-none' : ''}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12"/></svg>
            Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleArchivoExcel} className="sr-only" />
          </label>
          <button
            disabled={nivelPermiso !== 'escritura'}
            onClick={openAñadir}
            className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30 disabled:opacity-50 disabled:cursor-not-allowed">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Añadir ítem
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p className="font-semibold text-ink-900 text-lg mb-1">Aún no tienes ítems en tu lista de precios.</p>
          <p className="text-ink-500 text-sm">Añade el primero para que tu asistente IA pueda informar sobre tus productos y servicios.</p>
        </div>
      ) : (
        <>
          {/* Filtros: tipo */}
          <div className="flex items-center gap-3 flex-wrap mb-5">
            <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200">
              <button onClick={() => setFiltroTipo('todos')} className={`px-4 py-1.5 rounded-lg text-sm transition ${filtroTipo === 'todos' ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500'}`}>Todos</button>
              <button onClick={() => setFiltroTipo('producto')} className={`px-4 py-1.5 rounded-lg text-sm transition ${filtroTipo === 'producto' ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500'}`}>Productos</button>
              <button onClick={() => setFiltroTipo('servicio')} className={`px-4 py-1.5 rounded-lg text-sm transition ${filtroTipo === 'servicio' ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500'}`}>Servicios</button>
            </div>
          </div>

          {/* ===== TABLA ===== */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-ink-500">
                    <th className="font-600 px-5 py-3">Ítem</th>
                    <th className="font-600 px-5 py-3">Tipo</th>
                    <th className="font-600 px-5 py-3">Categoría</th>
                    <th className="font-600 px-5 py-3">Precio</th>
                    <th className="font-600 px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemsFiltrados.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-3.5">
                        <p className="font-600 text-ink-900">{item.nombre}</p>
                        {item.descripcion && <p className="text-xs text-ink-400 mt-0.5">{item.descripcion}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-500 ${item.tipo === 'producto' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {item.tipo === 'producto' ? 'Producto' : 'Servicio'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-ink-600 text-sm">
                        {item.categoria ? (
                          <span>{item.categoria}{item.subcategoria ? ` › ${item.subcategoria}` : ''}</span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-600 text-ink-900">
                        {formatearPrecio(item)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditar(item)} disabled={nivelPermiso !== 'escritura'} className="p-1.5 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Editar"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                          <button onClick={() => handleDelete(item.id)} disabled={nivelPermiso !== 'escritura'} className="p-1.5 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Eliminar"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {itemsFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-ink-500 text-sm">
                        No hay ítems que coincidan con este filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           POPUP · Añadir / Editar ítem
           ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          {/* fondo oscuro */}
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
        
          {/* caja del popup */}
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]">
              
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 h-full">
                {/* Cabecera */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                  <h2 className="font-display font-700 text-lg text-ink-900">{modalMode === 'editar' ? 'Editar ítem' : 'Añadir ítem'}</h2>
                  <button type="button" onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
        
                {/* Formulario */}
                <div className="flex-1 min-h-0 px-6 py-5 space-y-4 overflow-y-auto">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre del ítem</label>
                    <input type="text" required placeholder="Ej. Torta de chocolate"
                      value={formData.nombre}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" 
                    />
                  </div>
        
                  {/* Tipo: producto / servicio */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Tipo</label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition ${formData.tipo === 'producto' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="tipo" value="producto" checked={formData.tipo === 'producto'} onChange={() => setFormData({...formData, tipo: 'producto'})} className="w-4 h-4 text-brand-600 focus:ring-brand-400" />
                        <span className="text-sm font-500 text-ink-800">Producto</span>
                      </label>
                      <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition ${formData.tipo === 'servicio' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="tipo" value="servicio" checked={formData.tipo === 'servicio'} onChange={() => setFormData({...formData, tipo: 'servicio'})} className="w-4 h-4 text-brand-600 focus:ring-brand-400" />
                        <span className="text-sm font-500 text-ink-800">Servicio</span>
                      </label>
                    </div>
                  </div>
        
                  {/* Tipo de precio: exacto / desde / a consultar */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Tipo de precio</label>
                    <div className="grid grid-cols-3 gap-2">
                      <label className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer transition ${formData.precio_tipo === 'exacto' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="precio_tipo" value="exacto" checked={formData.precio_tipo === 'exacto'} onChange={() => setFormData({...formData, precio_tipo: 'exacto'})} className="peer sr-only" />
                        <span className="text-xs font-500 text-ink-800">Exacto</span>
                      </label>
                      <label className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer transition ${formData.precio_tipo === 'desde' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="precio_tipo" value="desde" checked={formData.precio_tipo === 'desde'} onChange={() => setFormData({...formData, precio_tipo: 'desde'})} className="peer sr-only" />
                        <span className="text-xs font-500 text-ink-800">Desde</span>
                      </label>
                      <label className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer transition ${formData.precio_tipo === 'consultar' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="precio_tipo" value="consultar" checked={formData.precio_tipo === 'consultar'} onChange={() => setFormData({...formData, precio_tipo: 'consultar'})} className="peer sr-only" />
                        <span className="text-xs font-500 text-ink-800">A consultar</span>
                      </label>
                    </div>
                    <p className="text-xs text-ink-400 mt-1.5">
                      {formData.precio_tipo === 'exacto' && 'Precio fijo del ítem.'}
                      {formData.precio_tipo === 'desde' && 'Se mostrará como "Desde X". Útil para servicios con precio variable.'}
                      {formData.precio_tipo === 'consultar' && 'No se muestra precio. Se indica "A consultar" al cliente.'}
                    </p>
                  </div>
        
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Precio</label>
                    <input type="number" step="0.01" min="0" placeholder="0.00"
                      required={formData.precio_tipo !== 'consultar'}
                      disabled={formData.precio_tipo === 'consultar'}
                      value={formData.precio_tipo === 'consultar' ? '' : (formData.precio || '')}
                      onChange={e => setFormData({...formData, precio: parseFloat(e.target.value) || null})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:text-ink-400 disabled:border-slate-200" 
                    />
                  </div>
        
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Descripción</label>
                    <textarea rows={3} placeholder="Describe el ítem para que la IA lo use al responder..."
                      value={formData.descripcion || ''}
                      onChange={e => setFormData({...formData, descripcion: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                  </div>
        
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">Categoría <span className="text-ink-400 font-400">· opcional</span></label>
                      <select value={formData.categoria || ''} onChange={e => setFormData({...formData, categoria: e.target.value, subcategoria: ''})}
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
                        <option value="">Sin categoría</option>
                        {categoriasRaiz.map(cat => (
                          <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">Subcategoría <span className="text-ink-400 font-400">· opcional</span></label>
                      <select value={formData.subcategoria || ''} onChange={e => setFormData({...formData, subcategoria: e.target.value})}
                        disabled={!formData.categoria}
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:text-ink-400">
                        <option value="">Sin subcategoría</option>
                        {formData.categoria && subcategoriasDe(categoriasRaiz.find(c => c.nombre === formData.categoria)?.id || '').map(sub => (
                          <option key={sub.id} value={sub.nombre}>{sub.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
        
                {/* Pie con botones */}
                <div className="flex justify-end gap-3 px-6 pt-5 pb-6 border-t border-slate-100 shrink-0">
                  <button type="button" disabled={saving} onClick={() => setIsModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition flex items-center gap-2 disabled:bg-brand-400">
                    {saving ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Guardando...
                      </>
                    ) : 'Guardar ítem'}
                  </button>
                </div>
              </form>
        
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR */}
      {isImportModalOpen && importPreview && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !importando && setIsImportModalOpen(false)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <h2 className="font-display font-700 text-lg text-ink-900">Previsualización de importación</h2>
                <button onClick={() => setIsImportModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Resumen */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <p className="text-2xl font-700 text-emerald-700">{importPreview.validos.length}</p>
                    <p className="text-sm text-emerald-600 mt-0.5">Filas válidas listas para importar</p>
                  </div>
                  <div className={`p-4 rounded-xl border ${importPreview.errores.length > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <p className={`text-2xl font-700 ${importPreview.errores.length > 0 ? 'text-red-700' : 'text-slate-400'}`}>{importPreview.errores.length}</p>
                    <p className={`text-sm mt-0.5 ${importPreview.errores.length > 0 ? 'text-red-600' : 'text-slate-400'}`}>Filas con errores (se omitirán)</p>
                  </div>
                </div>

                {/* Errores */}
                {importPreview.errores.length > 0 && (
                  <div>
                    <p className="text-sm font-600 text-ink-700 mb-2">Errores encontrados</p>
                    <div className="space-y-2">
                      {importPreview.errores.map((e, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
                          <span className="text-xs font-600 text-red-500 shrink-0 mt-0.5">Fila {e.fila}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-500 text-red-800 truncate">{e.nombre}</p>
                            <p className="text-xs text-red-600 mt-0.5">{e.error}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview válidos */}
                {importPreview.validos.length > 0 && (
                  <div>
                    <p className="text-sm font-600 text-ink-700 mb-2">Ítems que se importarán</p>
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-4 py-2.5 font-600 text-ink-600">Nombre</th>
                            <th className="text-left px-4 py-2.5 font-600 text-ink-600">Tipo</th>
                            <th className="text-left px-4 py-2.5 font-600 text-ink-600">Precio</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importPreview.validos.map((v, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-2.5 text-ink-900 font-500">{v.nombre}</td>
                              <td className="px-4 py-2.5 text-ink-500 capitalize">{v.tipo}</td>
                              <td className="px-4 py-2.5 text-ink-700 font-500">
                                {v.precio_tipo === 'consultar' ? 'A consultar' : v.precio_tipo === 'desde' ? `Desde ${v.precio}` : v.precio}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={() => setIsImportModalOpen(false)} disabled={importando}
                  className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleConfirmarImport}
                  disabled={importando || importPreview.validos.length === 0}
                  className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">
                  {importando ? 'Importando...' : `Importar ${importPreview.validos.length} ítem${importPreview.validos.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTIONAR CATEGORÍAS */}
      {isCategoriasModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => setIsCategoriasModalOpen(false)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="font-display font-700 text-lg text-ink-900">Categorías y subcategorías</h2>
                  <p className="text-xs text-ink-500 mt-0.5">Organiza tu catálogo. Ambas son opcionales al crear un ítem.</p>
                </div>
                <button onClick={() => setIsCategoriasModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex bg-slate-50/50">
                {/* Columna izquierda: categorías */}
                <div className="w-1/2 flex flex-col border-r border-slate-100 bg-white shadow-sm z-10">
                  <div className="px-5 py-4 border-b border-slate-100 shrink-0 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                    </div>
                    <p className="text-sm font-600 text-ink-900">Categorías</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1 max-h-[360px]">
                    {categoriasRaiz.length === 0 && (
                      <div className="text-center py-8 px-4">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                        </div>
                        <p className="text-sm text-ink-500 font-500">Aún no hay categorías.</p>
                      </div>
                    )}
                    {categoriasRaiz.map(cat => {
                      const itemCount = items.filter(i => i.categoria === cat.nombre).length;
                      return (
                      <div key={cat.id}
                        onClick={() => setCategoriaSeleccionada(cat.id)}
                        className={`group relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${categoriaSeleccionada === cat.id ? 'bg-indigo-50 shadow-sm border border-indigo-100/50' : 'bg-transparent border border-transparent hover:bg-slate-50'}`}>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <svg className={`w-4 h-4 shrink-0 transition-colors ${categoriaSeleccionada === cat.id ? 'text-indigo-500' : 'text-slate-400 group-hover:text-slate-500'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                          {editandoCatId === cat.id ? (
                            <input autoFocus value={editandoCatNombre} onChange={e => setEditandoCatNombre(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditandoCatId(null) }}
                              onBlur={guardarEdicion}
                              className="flex-1 min-w-0 h-8 px-2 rounded-lg border-2 border-indigo-500 text-sm focus:outline-none" />
                          ) : (
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className={`text-sm font-500 truncate ${categoriaSeleccionada === cat.id ? 'text-indigo-900' : 'text-ink-700 group-hover:text-ink-900'}`}>{cat.nombre}</span>
                              {itemCount > 0 && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-600 ${categoriaSeleccionada === cat.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {itemCount}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className={`flex items-center gap-1 shrink-0 transition-opacity ${categoriaSeleccionada === cat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <button onClick={e => { e.stopPropagation(); iniciarEdicion(cat) }} className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-100/50 transition">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleEliminarCategoria(cat.id) }} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                        {categoriaSeleccionada === cat.id && (
                          <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border border-slate-100 rounded-full flex items-center justify-center shadow-sm z-20">
                            <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
                    <div className="flex gap-2">
                      <input value={nuevoNombreCategoria} onChange={e => setNuevoNombreCategoria(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCrearCategoria() }}
                        placeholder="Nueva categoría..."
                        className="flex-1 h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition shadow-sm" />
                      <button onClick={handleCrearCategoria} className="px-3 h-10 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-600 transition shadow-sm shrink-0">
                        Añadir
                      </button>
                    </div>
                  </div>
                </div>

                {/* Columna derecha: subcategorías */}
                <div className="w-1/2 flex flex-col bg-slate-50/30">
                  <div className="px-6 py-4 border-b border-slate-100 shrink-0 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-600 text-ink-900 truncate">Subcategorías</p>
                      {categoriaSeleccionada && (
                        <p className="text-xs text-ink-500 mt-0.5 truncate max-w-[200px]">de {categorias.find(c => c.id === categoriaSeleccionada)?.nombre}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-1.5 max-h-[360px]">
                    {!categoriaSeleccionada && (
                      <div className="h-full flex flex-col items-center justify-center text-center px-4 opacity-60">
                        <svg className="w-8 h-8 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                        <p className="text-sm text-slate-500 font-500">Selecciona una categoría<br/>para ver sus subcategorías.</p>
                      </div>
                    )}
                    {categoriaSeleccionada && subcategoriasDe(categoriaSeleccionada).length === 0 && (
                      <div className="text-center py-6 px-4">
                        <p className="text-sm text-slate-400 font-500">Sin subcategorías todavía.</p>
                      </div>
                    )}
                    {categoriaSeleccionada && subcategoriasDe(categoriaSeleccionada).map(sub => {
                      const itemCount = items.filter(i => i.subcategoria === sub.nombre).length;
                      return (
                      <div key={sub.id} className="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all duration-200">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <svg className="w-3.5 h-3.5 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                          {editandoCatId === sub.id ? (
                            <input autoFocus value={editandoCatNombre} onChange={e => setEditandoCatNombre(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditandoCatId(null) }}
                              onBlur={guardarEdicion}
                              className="flex-1 min-w-0 h-8 px-2 rounded-lg border-2 border-emerald-500 text-sm focus:outline-none" />
                          ) : (
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="text-sm font-500 text-ink-700 group-hover:text-ink-900 truncate">{sub.nombre}</span>
                              {itemCount > 0 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-600 bg-slate-100 text-slate-500">
                                  {itemCount}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => iniciarEdicion(sub)} className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button onClick={() => handleEliminarCategoria(sub.id)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                      </div>
                    )})}
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
                    <div className="flex gap-2">
                      <input value={nuevoNombreSubcategoria} onChange={e => setNuevoNombreSubcategoria(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCrearSubcategoria() }}
                        disabled={!categoriaSeleccionada}
                        placeholder={categoriaSeleccionada ? 'Nueva subcategoría...' : 'Selecciona una categoría'}
                        className="flex-1 h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition shadow-sm disabled:bg-slate-100 disabled:text-ink-400" />
                      <button onClick={handleCrearSubcategoria} disabled={!categoriaSeleccionada}
                        className="px-3 h-10 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-600 transition shadow-sm shrink-0">
                        Añadir
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50/50 rounded-b-2xl">
                <button onClick={() => setIsCategoriasModalOpen(false)}
                  className="px-6 h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-600 shadow-sm transition">
                  Listo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!itemAEliminar}
        title="Eliminar ítem"
        message="¿Estás seguro de que quieres eliminar este ítem?"
        confirmText="Eliminar"
        cancelText="Cancelar"
        type="danger"
        onConfirm={handleConfirmDelete}
        onClose={() => setItemAEliminar(null)}
      />

      <ConfirmModal
        isOpen={!!catAEliminar}
        title="Eliminar categoría"
        message="¿Eliminar esta categoría? Si tiene subcategorías, también se eliminarán."
        confirmText="Eliminar"
        cancelText="Cancelar"
        type="danger"
        onConfirm={handleConfirmEliminarCategoria}
        onClose={() => setCatAEliminar(null)}
      />
    </div>
  )
}
