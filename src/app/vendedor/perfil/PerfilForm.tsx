'use client'

import { useState, useRef } from 'react'
import { actualizarPerfilVendedor } from '@/app/actions/vendedor'
import { createClient } from '@/utils/supabase/client'
import { useToast } from '@/components/ui/Toast'

type VendedorData = {
  nombre: string
  email: string
  comision_conversion_pct: number
  comision_mrr_pct: number
  activo: boolean
}

export default function PerfilForm({ vendedor, avatarUrl }: { vendedor: VendedorData, avatarUrl?: string }) {
  const [nombre, setNombre] = useState(vendedor.nombre || '')
  const [isSaving, setIsSaving] = useState(false)
  const { showToast } = useToast()
  
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string>(avatarUrl || '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)

    let finalAvatarUrl = avatarUrl

    try {
      if (avatarFile) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const filePath = `${user.id}/avatar`
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, avatarFile, { upsert: true, contentType: avatarFile.type })
          
          if (uploadError) {
            showToast('Error al subir la imagen de perfil: ' + uploadError.message, 'error')
            setIsSaving(false)
            return
          }
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
          finalAvatarUrl = publicUrl + '?t=' + Date.now()
        }
      }

      const res = await actualizarPerfilVendedor(nombre, finalAvatarUrl)
      setIsSaving(false)

      if (res.success) {
        showToast('Perfil actualizado correctamente.', 'success')
      } else {
        showToast(res.error || 'Error al actualizar el perfil.', 'error')
      }
    } catch (e: any) {
      setIsSaving(false)
      showToast('Ocurrió un error inesperado.', 'error')
    }
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-600 text-ink-900 font-display">Información personal</h2>
          <p className="text-sm text-ink-500 mt-1">Actualiza tu foto y nombre de usuario.</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          
          <div>
            <label className="block text-sm font-500 text-ink-700 mb-3">Foto de perfil</label>
            <div className="flex items-center gap-5">
              <div className="relative w-20 h-20 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-600 text-slate-400">
                    {nombre ? nombre.substring(0, 2).toUpperCase() : 'US'}
                  </span>
                )}
              </div>
              <input 
                type="file" 
                accept="image/jpeg, image/png, image/webp" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) {
                    if (file.size > 5 * 1024 * 1024) {
                      showToast('La imagen debe pesar menos de 5MB', 'error')
                      return
                    }
                    setAvatarFile(file)
                    setAvatarPreview(URL.createObjectURL(file))
                  }
                }} 
              />
              <div className="flex flex-col items-start gap-2">
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()} 
                  className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm font-500 text-slate-700 hover:bg-slate-50 transition shadow-sm"
                >
                  Cambiar foto
                </button>
                <p className="text-xs text-ink-400">JPG, PNG o WebP. Máximo 5MB.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre completo</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-500 text-ink-700 mb-1.5">Email (solo lectura)</label>
              <input
                type="email"
                value={vendedor.email}
                disabled
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-ink-500 cursor-not-allowed outline-none"
              />
              <p className="text-xs text-ink-400 mt-1.5">El correo electrónico se usa para iniciar sesión y no se puede cambiar aquí.</p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSaving}
              className={`px-4 py-2 rounded-xl text-sm font-600 transition ${isSaving ? 'bg-brand-400 text-white cursor-not-allowed' : 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm hover:shadow'}`}
            >
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-600 text-ink-900 font-display">Condiciones de trabajo</h2>
            <p className="text-sm text-ink-500 mt-1">Tus comisiones y estado actual.</p>
          </div>
          <span className={`px-2.5 py-1 text-xs font-600 rounded-lg ${vendedor.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {vendedor.activo ? 'Cuenta activa' : 'Cuenta inactiva'}
          </span>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-sm font-500 text-ink-500 mb-1">Comisión por Conversión</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-700 text-brand-700 font-display">{vendedor.comision_conversion_pct}%</span>
                <span className="text-sm text-ink-400">/ venta</span>
              </div>
              <p className="text-xs text-ink-500 mt-2">Aplicable a pagos iniciales (setup o un solo pago).</p>
            </div>
            
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-sm font-500 text-ink-500 mb-1">Comisión Recurrente (MRR)</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-700 text-brand-700 font-display">{vendedor.comision_mrr_pct}%</span>
                <span className="text-sm text-ink-400">/ mes</span>
              </div>
              <p className="text-xs text-ink-500 mt-2">Aplicable a mensualidades mientras el cliente siga activo.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
