/**
 * Amorçage de la base.
 *
 * Deux usages :
 *   npm run seed                 — référentiels indispensables uniquement
 *                                  (TVA, emplacements lumineux, équipements,
 *                                  zones de livraison, paramètres).
 *   npm run seed:demo            — ajoute le jeu de démonstration.
 *   npm run seed -- --purge-demo — retire tout ce qui porte isDemo.
 *
 * Aucun compte administrateur n'est créé ici : un mot de passe en clair dans
 * le dépôt serait un défaut de sécurité. L'administrateur initial se crée avec
 * `npm run admin:create` (voir scripts/create-admin.ts), qui demande le mot de
 * passe de façon interactive.
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import {
  demoCategories,
  demoEquipment,
  demoFaq,
  demoFitments,
  demoHomeBlocks,
  demoLightPositions,
  demoProducts,
  demoShipping,
  demoVehicle,
} from './demo-data'

const prisma = new PrismaClient()

const args = process.argv.slice(2)
const withDemo = args.includes('--demo')
const purgeDemo = args.includes('--purge-demo')

async function seedReferenceData() {
  console.log('→ Référentiels')

  await prisma.vatRate.upsert({
    where: { code: 'FR_STANDARD' },
    update: {},
    create: { code: 'FR_STANDARD', label: 'TVA 20 % (France)', rateBp: 2000, isDefault: true },
  })

  for (const position of demoLightPositions) {
    await prisma.lightPosition.upsert({
      where: { code: position.code },
      update: { label: position.label, family: position.family, defaultQty: position.defaultQty },
      create: { ...position },
    })
  }

  for (const equipment of demoEquipment) {
    await prisma.lightingEquipment.upsert({
      where: { code: equipment.code },
      update: { label: equipment.label, description: equipment.description },
      create: { ...equipment },
    })
  }

  const zone = await prisma.shippingZone.upsert({
    where: { code: demoShipping.zone.code },
    update: {},
    create: { ...demoShipping.zone },
  })
  for (const method of demoShipping.methods) {
    await prisma.shippingMethod.upsert({
      where: { zoneId_code: { zoneId: zone.id, code: method.code } },
      update: { ...method },
      create: { ...method, zoneId: zone.id },
    })
  }

  // Paramètres pilotables depuis le back-office.
  const settings: Array<[string, string, Prisma.InputJsonValue, string]> = [
    ['shop.freeShippingThresholdCents', 'general', 8000, 'Seuil de livraison offerte (centimes TTC)'],
    ['shop.returnWindowDays', 'general', 14, 'Délai de rétractation (jours)'],
    ['shop.currency', 'general', 'EUR', 'Devise'],
    ['invoice.prefix', 'billing', 'FA', 'Préfixe de numérotation des factures'],
    ['invoice.creditPrefix', 'billing', 'AV', "Préfixe de numérotation des avoirs"],
    ['payments.provider', 'payments', 'stripe', 'Prestataire de paiement actif'],
    ['payments.testMode', 'payments', true, 'Mode test du prestataire'],
    ['email.provider', 'email', 'log', 'Prestataire e-mail (log = envoi simulé)'],
  ]
  for (const [key, group, value, label] of settings) {
    await prisma.setting.upsert({
      where: { key },
      update: { label, group },
      create: { key, group, value, label },
    })
  }
}

async function purge() {
  console.log('→ Suppression des données de démonstration')
  // L'ordre suit les dépendances : compatibilités, puis variantes, produits,
  // véhicules, médias.
  const demoVariants = await prisma.productVariant.findMany({
    where: { isDemo: true },
    select: { id: true },
  })
  const variantIds = demoVariants.map((v) => v.id)
  await prisma.fitmentAccessory.deleteMany({ where: { variantId: { in: variantIds } } })
  await prisma.fitment.deleteMany({ where: { variantId: { in: variantIds } } })
  await prisma.kitComponent.deleteMany({
    where: { OR: [{ kitId: { in: variantIds } }, { componentId: { in: variantIds } }] },
  })
  await prisma.productVariant.deleteMany({ where: { isDemo: true } })
  await prisma.product.deleteMany({ where: { isDemo: true } })
  await prisma.vehicleMake.deleteMany({ where: { slug: demoVehicle.make.slug } })
  await prisma.media.deleteMany({ where: { isDemo: true } })
  await prisma.homeBlock.deleteMany({})
  console.log('  données de démonstration retirées')
}

async function seedDemo() {
  console.log('→ Jeu de démonstration')

  // --- Médias ---------------------------------------------------------------
  const mediaBySlug = new Map<string, string>()
  async function media(file: string, alt: string, caption?: string) {
    if (mediaBySlug.has(file)) return mediaBySlug.get(file)!
    const record = await prisma.media.upsert({
      where: { storageKey: `demo/${file}` },
      update: { alt, caption },
      create: {
        storageKey: `demo/${file}`,
        url: `/demo/${file}`,
        mimeType: 'image/jpeg',
        alt,
        caption,
        // Les visuels viennent des maquettes : ce sont des illustrations.
        nature: 'ILLUSTRATION',
        isDemo: true,
      },
    })
    mediaBySlug.set(file, record.id)
    return record.id
  }

  // --- Catégories -----------------------------------------------------------
  for (const category of demoCategories) {
    const heroMediaId = category.hero
      ? await media(category.hero, `Univers ${category.name} — illustration`)
      : null
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description, heroMediaId },
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        family: category.family,
        position: category.position,
        published: true,
        heroMediaId,
      },
    })
  }

  // --- Véhicule -------------------------------------------------------------
  const make = await prisma.vehicleMake.upsert({
    where: { slug: demoVehicle.make.slug },
    update: {},
    create: { ...demoVehicle.make },
  })
  const model = await prisma.vehicleModel.upsert({
    where: { makeId_slug: { makeId: make.id, slug: demoVehicle.model.slug } },
    update: {},
    create: { ...demoVehicle.model, makeId: make.id },
  })
  const generationBySlug = new Map<string, string>()
  for (const generation of demoVehicle.generations) {
    const record = await prisma.vehicleGeneration.upsert({
      where: { modelId_slug: { modelId: model.id, slug: generation.slug } },
      update: { name: generation.name, phase: generation.phase },
      create: { ...generation, modelId: model.id },
    })
    generationBySlug.set(generation.slug, record.id)
  }

  const equipmentByCode = new Map(
    (await prisma.lightingEquipment.findMany()).map((e) => [e.code, e.id]),
  )
  const positionByCode = new Map((await prisma.lightPosition.findMany()).map((p) => [p.code, p.id]))

  const configurationKey = (generation: string, equipment: string) => `${generation}|${equipment}`
  const configurationIds = new Map<string, string>()
  for (const config of demoVehicle.configurations) {
    const generationId = generationBySlug.get(config.generation)!
    const equipmentId = equipmentByCode.get(config.equipment)!
    const existing = await prisma.vehicleConfiguration.findFirst({
      where: { generationId, equipmentId, trimId: null, headlampRef: null },
    })
    const record =
      existing ??
      (await prisma.vehicleConfiguration.create({
        data: { generationId, equipmentId, label: config.label },
      }))
    configurationIds.set(configurationKey(config.generation, config.equipment), record.id)
  }

  // --- Produits et variantes ------------------------------------------------
  const vat = await prisma.vatRate.findUnique({ where: { code: 'FR_STANDARD' } })
  const variantIdBySku = new Map<string, string>()

  for (const product of demoProducts) {
    const record = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        tagline: product.tagline,
        description: product.description,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        featured: product.featured ?? false,
      },
      create: {
        slug: product.slug,
        name: product.name,
        tagline: product.tagline,
        description: product.description,
        kind: product.kind,
        vehicleType: product.vehicleType,
        difficulty: product.difficulty,
        bulbBase: product.bulbBase,
        colorTemperature: product.colorTemperature,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        featured: product.featured ?? false,
        isDemo: true,
        metaTitle: `${product.name} — ${product.tagline}`,
        metaDescription: product.description.slice(0, 155),
      },
    })

    await prisma.productCategory.deleteMany({ where: { productId: record.id } })
    for (const slug of product.categories) {
      const category = await prisma.category.findUnique({ where: { slug } })
      if (category) {
        await prisma.productCategory.create({
          data: { productId: record.id, categoryId: category.id },
        })
      }
    }

    await prisma.productSpec.deleteMany({ where: { productId: record.id } })
    await prisma.productSpec.createMany({
      data: product.specs.map(([label, value], index) => ({
        productId: record.id,
        label,
        value,
        position: index,
      })),
    })

    if (product.image) {
      const mediaId = await media(product.image, `${product.name} — visuel illustratif`)
      await prisma.productMedia.upsert({
        where: { productId_mediaId_role: { productId: record.id, mediaId, role: 'PRODUCT' } },
        update: {},
        create: { productId: record.id, mediaId, role: 'PRODUCT', position: 0 },
      })
    }
    for (const [index, item] of (product.gallery ?? []).entries()) {
      const mediaId = await media(item.file, `${product.name} — ${item.caption}`, item.caption)
      await prisma.productMedia.upsert({
        where: { productId_mediaId_role: { productId: record.id, mediaId, role: item.role } },
        update: {},
        create: { productId: record.id, mediaId, role: item.role, position: index + 1 },
      })
    }

    for (const [index, variant] of product.variants.entries()) {
      const saved = await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: { priceCents: variant.priceCents, name: variant.name },
        create: {
          productId: record.id,
          sku: variant.sku,
          name: variant.name,
          packaging: variant.packaging,
          priceCents: variant.priceCents,
          stockOnHand: variant.stockOnHand,
          lowStockThreshold: 5,
          vatRateId: vat?.id,
          position: index,
          isDemo: true,
        },
      })
      variantIdBySku.set(variant.sku, saved.id)
    }
  }

  // Composition des kits, une fois toutes les variantes connues.
  for (const product of demoProducts) {
    for (const variant of product.variants) {
      if (!variant.components) continue
      const kitId = variantIdBySku.get(variant.sku)!
      for (const [index, component] of variant.components.entries()) {
        const componentId = variantIdBySku.get(component.sku)
        if (!componentId) continue
        await prisma.kitComponent.upsert({
          where: { kitId_componentId: { kitId, componentId } },
          update: { quantity: component.quantity },
          create: { kitId, componentId, quantity: component.quantity, position: index },
        })
      }
    }
  }

  // --- Compatibilités -------------------------------------------------------
  for (const fitment of demoFitments) {
    const configurationId = configurationIds.get(
      configurationKey(fitment.configuration.generation, fitment.configuration.equipment),
    )
    const positionId = positionByCode.get(fitment.position)
    const variantId = variantIdBySku.get(fitment.sku)
    if (!configurationId || !positionId || !variantId) continue

    const saved = await prisma.fitment.upsert({
      where: { configurationId_positionId_variantId: { configurationId, positionId, variantId } },
      update: {
        status: fitment.status,
        roadApproval: fitment.roadApproval,
        restrictions: fitment.restrictions ?? null,
        approvalNote: fitment.approvalNote ?? null,
        source: fitment.source ?? null,
        // Seule une compatibilité confirmée porte une date de vérification.
        verifiedAt: fitment.status === 'CONFIRMED' ? new Date() : null,
      },
      create: {
        configurationId,
        positionId,
        variantId,
        status: fitment.status,
        quantity: fitment.quantity,
        roadApproval: fitment.roadApproval,
        restrictions: fitment.restrictions ?? null,
        approvalNote: fitment.approvalNote ?? null,
        source: fitment.source ?? null,
        verifiedAt: fitment.status === 'CONFIRMED' ? new Date() : null,
      },
    })

    for (const accessory of fitment.accessories) {
      const accessoryVariantId = variantIdBySku.get(accessory.sku)
      if (!accessoryVariantId) continue
      await prisma.fitmentAccessory.upsert({
        where: { fitmentId_variantId: { fitmentId: saved.id, variantId: accessoryVariantId } },
        update: { quantity: accessory.quantity, required: accessory.required },
        create: {
          fitmentId: saved.id,
          variantId: accessoryVariantId,
          quantity: accessory.quantity,
          required: accessory.required,
          note: accessory.note ?? null,
        },
      })
    }
  }

  // --- Contenus -------------------------------------------------------------
  for (const [index, [key, payload]] of Object.entries(demoHomeBlocks).entries()) {
    await prisma.homeBlock.upsert({
      where: { key },
      update: { payload: payload as Prisma.InputJsonValue, position: index },
      create: { key, payload: payload as Prisma.InputJsonValue, position: index },
    })
  }

  for (const [index, item] of demoFaq.entries()) {
    const existing = await prisma.faqItem.findFirst({ where: { question: item.question } })
    if (existing) continue
    await prisma.faqItem.create({
      data: { question: item.question, answer: item.answer, position: index, scope: 'general' },
    })
  }

  console.log(
    `  ${demoProducts.length} produits, ${demoFitments.length} compatibilités, ` +
      `${demoCategories.length} catégories`,
  )
}

async function main() {
  if (purgeDemo) {
    await purge()
    return
  }
  await seedReferenceData()
  if (withDemo) await seedDemo()
  console.log('Terminé.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
