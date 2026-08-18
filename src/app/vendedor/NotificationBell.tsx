'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { marcarNotificacionLeida } from '@/app/actions/notificaciones'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

type Notification = {
  id: string
  tipo: string
  titulo: string
  cuerpo: string
  leida: boolean
  timestamp: string
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const unreadCount = notifications.filter(n => !n.leida).length

  useEffect(() => {
    // 1. Cargar inicial
    const fetchInitial = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(10)
      
      if (data) setNotifications(data)
    }
    fetchInitial()

    // 2. Suscribirse a Realtime
    const channel = supabase
      .channel('notificaciones-vendedor')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev].slice(0, 10))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new as Notification : n))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.leida) {
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, leida: true } : n))
      await marcarNotificacionLeida(notif.id)
    }
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-8 h-8 rounded-full flex items-center justify-center text-ink-500 hover:bg-slate-100 hover:text-ink-700 transition focus:outline-none"
        aria-label="Notificaciones"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold leading-none text-white bg-rose-500 rounded-full border-2 border-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-30 flex flex-col max-h-[400px]">
          <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-sm font-700 text-ink-900 font-display">Notificaciones</h3>
          </div>
          
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-ink-500 text-sm">
                No tienes notificaciones
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifications.map(notif => (
                  <button
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`w-full text-left px-4 py-3 transition hover:bg-slate-50 ${!notif.leida ? 'bg-brand-50/30' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className={`text-sm ${!notif.leida ? 'font-600 text-ink-900' : 'font-500 text-ink-700'}`}>
                        {notif.titulo}
                      </p>
                      {!notif.leida && <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0"></span>}
                    </div>
                    <p className="text-xs text-ink-500 line-clamp-2">{notif.cuerpo}</p>
                    <p className="text-[10px] text-ink-400 mt-1">
                      {formatDistanceToNow(new Date(notif.timestamp), { addSuffix: true, locale: es })}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-2 px-2 pb-1 shrink-0">
            <Link 
              href="/vendedor/notificaciones" 
              onClick={() => setIsOpen(false)}
              className="block w-full text-center px-4 py-2 text-sm text-brand-600 font-500 hover:bg-brand-50 rounded-lg transition"
            >
              Ver todas las notificaciones
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
