/**
 * Jeu de démonstration.
 *
 * Toutes les lignes créées depuis ce fichier portent `isDemo: true`, ce qui
 * permet de les retirer en une commande (`npm run seed -- --purge-demo`) sans
 * toucher au code. Les visuels viennent des maquettes fournies : ce sont des
 * illustrations de rendu, jamais des photos d'essai — d'où `nature:
 * 'ILLUSTRATION'` sur chacun.
 *
 * Les prix, stocks et compatibilités reprennent les maquettes à titre
 * d'exemple. Aucun n'est une donnée validée.
 */

export const demoCategories = [
  { slug: 'phares-led', name: 'Phares LED', family: 'HEADLIGHT', hero: 'univers-phares-led.jpg', position: 1,
    description: "Feux de croisement, feux de route et antibrouillards." },
  { slug: 'interieur', name: 'Intérieur', family: 'INTERIOR', hero: 'univers-interieur.jpg', position: 2,
    description: "Plafonnier, habitacle, coffre et boîte à gants." },
  { slug: 'plaque-recul', name: 'Plaque & recul', family: 'PLATE', hero: 'univers-plaque-recul.jpg', position: 3,
    description: "Éclairage de plaque, feux de recul et veilleuses." },
  { slug: 'clignotants', name: 'Clignotants', family: 'TURN_SIGNAL', hero: 'indicator.png', position: 4,
    description: "Clignotants avant, arrière et répétiteurs." },
  { slug: 'xenon', name: 'Xénon', family: 'XENON', hero: 'univers-xenon.jpg', position: 5,
    description: "Ampoules xénon de remplacement." },
  { slug: 'moto', name: 'Moto', family: 'MOTORCYCLE', hero: 'univers-moto.jpg', position: 6,
    description: "Éclairage avant, arrière et clignotants deux-roues." },
  { slug: 'accessoires', name: 'Accessoires', family: 'ACCESSORY', hero: null, position: 7,
    description: "Adaptateurs, décodeurs anti-erreur et supports." },
] as const

export const demoLightPositions = [
  { code: 'LOW_BEAM', label: 'Feux de croisement', family: 'HEADLIGHT', defaultQty: 2, position: 1 },
  { code: 'HIGH_BEAM', label: 'Feux de route', family: 'HEADLIGHT', defaultQty: 2, position: 2 },
  { code: 'FOG', label: 'Antibrouillards', family: 'HEADLIGHT', defaultQty: 2, position: 3 },
  { code: 'INTERIOR_DOME', label: 'Plafonnier', family: 'INTERIOR', defaultQty: 1, position: 4 },
  { code: 'PLATE', label: 'Éclairage de plaque', family: 'PLATE', defaultQty: 2, position: 5 },
  { code: 'REVERSE', label: 'Feux de recul', family: 'REVERSE', defaultQty: 1, position: 6 },
  { code: 'SIDELIGHT', label: 'Veilleuses', family: 'SIDELIGHT', defaultQty: 2, position: 7 },
  { code: 'TURN_FRONT', label: 'Clignotants avant', family: 'TURN_SIGNAL', defaultQty: 2, position: 8 },
] as const

/**
 * Équipements d'origine.
 *
 * `hint` est écrit pour quelqu'un qui regarde ses phares, pas pour un
 * mécanicien : c'est ce qui permet de se reconnaître sans ouvrir le capot ni
 * chercher une référence.
 */
export const demoEquipment = [
  {
    code: 'HALOGEN',
    label: 'Phares halogènes',
    position: 1,
    description: "Équipement d'origine le plus courant, ampoule à filament.",
    hint: 'Lumière jaune à l’allumage, immédiate. Ampoule visible derrière le verre.',
  },
  {
    code: 'XENON_OEM',
    label: "Xénon d'origine",
    position: 2,
    description: 'Bloc optique prévu pour une ampoule à décharge.',
    hint: 'Lumière blanche légèrement bleutée, qui met une seconde à monter en puissance.',
  },
  {
    code: 'LED_OEM',
    label: "LED d'origine",
    position: 3,
    description: 'Module LED intégré au bloc optique, non remplaçable par une ampoule.',
    hint: 'Plusieurs petits points lumineux alignés, allumage instantané.',
  },
] as const

/** Un seul véhicule de démonstration, celui des maquettes. */
export const demoVehicle = {
  make: { slug: 'volkswagen', name: 'Volkswagen', type: 'CAR' as const },
  model: { slug: 'golf', name: 'Golf' },
  generations: [
    { slug: 'golf-vii', name: 'Golf VII', phase: 'Phase 1', yearFrom: 2012, yearTo: 2016 },
    { slug: 'golf-vii-ph2', name: 'Golf VII', phase: 'Phase 2 (restylage)', yearFrom: 2017, yearTo: 2020 },
  ],
  /** Deux équipements d'origine sur la phase 1 : le client doit trancher. */
  configurations: [
    { generation: 'golf-vii', equipment: 'HALOGEN', label: 'Golf VII · phares halogènes' },
    { generation: 'golf-vii', equipment: 'XENON_OEM', label: 'Golf VII · xénon d’origine' },
    { generation: 'golf-vii-ph2', equipment: 'HALOGEN', label: 'Golf VII phase 2 · phares halogènes' },
  ],
} as const

type DemoVariant = {
  sku: string
  name: string
  packaging: 'UNIT' | 'PAIR' | 'PACK' | 'KIT'
  priceCents: number
  stockOnHand: number
  components?: Array<{ sku: string; quantity: number }>
}

export type DemoProduct = {
  slug: string
  name: string
  tagline: string
  description: string
  categories: string[]
  bulbBase: string | null
  colorTemperature: number | null
  vehicleType: 'CAR' | 'MOTORCYCLE' | 'BOTH'
  difficulty: 'UNKNOWN' | 'EASY' | 'MEDIUM' | 'HARD'
  kind: 'SIMPLE' | 'KIT'
  image: string | null
  /** Visuels additionnels de la fiche : rendu, contenu du kit, montage. */
  gallery?: Array<{ file: string; role: 'RESULT' | 'KIT_CONTENT' | 'INSTALL'; caption: string }>
  specs: Array<[string, string]>
  variants: DemoVariant[]
  featured?: boolean
}

export const demoProducts: DemoProduct[] = [
  // --- Accessoires d'abord : ils sont composants des kits -------------------
  {
    slug: 'adaptateur-h7-golf-vii',
    name: 'Adaptateur de fixation H7',
    tagline: "Maintient l'ampoule LED dans le bloc optique.",
    description:
      "Bague d'adaptation reprenant la fixation d'origine. Référence à vérifier bloc optique par bloc optique.",
    categories: ['accessoires'],
    bulbBase: 'H7',
    colorTemperature: null,
    vehicleType: 'CAR',
    difficulty: 'EASY',
    kind: 'SIMPLE',
    image: null,
    specs: [
      ['Culot', 'H7'],
      ['Matière', 'Acier inoxydable'],
      ['Vendu par', 'Unité'],
    ],
    variants: [
      { sku: 'ACC-ADAPT-H7', name: "Adaptateur H7 — l'unité", packaging: 'UNIT', priceCents: 690, stockOnHand: 240 },
    ],
  },
  {
    slug: 'decodeur-anti-erreur-canbus',
    name: 'Décodeur anti-erreur CAN bus',
    tagline: "Évite le voyant d'ampoule grillée au tableau de bord.",
    description:
      "Module à intercaler entre le faisceau et l'ampoule. Sa nécessité dépend du véhicule : elle est indiquée par la compatibilité, pas par le culot.",
    categories: ['accessoires'],
    bulbBase: null,
    colorTemperature: null,
    vehicleType: 'CAR',
    difficulty: 'EASY',
    kind: 'SIMPLE',
    image: null,
    specs: [
      ['Type', 'Résistance CAN bus'],
      ['Tension', '12 V'],
      ['Vendu par', 'Unité'],
    ],
    variants: [
      { sku: 'ACC-CANBUS-01', name: "Décodeur — l'unité", packaging: 'UNIT', priceCents: 990, stockOnHand: 180 },
    ],
  },

  // --- Produits mis en avant sur l'accueil ---------------------------------
  {
    slug: 'kit-led-h7-blanc-pur-6000k',
    name: 'Kit LED H7',
    tagline: 'Passez du jaune au blanc, avec tout le nécessaire pour votre montage.',
    description:
      "Ampoules LED H7 de température 6 000 K, livrées avec les adaptateurs et les décodeurs anti-erreur lorsque le véhicule les demande. Deux conditionnements : le kit complet, ou les ampoules seules si vous possédez déjà les accessoires.",
    categories: ['phares-led'],
    bulbBase: 'H7',
    colorTemperature: 6000,
    vehicleType: 'CAR',
    difficulty: 'EASY',
    kind: 'KIT',
    image: 'product.png',
    /*
      Pas de vue « montage » : la vignette dont on disposait était une capture
      de maquette recadrée, bouton de lecture compris, pour une vidéo qui
      n'existe pas. Un visuel d'interface incrusté dans une photo produit
      promet une fonction absente.
    */
    gallery: [
      { file: 'car-night.png', role: 'RESULT', caption: 'Illustration de rendu — simulation de teinte.' },
      { file: 'product.png', role: 'KIT_CONTENT', caption: 'Contenu du kit complet.' },
    ],
    specs: [
      ['Culot', 'H7'],
      ['Température de couleur', '6 000 K'],
      ['Tension', '12 V'],
      ['Conditionnement', 'La paire'],
      ['Refroidissement', 'Ventilé'],
    ],
    variants: [
      {
        sku: 'KIT-LED-H7-6000K',
        name: 'Le kit complet',
        packaging: 'KIT',
        priceCents: 9990,
        stockOnHand: 0, // le stock d'un kit se calcule, il ne se saisit pas
        components: [
          { sku: 'LED-H7-6000K-PAIR', quantity: 1 },
          { sku: 'ACC-ADAPT-H7', quantity: 2 },
          { sku: 'ACC-CANBUS-01', quantity: 2 },
        ],
      },
      {
        sku: 'LED-H7-6000K-PAIR',
        name: 'Les ampoules seules',
        packaging: 'PAIR',
        priceCents: 6990,
        stockOnHand: 64,
      },
    ],
    featured: true,
  },
  {
    slug: 'pack-led-habitacle',
    name: 'Pack LED habitacle',
    tagline: 'Éclairage intérieur complet, en une seule commande.',
    description:
      "Ensemble d'ampoules pour le plafonnier, le coffre, la boîte à gants et les seuils de porte. La liste exacte dépend du véhicule sélectionné.",
    categories: ['interieur'],
    bulbBase: 'W5W',
    colorTemperature: 6000,
    vehicleType: 'CAR',
    difficulty: 'EASY',
    kind: 'SIMPLE',
    image: 'interior.png',
    specs: [
      ['Culots', 'W5W, C5W, T10'],
      ['Température de couleur', '6 000 K'],
      ['Conditionnement', 'Pack'],
    ],
    variants: [
      { sku: 'PACK-HAB-6000K', name: 'Le pack', packaging: 'PACK', priceCents: 2990, stockOnHand: 120 },
    ],
    featured: true,
  },
  {
    slug: 'pack-led-plaque',
    name: 'Pack LED de plaque',
    tagline: "Remplace l'éclairage de plaque d'origine.",
    description:
      "Modules d'éclairage de plaque à LED. Le format du module dépend du véhicule : la compatibilité est indiquée par emplacement.",
    categories: ['plaque-recul'],
    bulbBase: 'C5W',
    colorTemperature: 6000,
    vehicleType: 'CAR',
    difficulty: 'EASY',
    kind: 'SIMPLE',
    image: 'produit-pack-plaque.jpg',
    specs: [
      ['Culot', 'C5W / module dédié'],
      ['Température de couleur', '6 000 K'],
      ['Conditionnement', 'La paire'],
    ],
    variants: [
      { sku: 'PACK-PLAQ-6000K', name: 'La paire', packaging: 'PAIR', priceCents: 1490, stockOnHand: 95 },
    ],
    featured: true,
  },
  {
    slug: 'ampoules-xenon-d1s',
    name: 'Ampoules xénon D1S',
    tagline: "Remplacement à l'identique pour un bloc xénon d'origine.",
    description:
      "Ampoules à décharge D1S destinées aux véhicules équipés d'un bloc xénon d'origine. Elles ne remplacent pas un phare halogène.",
    categories: ['xenon'],
    bulbBase: 'D1S',
    colorTemperature: 6000,
    vehicleType: 'CAR',
    difficulty: 'MEDIUM',
    kind: 'SIMPLE',
    image: 'xenon.png',
    specs: [
      ['Culot', 'D1S'],
      ['Température de couleur', '6 000 K'],
      ['Conditionnement', 'La paire'],
      ['Prérequis', "Bloc xénon d'origine"],
    ],
    variants: [
      { sku: 'XEN-D1S-6000K', name: 'La paire', packaging: 'PAIR', priceCents: 4990, stockOnHand: 42 },
    ],
    featured: true,
  },
]

/**
 * Compatibilités de démonstration.
 *
 * Volontairement incomplètes et contrastées : un cas confirmé, un cas sans
 * information, un cas incompatible. C'est exactement ce que le parcours doit
 * savoir restituer.
 */
export type DemoFitment = {
  configuration: { generation: string; equipment: string }
  position: string
  sku: string
  status: 'CONFIRMED' | 'UNKNOWN' | 'INCOMPATIBLE'
  quantity: number
  roadApproval: 'APPROVED' | 'NOT_APPROVED' | 'UNKNOWN'
  approvalNote?: string | null
  restrictions?: string | null
  source: string | null
  accessories: Array<{ sku: string; quantity: number; required: boolean; note?: string | null }>
}

export const demoFitments: DemoFitment[] = [
  {
    configuration: { generation: 'golf-vii', equipment: 'HALOGEN' },
    position: 'LOW_BEAM',
    sku: 'KIT-LED-H7-6000K',
    status: 'CONFIRMED',
    quantity: 1,
    roadApproval: 'UNKNOWN',
    approvalNote:
      "L'homologation d'un kit LED en remplacement d'un halogène dépend du produit et du pays ; elle n'est pas établie pour cette référence.",
    restrictions: "Accès par la trappe arrière du phare, sans dépose du pare-chocs.",
    source: 'Donnée de démonstration',
    accessories: [
      { sku: 'ACC-ADAPT-H7', quantity: 2, required: true, note: 'Fixation du bloc optique Golf VII.' },
      { sku: 'ACC-CANBUS-01', quantity: 2, required: true, note: "Évite le voyant d'ampoule grillée." },
    ],
  },
  {
    configuration: { generation: 'golf-vii', equipment: 'HALOGEN' },
    position: 'LOW_BEAM',
    sku: 'LED-H7-6000K-PAIR',
    status: 'CONFIRMED',
    quantity: 1,
    roadApproval: 'UNKNOWN',
    restrictions: 'Adaptateurs et décodeurs nécessaires, non inclus.',
    source: 'Donnée de démonstration',
    accessories: [
      { sku: 'ACC-ADAPT-H7', quantity: 2, required: true, note: null },
      { sku: 'ACC-CANBUS-01', quantity: 2, required: true, note: null },
    ],
  },
  {
    // Xénon d'origine : un kit H7 n'a rien à y faire.
    configuration: { generation: 'golf-vii', equipment: 'XENON_OEM' },
    position: 'LOW_BEAM',
    sku: 'KIT-LED-H7-6000K',
    status: 'INCOMPATIBLE',
    quantity: 1,
    roadApproval: 'NOT_APPROVED',
    restrictions:
      "Le bloc optique xénon n'accepte pas d'ampoule H7 : le culot et l'allumage sont différents.",
    source: 'Donnée de démonstration',
    accessories: [],
  },
  {
    configuration: { generation: 'golf-vii', equipment: 'XENON_OEM' },
    position: 'LOW_BEAM',
    sku: 'XEN-D1S-6000K',
    status: 'CONFIRMED',
    quantity: 1,
    roadApproval: 'APPROVED',
    source: 'Donnée de démonstration',
    accessories: [],
  },
  {
    configuration: { generation: 'golf-vii', equipment: 'HALOGEN' },
    position: 'PLATE',
    sku: 'PACK-PLAQ-6000K',
    status: 'CONFIRMED',
    quantity: 1,
    roadApproval: 'APPROVED',
    source: 'Donnée de démonstration',
    accessories: [],
  },
  {
    // Cas « informations insuffisantes » : la ligne existe et le dit.
    configuration: { generation: 'golf-vii-ph2', equipment: 'HALOGEN' },
    position: 'LOW_BEAM',
    sku: 'KIT-LED-H7-6000K',
    status: 'UNKNOWN',
    quantity: 1,
    roadApproval: 'UNKNOWN',
    restrictions: "Le bloc optique de la phase 2 n'a pas été vérifié.",
    source: null,
    accessories: [],
  },
]

/**
 * Compléments facultatifs proposés sur une fiche.
 *
 * Ce sont des SUGGESTIONS, pas des pièces nécessaires : les adaptateurs et
 * décodeurs qu'un kit exige passent par `demoFitments` (accessoires de
 * compatibilité) et s'affichent dans le bloc d'achat. Mélanger les deux ferait
 * passer une pièce indispensable pour une option, ou l'inverse.
 *
 * La compatibilité de chaque complément est résolue séparément, pour son
 * propre véhicule : rien n'est hérité du produit qui le propose.
 */
export const demoRelations = [
  // Qui pose des LED dans ses phares pense rarement à la plaque et à
  // l'habitacle le même jour — mais les trois se montent ensemble.
  { source: 'kit-led-h7-blanc-pur-6000k', target: 'pack-led-habitacle', position: 1 },
  { source: 'kit-led-h7-blanc-pur-6000k', target: 'pack-led-plaque', position: 2 },
  { source: 'ampoules-xenon-d1s', target: 'pack-led-plaque', position: 1 },
  { source: 'ampoules-xenon-d1s', target: 'pack-led-habitacle', position: 2 },
  { source: 'pack-led-habitacle', target: 'pack-led-plaque', position: 1 },
  { source: 'pack-led-plaque', target: 'pack-led-habitacle', position: 1 },
] as const

/** Contenus éditoriaux de la page d'accueil, administrables ensuite. */
export const demoHomeBlocks = {
  hero: {
    eyebrow: 'Éclairage auto & moto',
    title: 'Passez du jaune au blanc LED.',
    // Coupes de ligne reprises de la référence (`<br>` dans son HTML) : elles
    // font partie de la composition du bandeau.
    subtitle:
      'Phares, intérieur, plaque…\nLe bon éclairage pour votre véhicule,\navec les bons accessoires.',
    ctaLabel: 'Trouver mon éclairage',
    // Ancre, et non page séparée : le sélecteur est juste en dessous et visible
    // dès l'arrivée. Y envoyer directement évite un chargement de page pour
    // revenir au même geste. La page /vehicule reste accessible par le menu,
    // pour qui veut l'explication complète du parcours.
    ctaHref: '#choisir-mon-vehicule',
    bullets: ['Montage expliqué', 'Assistance au choix'],
    image: 'home-hero.png',
    imageCaption: 'Illustration de rendu.',
  },
  vehicleBand: {
    title: 'Le bon éclairage commence par votre véhicule.',
    note: "Votre équipement d'origine sera précisé avant le choix du kit.",
  },
  reassurance: [
    {
      icon: 'gear',
      title: 'Des kits adaptés au montage',
      text: 'Des solutions pensées pour votre véhicule.',
    },
    {
      icon: 'wrench',
      title: 'Branchement sans modifier le câblage',
      text: 'Une installation simple et réversible.',
      footnote: 'Selon le véhicule et son équipement d’origine.',
    },
    {
      icon: 'shield',
      title: 'Un accompagnement avant et après',
      text: 'Nos experts vous guident à chaque étape.',
    },
  ],
  universes: {
    eyebrow: 'À chaque envie, son éclairage',
    title: 'Du blanc, partout où vous le voulez.',
  },
  comparison: {
    eyebrow: 'Le détail qui change tout',
    title: 'Même voiture.\nUn autre regard.',
    subtitle: 'Un blanc pur pour moderniser le style de votre véhicule.',
    /*
      La cible est une rubrique, pas un produit. Ce bloc fournit les valeurs
      par DÉFAUT de la page d'accueil : elles servent partout où la table
      `HomeBlock` est vide, donc sur tout environnement neuf. Le bouton
      pointait sur un produit de démonstration, absent de la production
      installée sans `--demo` : le visiteur qui cliquait tombait sur un 404,
      depuis la page d'accueil. Une rubrique existe dès que la taxonomie est
      semée.
    */
    ctaLabel: 'Voir les kits LED pour phares',
    ctaHref: '/c/phares-led',
    image: 'car-night.png',
    caption: 'Simulation de rendu — illustration.',
    leftLabel: 'Jaune',
    rightLabel: 'Blanc LED',
  },
  products: {
    eyebrow: 'Les essentiels pour passer au blanc',
    title: 'Votre prochain changement commence ici.',
  },
  method: {
    title: 'Le bon produit. Les bons conseils.',
    eyebrow: 'Plus simple quand on est bien accompagné',
    steps: [
      {
        icon: 'gear',
        title: 'Un kit pour votre montage',
        text: 'Des produits compatibles avec votre véhicule, sélectionnés avec soin.',
        linkLabel: 'Vérifier mon véhicule',
        linkHref: '#choisir-mon-vehicule',
      },
      {
        icon: 'wrench',
        title: 'Une installation expliquée',
        text: 'Des guides et conseils clairs pour un montage en toute confiance.',
        linkLabel: 'Voir les guides de montage',
        linkHref: '/guides',
      },
      {
        icon: 'headset',
        title: 'Un humain à vos côtés',
        text: 'Notre équipe vous aide à choisir et vous accompagne après l’achat.',
        linkLabel: 'Demander conseil',
        linkHref: '/contact',
      },
    ],
  },
  moto: {
    title: 'Le blanc LED.\nL’esprit libre.',
    subtitle: 'Des solutions d’éclairage haute performance pour votre moto.',
    ctaLabel: 'Trouver pour ma moto',
    ctaHref: '/c/moto',
    image: 'motorcycle.png',
    caption: 'Visuel illustratif · gamme de démonstration',
    eyebrow: 'Et sur deux roues ?',
  },
  help: {
    title: 'Le bon conseil, au bon moment.',
    text: 'Une question sur un produit, une compatibilité ou un montage ? Notre équipe est là pour vous aider.',
    ctaLabel: 'Demander conseil',
    ctaHref: '/contact',
  },
}

export const demoFaq = [
  {
    question: 'Comment savoir si un kit convient à mon véhicule ?',
    answer:
      "Renseignez la marque, le modèle et l'année, puis l'équipement d'origine de vos phares. La compatibilité s'affiche alors par emplacement : confirmée, à vérifier, ou incompatible. Un culot identique ne suffit pas à garantir le montage.",
  },
  {
    question: 'Un kit LED est-il homologué pour la route ?',
    answer:
      "La compatibilité de montage et l'homologation routière sont deux choses distinctes. L'homologation dépend du produit, du véhicule et du pays ; elle est indiquée séparément sur chaque fiche, et reste « à confirmer » tant qu'elle n'a pas été établie.",
  },
  {
    question: 'Que contient un kit complet ?',
    answer:
      "Les ampoules, et les accessoires rendus nécessaires par votre véhicule : adaptateurs de fixation, décodeurs anti-erreur. Le détail est affiché avant l'achat, et le panier reprend chaque composant ligne par ligne.",
  },
  {
    question: 'Puis-je acheter les ampoules sans les accessoires ?',
    answer:
      'Oui, lorsque le produit le permet. Les deux conditionnements sont proposés côte à côte sur la fiche, avec ce que chacun contient.',
  },
]

/** Zone et méthodes de livraison de démonstration, à remplacer. */
export const demoShipping = {
  zone: { code: 'FR', label: 'France métropolitaine', countries: ['FR'] },
  methods: [
    {
      code: 'COLISSIMO',
      label: 'Livraison à domicile',
      carrier: 'Colissimo',
      priceCents: 590,
      freeFromCents: 8000,
      minDays: 2,
      maxDays: 3,
      position: 1,
    },
    {
      code: 'RELAIS',
      label: 'Livraison en point relais',
      carrier: 'Mondial Relay',
      priceCents: 390,
      freeFromCents: 8000,
      minDays: 3,
      maxDays: 5,
      position: 2,
    },
  ],
}
