import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { GENERATION_VISIBLE } from '@/lib/queries/vehicules-visibles'
import { VEHICLE_COOKIE } from '@/lib/session'
import { retourApresChoix } from '@/lib/retour-vehicule'

const payloadSchema = z.object({
  modelId: z.string().min(1),
  year: z.number().int().min(1950).max(new Date().getFullYear() + 1),
  /** Fourni au second passage, quand l'équipement d'origine a été choisi. */
  configurationId: z.string().min(1).optional(),
  /**
   * Page d'où le sélecteur a été ouvert. Validée par `retourApresChoix` : une
   * valeur refusée ne fait pas échouer la sélection, elle est ignorée.
   */
  retour: z.unknown().optional(),
})

/**
 * Enregistre le véhicule de la session.
 *
 * Quand une génération expose plusieurs équipements lumineux d'origine, on ne
 * choisit pas à la place du client : la réponse renvoie vers l'étape
 * d'équipement. Un halogène et un xénon d'origine n'appellent pas le même kit.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête illisible.' }, { status: 400 })
  }

  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Véhicule incomplet.' }, { status: 400 })
  }
  const { modelId, year, configurationId } = parsed.data
  // Fiche ou catégorie d'où vient le client : il y revient, au lieu de
  // devoir retrouver sa page depuis la liste des résultats.
  const retour = retourApresChoix(parsed.data.retour)
  const suite = retour ?? '/vehicule/resultats'
  const etapeEquipement = (generationId: string) =>
    `/vehicule/${generationId}/equipement${retour ? `?retour=${encodeURIComponent(retour)}` : ''}`

  try {
    if (configurationId) {
      /*
        L'équipement doit appartenir au modèle et à l'année envoyés, sur une
        génération visible — les mêmes règles que le premier passage. « Actif »
        seul laissait fixer n'importe quelle configuration du référentiel
        (relecture du 16 novembre 2026).
      */
      const config = await prisma.vehicleConfiguration.findFirst({
        where: {
          id: configurationId,
          active: true,
          generation: {
            modelId,
            ...GENERATION_VISIBLE,
            yearFrom: { lte: year },
            OR: [{ yearTo: null }, { yearTo: { gte: year } }],
          },
        },
        select: { id: true },
      })
      if (!config) return NextResponse.json({ error: 'Configuration inconnue.' }, { status: 404 })
      return setVehicle(config.id, suite)
    }

    const generation = await prisma.vehicleGeneration.findFirst({
      where: {
        modelId,
        /*
          La même règle que le sélecteur, et pas seulement `active` : les listes
          sont filtrées côté lecture, mais c'est ici qu'on enregistre le
          véhicule du client. Sans ce filtre, une requête forgée — ou un onglet
          resté ouvert avant la dépublication — fixerait un véhicule masqué,
          et la barre le porterait ensuite de page en page vers des résultats
          vides.
        */
        ...GENERATION_VISIBLE,
        yearFrom: { lte: year },
        OR: [{ yearTo: null }, { yearTo: { gte: year } }],
      },
      include: { configurations: { where: { active: true }, select: { id: true } } },
    })

    if (!generation) {
      return NextResponse.json(
        { error: "Cette année n'est pas couverte pour ce modèle." },
        { status: 404 },
      )
    }

    const configurations = generation.configurations
    if (configurations.length === 0) {
      // Le véhicule existe, mais aucune configuration n'est documentée :
      // on le dit, on ne laisse pas croire que le catalogue est vide.
      return NextResponse.json({ redirect: etapeEquipement(generation.id) })
    }
    if (configurations.length > 1) {
      return NextResponse.json({ redirect: etapeEquipement(generation.id) })
    }
    return setVehicle(configurations[0].id, suite)
  } catch (error) {
    console.error('[vehicule] selection', error)
    return NextResponse.json({ error: 'Sélection indisponible pour le moment.' }, { status: 503 })
  }
}

function setVehicle(configurationId: string, redirect: string) {
  const response = NextResponse.json({ redirect, configurationId })
  response.cookies.set(VEHICLE_COOKIE, configurationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  })
  return response
}
