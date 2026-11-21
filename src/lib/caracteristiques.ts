/**
 * Les atouts et caractéristiques d'une fiche, tirés du relevé de la même fiche
 * chez LedPerf (`ReleveFiche`).
 *
 * Décision de l'exploitant (21 novembre 2026) : les produits du site sont
 * exactement ceux de LedPerf ; quand LedPerf annonce « sans erreur OBD » ou
 * « plug & play », la fiche LEDVROOM le dit aussi, et le met en avant en
 * badges. Ce module décide de ce qui s'affiche, avec nos mots :
 *
 * - **rien n'est repris tel quel** : chaque atout est un code relevé
 *   (`SANS_ERREUR`, `PLUG_PLAY`…) que ce module traduit ; un libellé de
 *   caractéristique inconnu est écarté plutôt que recopié ;
 * - **les règles de l'exploitant passent avant le relevé** : pas de référence
 *   d'ampoule sur un pack véhicule, pas de marque (la leur, Osram, Philips),
 *   pas de promesse de service qui serait la leur (garantie, port offert,
 *   satisfait ou remboursé : les nôtres sont dites ailleurs, et
 *   différemment) ;
 * - **l'homologation route se dit comme chez eux** (exploitant, 21 novembre
 *   2026, revenant sur la consigne du 7) : « homologué route » est mis en
 *   avant, en premier badge ; « non homologué », « circuit uniquement »,
 *   « intérieur uniquement » sont dits aussi, sans être des atouts. Seule la
 *   valeur relevée compte, jamais un texte libre de leur fiche ;
 * - **ce qui est saisi au back-office l'emporte** : un libellé déjà présent
 *   dans les caractéristiques de la fiche n'est pas doublé.
 *
 * Module pur, sans base ni réseau : la fiche, le flux Google et les tests
 * s'en servent.
 */
import { contientUneReference } from './sans-reference'

/** Ce que contient `ReleveFiche.donnees` (écrit par scripts/ledperf/). */
export type DonneesReleve = {
  v: 1
  /** Atouts relevés, en codes (voir `ATOUTS`). */
  atouts?: string[]
  /** Caractéristiques relevées : [libellé chez eux, valeur chez eux]. */
  specs?: Array<[string, string]>
  /** Ce que réunit le pack ou le kit, ligne par ligne. */
  composition?: string[]
  /** Temps de montage annoncé, en minutes. */
  montage?: number | null
  /** Une notice de montage personnalisée accompagne le produit. */
  notice?: boolean
  /** Homologation route annoncée : `true` homologué, `false` non homologué, absent si rien de sûr. */
  homologue?: boolean
  /** Usage limité annoncé (« Non ECE — circuit uniquement », « intérieur uniquement »). */
  usage?: 'circuit' | 'interieur'
}

export type Atout = {
  code: string
  /** Mot court pour le badge (« Sans erreur OBD »). */
  badge: string
  /** Phrase pour la liste des atouts. */
  texte: string
}

export type Caracteristiques = {
  /** Du plus fort au moins fort : les premiers deviennent les badges. */
  atouts: Atout[]
  specs: Array<{ label: string; value: string }>
  composition: string[]
  montageMinutes: number | null
  notice: boolean
  sansErreur: boolean
  plugAndPlay: boolean
  /** `true` homologué route, `false` non homologué, `null` inconnu. */
  homologue: boolean | null
  /** Usage limité, à dire près des badges : `null` quand rien n'est limité. */
  usage: 'circuit' | 'interieur' | null
}

/**
 * Les atouts connus, dans l'ordre où ils comptent pour un client qui hésite :
 * d'abord ce qui lève la peur (erreur au tableau de bord, câblage, temps de
 * montage, notice), ensuite le rendu, enfin la fiche technique.
 */
const ATOUTS: Array<{ code: string; badge: string; texte: string }> = [
  // « Quand c'est homologué route, il faut bien le mettre en avant » (exploitant, 21 novembre 2026).
  { code: 'HOMOLOGUE', badge: 'Homologué route', texte: 'Homologué pour la route' },
  { code: 'SANS_ERREUR', badge: 'Sans erreur OBD', texte: 'Aucune erreur au tableau de bord (OBD)' },
  { code: 'PLUG_PLAY', badge: 'Plug & play', texte: 'Plug & play : se monte à la place de l’origine, sans modification' },
  { code: 'MONTAGE', badge: '', texte: '' }, // rempli avec le temps relevé
  { code: 'NOTICE', badge: 'Notice PDF personnalisée', texte: 'Notice de montage PDF personnalisée' },
  { code: 'CANBUS', badge: 'Compatible CANbus', texte: 'Compatible CANbus' },
  { code: 'MONTAGE_FACILE', badge: 'Montage facile', texte: 'Montage facile' },
  { code: 'ETANCHE', badge: 'Étanche', texte: 'Étanche à l’eau et à la poussière' },
  { code: 'BLANC_PUR', badge: 'Blanc pur', texte: 'Lumière blanc pur' },
  { code: 'BLANC_FROID', badge: 'Blanc froid', texte: 'Lumière blanc froid' },
  { code: 'BLANC_NEUTRE', badge: 'Blanc neutre', texte: 'Lumière blanc neutre' },
  { code: 'TRES_HAUTE_PUISSANCE', badge: 'Très haute puissance', texte: 'Très haute puissance' },
  { code: 'HAUTE_PUISSANCE', badge: 'Haute puissance', texte: 'Haute puissance' },
  { code: 'TRES_LUMINEUX', badge: 'Très lumineux', texte: 'Éclairage très lumineux' },
  { code: 'VISIBLE_JOUR', badge: 'Bien visible de jour', texte: 'Bien visible, même de jour' },
  { code: 'LOUPE', badge: 'Avec lentille', texte: 'LED avec lentille, pour un faisceau concentré' },
  { code: 'FAISCEAU_REGLABLE', badge: 'Faisceau réglable', texte: 'Faisceau réglable' },
  { code: 'RAYONNEMENT_360', badge: 'Éclairage 360°', texte: 'Éclairage à 360°' },
  { code: 'VENTILE', badge: 'Ventilé', texte: 'Refroidissement par ventilateur' },
  { code: 'ANTI_RESIDUEL', badge: 'Anti-courant résiduel', texte: 'Anti-courant résiduel : aucune lueur une fois éteint' },
  { code: 'LONGUE_DUREE', badge: 'Longue durée de vie', texte: 'Longue durée de vie' },
  { code: 'EMBASE_METAL', badge: 'Embase métallique', texte: 'Embase métallique' },
  { code: 'HAUTE_QUALITE', badge: 'Haute qualité', texte: 'Composants de haute qualité' },
  { code: 'TENSION_12_24', badge: '12 V et 24 V', texte: 'Alimentation 12 V et 24 V' },
  { code: 'TENSION_12', badge: '12 V', texte: 'Alimentation 12 V' },
  { code: 'TENSION_24', badge: '24 V', texte: 'Alimentation 24 V' },
]

const RANG = new Map(ATOUTS.map((atout, i) => [atout.code, i]))

/**
 * Libellés de caractéristiques gardés, et comment on les nomme. Ce qui n'est
 * pas ici n'est pas affiché : la marque, la garantie, la gamme, leurs lignes
 * d'homologation telles qu'écrites (l'homologation relevée est dite à part,
 * avec nos mots), la référence du fabricant, la compatibilité (la nôtre est
 * gérée véhicule par véhicule), le conditionnement (le nôtre est celui de la
 * variante choisie, il ne doit pas être contredit).
 */
const LIBELLES: Record<string, string> = {
  tension: 'Tension',
  alimentation: 'Tension',
  couleur: 'Couleur',
  'couleur d eclairage': 'Couleur de la lumière',
  'couleurs d eclairage': 'Couleurs de la lumière',
  'temperature de couleur': 'Température de couleur',
  puissance: 'Puissance',
  technologie: 'Technologie',
  'flux lumineux': 'Flux lumineux',
  lumens: 'Flux lumineux',
  'eclairage ultra puissant': 'Flux lumineux',
  'intensite lumineuse': 'Intensité lumineuse',
  'angle de rayonnement': 'Angle d’éclairage',
  etancheite: 'Étanchéité',
  dimensions: 'Dimensions',
  longueur: 'Longueur',
  largeur: 'Largeur',
  epaisseur: 'Épaisseur',
  diametre: 'Diamètre',
  materiaux: 'Matériaux',
  boitier: 'Boîtier',
  finition: 'Finition',
  forme: 'Forme',
  refroidissement: 'Refroidissement',
  'nombre de leds': 'Nombre de LED',
  'nombre de puces led': 'Nombre de puces LED',
  led: 'LED utilisées',
  'marque des leds': 'LED utilisées',
  'puces led': 'LED utilisées',
  'duree de vie': 'Durée de vie',
  consommation: 'Consommation',
  courant: 'Courant',
  'gain de luminosite': 'Gain de luminosité',
  luminosite: 'Gain de luminosité',
  'temperature de fonctionnement': 'Température de fonctionnement',
  'certification ce': 'Certification CE',
  'anti erreur odb': 'Sans erreur au tableau de bord',
  'compatible canbus': 'Compatible CANbus',
  installation: 'Montage',
  raccordement: 'Branchement',
  connectique: 'Branchement',
  contient: 'Contenu',
  utilisation: 'Usage',
  ballast: 'Ballast',
  'format d ampoule': 'Format',
  culot: 'Culot',
  'culot technique iec': 'Culot',
  'leds a utiliser': 'LED à utiliser',
  'longueur d onde': 'Longueur d’onde',
  hauteur: 'Hauteur',
  taille: 'Taille',
  aspect: 'Aspect',
  revetement: 'Revêtement',
  specificite: 'Particularités',
  'type de boitier': 'Boîtier',
  'diametre led': 'Diamètre des LED',
  'distance entre chaque led': 'Écart entre les LED',
  'diametre exterieur du phare': 'Diamètre du phare',
  'made in germany': 'Fabriqué en Allemagne',
  resistance: 'Résistance',
  'flux lumineux double intensite': 'Flux lumineux',
  // Câbles, films, soudure : les fiches techniques des articles au détail.
  section: 'Section',
  'nombre de brins': 'Nombre de brins',
  'materiau du conducteur': 'Conducteur',
  'materiau de l isolant': 'Isolant',
  'couleur de gaine': 'Couleur de la gaine',
  'diametre exterieur': 'Diamètre extérieur',
  'temperature minimum d utilisation': 'Température minimale',
  'temperature maximum d utilisation': 'Température maximale',
  'temperature de fusion': 'Température de fusion',
  'protection uv': 'Protection UV',
  'anti reflet': 'Anti-reflet',
}

/** Ce qui ne s'affiche jamais, où que ce soit écrit. */
const INTERDIT = /led ?perf|osram|philips|homolog|garanti|satisfait|rembours|port offert|livraison/i

const sansAccent = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function cleLibelle(libelle: string): string {
  return sansAccent(libelle)
    .replace(/[’'()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Espace insécable fine avant les unités, majuscules et séparateurs à la française. */
function mettreEnForme(valeur: string): string {
  let v = valeur.replace(/\s+/g, ' ').trim()
  v = v.replace(/\b(\d+(?:[.,]\d+)?)\s*(watts?|w)\b/gi, '$1 W')
  v = v.replace(/\b(\d+(?:[.,]\d+)?)\s*v(olts?)?\b/gi, '$1 V')
  v = v.replace(/\b(\d+)\s*lm\b|\b(\d+)\s*lumens\b/gi, (_, a, b) => `${a ?? b} lm`)
  v = v.replace(/\bIP\s*(\d{2})\b/gi, 'IP$1')
  v = v.replace(/\b(\d)\s?(\d{3})\s*K\b/g, '$1 $2 K')
  v = v.replace(/\b(\d)(\d{3}) lm\b/g, '$1 $2 lm')
  v = v.replace(/\b(\d+)\s*mm\b/gi, '$1 mm')
  v = v.replace(/\bmm(?:\s+mm)+\b/gi, 'mm')
  // « - 40°C à 300°C » : un signe moins, pas un tiret de liste.
  v = v.replace(/^-\s*(?=\d)/, '−')
  v = v.replace(/\bOUI\b/g, 'Oui').replace(/\bNON\b/g, 'Non')
  // « Blanc Xenon » : avec l'accent, en minuscule au milieu d'une phrase.
  v = v.replace(/(\S\s+)x[ée]non\b/gi, '$1xénon').replace(/^x[ée]non\b/i, 'Xénon')
  return v.charAt(0).toUpperCase() + v.slice(1)
}

function montageLibelle(minutes: number): { badge: string; texte: string } {
  if (minutes < 60) return { badge: `Montage ${minutes} min`, texte: `Montage en ${minutes} minutes environ` }
  const heures = Math.floor(minutes / 60)
  const reste = minutes % 60
  const duree = reste ? `${heures} h ${String(reste).padStart(2, '0')}` : `${heures} h`
  return { badge: `Montage ${duree}`, texte: `Montage en ${duree} environ` }
}

/**
 * Ce que la fiche montre du relevé. `null` quand il n'y a rien d'utile : la
 * fiche n'affiche alors ni badge ni ligne de plus, et rien n'est inventé.
 *
 * `sansReference` : la fiche est un pack composé pour un véhicule — aucune
 * désignation d'ampoule ne s'y affiche (règle de l'exploitant), ni le culot.
 * `libellesExistants` : les caractéristiques saisies au back-office, qui
 * l'emportent sur le relevé à libellé égal.
 */
export function lireCaracteristiques(
  donnees: unknown,
  options: {
    sansReference: boolean
    libellesExistants?: string[]
    /** Un article déclaré non homologué au back-office ne se dit jamais « homologué route ». */
    nonHomologueDeclare?: boolean
  } = { sansReference: false },
): Caracteristiques | null {
  if (!donnees || typeof donnees !== 'object') return null
  const d = donnees as Partial<DonneesReleve>
  if (d.v !== 1) return null

  const codes = new Set((Array.isArray(d.atouts) ? d.atouts : []).filter((c) => typeof c === 'string'))
  const montage =
    typeof d.montage === 'number' && Number.isFinite(d.montage) && d.montage > 0 && d.montage <= 600
      ? Math.round(d.montage)
      : null
  const notice = d.notice === true
  const homologue =
    options.nonHomologueDeclare || d.homologue === false ? false : d.homologue === true ? true : null
  const usage = d.usage === 'circuit' || d.usage === 'interieur' ? d.usage : null

  // Les caractéristiques d'abord : certaines confirment un atout.
  const existants = new Set((options.libellesExistants ?? []).map(cleLibelle))
  const vus = new Set<string>()
  const specs: Array<{ label: string; value: string }> = []
  for (const paire of Array.isArray(d.specs) ? d.specs : []) {
    if (!Array.isArray(paire) || paire.length !== 2) continue
    const [brut, valeurBrute] = paire
    if (typeof brut !== 'string' || typeof valeurBrute !== 'string') continue
    const label = LIBELLES[cleLibelle(brut)]
    if (!label) continue
    const value = mettreEnForme(valeurBrute)
    if (!value || value.length > 80 || INTERDIT.test(value)) continue
    if (options.sansReference && (label === 'Culot' || contientUneReference(value))) continue
    const cle = cleLibelle(label)
    if (vus.has(cle) || existants.has(cle)) continue
    vus.add(cle)
    if (label === 'Sans erreur au tableau de bord' || label === 'Compatible CANbus') {
      if (/^oui/i.test(value)) codes.add(label === 'Compatible CANbus' ? 'CANBUS' : 'SANS_ERREUR')
      continue // dit par le badge, pas besoin d'une ligne « Oui »
    }
    if (label === 'Montage' && /plug/i.test(value)) {
      codes.add('PLUG_PLAY')
      continue
    }
    if (label === 'Étanchéité' && /ip6[5-8]|étanche|etanche/i.test(value)) codes.add('ETANCHE')
    specs.push({ label, value })
  }

  if (notice) codes.add('NOTICE')
  if (montage !== null) codes.add('MONTAGE')
  if (homologue === true && usage === null) codes.add('HOMOLOGUE')

  // L'homologation et l'usage, en fin de tableau, comme sur leur fiche : avec nos mots, jamais leur texte.
  if (homologue !== null && !existants.has(cleLibelle('Homologation route'))) {
    specs.push({ label: 'Homologation route', value: homologue ? 'Oui' : 'Non' })
  }
  if (usage !== null) {
    specs.push({
      label: 'Usage autorisé',
      value: usage === 'circuit' ? 'Circuit uniquement, pas sur la voie publique' : 'Intérieur du véhicule uniquement',
    })
  }
  // « 12 V et 24 V » dit déjà « 12 V ».
  if (codes.has('TENSION_12_24')) {
    codes.delete('TENSION_12')
    codes.delete('TENSION_24')
  }
  // Un temps de montage chiffré dit mieux que « montage facile ».
  if (montage !== null) codes.delete('MONTAGE_FACILE')
  if (codes.has('TRES_HAUTE_PUISSANCE')) codes.delete('HAUTE_PUISSANCE')

  const atouts: Atout[] = [...codes]
    .filter((code) => RANG.has(code))
    .sort((a, b) => RANG.get(a)! - RANG.get(b)!)
    .map((code) => {
      if (code === 'MONTAGE' && montage !== null) return { code, ...montageLibelle(montage) }
      const connu = ATOUTS[RANG.get(code)!]
      return { code, badge: connu.badge, texte: connu.texte }
    })

  const composition = (Array.isArray(d.composition) ? d.composition : [])
    .filter((ligne): ligne is string => typeof ligne === 'string')
    .map((ligne) =>
      ligne
        .replace(/\s+/g, ' ')
        .replace(/^[-–•\s]+/, '')
        .replace(/[.;]\s*$/, '')
        .replace(/\bInterrupeur\b/g, 'Interrupteur')
        .trim(),
    )
    .filter((ligne) => ligne.length > 1 && ligne.length <= 120 && !INTERDIT.test(ligne))
    .filter((ligne) => !(options.sansReference && contientUneReference(ligne)))
    .map((ligne) => ligne.charAt(0).toUpperCase() + ligne.slice(1))
    .slice(0, 12)

  if (atouts.length === 0 && specs.length === 0 && composition.length === 0) return null

  return {
    atouts,
    specs,
    composition,
    montageMinutes: montage,
    notice,
    sansErreur: codes.has('SANS_ERREUR'),
    plugAndPlay: codes.has('PLUG_PLAY'),
    homologue,
    usage,
  }
}

/**
 * Les premiers atouts en une phrase, pour la description Google de la fiche :
 * « sans erreur OBD, plug & play et montage 10 min ». `null` sans atout.
 */
export function phraseDesAtouts(atouts: Atout[], max = 3): string | null {
  const mots = atouts.slice(0, max).map((atout) => atout.badge.charAt(0).toLowerCase() + atout.badge.slice(1))
  if (mots.length === 0) return null
  return mots.length === 1 ? mots[0] : `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`
}

/**
 * Les badges d'une carte de liste (page véhicule, catégorie, recherche) : les
 * premiers atouts, deux au plus. Une vignette n'a pas la place d'une liste, et
 * ce sont ceux qui lèvent le doute — erreur au tableau de bord, montage.
 */
export function badgesDeCarte(donnees: unknown, max = 2): string[] {
  const caracteristiques = lireCaracteristiques(donnees, { sansReference: true })
  return caracteristiques ? caracteristiques.atouts.slice(0, max).map((atout) => atout.badge) : []
}
