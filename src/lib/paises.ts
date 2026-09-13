// Todos los países del mundo con su bandera y su prefijo telefónico, en
// español y ordenados por nombre. Sirve en el navegador y en el servidor.
//
// Decidido con Jorge (13-09-2026): el país de la sucursal y el prefijo del
// teléfono de un cliente son cosas distintas. El prefijo se pide siempre, en
// un campo aparte del número, y nunca se adivina por el país del negocio.

export interface Pais {
  codigo: string   // ISO 3166-1 alfa-2
  nombre: string
  bandera: string
  prefijo: string  // con el "+"
}

const LISTA: [string, string, string, string][] = [
  ['AF', 'Afganistán', '🇦🇫', '+93'],
  ['AL', 'Albania', '🇦🇱', '+355'],
  ['DE', 'Alemania', '🇩🇪', '+49'],
  ['AD', 'Andorra', '🇦🇩', '+376'],
  ['AO', 'Angola', '🇦🇴', '+244'],
  ['AI', 'Anguila', '🇦🇮', '+1'],
  ['AG', 'Antigua y Barbuda', '🇦🇬', '+1'],
  ['SA', 'Arabia Saudita', '🇸🇦', '+966'],
  ['DZ', 'Argelia', '🇩🇿', '+213'],
  ['AR', 'Argentina', '🇦🇷', '+54'],
  ['AM', 'Armenia', '🇦🇲', '+374'],
  ['AW', 'Aruba', '🇦🇼', '+297'],
  ['AU', 'Australia', '🇦🇺', '+61'],
  ['AT', 'Austria', '🇦🇹', '+43'],
  ['AZ', 'Azerbaiyán', '🇦🇿', '+994'],
  ['BS', 'Bahamas', '🇧🇸', '+1'],
  ['BD', 'Bangladés', '🇧🇩', '+880'],
  ['BB', 'Barbados', '🇧🇧', '+1'],
  ['BH', 'Baréin', '🇧🇭', '+973'],
  ['BE', 'Bélgica', '🇧🇪', '+32'],
  ['BZ', 'Belice', '🇧🇿', '+501'],
  ['BJ', 'Benín', '🇧🇯', '+229'],
  ['BM', 'Bermudas', '🇧🇲', '+1'],
  ['BY', 'Bielorrusia', '🇧🇾', '+375'],
  ['BO', 'Bolivia', '🇧🇴', '+591'],
  ['BQ', 'Bonaire', '🇧🇶', '+599'],
  ['BA', 'Bosnia y Herzegovina', '🇧🇦', '+387'],
  ['BW', 'Botsuana', '🇧🇼', '+267'],
  ['BR', 'Brasil', '🇧🇷', '+55'],
  ['BN', 'Brunéi', '🇧🇳', '+673'],
  ['BG', 'Bulgaria', '🇧🇬', '+359'],
  ['BF', 'Burkina Faso', '🇧🇫', '+226'],
  ['BI', 'Burundi', '🇧🇮', '+257'],
  ['BT', 'Bután', '🇧🇹', '+975'],
  ['CV', 'Cabo Verde', '🇨🇻', '+238'],
  ['KH', 'Camboya', '🇰🇭', '+855'],
  ['CM', 'Camerún', '🇨🇲', '+237'],
  ['CA', 'Canadá', '🇨🇦', '+1'],
  ['QA', 'Catar', '🇶🇦', '+974'],
  ['TD', 'Chad', '🇹🇩', '+235'],
  ['CZ', 'Chequia', '🇨🇿', '+420'],
  ['CL', 'Chile', '🇨🇱', '+56'],
  ['CN', 'China', '🇨🇳', '+86'],
  ['CY', 'Chipre', '🇨🇾', '+357'],
  ['CO', 'Colombia', '🇨🇴', '+57'],
  ['KM', 'Comoras', '🇰🇲', '+269'],
  ['KP', 'Corea del Norte', '🇰🇵', '+850'],
  ['KR', 'Corea del Sur', '🇰🇷', '+82'],
  ['CI', 'Costa de Marfil', '🇨🇮', '+225'],
  ['CR', 'Costa Rica', '🇨🇷', '+506'],
  ['HR', 'Croacia', '🇭🇷', '+385'],
  ['CU', 'Cuba', '🇨🇺', '+53'],
  ['CW', 'Curazao', '🇨🇼', '+599'],
  ['DK', 'Dinamarca', '🇩🇰', '+45'],
  ['DM', 'Dominica', '🇩🇲', '+1'],
  ['EC', 'Ecuador', '🇪🇨', '+593'],
  ['EG', 'Egipto', '🇪🇬', '+20'],
  ['SV', 'El Salvador', '🇸🇻', '+503'],
  ['AE', 'Emiratos Árabes Unidos', '🇦🇪', '+971'],
  ['ER', 'Eritrea', '🇪🇷', '+291'],
  ['SK', 'Eslovaquia', '🇸🇰', '+421'],
  ['SI', 'Eslovenia', '🇸🇮', '+386'],
  ['ES', 'España', '🇪🇸', '+34'],
  ['US', 'Estados Unidos', '🇺🇸', '+1'],
  ['EE', 'Estonia', '🇪🇪', '+372'],
  ['SZ', 'Esuatini', '🇸🇿', '+268'],
  ['ET', 'Etiopía', '🇪🇹', '+251'],
  ['PH', 'Filipinas', '🇵🇭', '+63'],
  ['FI', 'Finlandia', '🇫🇮', '+358'],
  ['FJ', 'Fiyi', '🇫🇯', '+679'],
  ['FR', 'Francia', '🇫🇷', '+33'],
  ['GA', 'Gabón', '🇬🇦', '+241'],
  ['GM', 'Gambia', '🇬🇲', '+220'],
  ['GE', 'Georgia', '🇬🇪', '+995'],
  ['GH', 'Ghana', '🇬🇭', '+233'],
  ['GI', 'Gibraltar', '🇬🇮', '+350'],
  ['GD', 'Granada', '🇬🇩', '+1'],
  ['GR', 'Grecia', '🇬🇷', '+30'],
  ['GL', 'Groenlandia', '🇬🇱', '+299'],
  ['GP', 'Guadalupe', '🇬🇵', '+590'],
  ['GU', 'Guam', '🇬🇺', '+1'],
  ['GT', 'Guatemala', '🇬🇹', '+502'],
  ['GF', 'Guayana Francesa', '🇬🇫', '+594'],
  ['GG', 'Guernsey', '🇬🇬', '+44'],
  ['GN', 'Guinea', '🇬🇳', '+224'],
  ['GQ', 'Guinea Ecuatorial', '🇬🇶', '+240'],
  ['GW', 'Guinea-Bisáu', '🇬🇼', '+245'],
  ['GY', 'Guyana', '🇬🇾', '+592'],
  ['HT', 'Haití', '🇭🇹', '+509'],
  ['HN', 'Honduras', '🇭🇳', '+504'],
  ['HK', 'Hong Kong', '🇭🇰', '+852'],
  ['HU', 'Hungría', '🇭🇺', '+36'],
  ['IN', 'India', '🇮🇳', '+91'],
  ['ID', 'Indonesia', '🇮🇩', '+62'],
  ['IQ', 'Irak', '🇮🇶', '+964'],
  ['IR', 'Irán', '🇮🇷', '+98'],
  ['IE', 'Irlanda', '🇮🇪', '+353'],
  ['IM', 'Isla de Man', '🇮🇲', '+44'],
  ['CX', 'Isla de Navidad', '🇨🇽', '+61'],
  ['NF', 'Isla Norfolk', '🇳🇫', '+672'],
  ['IS', 'Islandia', '🇮🇸', '+354'],
  ['AX', 'Islas Åland', '🇦🇽', '+358'],
  ['KY', 'Islas Caimán', '🇰🇾', '+1'],
  ['CC', 'Islas Cocos', '🇨🇨', '+61'],
  ['CK', 'Islas Cook', '🇨🇰', '+682'],
  ['FO', 'Islas Feroe', '🇫🇴', '+298'],
  ['FK', 'Islas Malvinas', '🇫🇰', '+500'],
  ['MP', 'Islas Marianas del Norte', '🇲🇵', '+1'],
  ['MH', 'Islas Marshall', '🇲🇭', '+692'],
  ['SB', 'Islas Salomón', '🇸🇧', '+677'],
  ['TC', 'Islas Turcas y Caicos', '🇹🇨', '+1'],
  ['VG', 'Islas Vírgenes Británicas', '🇻🇬', '+1'],
  ['VI', 'Islas Vírgenes de EE. UU.', '🇻🇮', '+1'],
  ['IL', 'Israel', '🇮🇱', '+972'],
  ['IT', 'Italia', '🇮🇹', '+39'],
  ['JM', 'Jamaica', '🇯🇲', '+1'],
  ['JP', 'Japón', '🇯🇵', '+81'],
  ['JE', 'Jersey', '🇯🇪', '+44'],
  ['JO', 'Jordania', '🇯🇴', '+962'],
  ['KZ', 'Kazajistán', '🇰🇿', '+7'],
  ['KE', 'Kenia', '🇰🇪', '+254'],
  ['KG', 'Kirguistán', '🇰🇬', '+996'],
  ['KI', 'Kiribati', '🇰🇮', '+686'],
  ['XK', 'Kosovo', '🇽🇰', '+383'],
  ['KW', 'Kuwait', '🇰🇼', '+965'],
  ['LA', 'Laos', '🇱🇦', '+856'],
  ['LS', 'Lesoto', '🇱🇸', '+266'],
  ['LV', 'Letonia', '🇱🇻', '+371'],
  ['LB', 'Líbano', '🇱🇧', '+961'],
  ['LR', 'Liberia', '🇱🇷', '+231'],
  ['LY', 'Libia', '🇱🇾', '+218'],
  ['LI', 'Liechtenstein', '🇱🇮', '+423'],
  ['LT', 'Lituania', '🇱🇹', '+370'],
  ['LU', 'Luxemburgo', '🇱🇺', '+352'],
  ['MO', 'Macao', '🇲🇴', '+853'],
  ['MK', 'Macedonia del Norte', '🇲🇰', '+389'],
  ['MG', 'Madagascar', '🇲🇬', '+261'],
  ['MY', 'Malasia', '🇲🇾', '+60'],
  ['MW', 'Malaui', '🇲🇼', '+265'],
  ['MV', 'Maldivas', '🇲🇻', '+960'],
  ['ML', 'Malí', '🇲🇱', '+223'],
  ['MT', 'Malta', '🇲🇹', '+356'],
  ['MA', 'Marruecos', '🇲🇦', '+212'],
  ['MQ', 'Martinica', '🇲🇶', '+596'],
  ['MU', 'Mauricio', '🇲🇺', '+230'],
  ['MR', 'Mauritania', '🇲🇷', '+222'],
  ['YT', 'Mayotte', '🇾🇹', '+262'],
  ['MX', 'México', '🇲🇽', '+52'],
  ['FM', 'Micronesia', '🇫🇲', '+691'],
  ['MD', 'Moldavia', '🇲🇩', '+373'],
  ['MC', 'Mónaco', '🇲🇨', '+377'],
  ['MN', 'Mongolia', '🇲🇳', '+976'],
  ['ME', 'Montenegro', '🇲🇪', '+382'],
  ['MS', 'Montserrat', '🇲🇸', '+1'],
  ['MZ', 'Mozambique', '🇲🇿', '+258'],
  ['MM', 'Myanmar', '🇲🇲', '+95'],
  ['NA', 'Namibia', '🇳🇦', '+264'],
  ['NR', 'Nauru', '🇳🇷', '+674'],
  ['NP', 'Nepal', '🇳🇵', '+977'],
  ['NI', 'Nicaragua', '🇳🇮', '+505'],
  ['NE', 'Níger', '🇳🇪', '+227'],
  ['NG', 'Nigeria', '🇳🇬', '+234'],
  ['NU', 'Niue', '🇳🇺', '+683'],
  ['NO', 'Noruega', '🇳🇴', '+47'],
  ['NC', 'Nueva Caledonia', '🇳🇨', '+687'],
  ['NZ', 'Nueva Zelanda', '🇳🇿', '+64'],
  ['OM', 'Omán', '🇴🇲', '+968'],
  ['NL', 'Países Bajos', '🇳🇱', '+31'],
  ['PK', 'Pakistán', '🇵🇰', '+92'],
  ['PW', 'Palaos', '🇵🇼', '+680'],
  ['PS', 'Palestina', '🇵🇸', '+970'],
  ['PA', 'Panamá', '🇵🇦', '+507'],
  ['PG', 'Papúa Nueva Guinea', '🇵🇬', '+675'],
  ['PY', 'Paraguay', '🇵🇾', '+595'],
  ['PE', 'Perú', '🇵🇪', '+51'],
  ['PF', 'Polinesia Francesa', '🇵🇫', '+689'],
  ['PL', 'Polonia', '🇵🇱', '+48'],
  ['PT', 'Portugal', '🇵🇹', '+351'],
  ['PR', 'Puerto Rico', '🇵🇷', '+1'],
  ['GB', 'Reino Unido', '🇬🇧', '+44'],
  ['CF', 'República Centroafricana', '🇨🇫', '+236'],
  ['CG', 'República del Congo', '🇨🇬', '+242'],
  ['CD', 'República Democrática del Congo', '🇨🇩', '+243'],
  ['DO', 'República Dominicana', '🇩🇴', '+1'],
  ['RE', 'Reunión', '🇷🇪', '+262'],
  ['RW', 'Ruanda', '🇷🇼', '+250'],
  ['RO', 'Rumanía', '🇷🇴', '+40'],
  ['RU', 'Rusia', '🇷🇺', '+7'],
  ['EH', 'Sáhara Occidental', '🇪🇭', '+212'],
  ['WS', 'Samoa', '🇼🇸', '+685'],
  ['AS', 'Samoa Americana', '🇦🇸', '+1'],
  ['BL', 'San Bartolomé', '🇧🇱', '+590'],
  ['KN', 'San Cristóbal y Nieves', '🇰🇳', '+1'],
  ['SM', 'San Marino', '🇸🇲', '+378'],
  ['MF', 'San Martín', '🇲🇫', '+590'],
  ['PM', 'San Pedro y Miquelón', '🇵🇲', '+508'],
  ['VC', 'San Vicente y las Granadinas', '🇻🇨', '+1'],
  ['SH', 'Santa Elena', '🇸🇭', '+290'],
  ['LC', 'Santa Lucía', '🇱🇨', '+1'],
  ['ST', 'Santo Tomé y Príncipe', '🇸🇹', '+239'],
  ['SN', 'Senegal', '🇸🇳', '+221'],
  ['RS', 'Serbia', '🇷🇸', '+381'],
  ['SC', 'Seychelles', '🇸🇨', '+248'],
  ['SL', 'Sierra Leona', '🇸🇱', '+232'],
  ['SG', 'Singapur', '🇸🇬', '+65'],
  ['SX', 'Sint Maarten', '🇸🇽', '+1'],
  ['SY', 'Siria', '🇸🇾', '+963'],
  ['SO', 'Somalia', '🇸🇴', '+252'],
  ['LK', 'Sri Lanka', '🇱🇰', '+94'],
  ['ZA', 'Sudáfrica', '🇿🇦', '+27'],
  ['SD', 'Sudán', '🇸🇩', '+249'],
  ['SS', 'Sudán del Sur', '🇸🇸', '+211'],
  ['SE', 'Suecia', '🇸🇪', '+46'],
  ['CH', 'Suiza', '🇨🇭', '+41'],
  ['SR', 'Surinam', '🇸🇷', '+597'],
  ['SJ', 'Svalbard y Jan Mayen', '🇸🇯', '+47'],
  ['TH', 'Tailandia', '🇹🇭', '+66'],
  ['TW', 'Taiwán', '🇹🇼', '+886'],
  ['TZ', 'Tanzania', '🇹🇿', '+255'],
  ['TJ', 'Tayikistán', '🇹🇯', '+992'],
  ['IO', 'Territorio Británico del Océano Índico', '🇮🇴', '+246'],
  ['TL', 'Timor Oriental', '🇹🇱', '+670'],
  ['TG', 'Togo', '🇹🇬', '+228'],
  ['TK', 'Tokelau', '🇹🇰', '+690'],
  ['TO', 'Tonga', '🇹🇴', '+676'],
  ['TT', 'Trinidad y Tobago', '🇹🇹', '+1'],
  ['TN', 'Túnez', '🇹🇳', '+216'],
  ['TM', 'Turkmenistán', '🇹🇲', '+993'],
  ['TR', 'Turquía', '🇹🇷', '+90'],
  ['TV', 'Tuvalu', '🇹🇻', '+688'],
  ['UA', 'Ucrania', '🇺🇦', '+380'],
  ['UG', 'Uganda', '🇺🇬', '+256'],
  ['UY', 'Uruguay', '🇺🇾', '+598'],
  ['UZ', 'Uzbekistán', '🇺🇿', '+998'],
  ['VU', 'Vanuatu', '🇻🇺', '+678'],
  ['VA', 'Vaticano', '🇻🇦', '+39'],
  ['VE', 'Venezuela', '🇻🇪', '+58'],
  ['VN', 'Vietnam', '🇻🇳', '+84'],
  ['WF', 'Wallis y Futuna', '🇼🇫', '+681'],
  ['YE', 'Yemen', '🇾🇪', '+967'],
  ['DJ', 'Yibuti', '🇩🇯', '+253'],
  ['ZM', 'Zambia', '🇿🇲', '+260'],
  ['ZW', 'Zimbabue', '🇿🇼', '+263']
]

export const PAISES: Pais[] = LISTA
  .map(([codigo, nombre, bandera, prefijo]) => ({ codigo, nombre, bandera, prefijo }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

// Varios países comparten prefijo (+1, +7, +44...). Cuando solo se conoce el
// prefijo, este es el país que se enseña.
const PREFERIDO: Record<string, string> = {
  '+1': 'US', '+7': 'RU', '+39': 'IT', '+44': 'GB', '+47': 'NO', '+61': 'AU',
  '+212': 'MA', '+262': 'RE', '+358': 'FI', '+590': 'GP', '+599': 'CW', '+672': 'NF'
}

// Todos los prefijos, del más largo al más corto (para reconocer el de un
// número ya escrito: "+1809..." es "+1" y "+34..." es "+34")
export const PREFIJOS: string[] = [...new Set(PAISES.map(p => p.prefijo))].sort((a, b) => b.length - a.length)

export function paisPorCodigo(codigo: string | null | undefined): Pais | null {
  const c = String(codigo || '').toUpperCase()
  return PAISES.find(p => p.codigo === c) || null
}

export function paisPorPrefijo(prefijo: string | null | undefined): Pais | null {
  const p = String(prefijo || '').trim()
  if (!p) return null
  return paisPorCodigo(PREFERIDO[p]) || PAISES.find(x => x.prefijo === p) || null
}

// El prefijo de un país, o null si no se conoce
export function prefijoDelPais(codigo: string | null | undefined): string | null {
  return paisPorCodigo(codigo)?.prefijo || null
}

// "+34 600 992 001" → { prefijo: "+34", numero: "600992001" }. Si el número
// no es internacional (no empieza por + ni por 00), null.
export function separarTelefono(telefono: string | null | undefined): { prefijo: string; numero: string } | null {
  let t = String(telefono || '').replace(/[^\d+]/g, '')
  if (t.startsWith('00')) t = `+${t.slice(2)}`
  if (!t.startsWith('+')) return null
  const prefijo = PREFIJOS.find(p => t.startsWith(p))
  if (!prefijo) return null
  return { prefijo, numero: t.slice(prefijo.length) }
}

// Prefijo + número → "+34600992001". Null si el prefijo no es de la lista o
// el número no tiene sentido (menos de 4 o más de 14 cifras).
export function unirTelefono(prefijo: string | null | undefined, numero: string | null | undefined): string | null {
  const p = String(prefijo || '').trim()
  if (!PREFIJOS.includes(p)) return null
  let n = String(numero || '').replace(/\D/g, '')
  // "0034 600..." o "+34 600..." escrito entero en el número: se respeta
  const entero = separarTelefono(String(numero || ''))
  if (entero) return `${entero.prefijo}${entero.numero}`.length >= 6 ? `${entero.prefijo}${entero.numero}` : null
  // El cero inicial de algunos países (Reino Unido, Francia...) sobra
  if (n.length > 4 && n.startsWith('0')) n = n.replace(/^0+/, '')
  if (n.length < 4 || n.length > 14) return null
  const total = `${p.slice(1)}${n}`
  if (total.length > 15) return null
  return `${p}${n}`
}
