import { clasesEtiqueta } from '@/lib/etiquetas/colores'

// Una etiqueta de conversación con su color, igual en todas las pantallas
export function EtiquetaPill({ nombre, color, pequena = false }: { nombre: string; color?: string | null; pequena?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-md font-medium ${pequena ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1'} ${clasesEtiqueta(color)}`}>
      {nombre}
    </span>
  )
}
