'use client'

import { useState, useRef } from 'react'
import { actualizarPerfilCliente } from '@/app/actions/perfil'
import { createClient } from '@/utils/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { USER_COLORS } from '@/lib/userColor'

type UserData = {
  nombre: string
  apodo: string
  email: string
  avatar_url: string
  color: string | null
}

export default function MiPerfilForm({ user, userId }: { user: UserData, userId: string }) {
  const [nombre, setNombre] = useState(user.nombre || '')
  const [apodo, setApodo] = useState(user.apodo || '')
  const [color, setColor] = useState<string | null>(user.color || null)
  const [isSaving, setIsSaving] = useState(false)
  const { showToast } = useToast()
  
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string>(user.avatar_url || '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)

    let finalAvatarUrl = user.avatar_url

    try {
      if (avatarFile) {
        const supabase = createClient()
        const filePath = `${userId}/avatar`
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

      const res = await actualizarPerfilCliente(nombre, apodo, finalAvatarUrl, color)
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
          <p className="text-sm text-ink-500 mt-1">Actualiza tu foto, nombre completo y apodo (nombre corto).</p>
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
              <label className="block text-sm font-500 text-ink-700 mb-1.5">Apodo (nombre corto)</label>
              <input
                type="text"
                value={apodo}
                onChange={(e) => setApodo(e.target.value)}
                placeholder="Ej. Jorge"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition outline-none"
              />
              <p className="text-xs text-ink-400 mt-1.5">Se mostrará en la cabecera para ahorrar espacio.</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-500 text-ink-700 mb-1.5">Email (solo lectura)</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-ink-500 cursor-not-allowed outline-none"
              />
              <p className="text-xs text-ink-400 mt-1.5">El correo electrónico se usa para iniciar sesión y no se puede cambiar aquí.</p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <label className="block text-sm font-500 text-ink-700 mb-3">Color de perfil</label>
            <p className="text-xs text-ink-500 mb-4">Elige un color para personalizar tu avatar y apodo cuando no tengas foto de perfil.</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition ${color === null ? 'border-ink-900' : 'border-transparent hover:border-slate-300'} bg-slate-100 text-slate-500`}
                title="Color automático"
              >
                Auto
              </button>
              {USER_COLORS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  className={`w-10 h-10 rounded-full border-2 transition ${color === c.id ? 'border-ink-900' : 'border-transparent hover:scale-110'} ${c.bg}`}
                  title={`Color ${c.id}`}
                />
              ))}
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
    </div>
  )
}
