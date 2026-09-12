import type { Automatizacion } from './tipos'

// LAS 37 AUTOMATIZACIONES QUE VIENEN HECHAS.
//
// Todas nacen apagadas: el cliente enciende una a una las que quiera, y cada
// una tiene sus propios ajustes. Esto es solo la descripción (el "libro de
// recetas"); quien las ejecuta es el motor (motor.ts).
//
// Los huecos que se rellenan al enviar: {{cliente}} {{pedido}} {{total}}
// {{seguimiento}} {{producto}} {{enlace}} {{codigo}} {{negocio}} {{dias}}

export const AUTOMATIZACIONES: Automatizacion[] = [
  // =========================================================================
  // PEDIDOS Y ENVÍOS
  // =========================================================================
  {
    clave: 'donde_esta_mi_pedido',
    nombre: '¿Dónde está mi pedido?',
    descripcion: 'La IA contesta al momento con el estado real del pedido.',
    detalle: 'Cuando alguien pregunta por su pedido, la IA lo busca en tu tienda y le dice en qué punto está y cuándo llega. Antes de dar ningún dato comprueba que el pedido es suyo.',
    categoria: 'pedidos',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders', 'read_fulfillments'],
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'pedir_identificacion', etiqueta: 'Pedir que se identifique', tipo: 'interruptor', porDefecto: true, ayuda: 'Si escribe desde el mismo teléfono con el que compró, no hace falta.' }
    ],
    receta: {
      disparador: { tipo: 'mensaje_cliente', intencion: 'estado_pedido' },
      pasos: [{ tipo: 'ia_responde', instruccion: 'Busca el pedido del cliente y dile en qué estado está, con el enlace de seguimiento si ya salió.' }]
    }
  },
  {
    clave: 'pedido_confirmado',
    nombre: 'Pedido confirmado',
    descripcion: 'Un mensaje en cuanto te compran, con el resumen del pedido.',
    detalle: 'Nada más entrar el pedido, el cliente recibe un mensaje con el número, lo que ha pedido y el total. Da tranquilidad y corta de raíz el "¿me ha llegado el pedido?".',
    categoria: 'pedidos',
    estado: 'lista',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: '¡Gracias por tu compra, {{cliente}}! Hemos recibido tu pedido {{pedido}} por {{total}}. Te aviso en cuanto salga.', ayuda: 'Puedes usar {{cliente}}, {{pedido}} y {{total}}.' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'orders/create' },
      pasos: [{ tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }]
    }
  },
  {
    clave: 'pedido_enviado',
    nombre: 'Pedido enviado',
    descripcion: 'Aviso con el enlace de seguimiento en cuanto sale el paquete.',
    detalle: 'Cuando marcas el pedido como enviado en Shopify, el cliente recibe el número de seguimiento y el enlace del transportista.',
    categoria: 'pedidos',
    estado: 'lista',
    requiereTienda: true,
    permisos: ['read_orders', 'read_fulfillments'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: '¡Tu pedido {{pedido}} ya va en camino! Puedes seguirlo aquí: {{seguimiento}}' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'orders/fulfilled' },
      pasos: [{ tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }]
    }
  },
  {
    clave: 'pedido_entregado',
    nombre: 'Pedido entregado',
    descripcion: 'Comprobar que ha llegado bien.',
    detalle: 'Cuando el transportista marca el paquete como entregado, se le pregunta al cliente si está todo correcto. Si contesta que no, la IA abre un caso para tu equipo.',
    categoria: 'pedidos',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders', 'read_fulfillments'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'esperar_horas', etiqueta: 'Esperar antes de escribir', tipo: 'horas', porDefecto: 3, min: 0, max: 72 },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, me dicen que tu pedido {{pedido}} ya está entregado. ¿Ha llegado todo bien?' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'fulfillments/delivered' },
      pasos: [
        { tipo: 'esperar', ajuste: 'esperar_horas' },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },
  {
    clave: 'pedido_retrasado',
    nombre: 'Pedido retrasado',
    descripcion: 'Avisar tú antes de que el cliente se enfade.',
    detalle: 'Cada día se repasan los pedidos pagados que siguen sin salir pasados los días que tú digas. Al cliente se le avisa y se abre un caso para que alguien lo mire.',
    categoria: 'pedidos',
    estado: 'lista',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'dias', etiqueta: 'Días sin salir', tipo: 'dias', porDefecto: 3, min: 1, max: 30 },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, tu pedido {{pedido}} está tardando más de lo normal. Perdona la espera: ya lo estamos mirando y te cuento en cuanto sepa algo.' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'dia', hora: 9 },
      pasos: [
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' },
        { tipo: 'abrir_caso', asunto: 'Pedido {{pedido}} retrasado', prioridad: 'normal' }
      ]
    }
  },
  {
    clave: 'pedido_cancelado',
    nombre: 'Pedido cancelado o reembolsado',
    descripcion: 'Explicar la cancelación y cuándo vuelve el dinero.',
    detalle: 'Si cancelas o reembolsas un pedido en Shopify, el cliente recibe el aviso con los plazos habituales del banco. La IA nunca cancela ni reembolsa por su cuenta: solo avisa de lo que ya has hecho tú.',
    categoria: 'pedidos',
    estado: 'lista',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, tu pedido {{pedido}} se ha cancelado y el importe de {{total}} vuelve a tu cuenta. Según el banco puede tardar unos días en aparecer.' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'orders/cancelled' },
      pasos: [{ tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }]
    }
  },
  {
    clave: 'confirmar_contrareembolso',
    nombre: 'Confirmar pedido contra reembolso',
    descripcion: 'Pedir que confirme antes de preparar el paquete.',
    detalle: 'En los pedidos que se pagan al recibirlos, se le pide al cliente que confirme por el chat. Si no contesta en el plazo que pongas, se abre un caso para que lo llaméis antes de enviar nada.',
    categoria: 'pedidos',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, tu pedido {{pedido}} por {{total}} se paga al recibirlo. ¿Me lo confirmas para prepararlo?' },
      { clave: 'esperar_horas', etiqueta: 'Esperar respuesta', tipo: 'horas', porDefecto: 24, min: 1, max: 168 },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'orders/create' },
      condiciones: [{ campo: 'pedido.contrareembolso', operador: 'es_cierto' }],
      pasos: [
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' },
        { tipo: 'esperar', ajuste: 'esperar_horas' },
        { tipo: 'comprobar', condiciones: [{ campo: 'cliente.ha_contestado', operador: 'es_falso' }] },
        { tipo: 'abrir_caso', asunto: 'Contra reembolso sin confirmar: pedido {{pedido}}', prioridad: 'alta' }
      ]
    }
  },
  {
    clave: 'falta_informacion_pedido',
    nombre: 'Falta información del pedido',
    descripcion: 'Pedir el dato que falta antes de que sea un problema.',
    detalle: 'Si un pedido entra sin teléfono, sin número de piso o con la dirección incompleta, la IA lo pide por el chat y lo deja anotado en el caso.',
    categoria: 'pedidos',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, para poder enviarte el pedido {{pedido}} me falta un dato: {{falta}}. ¿Me lo pasas?' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'orders/create' },
      condiciones: [{ campo: 'pedido.falta_dato', operador: 'es_cierto' }],
      pasos: [
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' },
        { tipo: 'etiquetar', etiqueta: 'Falta información' }
      ]
    }
  },
  {
    clave: 'cambio_direccion',
    nombre: 'Cambio de dirección a tiempo',
    descripcion: 'Atender el cambio mientras aún se puede.',
    detalle: 'Si el cliente pide cambiar la dirección y el pedido todavía no ha salido, se abre un caso urgente y se avisa a tu equipo al momento. Si ya salió, la IA se lo explica y ofrece las opciones.',
    categoria: 'pedidos',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: false,
    marketing: false,
    campos: [],
    receta: {
      disparador: { tipo: 'mensaje_cliente', intencion: 'cambio_direccion' },
      pasos: [
        { tipo: 'comprobar', condiciones: [{ campo: 'pedido.enviado', operador: 'es_falso' }] },
        { tipo: 'abrir_caso', asunto: 'Cambio de dirección: pedido {{pedido}}', prioridad: 'alta' },
        { tipo: 'avisar_equipo', texto: 'Cambio de dirección pendiente en el pedido {{pedido}}: aún no ha salido.' }
      ]
    }
  },

  // =========================================================================
  // RECUPERAR VENTAS
  // =========================================================================
  {
    clave: 'carrito_abandonado',
    nombre: 'Carrito abandonado',
    descripcion: 'Recordar lo que se dejó a medias.',
    detalle: 'Cuando alguien llena el carrito y no termina de pagar, se le escribe pasado el rato que tú digas con lo que se dejó y el enlace para terminar.',
    categoria: 'recuperar',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'esperar_horas', etiqueta: 'Esperar antes de escribir', tipo: 'horas', porDefecto: 2, min: 1, max: 72 },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, veo que te quedó {{producto}} en el carrito. Si quieres, lo terminas aquí: {{enlace}}' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'hora' },
      pasos: [
        { tipo: 'esperar', ajuste: 'esperar_horas' },
        { tipo: 'comprobar', condiciones: [{ campo: 'carrito.comprado', operador: 'es_falso' }] },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },
  {
    clave: 'carrito_segundo_aviso',
    nombre: 'Segundo aviso con descuento',
    descripcion: 'Un último empujón con un código de descuento.',
    detalle: 'Si tras el primer recordatorio sigue sin comprar, se le manda un código de descuento hecho a su medida, que caduca. Es promoción: solo se manda a quien haya aceptado recibirlas.',
    categoria: 'recuperar',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders', 'write_discounts'],
    escribeAlCliente: true,
    marketing: true,
    campos: [
      { clave: 'esperar_horas', etiqueta: 'Esperar tras el primer aviso', tipo: 'horas', porDefecto: 22, min: 1, max: 168 },
      { clave: 'porcentaje', etiqueta: 'Descuento', tipo: 'numero', porDefecto: 10, min: 1, max: 50, sufijo: '%' },
      { clave: 'dias_validez', etiqueta: 'Días que vale el código', tipo: 'dias', porDefecto: 3, min: 1, max: 30 },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Te dejo un {{descuento}} para que lo termines: usa el código {{codigo}} antes de que caduque. {{enlace}}' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'evento_interno', evento: 'carrito_primer_aviso_enviado' },
      pasos: [
        { tipo: 'esperar', ajuste: 'esperar_horas' },
        { tipo: 'comprobar', condiciones: [{ campo: 'carrito.comprado', operador: 'es_falso' }, { campo: 'cliente.acepta_marketing', operador: 'es_cierto' }] },
        { tipo: 'crear_descuento', ajuste_porcentaje: 'porcentaje' },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },
  {
    clave: 'pago_iniciado_sin_terminar',
    nombre: 'Pago iniciado sin terminar',
    descripcion: 'Ofrecer ayuda a quien se atascó pagando.',
    detalle: 'Alguien que llega a la pantalla de pago y no termina suele tener un problema concreto (la tarjeta, los gastos de envío). Se le escribe enseguida para ayudarle, no para venderle.',
    categoria: 'recuperar',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'esperar_minutos', etiqueta: 'Esperar antes de escribir', tipo: 'numero', porDefecto: 30, min: 5, max: 240, sufijo: 'minutos' },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, ¿te ha dado problemas el pago? Si te puedo echar una mano, dime.' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'checkouts/update' },
      pasos: [
        { tipo: 'esperar', ajuste: 'esperar_minutos' },
        { tipo: 'comprobar', condiciones: [{ campo: 'carrito.comprado', operador: 'es_falso' }] },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },
  {
    clave: 'aviso_vuelve_stock',
    nombre: 'Te aviso cuando vuelva',
    descripcion: 'Apuntar a quien pregunta por algo agotado y avisarle al reponer.',
    detalle: 'Si alguien pregunta por un producto sin stock, la IA le ofrece avisarle. Cuando el producto vuelve a tener stock en Shopify, le llega el mensaje automáticamente.',
    categoria: 'recuperar',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_products', 'read_inventory'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: '¡Buenas noticias, {{cliente}}! Ya tenemos {{producto}} otra vez. {{enlace}}' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'hora' },
      pasos: [
        { tipo: 'comprobar', condiciones: [{ campo: 'producto.hay_stock', operador: 'es_cierto' }] },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },
  {
    clave: 'bajo_de_precio',
    nombre: 'Bajó de precio',
    descripcion: 'Avisar a quien preguntó por algo que ahora está más barato.',
    detalle: 'Se recuerda por qué productos ha preguntado cada cliente. Si bajan de precio en tu tienda, se le avisa. Es promoción: solo a quien la haya aceptado.',
    categoria: 'recuperar',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_products'],
    escribeAlCliente: true,
    marketing: true,
    campos: [
      { clave: 'bajada_minima', etiqueta: 'Bajada mínima para avisar', tipo: 'numero', porDefecto: 10, min: 1, max: 90, sufijo: '%' },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, {{producto}} por el que preguntaste ha bajado de precio. {{enlace}}' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'dia', hora: 10 },
      pasos: [
        { tipo: 'comprobar', condiciones: [{ campo: 'cliente.acepta_marketing', operador: 'es_cierto' }] },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },
  {
    clave: 'cliente_dormido',
    nombre: 'Cliente dormido',
    descripcion: 'Volver a por quien hace mucho que no compra.',
    detalle: 'Cada día se busca a los clientes que llevan sin comprar los días que tú digas y se les escribe. Es promoción: solo a quien la haya aceptado.',
    categoria: 'recuperar',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_customers', 'read_orders'],
    escribeAlCliente: true,
    marketing: true,
    campos: [
      { clave: 'dias', etiqueta: 'Días sin comprar', tipo: 'dias', porDefecto: 90, min: 15, max: 730 },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, hace tiempo que no te vemos por aquí. Si te apetece, échale un ojo a lo nuevo. {{enlace}}' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'dia', hora: 11 },
      pasos: [
        { tipo: 'comprobar', condiciones: [{ campo: 'cliente.acepta_marketing', operador: 'es_cierto' }] },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },
  {
    clave: 'recompra',
    nombre: 'Recompra o reposición',
    descripcion: 'Recordar justo cuando se le está acabando.',
    detalle: 'Para lo que se gasta (café, cremas, recambios), se calcula cuándo se le va a acabar y se le recuerda. Es promoción: solo a quien la haya aceptado.',
    categoria: 'recuperar',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders', 'read_products'],
    escribeAlCliente: true,
    marketing: true,
    campos: [
      { clave: 'dias', etiqueta: 'Días desde la compra', tipo: 'dias', porDefecto: 30, min: 7, max: 365 },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, ¿te va quedando poco de {{producto}}? Si quieres repetir, te lo dejo aquí: {{enlace}}' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'dia', hora: 11 },
      pasos: [
        { tipo: 'comprobar', condiciones: [{ campo: 'cliente.acepta_marketing', operador: 'es_cierto' }] },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },

  // =========================================================================
  // VENDER DESDE EL CHAT
  // =========================================================================
  {
    clave: 'venta_asistida',
    nombre: 'Venta asistida',
    descripcion: 'La IA busca en tu tienda y recomienda con precios y stock reales.',
    detalle: 'Cuando alguien pregunta por un producto, la IA lo busca en tu catálogo de Shopify: precio de hoy, si queda, y el enlace. Sin inventarse nada.',
    categoria: 'vender',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_products', 'read_inventory'],
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'mostrar_agotados', etiqueta: 'Enseñar también lo agotado', tipo: 'interruptor', porDefecto: false, ayuda: 'Útil si repones rápido; si no, mejor apagado.' }
    ],
    receta: {
      disparador: { tipo: 'mensaje_cliente', intencion: 'busca_producto' },
      pasos: [{ tipo: 'ia_responde', instruccion: 'Busca en la tienda lo que pide el cliente y recomiéndale con precio, disponibilidad y enlace.' }]
    }
  },
  {
    clave: 'carrito_por_la_ia',
    nombre: 'Carrito armado por la IA',
    descripcion: 'La IA prepara el pedido y manda el enlace para pagar.',
    detalle: 'Cuando el cliente ya sabe lo que quiere, la IA le prepara el carrito en tu tienda y le manda un enlace para que pague en dos toques. El pago siempre se hace en tu Shopify.',
    categoria: 'vender',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_products', 'write_draft_orders'],
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'importe_maximo', etiqueta: 'Importe máximo sin pasar por una persona', tipo: 'numero', porDefecto: 300, min: 0, max: 100000, ayuda: 'Por encima de esto, la IA avisa a tu equipo antes de mandar el enlace.' }
    ],
    receta: {
      disparador: { tipo: 'mensaje_cliente', intencion: 'quiere_comprar' },
      pasos: [{ tipo: 'enlace_compra' }]
    }
  },
  {
    clave: 'producto_relacionado',
    nombre: 'Producto relacionado',
    descripcion: 'Ofrecer lo que pega con lo que se lleva.',
    detalle: 'Al cerrar una venta o al hablar de un producto, la IA sugiere uno que lo acompaña. Es promoción: solo a quien la haya aceptado.',
    categoria: 'vender',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_products'],
    escribeAlCliente: false,
    marketing: true,
    campos: [
      { clave: 'maximo', etiqueta: 'Cuántos sugerir', tipo: 'numero', porDefecto: 1, min: 1, max: 3 }
    ],
    receta: {
      disparador: { tipo: 'mensaje_cliente', intencion: 'quiere_comprar' },
      pasos: [{ tipo: 'ia_responde', instruccion: 'Sugiere un producto que acompañe a lo que se lleva, sin insistir.' }]
    }
  },
  {
    clave: 'presupuesto_tienda',
    nombre: 'Presupuesto con precios de la tienda',
    descripcion: 'Presupuestos con los precios de Shopify, no con una lista aparte.',
    detalle: 'Cuando el cliente pide un presupuesto, la IA lo hace con los precios y las existencias de tu tienda, y lo deja escrito en la conversación.',
    categoria: 'vender',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_products'],
    escribeAlCliente: false,
    marketing: false,
    campos: [],
    receta: {
      disparador: { tipo: 'mensaje_cliente', intencion: 'pide_presupuesto' },
      pasos: [{ tipo: 'ia_responde', instruccion: 'Haz el presupuesto con los precios reales de la tienda.' }]
    }
  },
  {
    clave: 'reserva_lista_espera',
    nombre: 'Reserva o lista de espera',
    descripcion: 'Guardar la vez cuando no hay stock.',
    detalle: 'Si no queda producto, la IA apunta al cliente en la lista y abre un caso para que tu equipo lo tenga controlado al reponer.',
    categoria: 'vender',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_products', 'read_inventory'],
    escribeAlCliente: false,
    marketing: false,
    campos: [],
    receta: {
      disparador: { tipo: 'mensaje_cliente', intencion: 'quiere_comprar' },
      pasos: [
        { tipo: 'comprobar', condiciones: [{ campo: 'producto.hay_stock', operador: 'es_falso' }] },
        { tipo: 'etiquetar', etiqueta: 'Lista de espera' },
        { tipo: 'abrir_caso', asunto: 'Reserva de {{producto}}', prioridad: 'baja' }
      ]
    }
  },

  // =========================================================================
  // POSVENTA Y FIDELIZACIÓN
  // =========================================================================
  {
    clave: 'pedir_resena',
    nombre: 'Pedir reseña',
    descripcion: 'Pedir la opinión cuando ya lo ha disfrutado.',
    detalle: 'Unos días después de la entrega se le pide una reseña, con el enlace donde quieras recibirla. Es promoción: solo a quien la haya aceptado.',
    categoria: 'posventa',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: true,
    marketing: true,
    campos: [
      { clave: 'dias', etiqueta: 'Días tras la entrega', tipo: 'dias', porDefecto: 7, min: 1, max: 90 },
      { clave: 'enlace', etiqueta: 'Enlace para dejar la reseña', tipo: 'texto', porDefecto: '' },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, ¿qué tal con {{producto}}? Si te ha gustado, nos ayuda mucho tu opinión: {{enlace}}' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'fulfillments/delivered' },
      pasos: [
        { tipo: 'esperar', ajuste: 'dias' },
        { tipo: 'comprobar', condiciones: [{ campo: 'cliente.acepta_marketing', operador: 'es_cierto' }] },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },
  {
    clave: 'como_usarlo',
    nombre: 'Cómo usarlo y cuidados',
    descripcion: 'Enviar las instrucciones justo cuando le llega.',
    detalle: 'Al recibir el pedido, el cliente recibe los consejos de uso o cuidado de lo que ha comprado. Menos dudas, menos devoluciones.',
    categoria: 'posventa',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders', 'read_products'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'esperar_horas', etiqueta: 'Esperar tras la entrega', tipo: 'horas', porDefecto: 24, min: 0, max: 336 },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, aquí tienes cómo sacarle partido a {{producto}}. Si tienes cualquier duda, escríbeme.' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'fulfillments/delivered' },
      pasos: [
        { tipo: 'esperar', ajuste: 'esperar_horas' },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },
  {
    clave: 'garantia_por_vencer',
    nombre: 'Garantía por vencer',
    descripcion: 'Avisar antes de que se acabe la garantía.',
    detalle: 'Antes de que venza la garantía de lo que compró, se le avisa por si quiere revisarlo o ampliarla.',
    categoria: 'posventa',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: true,
    marketing: false,
    campos: [
      { clave: 'meses_garantia', etiqueta: 'Meses de garantía', tipo: 'numero', porDefecto: 24, min: 1, max: 120, sufijo: 'meses' },
      { clave: 'avisar_dias_antes', etiqueta: 'Avisar con antelación', tipo: 'dias', porDefecto: 30, min: 1, max: 180 },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: 'Hola {{cliente}}, la garantía de {{producto}} termina en {{dias}} días. Si algo no va bien, dímelo y lo miramos.' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'dia', hora: 10 },
      pasos: [{ tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }]
    }
  },
  {
    clave: 'cumpleanos',
    nombre: 'Cumpleaños o aniversario',
    descripcion: 'Felicitar con un detalle.',
    detalle: 'Felicita el cumpleaños, o el aniversario de su primera compra si no sabes la fecha de nacimiento, con un código de descuento. Es promoción: solo a quien la haya aceptado.',
    categoria: 'posventa',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_customers', 'write_discounts'],
    escribeAlCliente: true,
    marketing: true,
    campos: [
      { clave: 'porcentaje', etiqueta: 'Descuento', tipo: 'numero', porDefecto: 10, min: 1, max: 50, sufijo: '%' },
      { clave: 'dias_validez', etiqueta: 'Días que vale el código', tipo: 'dias', porDefecto: 15, min: 1, max: 90 },
      { clave: 'texto', etiqueta: 'Mensaje', tipo: 'texto_largo', porDefecto: '¡Felicidades, {{cliente}}! Te dejo un {{descuento}} de regalo con el código {{codigo}}.' },
      { clave: 'plantilla', etiqueta: 'Plantilla de WhatsApp', tipo: 'plantilla', porDefecto: null, ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sin ella, a esos clientes no se les escribe (por correo no hace falta). Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.' }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'dia', hora: 9 },
      pasos: [
        { tipo: 'comprobar', condiciones: [{ campo: 'cliente.acepta_marketing', operador: 'es_cierto' }] },
        { tipo: 'crear_descuento', ajuste_porcentaje: 'porcentaje' },
        { tipo: 'mensaje', texto: '', ajuste_texto: 'texto', plantilla: 'plantilla' }
      ]
    }
  },
  {
    clave: 'cliente_vip',
    nombre: 'Cliente VIP',
    descripcion: 'Reconocer a quien más te compra.',
    detalle: 'Cuando un cliente pasa del número de compras o del gasto que tú marques, se le etiqueta como VIP en Shopify, se avisa a tu equipo y la IA le trata acorde.',
    categoria: 'posventa',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_customers', 'read_orders'],
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'compras_minimas', etiqueta: 'Compras para ser VIP', tipo: 'numero', porDefecto: 5, min: 2, max: 100 },
      { clave: 'gasto_minimo', etiqueta: 'O gasto total', tipo: 'numero', porDefecto: 500, min: 0, max: 100000 },
      { clave: 'etiqueta', etiqueta: 'Etiqueta en Shopify', tipo: 'texto', porDefecto: 'VIP' }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'orders/create' },
      pasos: [
        { tipo: 'comprobar', condiciones: [{ campo: 'cliente.compras', operador: 'mayor', ajuste: 'compras_minimas' }] },
        { tipo: 'etiquetar_en_tienda', etiqueta: 'VIP' },
        { tipo: 'etiquetar', etiqueta: 'VIP' },
        { tipo: 'avisar_equipo', texto: '{{cliente}} ya es cliente VIP.' }
      ]
    }
  },

  // =========================================================================
  // DEVOLUCIONES E INCIDENCIAS
  // =========================================================================
  {
    clave: 'devolucion_guiada',
    nombre: 'Devolución guiada',
    descripcion: 'La IA explica cómo se devuelve y recoge los datos.',
    detalle: 'La IA cuenta tu política de devoluciones (la de tu Shopify), comprueba si el pedido está en plazo, recoge el motivo y abre el caso. El reembolso lo hace siempre una persona.',
    categoria: 'devoluciones',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders', 'read_content'],
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'dias_plazo', etiqueta: 'Días para devolver', tipo: 'dias', porDefecto: 14, min: 1, max: 365 }
    ],
    receta: {
      disparador: { tipo: 'mensaje_cliente', intencion: 'devolucion' },
      pasos: [
        { tipo: 'ia_responde', instruccion: 'Explica la política de devoluciones y pide el motivo y el número de pedido.' },
        { tipo: 'etiquetar', etiqueta: 'Devolución' },
        { tipo: 'abrir_caso', asunto: 'Devolución del pedido {{pedido}}', prioridad: 'normal' }
      ]
    }
  },
  {
    clave: 'producto_danado',
    nombre: 'Producto dañado o equivocado',
    descripcion: 'Pedir la foto y pasarlo a una persona, rápido.',
    detalle: 'Si llega roto o no es lo que pidió, la IA pide una foto, la guarda en el caso y avisa a tu equipo con prioridad alta.',
    categoria: 'devoluciones',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'pedir_foto', etiqueta: 'Pedir foto', tipo: 'interruptor', porDefecto: true }
    ],
    receta: {
      disparador: { tipo: 'mensaje_cliente', intencion: 'producto_danado' },
      pasos: [
        { tipo: 'ia_responde', instruccion: 'Discúlpate, pide una foto de lo que ha llegado y dile que lo pasas a una persona ahora mismo.' },
        { tipo: 'etiquetar', etiqueta: 'Incidencia' },
        { tipo: 'abrir_caso', asunto: 'Producto dañado o equivocado: pedido {{pedido}}', prioridad: 'alta' },
        { tipo: 'avisar_equipo', texto: 'Incidencia con el pedido {{pedido}}: producto dañado o equivocado.' }
      ]
    }
  },
  {
    clave: 'reclamacion',
    nombre: 'Reclamación',
    descripcion: 'Que una queja no se quede en el chat.',
    detalle: 'Cuando la IA detecta una queja seria, para de contestar, etiqueta la conversación y avisa a una persona de tu equipo.',
    categoria: 'devoluciones',
    estado: 'en_camino',
    requiereTienda: false,
    escribeAlCliente: false,
    marketing: false,
    campos: [],
    receta: {
      disparador: { tipo: 'mensaje_cliente', intencion: 'reclamacion' },
      pasos: [
        { tipo: 'etiquetar', etiqueta: 'Reclamación' },
        { tipo: 'abrir_caso', asunto: 'Reclamación de {{cliente}}', prioridad: 'alta' },
        { tipo: 'avisar_equipo', texto: 'Reclamación de {{cliente}}: la IA ha dejado de contestar y espera a una persona.' }
      ]
    }
  },

  // =========================================================================
  // PARA TU EQUIPO
  // =========================================================================
  {
    clave: 'aviso_pedido_grande',
    nombre: 'Aviso de pedido grande',
    descripcion: 'Que no se te escape un pedido importante.',
    detalle: 'Cuando entra un pedido por encima del importe que marques, tu equipo recibe un aviso en Respondi.',
    categoria: 'equipo',
    estado: 'lista',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'importe', etiqueta: 'A partir de', tipo: 'numero', porDefecto: 300, min: 1, max: 1000000 }
    ],
    receta: {
      disparador: { tipo: 'evento_tienda', evento: 'orders/create' },
      pasos: [
        { tipo: 'comprobar', condiciones: [{ campo: 'pedido.total', operador: 'mayor', ajuste: 'importe' }] },
        { tipo: 'avisar_equipo', texto: 'Pedido grande: {{pedido}} por {{total}} de {{cliente}}.' }
      ]
    }
  },
  {
    clave: 'aviso_stock_bajo',
    nombre: 'Aviso de stock bajo',
    descripcion: 'Enterarte antes de quedarte sin producto.',
    detalle: 'Cada día se repasa el stock de tu tienda y se avisa a tu equipo de lo que está por debajo del mínimo que pongas.',
    categoria: 'equipo',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_products', 'read_inventory'],
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'minimo', etiqueta: 'Avisar por debajo de', tipo: 'numero', porDefecto: 3, min: 0, max: 1000, sufijo: 'unidades' },
      { clave: 'hora', etiqueta: 'Hora del aviso', tipo: 'hora', porDefecto: 9 }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'dia', hora: 9 },
      pasos: [{ tipo: 'avisar_equipo', texto: 'Stock bajo: {{producto}}.' }]
    }
  },
  {
    clave: 'resumen_diario',
    nombre: 'Resumen diario',
    descripcion: 'Un resumen del día, sin entrar a mirar.',
    detalle: 'A la hora que elijas, tu equipo recibe un resumen: pedidos, ventas, conversaciones atendidas por la IA y lo que quedó pendiente.',
    categoria: 'equipo',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders'],
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'hora', etiqueta: 'Hora del resumen', tipo: 'hora', porDefecto: 20 }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'dia', hora: 20 },
      pasos: [{ tipo: 'avisar_equipo', texto: 'Resumen del día.' }]
    }
  },
  {
    clave: 'cliente_esperando',
    nombre: 'Cliente esperando',
    descripcion: 'Avisar si alguien lleva rato sin respuesta.',
    detalle: 'Si una conversación con un cliente que ha comprado lleva sin contestar más de los minutos que pongas, tu equipo recibe un aviso.',
    categoria: 'equipo',
    estado: 'en_camino',
    requiereTienda: false,
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'minutos', etiqueta: 'Minutos sin respuesta', tipo: 'numero', porDefecto: 15, min: 1, max: 600, sufijo: 'minutos' }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'hora' },
      pasos: [{ tipo: 'avisar_equipo', texto: '{{cliente}} lleva esperando respuesta.' }]
    }
  },

  // =========================================================================
  // MANTENIMIENTO (no manda mensajes a nadie)
  // =========================================================================
  {
    clave: 'importar_catalogo',
    nombre: 'Importar el catálogo',
    descripcion: 'Traer tus productos de Shopify a la lista de precios.',
    detalle: 'Cada día se traen los productos, precios y existencias de tu tienda a la lista de precios de Respondi, para que la IA los tenga a mano al instante. No cambia nada en Shopify.',
    categoria: 'mantenimiento',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_products', 'read_inventory'],
    escribeAlCliente: false,
    marketing: false,
    campos: [
      { clave: 'solo_activos', etiqueta: 'Solo productos publicados', tipo: 'interruptor', porDefecto: true },
      { clave: 'hora', etiqueta: 'Hora de la importación', tipo: 'hora', porDefecto: 4 }
    ],
    receta: {
      disparador: { tipo: 'programado', cada: 'dia', hora: 4 },
      pasos: [{ tipo: 'importar_catalogo' }]
    }
  },
  {
    clave: 'importar_politicas',
    nombre: 'Importar las políticas de la tienda',
    descripcion: 'Que la IA conozca tus políticas de envío y devolución.',
    detalle: 'Se traen las políticas que tienes escritas en Shopify (envíos, devoluciones, privacidad) y se añaden a las normas que consulta la IA antes de contestar.',
    categoria: 'mantenimiento',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_content'],
    escribeAlCliente: false,
    marketing: false,
    campos: [],
    receta: {
      disparador: { tipo: 'programado', cada: 'semana' },
      pasos: [{ tipo: 'importar_politicas' }]
    }
  },
  {
    clave: 'etiquetar_clientes_shopify',
    nombre: 'Etiquetar clientes en Shopify',
    descripcion: 'Llevar a Shopify lo que se aprende en el chat.',
    detalle: 'Cuando la IA etiqueta una conversación (interesado en X, cliente difícil, VIP...), esa etiqueta se pone también en la ficha del cliente en Shopify.',
    categoria: 'mantenimiento',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_customers'],
    escribeAlCliente: false,
    marketing: false,
    campos: [],
    receta: {
      disparador: { tipo: 'evento_interno', evento: 'conversacion_etiquetada' },
      pasos: [{ tipo: 'etiquetar_en_tienda', etiqueta: '{{etiqueta}}' }]
    }
  },
  {
    clave: 'etiquetar_conversaciones',
    nombre: 'Etiquetar conversaciones con datos de la tienda',
    descripcion: 'Marcar quién ha comprado y quién no.',
    detalle: 'Al entrar un mensaje, se mira si esa persona tiene pedidos en tu tienda y se etiqueta la conversación (cliente nuevo, cliente que repite, pedido en curso).',
    categoria: 'mantenimiento',
    estado: 'en_camino',
    requiereTienda: true,
    permisos: ['read_orders', 'read_customers'],
    escribeAlCliente: false,
    marketing: false,
    campos: [],
    receta: {
      disparador: { tipo: 'evento_interno', evento: 'mensaje_entrante' },
      pasos: [{ tipo: 'etiquetar', etiqueta: '{{etiqueta}}' }]
    }
  }
]

export function automatizacionPorClave(clave: string) {
  return AUTOMATIZACIONES.find(a => a.clave === clave) || null
}

export function automatizacionesDeCategoria(categoria: string) {
  return AUTOMATIZACIONES.filter(a => a.categoria === categoria)
}
