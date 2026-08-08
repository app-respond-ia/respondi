import React from 'react'
import { HelpPopover } from './HelpPopover'

interface ActivityLogProps {
  logs: any[]
}

export function ActivityLog({ logs }: ActivityLogProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
        Actividad
        <HelpPopover content="Registro interno de acciones para trazabilidad. Solo visible para admins o usuarios con permisos de auditoría." />
      </h3>
      <div className="space-y-4 max-h-[22rem] overflow-y-auto pr-1">
        {logs.length > 0 ? logs.map((log: any) => {
          const esCaso = log.tabla_afectada === 'cases'
          return (
            <div key={log.id} className="flex gap-3">
              <div className="w-1.5 rounded-full shrink-0 bg-slate-200 mt-1.5 mb-1"></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-xs font-semibold text-ink-900 truncate">
                    {log.users?.nombre || 'Sistema'}
                  </p>
                  {esCaso && (
                    <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-sm">Caso</span>
                  )}
                </div>
                <p className="text-sm text-slate-600 leading-snug">
                  {log.accion}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {new Date(log.timestamp).toLocaleDateString()} a las {new Date(log.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                </p>
              </div>
            </div>
          )
        }) : (
          <p className="text-sm text-slate-500">No hay actividad reciente registrada.</p>
        )}
      </div>
    </div>
  )
}
