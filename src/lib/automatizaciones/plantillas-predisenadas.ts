// LAS PLANTILLAS DE WHATSAPP QUE VIENEN HECHAS, una por cada automatización
// que escribe al cliente.
//
// Por qué existen: pasadas 24 h desde el último mensaje del cliente (y quien
// compra en la web casi nunca te ha escrito antes), WhatsApp solo deja
// escribirle con una plantilla aprobada por Meta. Si el cliente la escribe
// él, se la pueden rechazar o puede meter lo que no toca. Así que la
// escribimos nosotros siguiendo las normas de Meta, y el cliente solo pulsa
// "Enviar a Meta para que la apruebe".
//
// Normas de Meta que se respetan aquí, para que las aprueben sin dramas:
//   · huecos numerados y seguidos ({{1}}, {{2}}...), nunca al final del texto
//   · pocos huecos para el largo del texto (si no, "floating parameters")
//   · un ejemplo por hueco (Meta los pide para revisar)
//   · categoría honesta: avisos de pedido = utilidad; carrito abandonado,
//     vuelve el stock, bajó de precio, cliente dormido, recompra, reseña y
//     cumpleaños = marketing (así lo clasifica Meta, aunque a nosotros nos
//     parezca un aviso). Las de marketing llevan "Responde BAJA" para que el
//     cliente pueda darse de baja.
//
// `huecos` dice qué dato va en cada {{n}}: los mismos nombres que en el texto
// de los ajustes (cliente, pedido, total, seguimiento, producto, enlace,
// codigo, descuento, dias, falta, negocio).

export interface PlantillaPredisenada {
  // Nombre en Meta (solo minúsculas, números y _). Llevan prefijo `respondi_`
  // para no chocar con las del cliente.
  nombre: string
  categoria: 'utilidad' | 'marketing'
  idioma: string
  cuerpo: string
  huecos: string[]
  ejemplos: string[]
}

export const PLANTILLAS_PREDISENADAS: Record<string, PlantillaPredisenada> = {
  pedido_confirmado: {
    nombre: 'respondi_pedido_confirmado',
    categoria: 'utilidad',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, hemos recibido tu pedido {{2}} por un total de {{3}}. Te avisaremos en cuanto salga. Gracias por tu compra.',
    huecos: ['cliente', 'pedido', 'total'],
    ejemplos: ['Laura', '#1042', '43,40 EUR']
  },
  pedido_enviado: {
    nombre: 'respondi_pedido_enviado',
    categoria: 'utilidad',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, tu pedido {{2}} ya está en camino. Puedes seguir el envío en este enlace: {{3}}. Gracias por tu compra.',
    huecos: ['cliente', 'pedido', 'seguimiento'],
    ejemplos: ['Laura', '#1042', 'https://seguimiento.correos.es/ABC123']
  },
  pedido_entregado: {
    nombre: 'respondi_pedido_entregado',
    categoria: 'utilidad',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, nos indican que tu pedido {{2}} ya ha sido entregado. Si hay cualquier problema con el paquete, responde a este mensaje y lo revisamos.',
    huecos: ['cliente', 'pedido'],
    ejemplos: ['Laura', '#1042']
  },
  pedido_retrasado: {
    nombre: 'respondi_pedido_retrasado',
    categoria: 'utilidad',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, tu pedido {{2}} está tardando más de lo previsto. Sentimos la espera: ya lo estamos revisando y te informaremos en cuanto sepamos algo.',
    huecos: ['cliente', 'pedido'],
    ejemplos: ['Laura', '#1042']
  },
  pedido_cancelado: {
    nombre: 'respondi_pedido_cancelado',
    categoria: 'utilidad',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, tu pedido {{2}} ha sido cancelado y el importe de {{3}} se devolverá a tu forma de pago. Según tu banco puede tardar unos días en aparecer.',
    huecos: ['cliente', 'pedido', 'total'],
    ejemplos: ['Laura', '#1042', '43,40 EUR']
  },
  confirmar_contrareembolso: {
    nombre: 'respondi_confirmar_contrareembolso',
    categoria: 'utilidad',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, tu pedido {{2}} por {{3}} se paga a la entrega. Para prepararlo necesitamos que nos lo confirmes respondiendo a este mensaje. Gracias.',
    huecos: ['cliente', 'pedido', 'total'],
    ejemplos: ['Laura', '#1042', '43,40 EUR']
  },
  falta_informacion_pedido: {
    nombre: 'respondi_falta_informacion',
    categoria: 'utilidad',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, para poder enviarte tu pedido {{2}} nos falta un dato: {{3}}. Nos lo puedes indicar respondiendo a este mensaje. Gracias.',
    huecos: ['cliente', 'pedido', 'falta'],
    ejemplos: ['Laura', '#1042', 'el número de piso']
  },
  carrito_abandonado: {
    nombre: 'respondi_carrito_guardado',
    categoria: 'marketing',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, hemos guardado tu carrito con {{2}}. Cuando quieras, puedes terminar tu compra en este enlace: {{3}}. Si necesitas ayuda, responde a este mensaje.',
    huecos: ['cliente', 'producto', 'enlace'],
    ejemplos: ['Laura', 'Tarta Sacher', 'https://mitienda.com/carrito/abc']
  },
  carrito_segundo_aviso: {
    nombre: 'respondi_carrito_descuento',
    categoria: 'marketing',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, tu carrito con {{2}} sigue disponible. Usa el código {{3}} para tener un descuento al terminar tu compra: {{4}}. Responde BAJA si no quieres más avisos.',
    huecos: ['cliente', 'producto', 'codigo', 'enlace'],
    ejemplos: ['Laura', 'Tarta Sacher', 'VUELVE10', 'https://mitienda.com/carrito/abc']
  },
  pago_iniciado_sin_terminar: {
    nombre: 'respondi_pago_sin_terminar',
    categoria: 'marketing',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, hemos visto que empezaste el pago de tu pedido y no llegó a completarse. Si ha habido algún problema, responde a este mensaje y te ayudamos.',
    huecos: ['cliente'],
    ejemplos: ['Laura']
  },
  aviso_vuelve_stock: {
    nombre: 'respondi_vuelve_stock',
    categoria: 'marketing',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, buenas noticias: {{2}} vuelve a estar disponible. Puedes verlo aquí: {{3}}. Responde BAJA si no quieres más avisos.',
    huecos: ['cliente', 'producto', 'enlace'],
    ejemplos: ['Laura', 'Tarta sin gluten', 'https://mitienda.com/productos/tarta-sin-gluten']
  },
  bajo_de_precio: {
    nombre: 'respondi_bajo_de_precio',
    categoria: 'marketing',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, el producto {{2}} por el que preguntaste ha bajado de precio. Puedes verlo aquí: {{3}}. Responde BAJA si no quieres más avisos.',
    huecos: ['cliente', 'producto', 'enlace'],
    ejemplos: ['Laura', 'Café en grano 1 kg', 'https://mitienda.com/productos/cafe-en-grano']
  },
  cliente_dormido: {
    nombre: 'respondi_te_echamos_de_menos',
    categoria: 'marketing',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, hace tiempo que no te vemos por {{2}} y tenemos novedades que te pueden gustar. Puedes verlas aquí: {{3}}. Responde BAJA si no quieres más avisos.',
    huecos: ['cliente', 'negocio', 'enlace'],
    ejemplos: ['Laura', 'Pastelería Sol', 'https://mitienda.com']
  },
  recompra: {
    nombre: 'respondi_recompra',
    categoria: 'marketing',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, puede que se te esté acabando {{2}}. Si quieres repetir tu pedido, puedes hacerlo aquí: {{3}}. Responde BAJA si no quieres más avisos.',
    huecos: ['cliente', 'producto', 'enlace'],
    ejemplos: ['Laura', 'Café en grano 1 kg', 'https://mitienda.com/productos/cafe-en-grano']
  },
  pedir_resena: {
    nombre: 'respondi_pedir_opinion',
    categoria: 'marketing',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, esperamos que estés disfrutando de {{2}}. Tu opinión nos ayuda mucho y puedes dejarla en este enlace: {{3}}. Muchas gracias.',
    huecos: ['cliente', 'producto', 'enlace'],
    ejemplos: ['Laura', 'Tarta Sacher', 'https://g.page/r/mitienda/review']
  },
  como_usarlo: {
    nombre: 'respondi_como_usarlo',
    categoria: 'utilidad',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, gracias por tu compra de {{2}}. Si tienes cualquier duda sobre cómo usarlo o cuidarlo, responde a este mensaje y te ayudamos encantados.',
    huecos: ['cliente', 'producto'],
    ejemplos: ['Laura', 'Tarta Sacher']
  },
  garantia_por_vencer: {
    nombre: 'respondi_garantia_por_vencer',
    categoria: 'utilidad',
    idioma: 'es',
    cuerpo: 'Hola {{1}}, la garantía de {{2}} termina en {{3}} días. Si has notado algún problema, responde a este mensaje y lo revisamos antes de que venza.',
    huecos: ['cliente', 'producto', 'dias'],
    ejemplos: ['Laura', 'Cafetera Moka', '30']
  },
  cumpleanos: {
    nombre: 'respondi_felicidades',
    categoria: 'marketing',
    idioma: 'es',
    cuerpo: 'Muchas felicidades, {{1}}. Para celebrarlo te regalamos un {{2}} de descuento con el código {{3}} en tu próxima compra. Responde BAJA si no quieres más avisos.',
    huecos: ['cliente', 'descuento', 'codigo'],
    ejemplos: ['Laura', '10%', 'FELIZ10']
  }
}

// Las automatizaciones cuya plantilla de Meta es de marketing: solo se escribe
// a quien haya aceptado promociones, lo diga el catálogo o no
export function esMarketingPorPlantilla(clave: string) {
  return PLANTILLAS_PREDISENADAS[clave]?.categoria === 'marketing'
}

// Cómo se ve la plantilla con los ejemplos puestos (para enseñarla en pantalla)
export function ejemploRelleno(p: PlantillaPredisenada) {
  return p.cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n) => p.ejemplos[Number(n) - 1] ?? `{{${n}}}`)
}
