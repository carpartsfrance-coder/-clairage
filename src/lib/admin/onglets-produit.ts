import type { Manque } from './completeness'

/**
 * Les six onglets de la fiche produit d'administration.
 *
 * L'écran tenait sur une seule page de onze sections : relevé des manques,
 * statut, identité, adresse, textes, conditionnements, composition, liens,
 * visuels, caractéristiques, questions, guides. Sept mille pixels de haut sur
 * un produit complet, et aucune réponse rapide à « où est le prix ».
 *
 * Trois décisions tiennent ce découpage :
 *
 * 1. **L'onglet vit dans l'adresse**, pas dans un état de composant. C'est ce
 *    qui permet au relevé des manques de pointer vers l'onglet qui corrige —
 *    « Ouvrir Médias » est un lien, pas un bouton qui demande un script — et
 *    ce qui rend une fiche à moitié remplie partageable telle quelle. Les
 *    recherches de liens vivent déjà dans l'adresse pour la même raison.
 * 2. **Un onglet inconnu retombe sur le premier**, sans erreur : une adresse
 *    recopiée de travers doit montrer la fiche, pas une page vide.
 * 3. **La colonne de droite n'est pas un onglet.** Statut, rubriques et
 *    identifiants restent visibles partout : ce sont les informations qu'on
 *    vérifie en travaillant sur autre chose. Un manque qui s'y corrige n'a
 *    donc pas d'onglet où renvoyer, et son lien disparaît plutôt que de
 *    promener l'exploitant.
 */

export const ONGLETS = ['fiche', 'medias', 'prix', 'compat', 'carac', 'seo'] as const
export type OngletValue = (typeof ONGLETS)[number]

export const ONGLET_LABELS: Record<OngletValue, string> = {
  fiche: 'Fiche produit',
  medias: 'Médias',
  prix: 'Prix et stock',
  compat: 'Compatibilités',
  carac: 'Caractéristiques',
  seo: 'SEO',
}

export function isOnglet(valeur: string): valeur is OngletValue {
  return (ONGLETS as readonly string[]).includes(valeur)
}

/** L'onglet demandé par l'adresse, ou le premier si elle ne dit rien de lisible. */
export function ongletDemande(valeur: string | undefined): OngletValue {
  const propre = (valeur ?? '').trim()
  return isOnglet(propre) ? propre : 'fiche'
}

/**
 * Où se corrige un manque, et par quel mot l'écrire.
 *
 * Le relevé nommait le manque et sa conséquence sans dire où aller : on lisait
 * « 3 visuels sans texte alternatif », puis on cherchait la section Visuels en
 * faisant défiler. Avec les onglets, la distance est devenue trop grande pour
 * laisser le lecteur se débrouiller.
 *
 * Le rapprochement se fait sur le début du libellé, parce que plusieurs
 * manques portent un suffixe variable — la référence concernée, le nombre de
 * lignes. `null` signifie « ça se corrige dans la colonne de droite, déjà
 * sous vos yeux ».
 */
const CIBLES: Array<{ prefixe: string; onglet: OngletValue | null; libelle: string }> = [
  { prefixe: 'Conditionnement', onglet: 'prix', libelle: 'Ajouter un conditionnement' },
  { prefixe: 'Prix —', onglet: 'prix', libelle: 'Renseigner le prix' },
  { prefixe: 'Taux de TVA —', onglet: 'prix', libelle: 'Choisir le taux de TVA' },
  { prefixe: 'Rubrique', onglet: null, libelle: 'Choisir une rubrique' },
  { prefixe: 'Visuels', onglet: 'medias', libelle: 'Ajouter des visuels' },
  { prefixe: 'Texte alternatif', onglet: 'medias', libelle: 'Compléter les textes alternatifs' },
  { prefixe: 'Accroche', onglet: 'fiche', libelle: 'Écrire l’accroche' },
  { prefixe: 'Caractéristiques', onglet: 'carac', libelle: 'Renseigner les caractéristiques' },
  {
    prefixe: 'Source de compatibilité',
    onglet: 'compat',
    libelle: 'Ajouter la source et la date',
  },
  { prefixe: 'Référencement', onglet: 'seo', libelle: 'Écrire le titre et la description' },
  { prefixe: 'Rédactionnel', onglet: 'fiche', libelle: 'Écrire le rédactionnel' },
]

export type CibleManque = { onglet: OngletValue | null; libelle: string } | null

export function cibleDuManque(champ: string): CibleManque {
  const cible = CIBLES.find((entree) => champ.startsWith(entree.prefixe))
  return cible ? { onglet: cible.onglet, libelle: cible.libelle } : null
}

/**
 * Les onglets qui portent au moins un manque.
 *
 * C'est ce qui met la pastille sur l'onglet : sans elle, un découpage en six
 * onglets cacherait les trous au lieu de les montrer — et le relevé des
 * manques existait précisément pour qu'on cesse de les découvrir après la
 * publication.
 */
export function ongletsAvecManque(manques: readonly Manque[]): Set<OngletValue> {
  const avec = new Set<OngletValue>()
  for (const manque of manques) {
    const cible = cibleDuManque(manque.champ)
    if (cible?.onglet) avec.add(cible.onglet)
  }
  return avec
}
