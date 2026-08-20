'use client'

import { useState, useRef } from 'react'
import { actualizarPerfilSuperadmin } from '@/app/actions/superadmin'
import { createClient } from '@/utils/supabase/client'

type SuperadminData = {
  nombre: string
  apodo: string
  email: string
  avatar_url?: string
}

export default function PerfilForm({ superadmin }: { superadmin: SuperadminData }) {
  const [nombre, setNombre] = useState(superadmin.nombre || '')
  const [apodo, setApodo] = useState(superadmin.apodo || '')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string>(superadmin.avatar_url || '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    setMessage(null)

    let finalAvatarUrl = superadmin.avatar_url

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
            setMessage({ type: 'error', text: 'Error al subir la imagen de perfil: ' + uploadError.message })
            setIsSaving(false)
            return
          }
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
          finalAvatarUrl = publicUrl + '?t=' + Date.now()
        }
      }

      const res = await actualizarPerfilSuperadmin(nombre, apodo, finalAvatarUrl)
      setIsSaving(false)

      if (res.success) {
        setMessage({ type: 'success', text: 'Perfil actualizado correctamente.' })
      } else {
        setMessage({ type: 'error', text: res.error || 'Error al actualizar el perfil.' })
      }
    } catch (e: any) {
      setIsSaving(false)
      setMessage({ type: 'error', text: 'Ocurrió un error inesperado.' })
    }
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-600 text-ink-900 font-display">Información personal</h2>
          <p className="text-sm text-ink-500 mt-1">Actualiza tu foto, nombre y apodo de usuario.</p>
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
                    {nombre ? nombre.substring(0, 2).toUpperCase() : 'SA'}
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
                      setMessage({ type: 'error', text: 'La imagen debe pesar menos de 5MB' })
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
              <label className="block text-sm font-500 text-ink-700 mb-1.5">Apodo (Opcional)</label>
              <input
                type="text"
                value={apodo}
                onChange={(e) => setApodo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-500 text-ink-700 mb-1.5">Email (solo lectura)</label>
              <input
                type="email"
                value={superadmin.email}
                disabled
                className="w-full md:w-1/2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-ink-500 cursor-not-allowed outline-none"
              />
              <p className="text-xs text-ink-400 mt-1.5">El correo electrónico se usa para iniciar sesión y no se puede cambiar aquí.</p>
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-xl text-sm font-500 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
              {message.text}
            </div>
          )}

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
    </div>
  )
}
