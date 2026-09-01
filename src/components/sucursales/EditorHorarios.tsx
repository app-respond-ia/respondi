'use client'

import React, { useState } from 'react'
import { DIAS_SEMANA } from '@/lib/dias-semana'

interface Franja {
  apertura: string
  cierre: string
  orden: number
}

interface HorarioDia {
  dia_semana: number
  cerrado: boolean
  franjas: Franja[]
}

interface EditorHorariosProps {
  horarios: HorarioDia[]
  onChange: (horarios: HorarioDia[]) => void
  nivelPermiso: 'lectura' | 'escritura'
}

export function EditorHorarios({ horarios, onChange, nivelPermiso }: EditorHorariosProps) {
  const [copyPopoverOpen, setCopyPopoverOpen] = useState<number | null>(null)
  const [copyTargets, setCopyTargets] = useState<number[]>([])

  const handleToggleCerrado = (diaId: number, cerrado: boolean) => {
    onChange(horarios.map(h =>
      h.dia_semana === diaId ? { ...h, cerrado } : h
    ))
  }

  const handleChangeFranja = (diaId: number, idx: number, field: 'apertura' | 'cierre', value: string) => {
    onChange(horarios.map(h => {
      if (h.dia_semana !== diaId) return h
      const franjas = [...h.franjas]
      franjas[idx] = { ...franjas[idx], [field]: value }
      return { ...h, franjas }
    }))
  }

  const handleAddFranja = (diaId: number) => {
    onChange(horarios.map(h => {
      if (h.dia_semana !== diaId) return h
      const franjas = [...h.franjas, { apertura: '09:00', cierre: '18:00', orden: h.franjas.length }]
      return { ...h, franjas }
    }))
  }

  const handleRemoveFranja = (diaId: number, idx: number) => {
    onChange(horarios.map(h => {
      if (h.dia_semana !== diaId) return h
      const franjas = h.franjas.filter((_: any, i: number) => i !== idx)
      return { ...h, franjas: franjas.length > 0 ? franjas : [{ apertura: '09:00', cierre: '18:00', orden: 0 }] }
    }))
  }

  const applyCopyHorario = (sourceDiaId: number) => {
    const source = horarios.find(h => h.dia_semana === sourceDiaId)
    if (!source || !source.franjas || source.franjas.length === 0) return
    onChange(horarios.map(h => {
      if (!copyTargets.includes(h.dia_semana)) return h
      return {
        ...h,
        cerrado: false,
        franjas: source.franjas.map((f, i) => ({ apertura: f.apertura, cierre: f.cierre, orden: i }))
      }
    }))
    setCopyPopoverOpen(null)
    setCopyTargets([])
  }

  return (
    <div className="divide-y divide-slate-100">
      {horarios.map(h => {
        const diaObj = DIAS_SEMANA.find(d => d.id === h.dia_semana)
        return (
          <div key={h.dia_semana} className={`p-4 sm:p-5 transition ${h.cerrado ? 'bg-slate-50' : 'bg-white'}`}>
            {/* Fila de cabecera del día */}
            <div className="flex items-center gap-4 mb-3">
              <label className="flex items-center gap-3 cursor-pointer min-w-[130px]">
                <div className="relative flex items-center justify-center w-6 h-6">
                  <input
                    type="checkbox"
                    checked={!h.cerrado}
                    onChange={e => handleToggleCerrado(h.dia_semana, !e.target.checked)}
                    disabled={nivelPermiso !== 'escritura'}
                    className="peer sr-only"
                  />
                  <div className="w-6 h-6 border-2 border-slate-300 rounded bg-white peer-checked:bg-brand-600 peer-checked:border-brand-600 transition"></div>
                  <svg className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                </div>
                <span className={`font-semibold text-sm ${h.cerrado ? 'text-slate-400' : 'text-ink-900'}`}>{diaObj?.label}</span>
              </label>
              {h.cerrado && <span className="text-xs text-slate-400 font-500">Cerrado</span>}
            </div>
  
            {/* Franjas horarias */}
            {!h.cerrado && (
              <div className="ml-9 space-y-2">
                {h.franjas.map((franja, idx) => (
                  <div key={idx} className="flex items-center gap-2 flex-wrap">
                    <input
                      type="time"
                      value={franja.apertura ? franja.apertura.substring(0, 5) : ''}
                      onChange={e => handleChangeFranja(h.dia_semana, idx, 'apertura', e.target.value)}
                      disabled={nivelPermiso !== 'escritura'}
                      className="w-32 h-10 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none disabled:bg-slate-100 disabled:text-slate-400 text-sm font-medium"
                    />
                    <span className="text-slate-400 text-sm">a</span>
                    <input
                      type="time"
                      value={franja.cierre ? franja.cierre.substring(0, 5) : ''}
                      onChange={e => handleChangeFranja(h.dia_semana, idx, 'cierre', e.target.value)}
                      disabled={nivelPermiso !== 'escritura'}
                      className="w-32 h-10 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none disabled:bg-slate-100 disabled:text-slate-400 text-sm font-medium"
                    />
                    {nivelPermiso === 'escritura' && h.franjas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFranja(h.dia_semana, idx)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                        aria-label="Eliminar franja"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    )}
                  </div>
                ))}
                {nivelPermiso === 'escritura' && (
                  <button
                    type="button"
                    onClick={() => handleAddFranja(h.dia_semana)}
                    className="flex items-center gap-1.5 text-xs font-600 text-brand-600 hover:text-brand-700 transition mt-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                    Añadir franja
                  </button>
                )}
                {nivelPermiso === 'escritura' && (
                  <div className="relative pt-1">
                    <button type="button" onClick={() => {
                      setCopyPopoverOpen(copyPopoverOpen === h.dia_semana ? null : h.dia_semana)
                      setCopyTargets([])
                    }} className="text-xs font-semibold text-ink-500 hover:text-ink-700 transition flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                      Copiar a...
                    </button>
  
                    {copyPopoverOpen === h.dia_semana && (
                      <div className="absolute z-10 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 p-3">
                        <p className="text-xs font-semibold text-ink-700 mb-2">Copiar horario de {DIAS_SEMANA.find(d => d.id === h.dia_semana)?.label} a:</p>
                        <div className="space-y-1.5 mb-3">
                          {horarios.map(otherDay => otherDay.dia_semana !== h.dia_semana && (
                            <label key={otherDay.dia_semana} className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                              <input type="checkbox"
                                checked={copyTargets.includes(otherDay.dia_semana)}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setCopyTargets(prev => [...prev, otherDay.dia_semana])
                                  } else {
                                    setCopyTargets(prev => prev.filter(id => id !== otherDay.dia_semana))
                                  }
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                              {DIAS_SEMANA.find(d => d.id === otherDay.dia_semana)?.label}
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { setCopyPopoverOpen(null); setCopyTargets([]) }}
                            className="flex-1 h-8 rounded-lg text-xs font-600 text-ink-600 hover:bg-slate-100 transition">
                            Cancelar
                          </button>
                          <button type="button" onClick={() => applyCopyHorario(h.dia_semana)}
                            disabled={copyTargets.length === 0}
                            className="flex-1 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-600 transition">
                            Aplicar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
