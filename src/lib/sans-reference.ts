/**
 * Ce qu'un pack véhicule ne montre jamais : le type d'ampoule.
 *
 * Règle de l'exploitant (novembre 2026) : sur un pack composé pour un
 * véhicule, la valeur vendue est la compatibilité. Afficher « H7 » ou « W5W »
 * permettrait d'acheter l'ampoule ailleurs. Les noms des packs respectent la
 * règle, mais d'autres textes la contournaient sans que personne les voie :
 *
 * - le texte alternatif des photos, repris des fiches d'origine — sur le kit
 *   xénon de l'Audi A3 8V, la photo se décrivait « Kit Xénon HID H1 35W Slim
 *   Canbus Pro… », lu par Google Images et les lecteurs d'écran (relevé le
 *   17 novembre 2026) ;
 * - les noms des composants d'un kit et des accessoires, et le lien vers la
 *   fiche de chaque composant, dont l'adresse porte la référence.
 *
 * Module pur : la fiche produit, les requêtes de packs et les tests s'en
 * servent tous.
 */

/**
 * Les désignations d'ampoules et de culots du catalogue. Délimitées par des
 * frontières de mot : « H7 » est retiré, « Hyundai » ou « 2016 » ne le sont
 * pas. Les températures de couleur (6 000 K) et puissances (35 W) restent :
 * elles ne désignent pas une ampoule. « T5 », « G20 » ne figurent pas dans la
 * liste : ce sont aussi des noms de véhicules (Transporter T5, BMW G20).
 */
const REFERENCE =
  /\b(?:H(?:1|3|4|7|8|9|10|11|13|15|16|27)(?:\/H\d{1,2})*|HB[1-5]|HIR[12]|D[1-8][SRC]|9004|9005|9006|9007|9012|W\d{1,2}(?:\/\d{1,2})?W|WY\d{1,2}W|P\d{1,2}(?:\/\d{1,2})?W|PY\d{1,2}W|PH\d{1,2}W|PSX?\d{2}W|PS\d{2}W|H\d{1,2}W|HY\d{1,2}W|R\d{1,2}W|C\d{1,2}W|T(?:10|15|20|25)|T4W|BA\d{1,2}[SD]|BAX\d{1,2}[SD]|BAU\d{1,2}[SD]|BAY\d{1,2}[SD]|BAZ\d{1,2}[SD]|BA\d{1,2}|PGJ\d{2}(?:-\d)?|PX\d{2}[a-z]?|PK\d{2}[sd]|P\d{2}[a-z]-\d|SV\d{1,2}(?:\.\d)?|W\d(?:\.\d)?x\d(?:\.\d)?d)\b/gi

/** Vrai si le texte nomme un type d'ampoule ou un culot. */
export function contientUneReference(texte: string): boolean {
  REFERENCE.lastIndex = 0
  const trouve = REFERENCE.test(texte)
  REFERENCE.lastIndex = 0
  return trouve
}

/**
 * Le texte, sans ses désignations d'ampoule. « Kit Xénon HID H1 35W Slim
 * Canbus Pro » devient « Kit Xénon HID 35W Slim Canbus Pro ». Les séparateurs
 * laissés orphelins (« – – », « / » en bout de phrase) sont nettoyés.
 */
export function retirerLesReferences(texte: string): string {
  // Chaque désignation devient un repère, pour nettoyer ce qui l'entourait :
  // « H8 / H11 », « (W5W) », « – W5W » en fin de nom.
  return texte
    .replace(REFERENCE, '§')
    .replace(/§(?:\s*[/,+&]\s*§)+/g, '§')
    .replace(/\(\s*§\s*\)/g, ' ')
    .replace(/[–-]\s*§(?=\s*(?:[–-]|$))/g, ' ')
    .replace(/§/g, ' ')
    .replace(/(\s*[–-]\s*){2,}/g, ' – ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[–\-/,]\s*|\s*[–\-/,]\s*$/g, '')
    .trim()
}

/**
 * Le texte alternatif d'une photo de pack véhicule : celui d'origine s'il ne
 * nomme aucune ampoule, sinon `repli` (« Kit xénon pour Audi A3 8V — visuel
 * d'illustration »). On ne le « nettoie » pas : une description amputée de
 * son sujet décrirait mal la photo.
 */
export function altSansReference(alt: string | null | undefined, repli: string): string {
  if (!alt || !alt.trim()) return repli
  return contientUneReference(alt) ? repli : alt
}

/** Ce qu'il faut de la fiche pour la passer au filtre. */
type FicheFiltrable = {
  name: string
  bulbBase: string | null
  specs: Array<{ label: string; value: string }>
  gallery: Array<{ alt: string }>
  variants: Array<{
    name: string
    components: Array<{ productName: string; variantName: string }>
    missingAccessories: Array<{ productName: string; variantName: string }>
    image: { url: string; alt: string } | null
    imageAllumee: { url: string; alt: string } | null
  }>
  optionalAddons: Array<{
    name: string
    tagline: string | null
    variantName: string
    image: { url: string; alt: string } | null
  }>
}

/**
 * La fiche d'un pack véhicule, sans aucune désignation d'ampoule dans ce
 * qu'elle affiche : textes alternatifs des photos (galerie, options, partage
 * sur les réseaux), noms des composants, des accessoires et des compléments,
 * noms des conditionnements, culot et caractéristiques qui en parlent. Le reste — prix, stock, compatibilité — est rendu tel
 * quel. Une fiche vendue à la référence ne passe jamais par ici : la
 * référence y est l'information utile.
 */
export function ficheSansReferences<T extends FicheFiltrable>(fiche: T): T {
  const repli = `${fiche.name} — visuel d’illustration`
  const image = (visuel: { url: string; alt: string } | null) =>
    visuel ? { ...visuel, alt: altSansReference(visuel.alt, repli) } : null
  const nom = (texte: string) => (contientUneReference(texte) ? retirerLesReferences(texte) : texte)
  return {
    ...fiche,
    // Le culot alimentait la pastille sous le titre et la propriété « Culot »
    // des données structurées lues par Google.
    bulbBase: null,
    specs: fiche.specs.filter(
      (spec) =>
        !/culot|r[ée]f[ée]rence|type d.ampoule/i.test(spec.label) && !contientUneReference(spec.value),
    ),
    gallery: fiche.gallery.map((visuel) => ({ ...visuel, alt: altSansReference(visuel.alt, repli) })),
    variants: fiche.variants.map((variante) => ({
      ...variante,
      name: nom(variante.name),
      image: image(variante.image),
      imageAllumee: image(variante.imageAllumee),
      components: variante.components.map((composant) => ({
        ...composant,
        productName: nom(composant.productName),
        variantName: nom(composant.variantName),
      })),
      missingAccessories: variante.missingAccessories.map((accessoire) => ({
        ...accessoire,
        productName: nom(accessoire.productName),
        variantName: nom(accessoire.variantName),
      })),
    })),
    optionalAddons: fiche.optionalAddons.map((complement) => ({
      ...complement,
      name: nom(complement.name),
      tagline: complement.tagline === null ? null : nom(complement.tagline),
      variantName: nom(complement.variantName),
      image: complement.image
        ? { ...complement.image, alt: altSansReference(complement.image.alt, nom(complement.name)) }
        : null,
    })),
  }
}
