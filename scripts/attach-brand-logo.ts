import { PrismaClient } from '@prisma/client'
import { storageStatus } from '../src/lib/storage/driver'
import { rattacherLogo } from './brand-logo'

const prisma = new PrismaClient()

/**
 * Pose un logo **fourni en local** sur une marque du référentiel véhicule.
 *
 * `import-brand-logos.ts` ne sait prendre que ce que Wikimedia Commons
 * héberge, c'est-à-dire des fichiers sous le seuil d'originalité, donc dans le
 * domaine public. Six marques du catalogue n'y ont rien : Alfa Romeo, Lotus,
 * Buell, Can-Am, MBK et Polaris. Leur emblème est une œuvre originale, Commons
 * ne le reproduit pas, et aucune recherche ne le fera apparaître.
 *
 * Ce script est l'autre porte, pour un fichier à la fois. Le lot déjà constitué
 * se rejoue, lui, avec `import-logos-fournis.ts`.
 *
 * La mécanique — contrôle du contenu, dépôt par la couche de stockage,
 * déduplication par empreinte — est dans `brand-logo.ts`, partagée par les
 * deux scripts.
 *
 *   npm run logo:marque -- <slug> <fichier> --provenance "<d'où il vient>"
 *   npm run logo:marque -- buell ./buell.png --provenance "…" --remplacer
 */

type Arguments = {
  slug: string
  fichier: string
  provenance: string | null
  remplacer: boolean
}

function lireArguments(argv: string[]): Arguments | { erreur: string } {
  const remplacer = argv.includes('--remplacer')

  const iProvenance = argv.indexOf('--provenance')
  const provenance = iProvenance === -1 ? null : (argv[iProvenance + 1] ?? null)
  if (iProvenance !== -1 && !provenance) {
    return { erreur: '--provenance attend une valeur.' }
  }

  // Les arguments qui ne sont ni un drapeau ni la valeur d'un drapeau.
  const positionnels = argv.filter((valeur, index) => {
    if (valeur.startsWith('--')) return false
    if (index > 0 && argv[index - 1] === '--provenance') return false
    return true
  })

  const [slug, fichier] = positionnels
  if (!slug || !fichier) {
    return {
      erreur:
        'Usage : npm run logo:marque -- <slug> <fichier> --provenance "<d’où il vient>" [--remplacer]',
    }
  }

  return { slug, fichier, provenance, remplacer }
}

async function main() {
  const args = lireArguments(process.argv.slice(2))
  if ('erreur' in args) {
    console.error(args.erreur)
    process.exitCode = 1
    return
  }

  const etat = storageStatus()
  if (!etat.ok) {
    console.error(
      `Stockage « ${etat.driver} » inutilisable : ${etat.problem}\n` +
        "Aucun logo n'est rattaché — mieux vaut rien qu'un média pointant vers un fichier absent.",
    )
    process.exitCode = 1
    return
  }

  const resultat = await rattacherLogo({
    prisma,
    slug: args.slug,
    fichier: args.fichier,
    provenance: args.provenance,
    remplacer: args.remplacer,
  })

  if (resultat.etat === 'refusé') {
    console.error(`! ${resultat.marque} — ${resultat.raison}`)
    process.exitCode = 1
    return
  }
  if (resultat.etat === 'déjà rattaché') {
    console.log(`· ${resultat.marque} portait déjà ce fichier — rien à faire.`)
    return
  }

  console.log(
    `✓ ${resultat.marque} — ${resultat.etat}, ${resultat.nouveau ? 'déposé' : 'média existant réutilisé'} : ${resultat.url}` +
      (args.provenance ? `\n  provenance : ${args.provenance}` : ''),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
