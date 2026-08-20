'use client'

import { useRouter } from 'next/navigation'
import { salirDeImpersonacion } from '@/app/actions/superadmin'
import { useState } from 'react'
import Loading from './Loading'

export default function ImpersonationBanner({ orgName }: { orgName: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleSalir = async () => {
    setLoading(true)
    await salirDeImpersonacion()
    router.push('/superadmin/organizaciones')
  }

  return (
    <div className="fixed top-0 inset-x-0 z-[9999] bg-amber-500 text-white px-4 py-2 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span className="text-sm font-600">
          Estás viendo como: <span className="font-800">{orgName}</span>
        </span>
      </div>
      <button 
        onClick={handleSalir}
        disabled={loading}
        className="text-xs font-700 bg-black/20 hover:bg-black/30 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
      >
        {loading ? 'Saliendo...' : 'Salir de impersonación'}
      </button>
    </div>
  )
}
