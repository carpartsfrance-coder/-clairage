/**
 * Pose le filigrane LEDVROOM sur les visuels types sur voiture
 * (`public/images-types/`, sauf les photos `produit-*`).
 *
 * Les originaux sans filigrane sont gardés dans `assets/images-types-originaux/`
 * (hors du dossier public) : le script repart toujours d'eux, on peut donc le
 * relancer sans doubler le filigrane.
 *
 *   npx tsx scripts/filigraner-images-types.ts
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { COPYRIGHT, filigraner } from "../src/lib/storage/filigrane"

const ORIGINAUX = path.join(process.cwd(), 'assets', 'images-types-originaux')
const PUBLIC = path.join(process.cwd(), 'public', 'images-types')

async function main() {
for (const nom of (await readdir(ORIGINAUX)).filter((n) => n.endsWith('.webp'))) {
  const marque = await filigraner(await readFile(path.join(ORIGINAUX, nom)))
  // Même format et même poids qu'avant : WebP, qualité 82.
  const sortie = await sharp(marque).webp({ quality: 82, effort: 4 }).withExif({
    IFD0: { Copyright: COPYRIGHT, Artist: 'LEDVROOM' },
  }).toBuffer()
  await writeFile(path.join(PUBLIC, nom), sortie)
  console.log(nom, `${Math.round(sortie.length / 1024)} ko`)
}
}

void main()
