'use client'
import React, { useState } from 'react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { HelpPopover } from '@/components/ui/HelpPopover'

interface AIToggleProps {
  isPaused: boolean;
  onToggleConfirm: (newPausedState: boolean) => Promise<boolean>;
  disabled?: boolean;
}

export function AIToggle({ isPaused, onToggleConfirm, disabled }: AIToggleProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [procesando, setProcesando] = useState(false)

  const handleConfirm = async () => {
    setProcesando(true)
    const success = await onToggleConfirm(!isPaused)
    setProcesando(false)
    if (success) {
      setModalOpen(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="text-right">
        <div className="flex items-center gap-1.5 justify-end">
          <p className="text-[11px] sm:text-xs font-600 text-ink-900 leading-tight">
            <span className="sm:hidden">{isPaused ? 'Pausada' : 'Activa'}</span>
            <span className="hidden sm:inline">{isPaused ? 'IA en pausa' : 'IA activa'}</span>
          </p>
          <div className="hidden sm:block">
            <HelpPopover content="Indica si la IA responde automáticamente al cliente (Activa) o si está silenciada para que un humano intervenga manualmente (Pausada)." />
          </div>
        </div>
      </div>
      <button 
        onClick={() => setModalOpen(true)} 
        disabled={disabled || procesando} 
        className={`relative w-11 h-6 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed ${isPaused ? 'bg-amber-500' : 'bg-brand-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isPaused ? 'translate-x-0' : 'translate-x-5'}`}></span>
      </button>

      <ConfirmModal
        isOpen={modalOpen}
        onClose={() => !procesando && setModalOpen(false)}
        onConfirm={handleConfirm}
        title={isPaused ? '¿Reanudar la IA?' : '¿Pausar la IA?'}
        message={isPaused ? 'La IA volverá a analizar y responder automáticamente los próximos mensajes de este cliente.' : 'La IA dejará de responder automáticamente a este cliente, permitiéndote tomar el control manual de la conversación.'}
        confirmText={isPaused ? 'Sí, reanudar IA' : 'Sí, pausar IA'}
        type="info"
        isLoading={procesando}
      />
    </div>
  )
}
