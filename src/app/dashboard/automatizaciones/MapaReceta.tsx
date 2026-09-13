'use client'

import type { ReactNode } from 'react'

// EL MAPA DE UNA AUTOMATIZACIÓN (14-09-2026).
//
// La misma receta que ya enseña la lista, pero dibujada: cajas y flechas, de
// arriba abajo. No es un editor: es para entender de un vistazo qué pasa y en
// qué orden, que es lo que cuesta leer en una lista larga.
//
// Sin librerías de diagramas. Una receta de Respondi es una fila de pasos en
// orden, así que basta con cajas apiladas y flechas entre ellas. Lo único que
// se sale de la fila es "comprobar", que puede cortar: se dibuja como una
// bifurcación con la salida de "si no, aquí se para".

export interface PasoMapa {
  tipo: string
  titulo: string
  detalle?: string
  indice?: number
}

const ESTILOS: Record<string, { caja: string; punto: string; etiqueta: string; icono: ReactNode }> = {
  disparador: {
    caja: 'border-brand-300 bg-brand-50',
    punto: 'bg-brand-600',
    etiqueta: 'Cuándo empieza',
    icono: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  },
  condicion: {
    caja: 'border-amber-300 bg-amber-50',
    punto: 'bg-amber-500',
    etiqueta: 'Solo si',
    icono: <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  },
  comprobar: {
    caja: 'border-amber-300 bg-amber-50',
    punto: 'bg-amber-500',
    etiqueta: 'Comprueba',
    icono: <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  },
  esperar: {
    caja: 'border-slate-200 bg-slate-50',
    punto: 'bg-slate-400',
    etiqueta: 'Espera',
    icono: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  },
  mensaje: {
    caja: 'border-emerald-300 bg-emerald-50',
    punto: 'bg-emerald-500',
    etiqueta: 'Escribe al cliente',
    icono: <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  },
  ia_responde: {
    caja: 'border-emerald-300 bg-emerald-50',
    punto: 'bg-emerald-500',
    etiqueta: 'Contesta la IA',
    icono: <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  },
  abrir_caso: {
    caja: 'border-sky-300 bg-sky-50',
    punto: 'bg-sky-500',
    etiqueta: 'Abre un caso',
    icono: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  },
  avisar_equipo: {
    caja: 'border-sky-300 bg-sky-50',
    punto: 'bg-sky-500',
    etiqueta: 'Avisa al equipo',
    icono: <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1h6z" />
  },
  etiquetar: {
    caja: 'border-violet-300 bg-violet-50',
    punto: 'bg-violet-500',
    etiqueta: 'Etiqueta',
    icono: <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 10V5a2 2 0 012-2z" />
  }
}

function estiloDe(tipo: string) {
  return ESTILOS[tipo] || {
    caja: 'border-slate-200 bg-white',
    punto: 'bg-slate-400',
    etiqueta: 'Hace',
    icono: <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  }
}

function Flecha({ nota }: { nota?: string }) {
  return (
    <div className="flex flex-col items-center py-1" aria-hidden="true">
      <div className="w-px h-4 bg-slate-300" />
      {nota && <span className="text-[10px] text-ink-400 bg-white px-1.5 py-0.5 rounded-full border border-slate-200 my-0.5">{nota}</span>}
      <svg className="w-3 h-3 text-slate-300 -mt-0.5" fill="currentColor" viewBox="0 0 12 12"><path d="M6 9L1 3h10z" /></svg>
    </div>
  )
}

export default function MapaReceta({ pasos }: { pasos: PasoMapa[] }) {
  if (!pasos?.length) return null

  return (
    <div className="overflow-x-auto">
      <ol className="flex flex-col items-stretch max-w-md min-w-[260px] mx-auto sm:mx-0">
        {pasos.map((p, i) => {
          const e = estiloDe(p.tipo)
          const corta = p.tipo === 'comprobar'
          const esUltimo = i === pasos.length - 1
          // Un "esperar" no es una caja: es lo que tarda la flecha siguiente
          if (p.tipo === 'esperar' && !esUltimo) {
            return <li key={i}><Flecha nota={p.titulo} /></li>
          }
          return (
            <li key={i}>
              <div className={`rounded-xl border px-3.5 py-2.5 ${e.caja}`}>
                <div className="flex items-start gap-2.5">
                  <span className={`w-6 h-6 rounded-lg ${e.punto} text-white flex items-center justify-center shrink-0 mt-0.5`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">{e.icono}</svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-ink-400 font-700">{e.etiqueta}</p>
                    <p className="text-sm text-ink-800 break-words">{p.titulo}</p>
                    {p.detalle && <p className="text-xs text-ink-500 mt-1 italic break-words">«{p.detalle}»</p>}
                  </div>
                </div>
              </div>

              {/* Comprobar puede cortar: se ve la salida de "si no se cumple" */}
              {corta && (
                <div className="flex items-stretch gap-3 pl-6 py-1">
                  <div className="w-px bg-slate-300" />
                  <span className="text-[11px] text-ink-400 self-center">si no se cumple, aquí se para</span>
                </div>
              )}

              {!esUltimo && <Flecha nota={corta ? 'si se cumple' : undefined} />}
            </li>
          )
        })}

        <li>
          <Flecha />
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-center">
            <p className="text-xs text-ink-400">Fin</p>
          </div>
        </li>
      </ol>
    </div>
  )
}
