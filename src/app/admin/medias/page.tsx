import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { listMedia, type MediaFilters } from '@/lib/queries/admin'
import { storageStatus, MAX_UPLOAD_BYTES } from '@/lib/storage'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { Alert, Card, EmptyState } from '@/components/ui/Surface'
import {
  MediaDeleteForm,
  MediaEditForm,
  MediaUploadForm,
} from '@/components/admin/MediaForms'
import { NATURE_LABELS, NATURE_OPTIONS } from '@/lib/media-nature'

/**
 * Médiathèque.
 *
 * L'état du stockage est affiché en haut, avant le formulaire, et le
 * téléversement est désactivé lorsqu'il n'est pas opérationnel. Une mauvaise
 * configuration de stockage ne se remarque autrement qu'au moment où une photo
 * manque en ligne, c'est-à-dire bien après la perte.
 */

export const metadata: Metadata = {
  title: 'Médias',
  robots: { index: false, follow: false },
}

const NATURE_TONES: Record<string, BadgeTone> = {
  PRODUCT_PHOTO: 'ok',
  ILLUSTRATION: 'warn',
  TEST_PHOTO: 'ok',
  DIAGRAM: 'neutral',
  UNSPECIFIED: 'neutral',
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ko`
  // Une décimale, sans « ,0 » inutile, et la virgule française.
  const mo = bytes / 1024 / 1024
  return `${mo.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}

type SearchParams = Record<string, string | string[] | undefined>

function readOne(params: SearchParams, key: string): string | undefined {
  const raw = params[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function pageHref(filters: MediaFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.nature) params.set('nature', filters.nature)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/admin/medias?${query}` : '/admin/medias'
}

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const staff = await requireStaff('catalog.view')
  const params = await searchParams

  // La lecture suffit pour consulter ; l'écriture a son propre droit. On masque
  // ce qui serait refusé plutôt que d'offrir un formulaire qui échouera — la
  // garde reste dans l'action, pas dans cet affichage.
  const mayEdit = can(staff.role, 'catalog.edit')

  const natureParam = readOne(params, 'nature')
  const pageParam = Number.parseInt(readOne(params, 'page') ?? '1', 10)

  const filters: MediaFilters = {
    q: readOne(params, 'q'),
    // Object.hasOwn, pas une lecture nue : « ?nature=constructor » remonterait
    // la chaîne de prototypes et passerait pour une nature connue.
    nature: natureParam && Object.hasOwn(NATURE_LABELS, natureParam) ? natureParam : undefined,
    page: Number.isFinite(pageParam) ? Math.max(1, pageParam) : 1,
  }

  const { items, total, page, pageCount, missingAlt } = await listMedia(filters)
  const status = storageStatus()
  const hasFilters = Boolean(filters.q || filters.nature)

  return (
    <div className="container-page py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[1.5rem] leading-tight font-extrabold">Médias</h1>
        <p className="text-sm text-muted-strong">
          {total} fichier{total > 1 ? 's' : ''} en médiathèque.
        </p>
      </header>

      {/* État du stockage : la première chose à lire sur cet écran. */}
      <section aria-labelledby="etat-stockage" className="mt-4">
        <h2 id="etat-stockage" className="sr-only">
          État du stockage
        </h2>
        {status.ok ? (
          <Alert tone={status.driver === 'local' ? 'warn' : 'info'}>
            {status.driver === 'local' ? (
              <>
                Stockage <strong>local</strong> (<code>public/uploads</code>) — développement
                uniquement. Sur Render, le disque de l’instance est effacé à chaque déploiement :
                tout fichier téléversé ainsi disparaîtrait sans erreur ni trace. Configurez{' '}
                <code>MEDIA_DRIVER=s3</code> avant la mise en ligne.
              </>
            ) : (
              <>
                Stockage objet <strong>S3</strong> configuré. Les fichiers survivent aux
                déploiements. Pensez à sauvegarder le bucket à part de la base :{' '}
                <code>scripts/backup.sh</code> ne couvre que PostgreSQL.
              </>
            )}
          </Alert>
        ) : (
          <Alert tone="danger" title="Téléversement indisponible" live="assertive">
            {status.problem} Tant que ce point n’est pas réglé, le téléversement est refusé plutôt
            que d’écrire un fichier qui serait perdu.
          </Alert>
        )}
      </section>

      {missingAlt > 0 ? (
        <Alert tone="warn" className="mt-3">
          {missingAlt} média{missingAlt > 1 ? 's' : ''} sans texte alternatif. Une image sans
          description reste muette pour les visiteurs qui ne la voient pas, et pour les moteurs de
          recherche.
        </Alert>
      ) : null}

      <div className="mt-5 grid gap-6 lg:grid-cols-[22rem_1fr]">
        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="ajouter-media">
          <Card className="p-4">
            <h2 id="ajouter-media" className="text-base font-bold">
              Ajouter un média
            </h2>
            {mayEdit ? (
              <>
                <p className="mt-1 text-xs text-muted">
                  {formatBytes(MAX_UPLOAD_BYTES)} au maximum par fichier.
                </p>
                <div className="mt-3">
                  <MediaUploadForm disabled={!status.ok} />
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-strong">
                Votre rôle donne accès à la consultation de la médiathèque, pas à sa modification.
              </p>
            )}
          </Card>

          <p className="mt-3 text-xs text-muted">
            Le rattachement d’un média à une fiche produit se fait par le script d’amorçage ou par
            import ; il n’existe pas encore d’écran pour le faire ici.
          </p>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section aria-labelledby="liste-medias">
          <h2 id="liste-medias" className="text-base font-bold">
            Médiathèque
          </h2>

          <form
            method="get"
            className="mt-3 flex flex-col gap-3 rounded-md border border-line bg-surface-soft p-3 sm:flex-row sm:items-end"
          >
            <TextField
              id="medias-q"
              name="q"
              label="Recherche"
              fieldSize="sm"
              defaultValue={filters.q ?? ''}
              placeholder="Texte alternatif, légende, clé"
              wrapperClassName="sm:flex-1"
            />
            <SelectField
              id="medias-nature"
              name="nature"
              label="Nature"
              fieldSize="sm"
              defaultValue={filters.nature ?? ''}
              wrapperClassName="sm:w-56"
            >
              <option value="">Toutes les natures</option>
              {NATURE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {NATURE_LABELS[option.value]}
                </option>
              ))}
            </SelectField>
            <div className="flex items-center gap-3 sm:pb-0.5">
              <Button type="submit" size="sm">
                Filtrer
              </Button>
              {hasFilters ? (
                <Link
                  href="/admin/medias"
                  className="inline-flex h-9 items-center text-sm font-semibold text-slate-ink underline underline-offset-4 hover:text-brand"
                >
                  Réinitialiser
                </Link>
              ) : null}
            </div>
          </form>

          {items.length === 0 ? (
            <EmptyState
              className="mt-3"
              title="Aucun média"
              description={
                hasFilters
                  ? 'Aucun média ne correspond à ces critères.'
                  : 'La médiathèque est vide. Téléversez un premier fichier avec le formulaire ci-contre.'
              }
              action={hasFilters ? { label: 'Réinitialiser les filtres', href: '/admin/medias' } : undefined}
            />
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {items.map((media) => (
                <Card as="li" key={media.id} className="p-3">
                  <div className="grid gap-4 sm:grid-cols-[8rem_1fr_16rem]">
                    {/* Aperçu. Volontairement en <img> : l'URL vient d'un
                        stockage dont le domaine est configuré à l'exécution,
                        et next/image refuserait un domaine non déclaré. */}
                    <div className="flex items-start">
                      {media.mimeType === 'application/pdf' ? (
                        <a
                          href={media.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex size-32 items-center justify-center rounded-sm border border-line bg-surface-soft text-xs font-semibold text-muted-strong"
                        >
                          PDF
                        </a>
                      ) : (
                        <a href={media.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={media.url}
                            alt={media.alt ?? ''}
                            className="size-32 rounded-sm border border-line bg-surface-soft object-contain"
                          />
                        </a>
                      )}
                    </div>

                    <div className="min-w-0 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={NATURE_TONES[media.nature] ?? 'neutral'}>
                          {NATURE_LABELS[media.nature] ?? media.nature}
                        </Badge>
                        {media.isDemo ? <Badge tone="warn">démo</Badge> : null}
                        {!media.alt ? <Badge tone="danger">sans texte alternatif</Badge> : null}
                      </div>

                      <p className="mt-2 font-semibold break-words">
                        {media.alt || <span className="text-muted">aucun texte alternatif</span>}
                      </p>
                      {media.caption ? (
                        <p className="mt-0.5 text-muted-strong break-words">{media.caption}</p>
                      ) : null}

                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
                        <div>
                          <dt className="inline font-semibold">Type : </dt>
                          <dd className="inline">{media.mimeType}</dd>
                        </div>
                        <div>
                          <dt className="inline font-semibold">Poids : </dt>
                          <dd className="inline">{formatBytes(media.sizeBytes)}</dd>
                        </div>
                        <div>
                          <dt className="inline font-semibold">Ajouté le : </dt>
                          <dd className="inline">{dateFormatter.format(media.createdAt)}</dd>
                        </div>
                        <div>
                          <dt className="inline font-semibold">Rattachements : </dt>
                          <dd className="inline">{media.uses}</dd>
                        </div>
                      </dl>
                      <p className="mt-1 font-mono text-[0.7rem] break-all text-muted">
                        {media.storageKey}
                      </p>

                      {mayEdit ? (
                        <div className="mt-2">
                          <MediaDeleteForm mediaId={media.id} uses={media.uses} />
                        </div>
                      ) : null}
                    </div>

                    {mayEdit ? (
                      <div className="border-t border-line pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                        <MediaEditForm media={media} />
                      </div>
                    ) : null}
                  </div>
                </Card>
              ))}
            </ul>
          )}

          {pageCount > 1 ? (
            <nav aria-label="Pagination de la médiathèque" className="mt-3 flex items-center gap-3 text-sm">
              {page > 1 ? (
                <Link
                  href={pageHref(filters, page - 1)}
                  className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 font-semibold hover:border-slate-ink"
                >
                  Page précédente
                </Link>
              ) : null}
              <span className="text-muted-strong">
                Page {page} sur {pageCount}
              </span>
              {page < pageCount ? (
                <Link
                  href={pageHref(filters, page + 1)}
                  className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 font-semibold hover:border-slate-ink"
                >
                  Page suivante
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  )
}
