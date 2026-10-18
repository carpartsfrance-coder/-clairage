import type { ImportKind } from '@prisma/client'
import { normalizeHeader } from './csv'

/**
 * Formats d'import.
 *
 * Chaque format décrit ses colonnes une bonne fois : libellé, obligation,
 * exemple, et les intitulés qu'on accepte de reconnaître automatiquement. Cette
 * description sert à trois choses à la fois — la correspondance automatique, la
 * validation, et la documentation affichée à l'écran. Les tenir séparées les
 * ferait diverger, et c'est l'écran qui mentirait.
 */

export type ImportField = {
  key: string
  label: string
  required: boolean
  /** Intitulés reconnus automatiquement, en plus du libellé et de la clé. */
  aliases: string[]
  example: string
  help?: string
}

export type ImportDefinition = {
  kind: ImportKind
  label: string
  description: string
  /** Ce qu'une ligne représente : utile pour comprendre un fichier de 3 000 lignes. */
  rowMeaning: string
  fields: ImportField[]
  /** Avertissement affiché avant l'écriture, quand il y a un risque particulier. */
  caution?: string
}

export const IMPORT_DEFINITIONS: Record<string, ImportDefinition> = {
  PRODUCTS: {
    kind: 'PRODUCTS',
    label: 'Produits et variantes',
    description:
      "Crée ou met à jour des produits et leurs conditionnements. Une ligne par conditionnement : les colonnes du produit se répètent à l'identique sur chacune de ses lignes.",
    rowMeaning: 'une variante (un SKU)',
    caution:
      "Les produits importés sont créés en BROUILLON. Ils ne sont visibles sur la boutique qu'une fois publiés — un import ne met jamais directement en vente.",
    fields: [
      {
        key: 'slug',
        label: 'Identifiant produit',
        required: true,
        aliases: ['slugproduit', 'identifiant', 'refproduit', 'producthandle', 'handle'],
        example: 'kit-led-h7-blanc-pur-6000k',
        help: "Sert de clé : deux lignes avec le même identifiant appartiennent au même produit.",
      },
      {
        key: 'name',
        label: 'Nom du produit',
        required: true,
        aliases: ['nom', 'libelle', 'designation', 'titre', 'productname'],
        example: 'Kit LED H7',
      },
      {
        key: 'sku',
        label: 'Référence (SKU)',
        required: true,
        aliases: ['reference', 'ref', 'codearticle', 'ean', 'variantsku'],
        example: 'KIT-LED-H7-6000K',
        help: 'Doit être unique dans tout le catalogue.',
      },
      {
        key: 'variantName',
        label: 'Nom du conditionnement',
        required: true,
        aliases: ['nomvariante', 'variante', 'conditionnement', 'variantname'],
        example: 'Le kit complet',
      },
      {
        key: 'priceCents',
        label: 'Prix TTC',
        required: true,
        aliases: ['prix', 'prixttc', 'tarif', 'price', 'prixdevente'],
        example: '99,90',
        help: 'En euros. La virgule comme le point sont acceptés.',
      },
      {
        key: 'packaging',
        label: 'Type de conditionnement',
        required: false,
        aliases: ['typeconditionnement', 'packaging', 'unite'],
        example: 'KIT',
        help: 'UNIT, PAIR, PACK ou KIT. Par défaut UNIT.',
      },
      {
        key: 'stockOnHand',
        label: 'Stock détenu',
        required: false,
        aliases: ['stock', 'quantite', 'qte', 'stockdisponible', 'inventory'],
        example: '64',
        help: 'Laissé vide, le stock existant n’est pas modifié.',
      },
      {
        key: 'lowStockThreshold',
        label: "Seuil d'alerte",
        required: false,
        aliases: ['seuil', 'seuilalerte', 'stockmini'],
        example: '5',
      },
      {
        key: 'categorySlug',
        label: 'Catégorie',
        required: false,
        aliases: ['categorie', 'rayon', 'famille', 'category'],
        example: 'phares-led',
        help: "Identifiant d'une catégorie existante. Une catégorie inconnue fait échouer la ligne.",
      },
      {
        key: 'tagline',
        label: 'Accroche',
        required: false,
        aliases: ['accroche', 'soustitre', 'benefice'],
        example: 'Passez du jaune au blanc.',
      },
      {
        key: 'description',
        label: 'Description',
        required: false,
        aliases: ['descriptif', 'texte', 'details'],
        example: 'Ampoules LED H7 de 6 000 K…',
      },
      {
        key: 'bulbBase',
        label: 'Culot',
        required: false,
        aliases: ['culot', 'socket', 'base'],
        example: 'H7',
      },
      {
        key: 'colorTemperature',
        label: 'Température de couleur',
        required: false,
        aliases: ['temperature', 'kelvin', 'temperaturedecouleur', 'k'],
        example: '6000',
        help: 'En kelvins, sans unité.',
      },
      {
        key: 'vehicleType',
        label: 'Type de véhicule',
        required: false,
        aliases: ['typevehicule', 'vehicule'],
        example: 'CAR',
        help: 'CAR, MOTORCYCLE ou BOTH. Par défaut CAR.',
      },
    ],
  },

  FITMENTS: {
    kind: 'FITMENTS',
    label: 'Compatibilités',
    description:
      "Rattache une référence à un véhicule et à un emplacement, avec son statut. C'est l'import le plus sensible du catalogue : il décide de ce qu'on affirme au client.",
    rowMeaning: 'une compatibilité (véhicule × emplacement × référence)',
    caution:
      "Une ligne sans statut explicite est importée en « à vérifier », jamais en « compatible ». Une donnée manquante ne vaut pas confirmation.",
    fields: [
      {
        key: 'makeSlug',
        label: 'Marque',
        required: true,
        aliases: ['marque', 'constructeur', 'make', 'brand'],
        example: 'volkswagen',
      },
      {
        key: 'modelSlug',
        label: 'Modèle',
        required: true,
        aliases: ['modele', 'model'],
        example: 'golf',
      },
      {
        key: 'generationSlug',
        label: 'Génération',
        required: true,
        aliases: ['generation', 'gen', 'version'],
        example: 'golf-vii',
      },
      {
        key: 'equipmentCode',
        label: "Équipement d'origine",
        required: true,
        aliases: ['equipement', 'equipementorigine', 'optique', 'equipment'],
        example: 'HALOGEN',
        help: "HALOGEN, XENON_OEM ou LED_OEM. C'est lui qui décide de la compatibilité, pas le culot.",
      },
      {
        key: 'positionCode',
        label: 'Emplacement',
        required: true,
        aliases: ['emplacement', 'position', 'feu'],
        example: 'LOW_BEAM',
        help: 'Code d’un emplacement existant (LOW_BEAM, PLATE, REVERSE…).',
      },
      {
        key: 'sku',
        label: 'Référence (SKU)',
        required: true,
        aliases: ['reference', 'ref', 'article', 'codearticle'],
        example: 'KIT-LED-H7-6000K',
      },
      {
        key: 'status',
        label: 'Statut',
        required: false,
        aliases: ['statut', 'compatibilite', 'etat'],
        example: 'CONFIRMED',
        help: 'CONFIRMED, UNKNOWN ou INCOMPATIBLE. Vide ou illisible → UNKNOWN.',
      },
      {
        key: 'quantity',
        label: 'Quantité nécessaire',
        required: false,
        aliases: ['quantite', 'qte', 'nombre'],
        example: '1',
      },
      {
        key: 'restrictions',
        label: 'Restrictions de montage',
        required: false,
        aliases: ['restriction', 'remarque', 'note', 'montage'],
        example: 'Accès par la trappe arrière du phare.',
      },
      {
        key: 'roadApproval',
        label: 'Homologation routière',
        required: false,
        aliases: ['homologation', 'homologue', 'approval'],
        example: 'UNKNOWN',
        help: 'APPROVED, NOT_APPROVED ou UNKNOWN. Distincte de la compatibilité de montage.',
      },
      {
        key: 'source',
        label: 'Source',
        required: false,
        aliases: ['origine', 'provenance', 'reference_source'],
        example: 'Catalogue fournisseur 2026',
        help: "D'où vient l'information. Sans source, aucune date de vérification n'est posée.",
      },
      {
        key: 'verifiedAt',
        label: 'Date de vérification',
        required: false,
        aliases: ['dateverification', 'verifiele', 'date'],
        example: '2026-10-18',
        help: 'Format AAAA-MM-JJ. Ignorée si le statut n’est pas « confirmé ».',
      },
    ],
  },

  STOCK: {
    kind: 'STOCK',
    label: 'Stocks',
    description:
      'Met à jour le stock détenu et le seuil d’alerte de références existantes. Ne crée rien.',
    rowMeaning: 'une référence',
    caution:
      "Le stock des kits n'est pas modifiable : il se calcule depuis leurs composants. Les lignes visant un kit sont signalées et ignorées.",
    fields: [
      {
        key: 'sku',
        label: 'Référence (SKU)',
        required: true,
        aliases: ['reference', 'ref', 'codearticle', 'ean'],
        example: 'LED-H7-6000K-PAIR',
      },
      {
        key: 'stockOnHand',
        label: 'Stock détenu',
        required: true,
        aliases: ['stock', 'quantite', 'qte', 'inventory'],
        example: '64',
      },
      {
        key: 'lowStockThreshold',
        label: "Seuil d'alerte",
        required: false,
        aliases: ['seuil', 'seuilalerte', 'stockmini'],
        example: '5',
      },
    ],
  },
}

export const IMPORT_KINDS = Object.keys(IMPORT_DEFINITIONS) as Array<keyof typeof IMPORT_DEFINITIONS>

/**
 * Correspondance automatique des colonnes.
 *
 * Elle propose, elle ne décide pas : l'écran affiche le résultat et laisse
 * corriger avant toute écriture. Une correspondance devinée et appliquée en
 * silence est le meilleur moyen de remplir une colonne « prix » avec des
 * références.
 */
export function suggestMapping(
  headers: string[],
  definition: ImportDefinition,
): Record<string, string> {
  const mapping: Record<string, string> = {}
  const taken = new Set<string>()

  for (const header of headers) {
    const normalized = normalizeHeader(header)
    if (!normalized) {
      mapping[header] = '__ignore__'
      continue
    }

    const field = definition.fields.find((candidate) => {
      if (taken.has(candidate.key)) return false
      const names = [candidate.key, candidate.label, ...candidate.aliases].map(normalizeHeader)
      return names.includes(normalized)
    })

    if (field) {
      mapping[header] = field.key
      taken.add(field.key)
    } else {
      mapping[header] = '__ignore__'
    }
  }

  return mapping
}

/** Colonnes obligatoires non couvertes par la correspondance proposée. */
export function missingRequiredFields(
  mapping: Record<string, string>,
  definition: ImportDefinition,
): ImportField[] {
  const mapped = new Set(Object.values(mapping))
  return definition.fields.filter((field) => field.required && !mapped.has(field.key))
}

/** Exemple de fichier, affiché et téléchargeable depuis l'écran d'import. */
export function sampleCsv(definition: ImportDefinition): string {
  const headers = definition.fields.map((field) => field.label)
  const example = definition.fields.map((field) => {
    // Un exemple contenant le délimiteur doit être protégé, sinon le fichier
    // d'exemple qu'on distribue est lui-même mal formé.
    return field.example.includes(';') ? `"${field.example}"` : field.example
  })
  return `${headers.join(';')}\n${example.join(';')}\n`
}
