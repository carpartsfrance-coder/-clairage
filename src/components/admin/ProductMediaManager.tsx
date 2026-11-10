'use client'

import { useActionState, useId, useMemo, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import {
  addProductMedia,
  attachProductMedia,
  detachProductMedia,
  moveProductMedia,
  setProductMediaRole,
  type ProductMediaState,
} from '@/lib/actions/admin-product-media'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { IconCheck, IconChevronRight, IconClose, IconImage } from '@/components/ui/icons'
import { NATURE_LABELS, NATURE_NOTES, NATURE_OPTIONS } from '@/lib/media-nature'
import { ROLE_LABELS, ROLE_NOTES, ROLE_OPTIONS, type MediaRoleValue } from '@/lib/media-role'
import { MediaAltForm } from './ProductEditor'

/**
 * Les visuels d'une fiche produit, côté back-office.
 *
 * La section était en lecture seule : elle listait ce qui existait et laissait
 * corriger un texte alternatif, mais **ajouter une image passait par un import
 * ou par une requête à la main**. Une fiche créée ici restait donc sans
 * galerie, et le relevé des manques le reprochait sans offrir le geste.
 *
 * Ce que l'écran cherche à rendre évident, parce que c'est ce qui se perd :
 *
 * - **L'ordre compte.** Le premier visuel du groupe « Le produit » est la
 *   vignette du produit dans tout le catalogue, et la galerie ouvre dessus. La
 *   pastille le dit, et les flèches le changent.
 * - **Le rôle décide de la place**, pas du rangement : les groupes affichés ici
 *   sont ceux de la galerie publique, dans le même ordre.
 * - **Une image sans texte alternatif est incomplète.** Elle est acceptée —
 *   refuser le téléversement ferait perdre la photo — mais signalée sur la
 *   vignette, et le champ est à côté.
 *
 * **Pourquoi les envois sont séquentiels.** Déposer cinq photos lance cinq
 * appels l'un après l'autre, chacun avec son fichier. Regroupés, ils
 * dépasseraient le plafond de corps d'une action de serveur (10 Mo) et la
 * requête serait coupée sans message. Un par un, chaque fichier a son état et
 * sa raison d'échec.
 *
 * **Pourquoi `<img>` et non `next/image`.** L'URL vient d'un stockage dont le
 * domaine est configuré à l'exécution ; l'optimiseur refuse un domaine non
 * déclaré. La médiathèque fait le même choix, pour la même raison.
 */

export type VisuelFiche = {
  /** Identifiant du rattachement — ce qu'on déplace et ce qu'on retire. */
  attachmentId: string
  /** Identifiant du fichier — ce qu'on décrit. */
  mediaId: string
  url: string
  alt: string | null
  caption: string | null
  nature: string
  mimeType: string
  role: string
  /** Rattachements du fichier ailleurs : décide si sa suppression est proposée. */
  autresUsages: number
}

export type VisuelMediatheque = {
  id: string
  url: string
  alt: string | null
  caption: string | null
  nature: string
  /** Pour la recherche : la clé de stockage porte le nom d'origine du lot. */
  storageKey: string
}

const EMPTY: ProductMediaState = {}

const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']

/** Un fichier dans la file d'envoi, et ce qu'il est devenu. */
type Envoi = {
  cle: string
  nom: string
  etat: 'attente' | 'envoi' | 'fait' | 'echec'
  message?: string
}

function formatMo(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} Mo`
}

export function ProductMediaManager({
  productId,
  visuels,
  mediatheque,
  maxBytes,
  stockageOk,
  stockageProbleme,
  mayEdit,
  illustrations = 0,
}: {
  productId: string
  /** Déjà triés comme la boutique les affichera. */
  visuels: VisuelFiche[]
  /** Images de la médiathèque non encore rattachées à cette fiche. */
  mediatheque: VisuelMediatheque[]
  maxBytes: number
  stockageOk: boolean
  stockageProbleme?: string
  mayEdit: boolean
  /** Visuels d'illustration montrés à la place quand la fiche n'en a pas. */
  illustrations?: number
}) {
  const [role, setRole] = useState<MediaRoleValue>('PRODUCT')

  const sansAlt = visuels.filter((visuel) => !visuel.alt?.trim()).length
  const couvertureId = visuels.find((visuel) => visuel.role === 'PRODUCT')?.attachmentId

  // Les groupes de la galerie publique, dans son ordre, et seulement ceux qui
  // portent quelque chose.
  const groupes = ROLE_OPTIONS.map((option) => ({
    ...option,
    items: visuels.filter((visuel) => visuel.role === option.value),
  })).filter((groupe) => groupe.items.length > 0)

  // Un rôle inconnu du vocabulaire (valeur ajoutée en base sans passer par ici)
  // ne doit pas disparaître de l'écran sans rien dire.
  const orphelins = visuels.filter(
    (visuel) => !ROLE_OPTIONS.some((option) => option.value === visuel.role),
  )

  return (
    <div className="mt-3 flex flex-col gap-5">
      <p className="text-sm text-muted-strong">
        {visuels.length === 0 && illustrations > 0 ? (
          <>
            Pas de photo propre à ce produit. La fiche montre pour l’instant {illustrations} visuel
            {illustrations > 1 ? 's' : ''} d’illustration. Ajoutez vos photos pour les remplacer.
          </>
        ) : visuels.length === 0 ? (
          <>
            Aucun visuel. La fiche s’afficherait sans galerie : le client achèterait sans rien voir.
          </>
        ) : (
          <>
            {visuels.length} visuel{visuels.length > 1 ? 's' : ''}. Le premier du groupe «&nbsp;Le
            produit&nbsp;» sert de vignette dans tout le catalogue et ouvre la galerie.
          </>
        )}
      </p>

      {sansAlt > 0 ? (
        <Alert tone="warn">
          {sansAlt} visuel{sansAlt > 1 ? 's' : ''} sans texte alternatif. Une image sans description
          reste muette pour les visiteurs qui ne la voient pas, et pour les moteurs de recherche. Le
          champ est sous chaque vignette.
        </Alert>
      ) : null}

      {mayEdit ? (
        <fieldset className="rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-bold">Ajouter des visuels</legend>

          <SelectField
            id="visuel-role"
            label="Rôle sur la fiche"
            fieldSize="sm"
            value={role}
            onChange={(event) => setRole(event.target.value as MediaRoleValue)}
            hint={ROLE_NOTES[role]}
            wrapperClassName="max-w-md"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <ZoneDepot
            productId={productId}
            role={role}
            maxBytes={maxBytes}
            desactive={!stockageOk}
            probleme={stockageProbleme}
          />

          {mediatheque.length > 0 ? (
            <ChoixMediatheque productId={productId} role={role} candidats={mediatheque} />
          ) : null}
        </fieldset>
      ) : null}

      {visuels.length === 0 ? null : (
        <div className="flex flex-col gap-5">
          {groupes.map((groupe) => (
            <section key={groupe.value} aria-labelledby={`groupe-${groupe.value}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 id={`groupe-${groupe.value}`} className="text-sm font-bold">
                  {groupe.label}
                </h3>
                <span className="text-xs text-muted-strong">
                  {groupe.items.length} visuel{groupe.items.length > 1 ? 's' : ''} ·{' '}
                  {ROLE_NOTES[groupe.value]}
                </span>
              </div>

              <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {groupe.items.map((visuel, index) => (
                  <CarteVisuel
                    key={visuel.attachmentId}
                    productId={productId}
                    visuel={visuel}
                    couverture={visuel.attachmentId === couvertureId}
                    premier={index === 0}
                    dernier={index === groupe.items.length - 1}
                    mayEdit={mayEdit}
                  />
                ))}
              </ul>
            </section>
          ))}

          {orphelins.length > 0 ? (
            <Alert tone="warn" title="Rôle inconnu">
              {orphelins.length} visuel{orphelins.length > 1 ? 's' : ''} portent un rôle que la
              galerie ne sait pas placer ({[...new Set(orphelins.map((item) => item.role))].join(
                ', ',
              )}). Ils ne s’affichent pas sur la fiche publique.
            </Alert>
          ) : null}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Dépôt de fichiers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Zone de dépôt.
 *
 * Le glisser-déposer est un confort posé **par-dessus** un vrai champ de
 * fichier : le champ reste dans l'ordre de tabulation et s'ouvre au clavier,
 * parce qu'un dépôt à la souris est le seul geste qu'une partie des gens ne
 * peut pas faire.
 *
 * Les refus évidents — type non accepté, fichier trop lourd — sont dits avant
 * l'envoi. Faire un aller-retour serveur pour apprendre qu'un fichier de
 * 40 Mo est trop lourd fait attendre pour rien.
 */
function ZoneDepot({
  productId,
  role,
  maxBytes,
  desactive,
  probleme,
}: {
  productId: string
  role: MediaRoleValue
  maxBytes: number
  desactive: boolean
  probleme?: string
}) {
  const champId = useId()
  const champ = useRef<HTMLInputElement>(null)
  const [nature, setNature] = useState('PRODUCT_PHOTO')
  const [survol, setSurvol] = useState(false)
  const [envois, setEnvois] = useState<Envoi[]>([])
  const [enCours, setEnCours] = useState(false)
  const [bilan, setBilan] = useState<{ ajoutes: number; sansAlt: number } | null>(null)

  async function envoyer(fichiers: File[]) {
    if (desactive || enCours || fichiers.length === 0) return

    const refuser = (fichier: File): string | undefined => {
      if (fichier.size === 0) return 'Fichier vide.'
      if (fichier.size > maxBytes) {
        return `Trop lourd (${formatMo(fichier.size)}). Maximum ${formatMo(maxBytes)}.`
      }
      // Le type annoncé par le navigateur se falsifie : il sert ici à éviter un
      // aller-retour inutile, pas de garde. Le serveur relit les octets.
      if (fichier.type && !TYPES_ACCEPTES.includes(fichier.type)) {
        return `Type ${fichier.type} non accepté dans une galerie.`
      }
      return undefined
    }

    const attente: Array<{ envoi: Envoi; fichier: File | null }> = fichiers.map(
      (fichier, index) => {
        const refus = refuser(fichier)
        return {
          fichier: refus ? null : fichier,
          envoi: {
            cle: `${Date.now()}-${index}-${fichier.name}`,
            nom: fichier.name,
            etat: refus ? 'echec' : 'attente',
            message: refus,
          },
        }
      },
    )

    setBilan(null)
    setEnvois(attente.map((entree) => entree.envoi))
    setEnCours(true)

    let ajoutes = 0
    let sansAlt = 0

    for (const entree of attente) {
      if (!entree.fichier) continue

      setEnvois((precedents) =>
        precedents.map((envoi) =>
          envoi.cle === entree.envoi.cle ? { ...envoi, etat: 'envoi' } : envoi,
        ),
      )

      const formData = new FormData()
      formData.set('productId', productId)
      formData.set('role', role)
      formData.set('nature', nature)
      formData.set('file', entree.fichier)

      let retour: ProductMediaState
      try {
        retour = await addProductMedia(EMPTY, formData)
      } catch (error) {
        console.error('[fiche] envoi interrompu', error)
        retour = { error: 'Envoi interrompu. Réessayez.' }
      }

      if (retour.ok) {
        ajoutes += 1
        if (retour.message?.includes('alternatif')) sansAlt += 1
      }

      setEnvois((precedents) =>
        precedents.map((envoi) =>
          envoi.cle === entree.envoi.cle
            ? {
                ...envoi,
                etat: retour.ok ? 'fait' : 'echec',
                message: retour.ok ? undefined : retour.error,
              }
            : envoi,
        ),
      )
    }

    // Les réussites disparaissent de la file : elles sont désormais dans la
    // grille ci-dessous, avec leur champ de description. Les échecs restent,
    // avec leur raison — c'est le seul endroit où on peut encore les lire.
    setEnvois((precedents) => precedents.filter((envoi) => envoi.etat === 'echec'))
    setBilan({ ajoutes, sansAlt })
    setEnCours(false)
    if (champ.current) champ.current.value = ''
  }

  function auDepot(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setSurvol(false)
    const fichiers = Array.from(event.dataTransfer?.files ?? [])
    if (fichiers.length > 0) void envoyer(fichiers)
  }

  const echecs = envois.filter((envoi) => envoi.etat === 'echec')

  return (
    <div className="mt-4">
      {desactive ? (
        <Alert tone="danger" title="Téléversement indisponible" live="assertive">
          {probleme} Tant que ce point n’est pas réglé, l’envoi est refusé plutôt que d’écrire un
          fichier qui serait perdu.
        </Alert>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault()
          if (!desactive) setSurvol(true)
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={auDepot}
        className={[
          'rounded-lg border-2 border-dashed transition-colors',
          desactive
            ? 'border-line bg-surface-muted'
            : survol
              ? 'border-brand bg-danger-soft'
              : 'border-line-strong bg-surface-soft hover:border-slate-ink',
        ].join(' ')}
      >
        <input
          ref={champ}
          id={champId}
          type="file"
          multiple
          accept={TYPES_ACCEPTES.join(',')}
          disabled={desactive || enCours}
          className="peer sr-only"
          onChange={(event) => {
            const fichiers = Array.from(event.target.files ?? [])
            if (fichiers.length > 0) void envoyer(fichiers)
          }}
        />
        <label
          htmlFor={champId}
          className={[
            'flex flex-col items-center gap-1.5 px-4 py-7 text-center',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand',
            desactive || enCours ? 'cursor-default text-muted' : 'cursor-pointer',
          ].join(' ')}
        >
          <IconImage className="size-7 text-muted-strong" />
          <span className="text-sm font-semibold">
            {enCours ? (
              'Envoi en cours…'
            ) : (
              <>
                Glissez vos images ici, ou <span className="text-brand underline">parcourez</span>
              </>
            )}
          </span>
          <span className="text-xs text-muted">
            JPEG, PNG, WebP, AVIF ou SVG. {formatMo(maxBytes)} par image, plusieurs à la fois. Elles
            sont ajoutées au rôle «&nbsp;{ROLE_LABELS[role]}&nbsp;».
          </span>
        </label>
      </div>

      <SelectField
        id={`${champId}-nature`}
        label="Nature des visuels déposés"
        fieldSize="sm"
        value={nature}
        onChange={(event) => setNature(event.target.value)}
        disabled={desactive}
        hint={NATURE_NOTES[nature]}
        wrapperClassName="mt-3 max-w-md"
      >
        {NATURE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>

      {envois.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5" aria-live="polite">
          {envois.map((envoi) => (
            <li
              key={envoi.cle}
              className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-white px-3 py-2 text-xs"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{envoi.nom}</span>
              {envoi.etat === 'attente' ? <span className="text-muted">en attente</span> : null}
              {envoi.etat === 'envoi' ? <span className="text-muted-strong">envoi…</span> : null}
              {envoi.etat === 'fait' ? (
                <span className="inline-flex items-center gap-1 font-semibold text-ok">
                  <IconCheck className="size-4" /> ajouté
                </span>
              ) : null}
              {envoi.etat === 'echec' ? (
                <span className="font-semibold text-danger">{envoi.message ?? 'refusé'}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {bilan && !enCours ? (
        <Alert
          tone={echecs.length > 0 ? 'warn' : bilan.sansAlt > 0 ? 'warn' : 'ok'}
          className="mt-3"
          live="polite"
        >
          {bilan.ajoutes > 0
            ? `${bilan.ajoutes} visuel${bilan.ajoutes > 1 ? 's' : ''} ajouté${bilan.ajoutes > 1 ? 's' : ''}.`
            : 'Aucun visuel ajouté.'}
          {bilan.sansAlt > 0
            ? ` ${bilan.sansAlt} attend${bilan.sansAlt > 1 ? 'ent' : ''} un texte alternatif, dans la grille ci-dessous.`
            : ''}
          {echecs.length > 0
            ? ` ${echecs.length} fichier${echecs.length > 1 ? 's' : ''} refusé${echecs.length > 1 ? 's' : ''} : la raison est indiquée au-dessus.`
            : ''}
        </Alert>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Choix dans la médiathèque                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Rattacher un fichier déjà téléversé.
 *
 * Un schéma de brochage ou un comparatif de teintes sert sur plusieurs fiches.
 * Le téléverser à nouveau créerait deux fichiers à décrire et à corriger
 * séparément — et le jour où l'un est remplacé, l'autre resterait en ligne.
 *
 * Replié par défaut : l'ajout courant est le dépôt, pas la reprise.
 */
function ChoixMediatheque({
  productId,
  role,
  candidats,
}: {
  productId: string
  role: MediaRoleValue
  candidats: VisuelMediatheque[]
}) {
  const [state, action, pending] = useActionState(attachProductMedia, EMPTY)
  const [recherche, setRecherche] = useState('')
  const [choisi, setChoisi] = useState<string | null>(null)
  const champId = useId()

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    if (!terme) return candidats
    return candidats.filter((media) =>
      [media.alt, media.caption, media.storageKey]
        .filter(Boolean)
        .some((valeur) => valeur!.toLowerCase().includes(terme)),
    )
  }, [candidats, recherche])

  return (
    <details className="mt-4 rounded-md border border-line bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
        Reprendre un visuel de la médiathèque
        {/* « Les plus récentes », et non « disponibles » : la liste est
            plafonnée. Annoncer un total qu'on ne montre pas ferait conclure à
            tort qu'une image absente n'existe pas. */}
        <span className="ml-1 font-normal text-muted">
          (les {candidats.length} plus récentes, déjà téléversées)
        </span>
      </summary>

      <form action={action} className="border-t border-line p-3">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="role" value={role} />

        {state.error ? (
          <Alert tone="danger" className="mb-3" live="assertive">
            {state.error}
          </Alert>
        ) : null}
        {state.ok && state.message ? (
          <Alert
            tone={state.message.includes('alternatif') ? 'warn' : 'ok'}
            className="mb-3"
            live="polite"
          >
            {state.message}
          </Alert>
        ) : null}

        <TextField
          id={`${champId}-recherche`}
          label="Filtrer"
          fieldSize="sm"
          value={recherche}
          onChange={(event) => setRecherche(event.target.value)}
          placeholder="Texte alternatif, légende, nom de fichier"
          wrapperClassName="max-w-sm"
        />

        {filtres.length === 0 ? (
          <p className="mt-3 text-sm text-muted-strong">
            Aucune de ces {candidats.length} images ne correspond. Les plus anciennes ne sont pas
            dans cette liste :{' '}
            <Link
              href="/admin/medias"
              className="font-semibold text-brand underline underline-offset-4"
            >
              la médiathèque
            </Link>{' '}
            a sa propre recherche.
          </p>
        ) : (
          <>
            <fieldset className="mt-3">
              <legend className="sr-only">Visuels de la médiathèque</legend>
              <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5 lg:grid-cols-8">
                {filtres.map((media) => (
                  <li key={media.id}>
                    <label className="block cursor-pointer">
                      <input
                        type="radio"
                        name="mediaId"
                        value={media.id}
                        checked={choisi === media.id}
                        onChange={() => setChoisi(media.id)}
                        className="peer sr-only"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={media.url}
                        alt={media.alt ?? 'Visuel sans description'}
                        className="aspect-square w-full rounded-sm border-2 border-line bg-surface-soft object-contain p-1 peer-checked:border-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand"
                      />
                      <span className="mt-0.5 block truncate text-[0.7rem] text-muted">
                        {media.alt || 'sans description'}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <Button type="submit" size="sm" variant="secondary" className="mt-3" disabled={pending || !choisi}>
              {pending
                ? 'Rattachement…'
                : `Rattacher au rôle « ${ROLE_LABELS[role]} »`}
            </Button>
          </>
        )}
      </form>
    </details>
  )
}

/* -------------------------------------------------------------------------- */
/* Une vignette, et ce qu'on peut en faire                                    */
/* -------------------------------------------------------------------------- */

const NATURE_TONES: Record<string, 'ok' | 'warn' | 'neutral'> = {
  PRODUCT_PHOTO: 'ok',
  TEST_PHOTO: 'ok',
  ILLUSTRATION: 'warn',
  DIAGRAM: 'neutral',
  UNSPECIFIED: 'neutral',
}

function CarteVisuel({
  productId,
  visuel,
  couverture,
  premier,
  dernier,
  mayEdit,
}: {
  productId: string
  visuel: VisuelFiche
  couverture: boolean
  premier: boolean
  dernier: boolean
  mayEdit: boolean
}) {
  const [ordre, actionOrdre, ordrePending] = useActionState(moveProductMedia, EMPTY)
  const [roleState, actionRole, rolePending] = useActionState(setProductMediaRole, EMPTY)
  const [retrait, actionRetrait, retraitPending] = useActionState(detachProductMedia, EMPTY)
  const [confirme, setConfirme] = useState(false)
  const formRole = useRef<HTMLFormElement>(null)

  const occupe = ordrePending || rolePending || retraitPending
  const erreur = ordre.error ?? roleState.error ?? retrait.error
  const sansAlt = !visuel.alt?.trim()

  return (
    <li
      aria-busy={occupe || undefined}
      className={[
        'flex flex-col rounded-md border bg-white',
        sansAlt ? 'border-warn-border' : 'border-line',
        occupe ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* Hauteur fixe plutôt que carré : une grille de quatre vignettes
            carrées sur un écran large fait trois écrans de défilement pour
            huit photos, et l'ordre ne se lit plus d'un coup d'œil. */}
        <img
          src={visuel.url}
          alt={visuel.alt ?? ''}
          className="h-44 w-full rounded-t-md bg-surface-soft object-contain p-2"
        />
        {couverture ? (
          <span className="absolute top-2 left-2">
            <Badge tone="ok">Vignette du catalogue</Badge>
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 border-t border-line p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={NATURE_TONES[visuel.nature] ?? 'neutral'}>
            {NATURE_LABELS[visuel.nature] ?? visuel.nature}
          </Badge>
          {sansAlt ? <Badge tone="danger">sans description</Badge> : null}
        </div>

        {mayEdit ? (
          <MediaAltForm productId={productId} mediaId={visuel.mediaId} alt={visuel.alt} />
        ) : (
          <p className="text-xs break-words">
            {visuel.alt || <span className="text-muted">aucun texte alternatif</span>}
          </p>
        )}

        {mayEdit ? (
          <>
            {/* Ordre. Deux flèches et un raccourci : « mettre en tête » est le
                geste réellement demandé — choisir la vignette du catalogue —
                et le faire à coups de flèches sur huit photos est pénible. */}
            {/*
              Les classes de taille du bouton portent déjà un retrait
              horizontal, et `cn` ne déduplique pas les utilitaires Tailwind :
              un `px-0` posé ici ne gagnerait pas, il écraserait seulement
              l'icône dans une boîte de 6 px. D'où des boutons à la taille
              normale, et des icônes qui ne rétrécissent pas.
            */}
            <form
              action={actionOrdre}
              /* Seul dans son groupe : deux flèches grisées n'apprennent rien
                 et occupent la place du reste. */
              className={premier && dernier ? 'hidden' : 'flex flex-wrap items-center gap-1'}
            >
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="attachmentId" value={visuel.attachmentId} />
              <Button
                type="submit"
                name="deplacement"
                value="avant"
                size="sm"
                variant="secondary"
                disabled={occupe || premier}
                aria-label="Avancer ce visuel dans son groupe"
                title="Avancer"
              >
                <IconChevronRight className="size-4 shrink-0 rotate-180" />
              </Button>
              <Button
                type="submit"
                name="deplacement"
                value="apres"
                size="sm"
                variant="secondary"
                disabled={occupe || dernier}
                aria-label="Reculer ce visuel dans son groupe"
                title="Reculer"
              >
                <IconChevronRight className="size-4 shrink-0" />
              </Button>
              {!premier ? (
                <Button
                  type="submit"
                  name="deplacement"
                  value="premier"
                  size="sm"
                  variant="ghost"
                  disabled={occupe}
                  title={
                    visuel.role === 'PRODUCT'
                      ? 'En tête du groupe : ce visuel devient la vignette du catalogue'
                      : 'En tête de son groupe'
                  }
                >
                  En tête
                </Button>
              ) : null}
            </form>

            {/* Rôle : c'est ce qui déplace le visuel d'un groupe de la galerie à
                un autre. Le choix s'applique à la sélection ; le bouton reste
                pour qui n'a pas de JavaScript ou valide au clavier. */}
            <form action={actionRole} ref={formRole}>
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="attachmentId" value={visuel.attachmentId} />
              <SelectField
                id={`role-${visuel.attachmentId}`}
                name="role"
                label="Rôle"
                hideLabel
                fieldSize="sm"
                defaultValue={visuel.role}
                disabled={occupe}
                onChange={() => formRole.current?.requestSubmit()}
                aria-label="Rôle de ce visuel sur la fiche"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
              <button type="submit" className="sr-only">
                Appliquer le rôle
              </button>
            </form>

            {/* Retrait. Détacher et supprimer sont deux gestes : le second est
                irréversible, et n'est proposé que si le fichier ne sert nulle
                part ailleurs. Le serveur revérifie. */}
            <form action={actionRetrait} className="mt-auto">
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="attachmentId" value={visuel.attachmentId} />

              {confirme ? (
                <div className="flex flex-col gap-1.5 rounded-sm bg-surface-soft p-2">
                  <p className="text-xs text-muted-strong">
                    {visuel.autresUsages > 0
                      ? `Ce fichier sert aussi à ${visuel.autresUsages} autre${visuel.autresUsages > 1 ? 's' : ''} endroit${visuel.autresUsages > 1 ? 's' : ''} : il restera en médiathèque.`
                      : 'Le fichier restera en médiathèque, sauf si vous demandez sa suppression.'}
                  </p>
                  {visuel.autresUsages === 0 ? (
                    <label className="flex items-start gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        name="supprimerFichier"
                        className="mt-0.5 size-3.5 shrink-0"
                      />
                      <span>Supprimer aussi le fichier (irréversible)</span>
                    </label>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="submit" size="sm" disabled={retraitPending}>
                      {retraitPending ? 'Retrait…' : 'Confirmer'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirme(false)}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirme(true)}
                  disabled={occupe}
                >
                  {/* La couleur est portée par le contenu, et non par une
                      classe sur le bouton : `text-slate-ink` de la variante
                      gagnerait sur un `text-danger` ajouté après. */}
                  <span className="flex items-center gap-1.5 text-danger">
                    <IconClose className="size-4 shrink-0" />
                    Retirer
                  </span>
                </Button>
              )}
            </form>
          </>
        ) : null}

        {erreur ? (
          <p className="text-xs font-medium text-danger" role="alert">
            {erreur}
          </p>
        ) : null}
        {retrait.ok && retrait.message ? (
          <p className="text-xs text-muted-strong" aria-live="polite">
            {retrait.message}
          </p>
        ) : null}
      </div>
    </li>
  )
}
