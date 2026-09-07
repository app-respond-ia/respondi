import Link from 'next/link'

export default function PrivacidadPage() {
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
        <h1 className="text-3xl font-700 font-display text-ink-900 mb-4">Política de Privacidad de Respondi</h1>
        <p className="mb-8 text-ink-500 italic">Última actualización: [FECHA DE PUBLICACIÓN]</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">Resumen rápido</h2>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>Recogemos los datos necesarios para que Respondi funcione: datos de la cuenta del negocio que nos contrata, y el contenido de los mensajes que sus clientes le envían por WhatsApp, Instagram o Facebook.</li>
          <li>Usamos inteligencia artificial para generar respuestas automáticas a esos mensajes.</li>
          <li>No vendemos datos a nadie, ni los usamos para publicidad.</li>
          <li>Compartimos datos solo con los proveedores estrictamente necesarios para que el servicio funcione (alojamiento, IA, mensajería, correo, pagos).</li>
          <li>Puedes pedirnos acceder a tus datos, corregirlos o borrarlos en cualquier momento.</li>
        </ul>
        <p className="mb-6">El resto de este documento explica todo esto con más detalle.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">1. Quiénes somos</h2>
        <p className="mb-4">Respondi es una plataforma de atención al cliente con inteligencia artificial, dirigida a negocios locales (restaurantes, hostelería y comercios similares).</p>
        <p className="mb-4">El responsable del tratamiento de los datos descritos en esta política es:</p>
        <p className="mb-4"><strong>Atsura</strong><br/>
        [Forma jurídica de Atsura — ej. S.L.]<br/>
        [Dirección fiscal completa]<br/>
        [NIF/CIF]</p>
        <p className="mb-6">Para cualquier duda sobre esta política, puedes escribirnos a <strong>privacidad@respondi.app</strong>.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">2. A quién se aplica esta política</h2>
        <p className="mb-4">Distinguimos dos perfiles distintos:</p>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li><strong>Los negocios que contratan Respondi</strong> y las personas que trabajan en ellos (propietarios, administradores, agentes).</li>
          <li><strong>Los clientes de esos negocios</strong>: las personas que escriben por WhatsApp, Instagram o Facebook y cuyos mensajes son atendidos con ayuda de nuestra IA.</li>
        </ul>
        <p className="mb-6">Si eres cliente de un negocio que usa Respondi, ese negocio es quien decide cómo y para qué se usan tus datos dentro de la plataforma (es el responsable principal frente a ti). Te recomendamos dirigirte primero a él. Aun así, puedes contactarnos directamente si lo prefieres.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">3. Qué datos recogemos</h2>
        
        <h3 className="text-xl font-600 font-display text-ink-900 mt-8 mb-3">3.1 De los negocios que contratan Respondi</h3>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li><strong>Datos de identidad y contacto</strong>: nombre, email, teléfono, foto de perfil, rol dentro de la organización.</li>
          <li><strong>Datos del negocio</strong>: nombre comercial, dirección, sucursales, horarios, catálogo de productos o servicios, políticas internas del negocio.</li>
          <li><strong>Datos de facturación</strong>: forma de pago, historial de consumo y créditos (cuando el sistema de pago esté activo).</li>
          <li><strong>Registros de actividad</strong>: acciones realizadas dentro de la plataforma, con fines de seguridad y soporte.</li>
        </ul>

        <h3 className="text-xl font-600 font-display text-ink-900 mt-8 mb-3">3.2 De las personas que escriben a un negocio que usa Respondi</h3>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li><strong>Identificador de contacto</strong>: tu número de WhatsApp o tu usuario de Instagram, según el canal.</li>
          <li><strong>Nombre visible</strong>: el nombre que muestres en ese canal, si está disponible.</li>
          <li><strong>Contenido de la conversación</strong>: texto, imágenes y notas de voz que envíes, cuando el negocio los reciba a través de Respondi.</li>
          <li><strong>Metadatos de la conversación</strong>: fecha, hora, y si fue atendida por la IA o por una persona del negocio.</li>
        </ul>

        <h3 className="text-xl font-600 font-display text-ink-900 mt-8 mb-3">3.3 Datos técnicos</h3>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li><strong>Datos de acceso</strong>: direcciones IP y datos básicos de conexión a la plataforma, con fines de seguridad.</li>
        </ul>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">4. Para qué usamos estos datos, y con qué base legal</h2>
        <div className="overflow-x-auto mb-6">
          <table className="min-w-full border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-4 py-3 text-left font-600 text-ink-900">Finalidad</th>
                <th className="border border-slate-300 px-4 py-3 text-left font-600 text-ink-900">Base legal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Prestar el servicio de atención automatizada contratado por el negocio</td>
                <td className="border border-slate-300 px-4 py-3">Ejecución del contrato con el negocio cliente</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Generar respuestas automáticas mediante inteligencia artificial</td>
                <td className="border border-slate-300 px-4 py-3">Ejecución del contrato / interés legítimo</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Gestionar cuentas, facturación y soporte técnico</td>
                <td className="border border-slate-300 px-4 py-3">Ejecución del contrato</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Prevenir fraude, abuso o mal uso de la plataforma</td>
                <td className="border border-slate-300 px-4 py-3">Interés legítimo</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Cumplir obligaciones legales (fiscales, contables)</td>
                <td className="border border-slate-300 px-4 py-3">Obligación legal</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Comunicaciones sobre cambios importantes del servicio</td>
                <td className="border border-slate-300 px-4 py-3">Interés legítimo</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mb-6">No usamos los datos de las personas que escriben a los negocios para elaborar perfiles publicitarios, ni los vendemos ni cedemos a terceros con fines comerciales.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">5. Con quién compartimos los datos</h2>
        <p className="mb-4">Trabajamos con proveedores externos que actúan como encargados del tratamiento, cada uno con acceso limitado a lo estrictamente necesario para su función:</p>
        <div className="overflow-x-auto mb-6">
          <table className="min-w-full border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-4 py-3 text-left font-600 text-ink-900">Categoría de proveedor</th>
                <th className="border border-slate-300 px-4 py-3 text-left font-600 text-ink-900">Para qué lo usamos</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Proveedor de inteligencia artificial</td>
                <td className="border border-slate-300 px-4 py-3">Procesa el contenido de los mensajes para generar las respuestas automáticas</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Canales de mensajería (WhatsApp, Instagram, Facebook)</td>
                <td className="border border-slate-300 px-4 py-3">Por donde llegan y se envían los mensajes</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Proveedores de alojamiento y base de datos</td>
                <td className="border border-slate-300 px-4 py-3">Almacenan la información de forma segura</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Proveedor de envío de correo electrónico</td>
                <td className="border border-slate-300 px-4 py-3">Correos transaccionales, como invitaciones o avisos</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Herramientas internas de automatización</td>
                <td className="border border-slate-300 px-4 py-3">Enrutan los mensajes entre los distintos canales</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-4 py-3">Proveedor de pagos <em>(cuando esté activo)</em></td>
                <td className="border border-slate-300 px-4 py-3">Procesa los cobros de tu suscripción</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mb-6">Ninguno de estos proveedores puede usar los datos para sus propios fines; solo los tratan siguiendo nuestras instrucciones. Si necesitas el listado detallado de proveedores concretos (por ejemplo, para un acuerdo de tratamiento de datos como cliente empresarial), puedes solicitarlo escribiendo a <strong>privacidad@respondi.app</strong>.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">6. Dónde se almacenan los datos y transferencias internacionales</h2>
        <p className="mb-4">Los datos se almacenan en servidores ubicados en la Unión Europea (Irlanda), a través de nuestros proveedores de infraestructura.</p>
        <p className="mb-4">Cuando prestamos servicio a negocios fuera de la Unión Europea, o cuando un dato se transfiere a un proveedor situado fuera de la UE (como nuestro proveedor de inteligencia artificial o los canales de mensajería, ambos con sede en EE. UU.), nos aseguramos de que existan garantías legales adecuadas para esa transferencia — como las Cláusulas Contractuales Tipo de la Comisión Europea.</p>
        <p className="mb-6">Si resides en un país con normativa propia de protección de datos, esta puede otorgarte derechos adicionales a los descritos aquí; en ese caso, esos derechos adicionales también se aplican.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">7. Cuánto tiempo conservamos los datos</h2>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>Los mensajes y conversaciones se conservan durante el periodo definido en el plan contratado por cada negocio, tras el cual se eliminan o anonimizan.</li>
          <li>Los datos de la cuenta se conservan mientras esté activa, y el tiempo adicional que exija la ley tras la baja (por ejemplo, para obligaciones fiscales).</li>
          <li>Los registros de seguridad se conservan durante [periodo a definir, ej. 12 meses].</li>
        </ul>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">8. Tus derechos</h2>
        <p className="mb-4">Tienes derecho a:</p>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li><strong>Acceder</strong> a los datos que tenemos sobre ti.</li>
          <li><strong>Rectificar</strong> datos incorrectos o incompletos.</li>
          <li><strong>Solicitar la eliminación</strong> de tus datos, cuando proceda.</li>
          <li><strong>Oponerte</strong> al tratamiento o <strong>solicitar que se limite</strong>.</li>
          <li><strong>Solicitar la portabilidad</strong> de tus datos a otro proveedor.</li>
        </ul>
        <p className="mb-4">Puedes ejercer estos derechos escribiendo a <strong>privacidad@respondi.app</strong>. Si eres cliente de un negocio que usa Respondi, te recomendamos contactar primero con ese negocio.</p>
        <p className="mb-6">También tienes derecho a presentar una reclamación ante la autoridad de protección de datos que corresponda (en España, la Agencia Española de Protección de Datos).</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">9. Seguridad</h2>
        <ul className="list-disc pl-6 mb-6 space-y-2">
          <li>Cifrado de las conexiones (HTTPS) entre tu navegador y nuestros servidores.</li>
          <li>Aislamiento estricto por organización: cada negocio solo puede acceder a sus propios datos, nunca a los de otro negocio de la plataforma.</li>
          <li>Registros de auditoría de las acciones realizadas dentro de cada cuenta.</li>
          <li>Acceso interno limitado por rol, incluso para nuestro propio personal.</li>
        </ul>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">10. Menores de edad</h2>
        <p className="mb-6">Respondi no está dirigido a menores de edad. No recogemos conscientemente datos de menores al crear cuentas de negocio. Si detectas que un menor ha facilitado datos personales a través de la plataforma, contáctanos para eliminarlos.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">11. Cambios en esta política</h2>
        <p className="mb-6">Podemos actualizar esta política cuando cambien nuestras prácticas o la normativa aplicable. Cuando lo hagamos, indicaremos en esta misma página qué ha cambiado, no solo la fecha de la actualización. Si el cambio es significativo, avisaremos a los negocios clientes con antelación razonable.</p>

        <h2 className="text-2xl font-700 font-display text-ink-900 mt-10 mb-4">12. Contacto</h2>
        <p className="mb-6"><strong>privacidad@respondi.app</strong></p>
      </main>
    </div>
  )
}
