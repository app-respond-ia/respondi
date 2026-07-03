import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export default async function VendedorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('rol, nombre')
    .eq('id', session.user.id)
    .single()

  if (!userData || userData.rol !== 'vendedor') redirect('/login')

  const nombreUsuario = userData.nombre || session.user.email || 'Vendedor'
  const iniciales = nombreUsuario.substring(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-slate-50 text-ink-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
            </div>
            <span className="font-display font-700 text-ink-900">Respondi</span>
            <span className="hidden sm:inline text-xs font-600 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-100">Panel vendedor</span>
          </div>

          {/* Nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {[
              { href: '/vendedor', label: 'Inicio' },
              { href: '/vendedor/clientes', label: 'Clientes' },
              { href: '/vendedor/comisiones', label: 'Comisiones' },
              { href: '/vendedor/nuevo-cliente', label: 'Nuevo cliente' },
            ].map(link => (
              <a key={link.href} href={link.href}
                className="px-3 py-1.5 rounded-lg text-sm font-500 text-ink-600 hover:bg-slate-100 hover:text-ink-900 transition">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-600 text-sm">
              {iniciales}
            </div>
          </div>
        </div>

        {/* Nav móvil */}
        <div className="sm:hidden border-t border-slate-100 overflow-x-auto">
          <div className="flex items-center gap-1 px-4 py-2">
            {[
              { href: '/vendedor', label: 'Inicio' },
              { href: '/vendedor/clientes', label: 'Clientes' },
              { href: '/vendedor/comisiones', label: 'Comisiones' },
              { href: '/vendedor/nuevo-cliente', label: 'Nuevo cliente' },
            ].map(link => (
              <a key={link.href} href={link.href}
                className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-500 text-ink-600 hover:bg-slate-100 transition whitespace-nowrap">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
