import { PrismaClient, type PartFamily } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Arborescence des catégories du catalogue.
 *
 * Elle reprend la structure d'un grand revendeur d'éclairage automobile,
 * adaptée au modèle de données de LUMERA. **Deux écarts, et ils sont
 * délibérés.**
 *
 * 1. **Les culots ne sont pas des catégories.** Chez la référence, chaque
 *    culot a la sienne : « Ampoules H7 LED et Kits LED H7 », « H4 », « D2S »…
 *    soit une petite centaine d'entrées. Ici le culot est déjà un attribut du
 *    produit (`Product.bulbBase`), avec ses pages `/culot/…` et son filtre de
 *    catalogue. Les dupliquer en catégories obligerait à tenir la même
 *    information à deux endroits — et à la corriger deux fois. Le menu génère
 *    donc ses entrées « Par culot » depuis les produits : publier une ampoule
 *    H4 fait apparaître H4, sans toucher à ce fichier.
 *
 * 2. **Les couleurs non plus.** « Led navette bleue », « Led T10 rouge »… est
 *    une déclinaison, pas une famille. Le modèle n'a pas d'attribut de
 *    couleur ; en faire des catégories créerait une arborescence que les
 *    données ne peuvent pas remplir. À ajouter le jour où les produits
 *    porteront une couleur.
 *
 * Ce qui est créé ici, ce sont les **rubriques et les vraies familles** : une
 * barre LED n'est pas une ampoule H7 d'une autre couleur, c'est un autre
 * produit.
 *
 * Le script est **idempotent** : il crée ce qui manque, met à jour les
 * libellés, l'ordre et la famille, et ne supprime ni ne dépublie rien. Une
 * catégorie retirée de ce fichier reste en base — c'est au back-office de
 * décider de la dépublier, pas à un script lancé au déploiement.
 *
 * Lancement : `npm run seed:taxonomy`
 */

type Entree = {
  slug: string
  /** Surtitre affiché au-dessus du libellé dans le menu. */
  kicker: string | null
  name: string
  family: PartFamily
  position: number
  description?: string
  /** Slug du parent, pour les sous-catégories. */
  parent?: string
}

/*
  Les rubriques, dans l'ordre du menu. Les deux premières entrées de la barre
  — « Packs par marque » auto et moto — ne sont PAS ici : ce sont des parcours
  véhicule (`/packs/…`), pas des catégories de produits. Les confondre ferait
  apparaître une marque dans le catalogue.
*/
const RUBRIQUES: Entree[] = [
  {
    slug: 'phares-led',
    kicker: 'Kits LED et ampoules',
    name: 'LED haute puissance',
    family: 'HEADLIGHT',
    position: 10,
    description:
      'Ampoules LED et kits complets pour les feux de croisement, de route et les antibrouillards.',
  },
  {
    slug: 'ampoules-effet-xenon',
    kicker: 'Ampoules',
    name: 'Effet xénon',
    family: 'HEADLIGHT',
    position: 20,
    description:
      'Ampoules halogènes à lumière blanche. Ce ne sont pas des ampoules à décharge : la technologie reste halogène.',
  },
  {
    slug: 'led-detail',
    kicker: 'LED',
    name: 'Au détail',
    family: 'OTHER',
    position: 30,
    description: "LED vendues à l'unité, à la paire ou en lot.",
  },
  {
    slug: 'veilleuses',
    kicker: 'LED',
    name: 'Veilleuses',
    family: 'SIDELIGHT',
    position: 40,
    description: 'Feux de position avant et arrière.',
  },
  {
    slug: 'interieur',
    kicker: 'LED',
    name: 'Plafonnier & habitacle',
    family: 'INTERIOR',
    position: 50,
    description: 'Plafonnier, liseuses, coffre, boîte à gants et seuils de porte.',
  },
  {
    slug: 'plaque-recul',
    kicker: 'LED',
    name: 'Plaque & recul',
    family: 'PLATE',
    position: 60,
    description: "Éclairage de plaque d'immatriculation et feux de recul.",
  },
  {
    slug: 'feux-de-jour',
    kicker: 'LED',
    name: 'Feux de jour',
    family: 'OTHER',
    position: 70,
    description: 'Feux de circulation diurne.',
  },
  {
    slug: 'clignotants',
    kicker: 'LED',
    name: 'Clignotants',
    family: 'TURN_SIGNAL',
    position: 80,
    description: 'Clignotants avant, arrière et répétiteurs.',
  },
  {
    slug: 'xenon',
    kicker: 'Ampoules',
    name: "Xénon d'origine",
    family: 'XENON',
    position: 90,
    description:
      "Ampoules à décharge de remplacement, pour un véhicule équipé d'un bloc xénon en usine.",
  },
  {
    slug: 'xenon-hid',
    kicker: 'Kits',
    name: 'Xénon HID',
    family: 'XENON',
    position: 100,
    description:
      "Kits de conversion à décharge pour un véhicule qui n'en avait pas d'origine. L'homologation routière est à vérifier au cas par cas.",
  },
  {
    slug: 'barres-phares-additionnels',
    kicker: 'Barres LED et',
    name: 'Phares additionnels',
    family: 'OTHER',
    position: 110,
    description: 'Barres, rampes, projecteurs de travail et leur fixation.',
  },
  {
    slug: 'moto',
    kicker: 'Éclairage',
    name: 'Moto & scooter',
    family: 'MOTORCYCLE',
    position: 120,
    description: 'Éclairage avant, arrière et clignotants pour deux-roues.',
  },
  {
    slug: 'accessoires',
    kicker: null,
    name: 'Accessoires',
    family: 'ACCESSORY',
    position: 130,
    description: 'Adaptateurs, décodeurs anti-erreur, supports et connectique.',
  },
]

/*
  Sous-familles réelles. Chacune désigne un type de produit distinct, pas une
  déclinaison de culot ou de couleur.
*/
const SOUS_FAMILLES: Entree[] = [
  // LED au détail : la distinction tient au format, pas au culot.
  { slug: 'led-cms', kicker: null, name: 'LED CMS', family: 'OTHER', position: 10, parent: 'led-detail' },
  { slug: 'led-cablees', kicker: null, name: 'LED câblées 12 V', family: 'OTHER', position: 20, parent: 'led-detail' },

  // Plaque et recul.
  { slug: 'modules-plaque', kicker: null, name: 'Modules de plaque complets', family: 'PLATE', position: 10, parent: 'plaque-recul' },
  { slug: 'feux-recul', kicker: null, name: 'Feux de recul', family: 'REVERSE', position: 20, parent: 'plaque-recul' },

  // Xénon HID : le kit complet et l'ampoule seule ne se vendent pas pareil.
  { slug: 'kits-xenon-hid', kicker: null, name: 'Kits complets', family: 'XENON', position: 10, parent: 'xenon-hid' },
  { slug: 'ampoules-xenon-hid', kicker: null, name: 'Ampoules seules', family: 'XENON', position: 20, parent: 'xenon-hid' },

  // Éclairage additionnel.
  { slug: 'barres-led', kicker: null, name: 'Barres et rampes LED', family: 'OTHER', position: 10, parent: 'barres-phares-additionnels' },
  { slug: 'phares-additionnels', kicker: null, name: 'Phares additionnels et feux de travail', family: 'OTHER', position: 20, parent: 'barres-phares-additionnels' },
  { slug: 'supports-barres', kicker: null, name: 'Supports et fixations', family: 'ACCESSORY', position: 30, parent: 'barres-phares-additionnels' },
  { slug: 'faisceaux-barres', kicker: null, name: 'Faisceaux et connectique', family: 'ACCESSORY', position: 40, parent: 'barres-phares-additionnels' },
  { slug: 'lampes-inspection', kicker: null, name: "Lampes d'inspection", family: 'OTHER', position: 50, parent: 'barres-phares-additionnels' },

  // Accessoires : ces trois entrées existaient dans l'ancien menu et
  // pointaient sur des catégories inexistantes. Elles existent maintenant.
  { slug: 'adaptateurs', kicker: null, name: 'Adaptateurs de fixation', family: 'ACCESSORY', position: 10, parent: 'accessoires' },
  { slug: 'decodeurs', kicker: null, name: 'Décodeurs anti-erreur', family: 'ACCESSORY', position: 20, parent: 'accessoires' },
  { slug: 'supports-entretoises', kicker: null, name: 'Supports et entretoises', family: 'ACCESSORY', position: 30, parent: 'accessoires' },
]

/**
 * Rattachements de produits aux sous-familles.
 *
 * Seulement ce qui est vrai du catalogue réel : les deux accessoires de
 * démonstration sont bien un adaptateur et un décodeur. Rien d'autre n'est
 * rattaché — remplir les familles vides demanderait d'inventer des produits.
 */
const RATTACHEMENTS: Array<{ produit: string; categorie: string }> = [
  { produit: 'adaptateur-h7-golf-vii', categorie: 'adaptateurs' },
  { produit: 'decodeur-anti-erreur-canbus', categorie: 'decodeurs' },
]

async function upsert(entree: Entree, parentId: string | null) {
  const donnees = {
    name: entree.name,
    shortName: entree.kicker,
    family: entree.family,
    position: entree.position,
    description: entree.description ?? null,
    parentId,
  }

  const existante = await prisma.category.findUnique({ where: { slug: entree.slug } })

  if (existante) {
    // On ne touche pas à `published` : la visibilité appartient au
    // back-office, pas au script.
    await prisma.category.update({ where: { slug: entree.slug }, data: donnees })
    return { id: existante.id, cree: false }
  }

  const creee = await prisma.category.create({
    data: { slug: entree.slug, published: true, ...donnees },
  })
  return { id: creee.id, cree: true }
}

async function main() {
  console.log('→ Arborescence du catalogue')

  const idParSlug = new Map<string, string>()
  let crees = 0

  for (const rubrique of RUBRIQUES) {
    const { id, cree } = await upsert(rubrique, null)
    idParSlug.set(rubrique.slug, id)
    if (cree) crees += 1
    console.log(`  ${cree ? '+' : '·'} ${rubrique.slug}`)
  }

  for (const famille of SOUS_FAMILLES) {
    const parentId = idParSlug.get(famille.parent!) ?? null
    if (!parentId) {
      console.warn(`  ! ${famille.slug} : parent « ${famille.parent} » introuvable, ignorée`)
      continue
    }
    const { id, cree } = await upsert(famille, parentId)
    idParSlug.set(famille.slug, id)
    if (cree) crees += 1
    console.log(`  ${cree ? '+' : '·'}   ${famille.parent}/${famille.slug}`)
  }

  let rattaches = 0
  for (const lien of RATTACHEMENTS) {
    const [produit, categorie] = await Promise.all([
      prisma.product.findUnique({ where: { slug: lien.produit }, select: { id: true } }),
      prisma.category.findUnique({ where: { slug: lien.categorie }, select: { id: true } }),
    ])
    if (!produit || !categorie) continue

    await prisma.productCategory.upsert({
      where: { productId_categoryId: { productId: produit.id, categoryId: categorie.id } },
      update: {},
      create: { productId: produit.id, categoryId: categorie.id },
    })
    rattaches += 1
  }

  const total = await prisma.category.count()
  console.log(
    `  ${crees} catégorie(s) créée(s), ${RUBRIQUES.length + SOUS_FAMILLES.length} à jour, ` +
      `${rattaches} rattachement(s). ${total} catégories en base.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
