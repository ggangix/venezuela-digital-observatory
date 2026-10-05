/**
 * Estimate the government level, Venezuelan state and sector of a domain
 * from its name. WHOIS `org` is empty for most domains, so the name is the
 * only signal available for all of them. Results are approximate and the UI
 * labels them as estimated.
 */

export type Level = 'national' | 'state' | 'municipal' | 'military';
export type Sector =
  | 'executive'
  | 'legislative'
  | 'oversight'
  | 'justice'
  | 'security'
  | 'health'
  | 'education'
  | 'utilities'
  | 'culture'
  | 'economy'
  | 'other';

export const LEVELS: Level[] = ['national', 'state', 'municipal', 'military'];
export const SECTORS: Sector[] = [
  'executive',
  'legislative',
  'oversight',
  'justice',
  'security',
  'health',
  'education',
  'utilities',
  'culture',
  'economy',
  'other',
];

// Ordered: more specific spellings first. Ambiguous words that are also common
// in national names (bolivar, sucre, miranda) only count as a state when the
// domain is clearly regional (alcaldia, gobernacion, ...).
export const VE_STATES: { id: string; name: string; patterns: RegExp; ambiguous?: boolean }[] = [
  { id: 'amazonas', name: 'Amazonas', patterns: /amazonas/ },
  { id: 'anzoategui', name: 'Anzoátegui', patterns: /anzoategui|anzo/ },
  { id: 'apure', name: 'Apure', patterns: /apure/ },
  { id: 'aragua', name: 'Aragua', patterns: /aragua/ },
  { id: 'barinas', name: 'Barinas', patterns: /barinas/ },
  { id: 'bolivar', name: 'Bolívar', patterns: /bolivar|guayana|caroni/, ambiguous: true },
  { id: 'carabobo', name: 'Carabobo', patterns: /carabobo|valencia/ },
  { id: 'cojedes', name: 'Cojedes', patterns: /cojedes/ },
  { id: 'delta-amacuro', name: 'Delta Amacuro', patterns: /delta-?a?macuro|deltaamacuro/ },
  { id: 'falcon', name: 'Falcón', patterns: /falcon|coro\b/ },
  { id: 'guarico', name: 'Guárico', patterns: /guarico/ },
  { id: 'lara', name: 'Lara', patterns: /lara\b|-lara|lara$|barquisimeto/ },
  { id: 'merida', name: 'Mérida', patterns: /merida/ },
  { id: 'miranda', name: 'Miranda', patterns: /miranda|chacao|baruta|sucre-miranda/, ambiguous: true },
  { id: 'monagas', name: 'Monagas', patterns: /monagas|maturin/ },
  { id: 'nueva-esparta', name: 'Nueva Esparta', patterns: /nueva-?esparta|margarita/ },
  { id: 'portuguesa', name: 'Portuguesa', patterns: /portuguesa/ },
  { id: 'sucre', name: 'Sucre', patterns: /sucre|cumana/, ambiguous: true },
  { id: 'tachira', name: 'Táchira', patterns: /tachira/ },
  { id: 'trujillo', name: 'Trujillo', patterns: /trujillo/ },
  { id: 'la-guaira', name: 'La Guaira', patterns: /vargas|laguaira|la-guaira/ },
  { id: 'yaracuy', name: 'Yaracuy', patterns: /yaracuy/ },
  { id: 'zulia', name: 'Zulia', patterns: /zulia|maracaibo/ },
  { id: 'distrito-capital', name: 'Distrito Capital', patterns: /caracas|distritocapital|libertador-dc/ },
];

const MUNICIPAL = /^(alcaldia|alc[a-z]|concejo|cmun|cm[a-z]?|camaramunicipal|contraloriamunicipal|cmdc|sindicatura)|municip/;
const STATE_LEVEL = /^(gobernacion|gob[a-z]|consejolegislativo|cle[a-z]?|contraloria(del)?estado|cge|cgem)/;
const REGIONAL_HINT = /^(alcaldia|alc|concejo|cm|gobernacion|consejolegislativo|cle|contraloria|policia|poli|hidro|fundacite|ima|imp|sat|semat|sumat)/;

const SECTOR_RULES: [Sector, RegExp][] = [
  ['legislative', /^(concejo|consejolegislativo|cle[a-z]?|cm[a-z]?|camaramunicipal|asamblea)/],
  ['oversight', /^(contraloria|cg[a-z]*|sindicatura|antimonopolio|procompetencia)|contraloria/],
  ['justice', /^(tsj|tribunal|fiscal|ministeriopublico|defensoria|procuraduria)|tsj|justicia/],
  ['security', /\.mil\.ve$|^(policia|poli|cpnb|guardia|bomberos|pcivil|proteccioncivil)|fanb|ejercito|armada|aviacion|defensa|seguridad/],
  ['health', /salud|hospital|ivss|sanidad|medic|farmac|clinic|ambulatorio/],
  ['education', /educa|escuel|liceo|universi|^uni|^iu|ince|mision(sucre|ribas|robinson)|canaim|cienc|tecnolog|fundacite/],
  ['utilities', /^hidro|agua|electr|corpoelec|^gas|aseo|vial|transporte|aeropuerto|puerto|telecom|cantv|conatel|vivienda|habitat/],
  ['culture', /cultur|museo|deporte|juegos|teatro|biblioteca|patrimonio|libreria|musica|danza|cine|turismo/],
  ['economy', /banco|finanz|tribut|^sat|seniat|sumat|semat|hacienda|economi|comercio|^fon|fondo|industri|produc|agro|alimenta|cereal|pesca|mercal|pdval|sunagro|sunacrip|cripto/],
  ['executive', /^(alcaldia|alc|gobernacion|gob[a-z]|min|mpp|vice|presidencia|despacho)/],
];

export type DomainClassification = {
  level: Level;
  state: string | null;
  sector: Sector;
};

export function classifyDomain(domain: string): DomainClassification {
  const name = domain.toLowerCase();
  const base = name.replace(/\.(gob|mil|gov)\.ve$/, '');

  let level: Level;
  if (name.endsWith('.mil.ve')) level = 'military';
  else if (MUNICIPAL.test(base)) level = 'municipal';
  else if (STATE_LEVEL.test(base)) level = 'state';
  else level = 'national';

  let state: string | null = null;
  const regional = level === 'municipal' || level === 'state' || REGIONAL_HINT.test(base);
  for (const s of VE_STATES) {
    if (s.ambiguous && !regional) continue;
    if (s.patterns.test(base)) {
      state = s.id;
      break;
    }
  }
  // A national-looking entity tied to a state (e.g. hidrolara, fundacite-merida) is regional.
  // Ambiguous names only matched above when the domain already looked regional.
  if (level === 'national' && state) level = 'state';

  const sector = SECTOR_RULES.find(([, re]) => re.test(base) || re.test(name))?.[0] ?? 'other';

  return { level, state, sector };
}

export function stateName(id: string | null): string | null {
  return VE_STATES.find((s) => s.id === id)?.name ?? null;
}
