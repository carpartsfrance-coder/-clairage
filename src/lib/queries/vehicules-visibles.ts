import type { Prisma } from '@prisma/client'

/**
 * Quels véhicules le site montre, et pourquoi c'est calculé et non listé.
 *
 * Le référentiel véhicule couvre bien plus large que le catalogue : 543 marques
 * et 2 876 générations, pour 1 001 fiches en ligne. Mener un client vers son
 * véhicule pour lui annoncer qu'aucun éclairage n'est proposé lui fait perdre
 * trois clics et la confiance qui va avec — il a vu sa voiture dans la liste.
 *
 * **La règle : un véhicule apparaît s'il mène à au moins un produit en ligne.**
 * Une génération si l'une de ses configurations porte une compatibilité vers une
 * variante active d'une fiche publiée ; un modèle s'il a une telle génération ;
 * une marque si elle a un tel modèle.
 *
 * Trois choses à savoir avant d'y toucher :
 *
 * 1. **Rien n'est écrit en dur, et c'est tout l'intérêt.** La liste des 408
 *    générations du lancement n'apparaît nulle part : publier une nouvelle série
 *    de photos fait réapparaître ses véhicules d'eux-mêmes, au premier
 *    chargement, sans qu'on ait à relire ce fichier. Une liste figée serait une
 *    seconde vérité à tenir à jour — c'est-à-dire une vérité à oublier.
 *
 * 2. **Pas de cache, parce qu'il n'est pas mérité.** Le calcul coûte 6 à 10 ms
 *    sur le catalogue réel : PostgreSQL l'exécute en sous-requêtes `EXISTS` que
 *    les index existants couvrent. Un cache ajouterait ici un second état à
 *    invalider, donc une occasion de montrer un véhicule dépublié ou de cacher
 *    un véhicule publié. Si le catalogue grossit d'un ordre de grandeur, la
 *    question se repose — et se mesure avant de se trancher.
 *
 * 3. **Cette règle s'ajoute à `active`, elle ne le remplace pas.** `active` reste
 *    l'interrupteur manuel du back-office : masquer un véhicule à la main doit
 *    rester possible même s'il a des produits. Les deux conditions se cumulent.
 *
 * Le filtre porte sur `status: 'PUBLISHED'` et non sur `publishedAt`, parce que
 * c'est le statut qui décide de l'affichage d'une fiche partout ailleurs dans le
 * code. Deux critères pour une même question donneraient deux réponses.
 */

/**
 * La feuille de l'arbre : une compatibilité qui mène vraiment à de l'achetable.
 *
 * La variante doit être active et sa fiche publiée. Le statut de la
 * compatibilité (`CONFIRMED`, `UNKNOWN`) n'entre pas en compte : une génération
 * dont les compatibilités sont seulement documentées a tout de même une page à
 * montrer — c'est la page elle-même qui dit ce qui est confirmé et ce qui ne
 * l'est pas. L'exclure reviendrait à masquer des véhicules qui ont bien des
 * produits.
 */
const COMPATIBILITE_EN_LIGNE: Prisma.FitmentWhereInput = {
  variant: { active: true, product: { status: 'PUBLISHED' } },
}

/** Une génération qui mène à au moins un produit en ligne. */
export const GENERATION_VISIBLE: Prisma.VehicleGenerationWhereInput = {
  active: true,
  configurations: { some: { active: true, fitments: { some: COMPATIBILITE_EN_LIGNE } } },
}

/** Un modèle qui a au moins une génération visible. */
export const MODELE_VISIBLE: Prisma.VehicleModelWhereInput = {
  active: true,
  generations: { some: GENERATION_VISIBLE },
}

/** Une marque qui a au moins un modèle visible. */
export const MARQUE_VISIBLE: Prisma.VehicleMakeWhereInput = {
  active: true,
  models: { some: MODELE_VISIBLE },
}
