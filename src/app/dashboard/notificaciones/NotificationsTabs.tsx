'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { marcarNotificacionLeida, marcarTodasLeidas, actualizarPreferencia } from '@/app/actions/notificaciones'

type Notification = {
  id: string
  tipo: string
  titulo: string
  cuerpo: string
  leida: boolean
  timestamp: string
  url?: string | null
}

type Preference = {
  id?: string
  tipo: string
  activado: boolean
}

const TIPOS_NOTIFICACIONES = [
  { id: 'ticket_nuevo_cliente', label: 'Nuevos tickets', desc: 'Cuando se abre un nuevo ticket de soporte de tus clientes.' },
  { id: 'respuesta_cliente', label: 'Respuestas de clientes', desc: 'Cuando un cliente responde a un ticket de soporte.' },
  { id: 'trial_por_vencer', label: 'Trial por vencer', desc: 'Cuando tu período de prueba está a punto de finalizar.' },
  { id: 'creditos_bajos', label: 'Créditos bajos', desc: 'Cuando tus créditos de IA están por agotarse.' },
  { id: 'cambio_plan_aplicado', label: 'Cambios de plan', desc: 'Cuando tu organización cambia de plan de suscripción.' },
  { id: 'pago_confirmado', label: 'Pagos confirmados', desc: 'Cuando se confirma la renovación o pago de tu suscripción.' },
  { id: 'cuenta_suspendida', label: 'Cuenta suspendida', desc: 'Cuando se suspende el acceso a tu cuenta.' },
  { id: 'cuenta_reactivada', label: 'Cuenta reactivada', desc: 'Cuando se restaura el acceso a tu cuenta.' },
]

export default function NotificationsTabs({
  initialNotifications,
  initialPreferences
}: {
  initialNotifications: Notification[]
  initialPreferences: Preference[]
}) {
  const [activeTab, setActiveTab] = useState<'lista' | 'preferencias'>('lista')
  const [notifications, setNotifications] = useState(initialNotifications)
  const [preferences, setPreferences] = useState(initialPreferences)
  const router = useRouter()

  const handleMarkAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n))
    await marcarNotificacionLeida(id)
  }

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.leida) {
      await handleMarkAsRead(notif.id)
    }
    if (notif.url) {
      router.push(notif.url)
    }
  }

  const handleMarkAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, leida: true })))
    await marcarTodasLeidas()
  }

  const handleTogglePref = async (tipo: string, currentVal: boolean) => {
    const newVal = !currentVal
    
    // Optimistic update
    setPreferences(prev => {
      const exists = prev.find(p => p.tipo === tipo)
      if (exists) {
        return prev.map(p => p.tipo === tipo ? { ...p, activado: newVal } : p)
      }
      return [...prev, { tipo, activado: newVal }]
    })

    await actualizarPreferencia(tipo, newVal)
  }

  const getPrefValue = (tipo: string) => {
    const pref = preferences.find(p => p.tipo === tipo)
    return pref ? pref.activado : true // Por defecto true
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
      <div className="flex border-b border-slate-200 bg-slate-50/50 px-2 pt-2">
        <button
          onClick={() => setActiveTab('lista')}
          className={`px-4 py-3 text-sm font-600 border-b-2 transition-colors ${activeTab === 'lista' ? 'border-brand-500 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-700'}`}
        >
          Todas las notificaciones
        </button>
        <button
          onClick={() => setActiveTab('preferencias')}
          className={`px-4 py-3 text-sm font-600 border-b-2 transition-colors ${activeTab === 'preferencias' ? 'border-brand-500 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-700'}`}
        >
          Preferencias
        </button>
      </div>

      <div className="flex-1 p-0">
        {activeTab === 'lista' && (
          <div className="flex flex-col h-full">
            <div className="flex justify-end p-4 border-b border-slate-100 bg-white sticky top-0 z-10">
              <button 
                onClick={handleMarkAllAsRead}
                disabled={!notifications.some(n => !n.leida)}
                className="text-sm font-500 text-brand-600 hover:text-brand-700 disabled:text-ink-400 disabled:cursor-not-allowed transition"
              >
                Marcar todas como leídas
              </button>
            </div>
            
            <div className="divide-y divide-slate-100">
              {notifications.length === 0 ? (
                <div className="p-12 text-center text-ink-500">
                  <svg className="w-12 h-12 mx-auto mb-4 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <p>No tienes notificaciones todavía.</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div 
                    key={notif.id} 
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-4 sm:px-6 flex gap-4 transition hover:bg-slate-50 ${!notif.leida ? 'bg-brand-50/20' : ''} ${notif.url ? 'cursor-pointer' : ''}`}
                  >
                    <div className="mt-1">
                      {notif.leida ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-brand-500 ring-4 ring-brand-100"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start gap-2">
                        <p className={`text-sm ${!notif.leida ? 'font-600 text-ink-900' : 'font-500 text-ink-700'}`}>
                          {notif.titulo}
                        </p>
                        <span className="text-[11px] text-ink-400 whitespace-nowrap">
                          {formatDistanceToNow(new Date(notif.timestamp), { addSuffix: true, locale: es })}
                        </span>
                      </div>
                      <p className="text-sm text-ink-600 mt-1">{notif.cuerpo}</p>
                      
                      {!notif.leida && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMarkAsRead(notif.id)
                          }}
                          className="text-xs font-500 text-brand-600 mt-2 hover:underline"
                        >
                          Marcar como leída
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'preferencias' && (
          <div className="p-6">
            <h3 className="text-base font-600 text-ink-900 mb-4 font-display">Ajustes de notificaciones</h3>
            <p className="text-sm text-ink-500 mb-6">Elige qué tipos de notificaciones deseas recibir en tu panel. Los cambios se guardan automáticamente.</p>
            
            <div className="space-y-4">
              {TIPOS_NOTIFICACIONES.map(tipo => {
                const activado = getPrefValue(tipo.id)
                
                return (
                  <div key={tipo.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white">
                    <div>
                      <p className="text-sm font-600 text-ink-900">{tipo.label}</p>
                      <p className="text-sm text-ink-500 mt-0.5">{tipo.desc}</p>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleTogglePref(tipo.id, activado)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${activado ? 'bg-brand-500' : 'bg-slate-200'}`}
                      role="switch"
                      aria-checked={activado}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${activado ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
