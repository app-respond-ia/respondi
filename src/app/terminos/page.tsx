import Link from 'next/link'

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header simple */}
      <header className="border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
            </div>
            <span className="font-display font-700 text-lg text-ink-900">Respondi</span>
          </div>
          <Link href="/" className="text-sm font-500 text-ink-500 hover:text-ink-900 transition">
            Volver al inicio
          </Link>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 lg:py-20 text-ink-700 leading-relaxed">
        <h1 className="text-3xl font-700 font-display text-ink-900 mb-4">Términos de Servicio de Respondi</h1>
        <p className="mb-8 text-ink-500 italic">Última actualización: [FECHA DE PUBLICACIÓN]</p>

        <p className="mb-6">Al crear una cuenta o usar Respondi, aceptas estos Términos de Servicio. Si no estás de acuerdo, no debes usar la plataforma.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">1. Qué es Respondi</h2>
        <p className="mb-4">Respondi es una plataforma que ayuda a negocios locales a atender a sus clientes en WhatsApp, Instagram y Facebook, combinando inteligencia artificial con la posibilidad de intervención humana.</p>
        <p className="mb-6">Estos Términos se aplican a cualquier persona u organización que cree una cuenta en Respondi ("el Cliente", "tú").</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">2. Quién puede contratar Respondi</h2>
        <p className="mb-4">Para crear una cuenta necesitas:</p>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>Tener capacidad legal para contratar en tu país.</li>
          <li>Proporcionar información veraz sobre tu negocio.</li>
          <li>Ser mayor de edad.</li>
        </ul>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">3. Tu cuenta</h2>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>Eres responsable de mantener la confidencialidad de tus credenciales de acceso.</li>
          <li>Eres responsable de las acciones realizadas desde tu cuenta y desde las cuentas de las personas que invites a tu organización.</li>
          <li>Debes notificarnos cuanto antes si detectas un uso no autorizado de tu cuenta.</li>
        </ul>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">4. Uso permitido de la plataforma</h2>
        <p className="mb-4">Puedes usar Respondi para atender a tus clientes a través de los canales que soporta la plataforma, dentro de los límites de tu plan contratado.</p>
        <p className="mb-4">No puedes usar Respondi para:</p>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>Enviar mensajes no solicitados (spam) o contenido engañoso.</li>
          <li>Suplantar la identidad de otra persona o negocio.</li>
          <li>Vulnerar la ley aplicable, incluidas las políticas de las plataformas de mensajería que integramos (WhatsApp, Instagram, Facebook).</li>
          <li>Intentar acceder a datos de otras organizaciones que usan Respondi, o realizar ingeniería inversa de la plataforma.</li>
          <li>Sobrecargar deliberadamente nuestros sistemas o interferir con su funcionamiento normal.</li>
        </ul>
        <p className="mb-6">El incumplimiento de estas condiciones puede suponer la suspensión o cancelación inmediata de tu cuenta.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">5. Planes, créditos y pagos</h2>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>El acceso a determinadas funciones (como el volumen de mensajes procesados por IA) depende del plan contratado.</li>
          <li>Los precios y condiciones de cada plan se muestran en la plataforma o se acuerdan por escrito.</li>
          <li>La facturación y el procesamiento de pagos son gestionados por Propulse System LLC en nombre de Respondi, a través de nuestro proveedor de pagos [Stripe, cuando esté activo]. No almacenamos tus datos de tarjeta directamente.</li>
          <li>[Política de reembolsos a definir]</li>
        </ul>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">6. El contenido y los datos son tuyos</h2>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>Los datos de tu negocio y las conversaciones con tus clientes te pertenecen a ti, no a nosotros.</li>
          <li>Usamos esos datos únicamente para prestarte el servicio, según se describe en nuestra Política de Privacidad.</li>
          <li>Puedes exportar o solicitar la eliminación de tus datos en cualquier momento, sujeto a las obligaciones legales de conservación que puedan aplicar.</li>
        </ul>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">7. Propiedad de la plataforma</h2>
        <p className="mb-6">Respondi, su código, diseño, marca y funcionalidades son propiedad de Atsura. Estos Términos no te otorgan ningún derecho sobre la plataforma más allá del uso descrito aquí.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">8. Disponibilidad del servicio</h2>
        <p className="mb-6">Nos esforzamos por mantener Respondi disponible de forma continua, pero no garantizamos un funcionamiento ininterrumpido. Puede haber interrupciones por mantenimiento, actualizaciones, o causas ajenas a nuestro control (por ejemplo, caídas de WhatsApp, Meta u otros proveedores externos de los que depende el servicio).</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">9. Limitación de responsabilidad</h2>
        <p className="mb-4">En la medida permitida por la ley:</p>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>Respondi se ofrece "tal cual", sin garantías de que las respuestas generadas por la inteligencia artificial sean siempre exactas o adecuadas para cada situación. Recomendamos supervisar las conversaciones gestionadas por la IA, especialmente en casos sensibles.</li>
          <li>No somos responsables de pérdidas indirectas, lucro cesante, o daños derivados del uso o la imposibilidad de uso de la plataforma, salvo en los casos en que la ley no permita limitar esta responsabilidad (por ejemplo, dolo o negligencia grave).</li>
          <li>Nuestra responsabilidad total frente a ti, en cualquier caso, se limita al importe pagado por el servicio en los 12 meses anteriores al hecho que la origine.</li>
        </ul>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">10. Indemnización</h2>
        <p className="mb-6">Aceptas mantenernos indemnes frente a reclamaciones de terceros derivadas de tu uso indebido de la plataforma o del incumplimiento de estos Términos.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">11. Cancelación</h2>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>Puedes cancelar tu cuenta en cualquier momento desde la plataforma o contactándonos.</li>
          <li>Podemos suspender o cancelar tu cuenta si incumples estos Términos, con notificación previa salvo en casos de uso fraudulento o riesgo de seguridad, en los que podemos actuar de forma inmediata.</li>
          <li>Tras la cancelación, tus datos se conservarán o eliminarán conforme a lo descrito en nuestra Política de Privacidad.</li>
        </ul>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">12. Ley aplicable y jurisdicción</h2>
        <p className="mb-6">Estos Términos se rigen por la ley española. Cualquier disputa se someterá a los juzgados y tribunales de [ciudad/provincia a definir], salvo que la normativa de protección al consumidor aplicable establezca otra cosa.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">13. Cambios en estos Términos</h2>
        <p className="mb-6">Podemos actualizar estos Términos cuando sea necesario. Si el cambio es significativo, te avisaremos con antelación razonable. El uso continuado de Respondi tras el cambio implica su aceptación.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">14. Contacto</h2>
        <p className="mb-6"><strong>legal@respondi.app</strong></p>
      </main>
    </div>
  )
}
