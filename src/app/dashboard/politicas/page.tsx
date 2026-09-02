'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { 
  getPolicies, 
  deletePolicy, 
  getPolicyUploadUrl, 
  registerPolicyDocument, 
  saveManualPolicy 
} from '@/app/actions/politicas'
import { createClient } from '@/utils/supabase/client'
import { FileText, Trash2, UploadCloud, FileType, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

export default function PoliticasPage() {
  const router = useRouter()
  const [policies, setPolicies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'archivo' | 'manual'>('archivo')
  
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualText, setManualText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPolicies()
  }, [])

  const loadPolicies = async () => {
    setLoading(true)
    const { success, data } = await getPolicies()
    if (success && data) {
      setPolicies(data)
    }
    setLoading(false)
  }

  // --- Subida de Archivo ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0])
    }
  }

  const handleFileSelected = async (file: File) => {
    setErrorMsg('')
    const ext = file.name.split('.').pop()?.toLowerCase()
    
    if (ext !== 'pdf' && ext !== 'docx') {
      setErrorMsg('Solo se permiten archivos PDF o DOCX.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('El archivo no puede exceder los 10MB.')
      return
    }

    setUploading(true)
    try {
      // 1. Obtener URL firmada
      const urlRes = await getPolicyUploadUrl(file.name, ext, file.size)
      if (!urlRes.success || !urlRes.data) {
        throw new Error(urlRes.error || 'Error generando URL de subida')
      }

      // 2. Subir directo a Supabase
      const { safePath, token } = urlRes.data
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('policy_documents')
        .uploadToSignedUrl(safePath, token, file)

      if (uploadError) throw uploadError

      // 3. Registrar en BD
      const regRes = await registerPolicyDocument(file.name, safePath)
      if (!regRes.success) throw new Error(regRes.error)

      await loadPolicies()
    } catch (err: any) {
      setErrorMsg(err.message || 'Error desconocido al subir archivo')
    } finally {
      setUploading(false)
    }
  }

  // --- Texto Manual ---
  const handleSaveManual = async () => {
    if (!manualTitle.trim() || !manualText.trim()) {
      setErrorMsg('El título y el texto son obligatorios.')
      return
    }

    setErrorMsg('')
    setUploading(true)
    try {
      const res = await saveManualPolicy(manualTitle, manualText)
      if (!res.success) throw new Error(res.error)

      setManualTitle('')
      setManualText('')
      await loadPolicies()
    } catch (err: any) {
      setErrorMsg(err.message || 'Error guardando texto manual')
    } finally {
      setUploading(false)
    }
  }

  // --- Borrar ---
  const handleDelete = async (id: string, rutaArchivo: string | null) => {
    if (!confirm('¿Seguro que deseas borrar esta política? Se perderá todo su conocimiento para la IA.')) return

    try {
      const res = await deletePolicy(id, rutaArchivo)
      if (res.success) {
        await loadPolicies()
      } else {
        alert(res.error || 'Error al borrar')
      }
    } catch (e: any) {
      alert('Error: ' + e.message)
    }
  }

  const renderStatus = (estado: string, error?: string) => {
    if (estado === 'completado') return <span className="flex items-center text-green-600 text-sm"><CheckCircle2 className="w-4 h-4 mr-1" /> Completado</span>
    if (estado === 'error') return <span className="flex items-center text-red-600 text-sm" title={error}><AlertCircle className="w-4 h-4 mr-1" /> Error</span>
    return <span className="flex items-center text-blue-600 text-sm"><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Procesando</span>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Políticas y Conocimiento</h1>
        <p className="text-slate-500 mt-1">Sube documentos o escribe políticas para que la IA se base en ellas al responder.</p>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          {errorMsg}
        </div>
      )}

      {/* Contenedor de Ingesta */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-10 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button 
            onClick={() => setActiveTab('archivo')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${activeTab === 'archivo' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Subir Documento (PDF/Word)
          </button>
          <button 
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${activeTab === 'manual' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Escribir Texto Manual
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'archivo' ? (
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileInput} className="hidden" accept=".pdf,.docx" />
              <UploadCloud className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-700 mb-1">Arrastra tu documento aquí o haz clic</h3>
              <p className="text-slate-500 text-sm">Soporta .PDF y .DOCX hasta 10MB</p>
              {uploading && <p className="text-indigo-600 font-medium mt-4">Subiendo y procesando...</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Título de la política</label>
                <input 
                  type="text" 
                  value={manualTitle}
                  onChange={e => setManualTitle(e.target.value)}
                  placeholder="Ej: Política de devoluciones" 
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  disabled={uploading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contenido</label>
                <textarea 
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  rows={6}
                  placeholder="Pega o escribe aquí las reglas, condiciones o información..." 
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                  disabled={uploading}
                />
              </div>
              <div className="flex justify-end">
                <button 
                  onClick={handleSaveManual}
                  disabled={uploading}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Guardando...' : 'Guardar Política'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Listado */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Documentos Activos ({policies.length}/20)</h2>
          <button onClick={loadPolicies} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Actualizar estado</button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Cargando...</div>
          ) : policies.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No hay políticas cargadas aún. Sube tu primer documento.
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Nombre</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {policies.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {p.tipo_origen === 'archivo' ? <FileText className="w-5 h-5 text-slate-400 mr-3" /> : <FileType className="w-5 h-5 text-slate-400 mr-3" />}
                        <span className="font-medium text-slate-900">{p.nombre}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {p.tipo_origen === 'archivo' ? 'Documento' : 'Texto Manual'}
                    </td>
                    <td className="px-6 py-4">
                      {renderStatus(p.estado, p.error_msg)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(p.id, p.ruta_archivo)}
                        className="text-slate-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
                        title="Eliminar política"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
