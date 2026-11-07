import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { estEffetXenon, vignetteEffetXenon } from '../src/lib/effet-xenon'
import { rubriquePour } from '../src/lib/admin/rubrique-des-packs'

/**
 * Les packs d'ampoules halogènes « effet xénon » ne doivent jamais passer pour
 * des LED. Le relevé dit lesquels en sont, par la vignette du pack du
 * partenaire : c'est elle qui fixe la liste de la migration
 * `20261107120000_packs_effet_xenon`.
 */
describe('packs effet xénon', () => {
  it('reconnaît un pack halogène à sa vignette, pas un pack de LED teinte xénon', () => {
    expect(vignetteEffetXenon('https://x/5227_pack-ampoules-de-phares-xenon-effects-pour-renault-clio-4.jpg')).toBe(true)
    expect(vignetteEffetXenon('https://x/5639_pack-ampoules-antibrouillards-xenon-effect-pour-audi-a5-a4-b8.jpg')).toBe(true)
    expect(vignetteEffetXenon('https://x/5658_pack-leds-antibrouillards-xenon-effect-pour-peugeot-3008.jpg')).toBe(false)
    expect(vignetteEffetXenon('https://x/4676_pack-veilleuses-a-led-blanc-xenon-pour-renault-clio-4.jpg')).toBe(false)
    expect(vignetteEffetXenon(null)).toBe(false)
  })

  it('compte 1 642 packs halogènes dans le relevé : 1 625 phares, 9 antibrouillards, 8 feux de jour', () => {
    const lire = (fichier: string) =>
      JSON.parse(readFileSync(path.join(__dirname, '..', 'prisma', fichier), 'utf8')).packs as Array<{
        positionLabel: string
        image: string | null
      }>
    const packs = [...lire('packs-vehicule.json'), ...lire('packs-vehicule-complement.json')]
    const halogenes = packs.filter((pack) => vignetteEffetXenon(pack.image))
    const parPosition = (label: string) => halogenes.filter((p) => p.positionLabel === label).length
    expect(halogenes).toHaveLength(1642)
    expect(parPosition('phares')).toBe(1625)
    expect(parPosition('antibrouillards')).toBe(9)
    expect(parPosition('feux de jour')).toBe(8)
  })

  it('la migration renomme exactement ces packs-là', () => {
    const lire = (fichier: string) =>
      JSON.parse(readFileSync(path.join(__dirname, '..', 'prisma', fichier), 'utf8')).packs as Array<{
        slug: string
        image: string | null
      }>
    const attendus = new Set(
      [...lire('packs-vehicule.json'), ...lire('packs-vehicule-complement.json')]
        .filter((pack) => vignetteEffetXenon(pack.image))
        .map((pack) => pack.slug),
    )
    const sql = readFileSync(
      path.join(__dirname, '..', 'prisma', 'migrations', '20261107120000_packs_effet_xenon', 'migration.sql'),
      'utf8',
    )
    const migres = new Set([...sql.matchAll(/^ {2}\('([^']+)', /gm)].map((m) => m[1]))
    expect(migres.size).toBe(attendus.size)
    expect([...attendus].filter((slug) => !migres.has(slug))).toEqual([])
  })

  it('les range sous « Effet xénon », pas sous les LED', () => {
    expect(estEffetXenon('Pack ampoules effet xénon phares pour Renault Clio 4')).toBe(true)
    expect(estEffetXenon('Pack LED phares pour Renault Clio 4')).toBe(false)
    expect(rubriquePour('Pack ampoules effet xénon phares pour Renault Clio 4')).toBe('ampoules-effet-xenon')
    expect(rubriquePour('Pack ampoules effet xénon antibrouillards pour Audi A1')).toBe('ampoules-effet-xenon')
  })
})
