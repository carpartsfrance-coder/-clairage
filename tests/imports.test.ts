import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import {
  getImportReport,
  prepareImport,
  previewImport,
  runImportChunk,
  updateMapping,
} from '../src/lib/imports/runner'
import { IMPORT_DEFINITIONS, suggestMapping } from '../src/lib/imports/definitions'

/**
 * Moteur d'import, sur vraie base.
 *
 * Ce que ces tests protègent : un import rate rarement bruyamment. Il écrit un
 * prix à un centime, écrase une ligne avec son doublon, ou affirme une
 * compatibilité que personne n'a vérifiée. Les cas ci-dessous sont exactement
 * ceux-là.
 */
const prisma = new PrismaClient()

async function reset() {
  await prisma.importRow.deleteMany()
  await prisma.importJob.deleteMany()
  await prisma.stockMovement.deleteMany()
  await prisma.fitment.deleteMany()
  await prisma.vehicleConfiguration.deleteMany()
  await prisma.vehicleGeneration.deleteMany()
  await prisma.vehicleModel.deleteMany()
  await prisma.vehicleMake.deleteMany()
  await prisma.lightingEquipment.deleteMany()
  await prisma.lightPosition.deleteMany()
  await prisma.kitComponent.deleteMany()
  await prisma.productVariant.deleteMany()
  await prisma.productCategory.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
}

beforeEach(reset)
afterAll(async () => {
  await reset()
  await prisma.$disconnect()
})

async function runToCompletion(jobId: string) {
  let guard = 0
  let last = await runImportChunk(jobId)
  while (!('error' in last) && !last.done && guard < 50) {
    last = await runImportChunk(jobId)
    guard += 1
  }
  return last
}

/* -------------------------------------------------------------------------- */

describe('correspondance automatique des colonnes', () => {
  it('reconnaît des intitulés français accentués et ponctués', () => {
    const mapping = suggestMapping(
      ['Référence', 'Nom du produit', 'Prix TTC (€)', 'Identifiant produit', 'Commentaire'],
      IMPORT_DEFINITIONS.PRODUCTS,
    )
    expect(mapping['Référence']).toBe('sku')
    expect(mapping['Nom du produit']).toBe('name')
    expect(mapping['Prix TTC (€)']).toBe('priceCents')
    expect(mapping['Identifiant produit']).toBe('slug')
    // Ce qu'on ne reconnaît pas est écarté, jamais deviné.
    expect(mapping['Commentaire']).toBe('__ignore__')
  })

  it('n’associe pas deux colonnes au même champ', () => {
    const mapping = suggestMapping(['sku', 'reference', 'ref'], IMPORT_DEFINITIONS.PRODUCTS)
    const assigned = Object.values(mapping).filter((value) => value === 'sku')
    expect(assigned).toHaveLength(1)
  })
})

describe('import de produits', () => {
  const csv = [
    'Identifiant produit;Nom du produit;Référence;Nom du conditionnement;Prix TTC (€);Stock détenu',
    'kit-led-h7;Kit LED H7;LED-H7-PAIR;Les ampoules seules;69,90;64',
    'kit-led-h7;Kit LED H7;KIT-LED-H7;Le kit complet;99,90;0',
  ].join('\n')

  it('crée les produits en brouillon, jamais publiés', async () => {
    const prepared = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'produits.csv',
      content: csv,
      createdBy: 'test',
    })
    expect('jobId' in prepared).toBe(true)
    if (!('jobId' in prepared)) return

    expect(prepared.missingRequired).toEqual([])

    const preview = await previewImport(prepared.jobId)
    expect(preview).toMatchObject({ valid: 2, errors: 0, duplicates: 0 })

    // Rien n'est écrit avant l'exécution : c'est tout l'intérêt de l'étape.
    expect(await prisma.product.count()).toBe(0)

    const result = await runToCompletion(prepared.jobId)
    expect(result).toMatchObject({ done: true, created: 2, errors: 0 })

    const product = await prisma.product.findUniqueOrThrow({ where: { slug: 'kit-led-h7' } })
    // Un import ne met jamais en vente.
    expect(product.status).toBe('DRAFT')

    const variants = await prisma.productVariant.findMany({ orderBy: { sku: 'asc' } })
    expect(variants.map((v) => v.sku)).toEqual(['KIT-LED-H7', 'LED-H7-PAIR'])
    // Le prix français « 69,90 » doit valoir 6990 centimes, pas 69.
    expect(variants.find((v) => v.sku === 'LED-H7-PAIR')?.priceCents).toBe(6990)
    expect(variants.find((v) => v.sku === 'KIT-LED-H7')?.priceCents).toBe(9990)
  })

  it('rapporte les erreurs ligne par ligne sans arrêter l’import', async () => {
    const mauvais = [
      'Identifiant produit;Nom du produit;Référence;Nom du conditionnement;Prix TTC (€)',
      'kit-a;Kit A;SKU-A;Unité;19,90',
      'kit-b;Kit B;SKU-B;Unité;sur devis',
      ';Kit C;SKU-C;Unité;29,90',
      'kit-d;Kit D;SKU-D;Unité;39,90',
    ].join('\n')

    const prepared = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'mauvais.csv',
      content: mauvais,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')

    const preview = await previewImport(prepared.jobId)
    expect(preview).toMatchObject({ valid: 2, errors: 2 })

    await runToCompletion(prepared.jobId)

    // Les lignes saines sont passées malgré les deux fautives.
    expect(await prisma.productVariant.count()).toBe(2)

    const report = await getImportReport(prepared.jobId)
    const erreurs = report!.rows.filter((row) => row.outcome === 'error')
    expect(erreurs).toHaveLength(2)
    // Le motif est explicite et porte le numéro de ligne du fichier.
    expect(erreurs[0].rowNumber).toBe(3)
    expect(erreurs[0].message).toContain('Prix illisible')
    expect(erreurs[1].rowNumber).toBe(4)
    expect(erreurs[1].message).toContain('Identifiant produit manquant')
  })

  it('signale un doublon dans le fichier au lieu de l’écraser en silence', async () => {
    const doublons = [
      'Identifiant produit;Nom du produit;Référence;Nom du conditionnement;Prix TTC (€)',
      'kit-a;Kit A;SKU-A;Unité;19,90',
      'kit-a;Kit A;SKU-A;Unité;29,90',
    ].join('\n')

    const prepared = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'doublons.csv',
      content: doublons,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')

    const preview = await previewImport(prepared.jobId)
    expect(preview).toMatchObject({ valid: 1, duplicates: 1 })

    await runToCompletion(prepared.jobId)

    // C'est la PREMIÈRE ligne qui gagne, et le prix de la seconde n'est jamais
    // écrit : sinon l'écrasement serait invisible.
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { sku: 'SKU-A' } })
    expect(variant.priceCents).toBe(1990)

    const report = await getImportReport(prepared.jobId)
    const doublon = report!.rows.find((row) => row.outcome === 'duplicate')
    expect(doublon?.message).toContain('ligne 2')
  })

  it('détaille ce qui change lors d’une mise à jour', async () => {
    const premier = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'a.csv',
      content:
        'Identifiant produit;Nom du produit;Référence;Nom du conditionnement;Prix TTC (€)\nkit-a;Kit A;SKU-A;Unité;19,90',
      createdBy: 'test',
    })
    if (!('jobId' in premier)) throw new Error('préparation échouée')
    await previewImport(premier.jobId)
    await runToCompletion(premier.jobId)

    const second = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'b.csv',
      content:
        'Identifiant produit;Nom du produit;Référence;Nom du conditionnement;Prix TTC (€)\nkit-a;Kit A;SKU-A;Unité;24,50',
      createdBy: 'test',
    })
    if (!('jobId' in second)) throw new Error('préparation échouée')
    await previewImport(second.jobId)
    const result = await runToCompletion(second.jobId)
    expect(result).toMatchObject({ updated: 1, created: 0 })

    const report = await getImportReport(second.jobId)
    // « mis à jour » ne suffit pas : on doit pouvoir vérifier quoi.
    expect(report!.rows[0].message).toContain('priceCents : 1990 → 2450')
  })

  it('respecte le mode « création seule »', async () => {
    const content =
      'Identifiant produit;Nom du produit;Référence;Nom du conditionnement;Prix TTC (€)\nkit-a;Kit A;SKU-A;Unité;19,90'

    const premier = await prepareImport({ kind: 'PRODUCTS', filename: 'a.csv', content, createdBy: 't' })
    if (!('jobId' in premier)) throw new Error('échec')
    await previewImport(premier.jobId)
    await runToCompletion(premier.jobId)

    const second = await prepareImport({ kind: 'PRODUCTS', filename: 'b.csv', content, createdBy: 't' })
    if (!('jobId' in second)) throw new Error('échec')
    await prisma.importJob.update({ where: { id: second.jobId }, data: { writeMode: 'create_only' } })
    await previewImport(second.jobId)
    const result = await runToCompletion(second.jobId)

    expect(result).toMatchObject({ created: 0, skipped: 1 })
  })
})

describe('reprise après interruption', () => {
  it('repart du curseur sans rejouer les lignes déjà écrites', async () => {
    const lignes = Array.from(
      { length: 120 },
      (_, i) => `kit-${i};Kit ${i};SKU-${i};Unité;${i + 1},00`,
    )
    const content = [
      'Identifiant produit;Nom du produit;Référence;Nom du conditionnement;Prix TTC (€)',
      ...lignes,
    ].join('\n')

    const prepared = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'gros.csv',
      content,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')
    await previewImport(prepared.jobId)

    // Un seul lot : l'import est volontairement laissé inachevé.
    const premierLot = await runImportChunk(prepared.jobId)
    if ('error' in premierLot) throw new Error(premierLot.error)
    expect(premierLot.done).toBe(false)
    expect(premierLot.created).toBe(50)
    const curseur = premierLot.cursor

    const apresUnLot = await prisma.productVariant.count()
    expect(apresUnLot).toBe(50)

    // Reprise : les 50 premières ne doivent pas être réécrites.
    const final = await runToCompletion(prepared.jobId)
    if ('error' in final) throw new Error(final.error)

    expect(final.done).toBe(true)
    expect(final.created).toBe(120)
    expect(final.cursor).toBeGreaterThan(curseur)
    expect(await prisma.productVariant.count()).toBe(120)

    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: prepared.jobId } })
    expect(job.status).toBe('DONE')
    expect(job.finishedAt).not.toBeNull()
  })
})

describe('import de compatibilités', () => {
  async function seedVehicle() {
    const make = await prisma.vehicleMake.create({
      data: { slug: 'volkswagen', name: 'Volkswagen', type: 'CAR' },
    })
    const model = await prisma.vehicleModel.create({
      data: { makeId: make.id, slug: 'golf', name: 'Golf' },
    })
    await prisma.vehicleGeneration.create({
      data: { modelId: model.id, slug: 'golf-vii', name: 'Golf VII', yearFrom: 2012, yearTo: 2020 },
    })
    await prisma.lightingEquipment.create({ data: { code: 'HALOGEN', label: 'Halogène' } })
    await prisma.lightPosition.create({
      data: { code: 'LOW_BEAM', label: 'Feux de croisement', family: 'HEADLIGHT' },
    })
    const product = await prisma.product.create({
      data: { slug: 'kit', name: 'Kit', status: 'PUBLISHED' },
    })
    await prisma.productVariant.create({
      data: { productId: product.id, sku: 'KIT-1', name: 'Kit', priceCents: 9990 },
    })
  }

  const entete =
    'Marque;Modèle;Génération;Équipement d’origine;Emplacement;Référence;Statut;Source;Date de vérification'

  it('n’affirme jamais une compatibilité que le fichier ne porte pas', async () => {
    await seedVehicle()
    const content = [
      entete,
      // Statut absent : doit devenir « à vérifier », jamais « confirmé ».
      'volkswagen;golf;golf-vii;HALOGEN;LOW_BEAM;KIT-1;;;',
    ].join('\n')

    const prepared = await prepareImport({
      kind: 'FITMENTS',
      filename: 'compat.csv',
      content,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')

    const preview = await previewImport(prepared.jobId)
    expect(preview).toMatchObject({ valid: 1, warnings: 1 })

    await runToCompletion(prepared.jobId)

    const fitment = await prisma.fitment.findFirstOrThrow()
    expect(fitment.status).toBe('UNKNOWN')
    // Pas de date de vérification sur une compatibilité non confirmée.
    expect(fitment.verifiedAt).toBeNull()
  })

  it('pose une date de vérification seulement sur une compatibilité confirmée', async () => {
    await seedVehicle()
    const content = [
      entete,
      'volkswagen;golf;golf-vii;HALOGEN;LOW_BEAM;KIT-1;CONFIRMED;Catalogue 2026;2026-05-04',
    ].join('\n')

    const prepared = await prepareImport({
      kind: 'FITMENTS',
      filename: 'compat.csv',
      content,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')
    await previewImport(prepared.jobId)
    await runToCompletion(prepared.jobId)

    const fitment = await prisma.fitment.findFirstOrThrow()
    expect(fitment.status).toBe('CONFIRMED')
    expect(fitment.source).toBe('Catalogue 2026')
    expect(fitment.verifiedAt?.toISOString().slice(0, 10)).toBe('2026-05-04')
  })

  it('refuse une ligne dont le véhicule ou la référence est inconnu', async () => {
    await seedVehicle()
    const content = [
      entete,
      'peugeot;308;p308;HALOGEN;LOW_BEAM;KIT-1;CONFIRMED;;',
      'volkswagen;golf;golf-vii;HALOGEN;LOW_BEAM;INEXISTANT;CONFIRMED;;',
    ].join('\n')

    const prepared = await prepareImport({
      kind: 'FITMENTS',
      filename: 'compat.csv',
      content,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')
    await previewImport(prepared.jobId)
    await runToCompletion(prepared.jobId)

    expect(await prisma.fitment.count()).toBe(0)

    const report = await getImportReport(prepared.jobId)
    const messages = report!.rows.map((row) => row.message ?? '')
    expect(messages[0]).toContain('Véhicule introuvable')
    expect(messages[1]).toContain('introuvable')
  })
})

describe('import de stocks', () => {
  it('met à jour le stock et trace le mouvement', async () => {
    const product = await prisma.product.create({
      data: { slug: 'p', name: 'P', status: 'PUBLISHED' },
    })
    await prisma.productVariant.create({
      data: { productId: product.id, sku: 'SKU-1', name: 'Unité', priceCents: 1000, stockOnHand: 10 },
    })

    const prepared = await prepareImport({
      kind: 'STOCK',
      filename: 'stock.csv',
      content: 'Référence;Stock détenu\nSKU-1;42',
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')
    await previewImport(prepared.jobId)
    await runToCompletion(prepared.jobId)

    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { sku: 'SKU-1' } })
    expect(variant.stockOnHand).toBe(42)

    const movement = await prisma.stockMovement.findFirstOrThrow()
    expect(movement.delta).toBe(32)
    expect(movement.reason).toBe('import')

    const report = await getImportReport(prepared.jobId)
    expect(report!.rows[0].message).toContain('10 → 42')
  })

  it('refuse de fixer le stock d’un kit', async () => {
    const product = await prisma.product.create({
      data: { slug: 'p', name: 'P', status: 'PUBLISHED', kind: 'KIT' },
    })
    const composant = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'COMP', name: 'Composant', priceCents: 500, stockOnHand: 10 },
    })
    const kit = await prisma.productVariant.create({
      data: { productId: product.id, sku: 'KIT-1', name: 'Kit', packaging: 'KIT', priceCents: 1000 },
    })
    await prisma.kitComponent.create({
      data: { kitId: kit.id, componentId: composant.id, quantity: 2 },
    })

    const prepared = await prepareImport({
      kind: 'STOCK',
      filename: 'stock.csv',
      content: 'Référence;Stock détenu\nKIT-1;99',
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')
    await previewImport(prepared.jobId)
    const result = await runToCompletion(prepared.jobId)

    expect(result).toMatchObject({ skipped: 1, updated: 0 })
    const reloaded = await prisma.productVariant.findUniqueOrThrow({ where: { sku: 'KIT-1' } })
    expect(reloaded.stockOnHand).toBe(0)

    const report = await getImportReport(prepared.jobId)
    expect(report!.rows[0].message).toContain('kit')
  })
})

describe('correspondance corrigée à la main', () => {
  it('prend en compte une correspondance modifiée avant la prévisualisation', async () => {
    // Intitulés que la correspondance automatique ne peut pas deviner.
    const content = 'colonne_1;colonne_2;colonne_3;colonne_4;colonne_5\nkit-x;Kit X;SKU-X;Unité;15,00'

    const prepared = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'inconnu.csv',
      content,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')

    // Rien n'est deviné : les colonnes obligatoires manquent, et on le dit.
    expect(prepared.missingRequired.length).toBeGreaterThan(0)
    const refus = await previewImport(prepared.jobId)
    expect('error' in refus).toBe(true)

    await updateMapping(prepared.jobId, {
      colonne_1: 'slug',
      colonne_2: 'name',
      colonne_3: 'sku',
      colonne_4: 'variantName',
      colonne_5: 'priceCents',
    })

    const preview = await previewImport(prepared.jobId)
    expect(preview).toMatchObject({ valid: 1, errors: 0 })

    await runToCompletion(prepared.jobId)
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { sku: 'SKU-X' } })
    expect(variant.priceCents).toBe(1500)
  })
})

/* -------------------------------------------------------------------------- */

describe('écriture concurrente', () => {
  /**
   * Le cas réel : deux onglets ouverts sur le même import, ou deux membres de
   * l'équipe qui cliquent « Écrire le prochain lot » en même temps. Sans
   * verrou, les deux appels lisaient le même lot de lignes au-delà du curseur
   * et l'écrivaient deux fois, en comptant deux fois.
   */
  it('refuse un second lot pendant qu’un lot est en cours', async () => {
    await reset()

    const content = [
      'slug;nom;sku;conditionnement;prix',
      'kit-a;Kit A;SKU-A1;La paire;19,90',
      'kit-b;Kit B;SKU-B1;La paire;29,90',
    ].join('\n')

    const prepared = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'concurrence.csv',
      content,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')
    await previewImport(prepared.jobId)

    // Les deux appels partent ensemble, comme deux requêtes simultanées.
    const [first, second] = await Promise.all([
      runImportChunk(prepared.jobId),
      runImportChunk(prepared.jobId),
    ])

    const refused = [first, second].filter((result) => 'error' in result)
    const accepted = [first, second].filter((result) => !('error' in result))

    expect(accepted).toHaveLength(1)
    expect(refused).toHaveLength(1)
    expect((refused[0] as { error: string }).error).toContain('déjà en cours')

    // Et surtout : chaque ligne n'a été écrite qu'une fois.
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: prepared.jobId } })
    expect(job.createdRows).toBe(2)
    expect(job.processedRows).toBe(2)
    expect(await prisma.product.count()).toBe(2)
  })

  it('relâche le verrou en fin de lot, pour que le suivant passe', async () => {
    await reset()

    const content = [
      'slug;nom;sku;conditionnement;prix',
      'kit-c;Kit C;SKU-C1;La paire;19,90',
    ].join('\n')

    const prepared = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'suite.csv',
      content,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')
    await previewImport(prepared.jobId)

    const result = await runToCompletion(prepared.jobId)
    // Si le verrou n'était pas relâché, le second lot serait refusé et
    // `runToCompletion` ne terminerait jamais l'import.
    expect(result).toMatchObject({ done: true })

    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: prepared.jobId } })
    expect(job.status).toBe('DONE')
    expect(job.lockedAt).toBeNull()
  })
})

describe('correspondance modifiée après validation', () => {
  /**
   * Changer la correspondance invalide ce qui en découlait. Le chiffrage et les
   * verdicts de ligne doivent disparaître, sinon l'écran continue d'afficher
   * « n lignes valides » à propos d'une association qui n'existe plus — un
   * rapport périmé qui se lit comme une vérification.
   */
  it('efface le chiffrage et les verdicts', async () => {
    await reset()

    const content = [
      'slug;nom;sku;conditionnement;prix',
      'kit-d;Kit D;SKU-D1;La paire;19,90',
    ].join('\n')

    const prepared = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'remap.csv',
      content,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')

    await previewImport(prepared.jobId)
    expect(
      await prisma.importRow.count({ where: { jobId: prepared.jobId, outcome: 'ready' } }),
    ).toBe(1)

    const result = await updateMapping(prepared.jobId, prepared.mapping)
    expect(result).toMatchObject({ ok: true })

    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: prepared.jobId } })
    expect(job.status).toBe('DRAFT')
    expect(job.summary).toBeNull()
    expect(
      await prisma.importRow.count({ where: { jobId: prepared.jobId, outcome: 'ready' } }),
    ).toBe(0)
    expect(
      await prisma.importRow.count({ where: { jobId: prepared.jobId, outcome: 'pending' } }),
    ).toBe(1)
  })

  it('REFUSE de changer la correspondance d’un import terminé', async () => {
    await reset()

    const content = [
      'slug;nom;sku;conditionnement;prix',
      'kit-e;Kit E;SKU-E1;La paire;19,90',
    ].join('\n')

    const prepared = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'termine.csv',
      content,
      createdBy: 'test',
    })
    if (!('jobId' in prepared)) throw new Error('préparation échouée')

    await previewImport(prepared.jobId)
    await runToCompletion(prepared.jobId)

    const result = await updateMapping(prepared.jobId, prepared.mapping)
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toContain('terminé')
  })
})

describe('plafond de lignes', () => {
  it('refuse un fichier au-delà du plafond, en disant combien', async () => {
    await reset()

    const header = 'slug;nom;sku;conditionnement;prix'
    const rows = Array.from(
      { length: 20_001 },
      (_, i) => `kit-${i};Kit ${i};SKU-${i};La paire;19,90`,
    )

    const result = await prepareImport({
      kind: 'PRODUCTS',
      filename: 'enorme.csv',
      content: [header, ...rows].join('\n'),
      createdBy: 'test',
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      // toLocaleString('fr-FR') sépare les milliers par une espace fine
      // insécable (U+202F), pas par une espace ordinaire.
      expect(result.error).toContain((20_001).toLocaleString('fr-FR'))
      expect(result.error).toContain('Découpez')
    }
    // Rien n'a été créé : le refus arrive avant l'écriture du travail.
    expect(await prisma.importJob.count()).toBe(0)
  })
})
