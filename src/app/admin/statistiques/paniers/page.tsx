import { connection } from 'next/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { lirePaniers, periode, type EtatPanier } from '@/lib/queries/mesure'
import { Card, EmptyState } from '@/components/ui/Surface'
import { Onglets } from '@/components/admin/statistiques/Onglets'
import { euros, formatJourHeure, nb } from '@/components/admin/statistiques/format'

/**
 * Les paniers : ce que les visiteurs ont mis de côté, et ce qu'il en est
 * advenu.
 *
 * Un panier est créé au premier ajout et vit trente jours (le cookie, puis la
 * purge — lib/purge-donnees.ts). Il n'a de nom que si un client connecté l'a
 * rempli : les autres disent ce qu'il y avait dedans, jamais qui.
 *
 * Réservé à qui peut voir les commandes : une adresse e-mail apparaît quand le
 * panier appartient à un compte.
 *
 * Relancer par e-mail un panier abandonné est une prospection commerciale :
 * permise sans accord préalable seulement auprès d'un client qui a déjà
 * acheté (produits analogues), et à condition qu'il puisse s'y opposer
 * simplement. Cet écran ne relance personne.
 */

export const metadata: Metadata = { title: 'Paniers', robots: { index: false, follow: false } }

const ETATS: Record<EtatPanier, { label: string; cls: string }> = {
  actif: { label: 'En cours', cls: 'bg-brand/10 text-brand' },
  abandonne: { label: 'Abandonné', cls: 'bg-danger/10 text-danger' },
  commande: { label: 'Commande créée', cls: 'bg-ok-soft text-[#1f5a39]' },
}

const PAIEMENTS: Record<string, string> = {
  PENDING: 'paiement en attente',
  AUTHORIZED: 'paiement autorisé',
  PAID: 'payée',
  PARTIALLY_REFUNDED: 'remboursée en partie',
  REFUNDED: 'remboursée',
  FAILED: 'paiement échoué',
  EXPIRED: 'paiement expiré',
}

export default async function PaniersPage({
  searchParams,
}: {
  searchParams: Promise<{ jours?: string; etat?: string }>
}) {
  await connection()
  await requireStaff('orders.view')
  const params = await searchParams
  const p = periode(Number(params.jours ?? 7))
  const etat = params.etat && params.etat in ETATS ? (params.etat as EtatPanier) : null
  const tous = await lirePaniers(p)
  const paniers = etat ? tous.filter((c) => c.etat === etat) : tous

  const compte = (e: EtatPanier) => tous.filter((c) => c.etat === e)
  const abandonnes = compte('abandonne')
  const valeurAbandonnee = abandonnes.reduce((s, c) => s + c.totalCents, 0)

  return (
    <div className="flex flex-col gap-5">
      <Onglets actif="paniers" jours={p.jours} conserver={{ etat }} />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Paniers remplis', nb(tous.length), null],
          ['Abandonnés', nb(abandonnes.length), `${euros(valeurAbandonnee)} laissés de côté`],
          ['En cours', nb(compte('actif').length), 'modifiés depuis moins d’une heure'],
          ['Devenus commande', nb(compte('commande').length), 'payée ou non'],
        ].map(([l, v, d]) => (
          <Card key={l} className="p-4">
            <p className="text-xs font-semibold text-muted-strong">{l}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{v}</p>
            {d ? <p className="mt-0.5 text-xs text-muted-strong">{d}</p> : null}
          </Card>
        ))}
      </div>

      <nav aria-label="Filtrer les paniers" className="flex flex-wrap gap-1.5 text-sm">
        {[null, 'abandonne', 'actif', 'commande'].map((e) => (
          <Link
            key={e ?? 'tous'}
            href={`/admin/statistiques/paniers?jours=${p.jours}${e ? `&etat=${e}` : ''}`}
            aria-current={etat === e ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 ${etat === e ? 'border-ink bg-ink text-white' : 'border-line hover:border-line-strong'}`}
          >
            {e ? ETATS[e as EtatPanier].label : 'Tous'}
          </Link>
        ))}
      </nav>

      {paniers.length === 0 ? (
        <EmptyState
          title="Aucun panier sur cette période."
          description="Un panier apparaît ici dès qu’un visiteur ajoute un article, qu’il soit connecté ou non."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {paniers.map((c) => (
            <li key={c.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${ETATS[c.etat].cls}`}>{ETATS[c.etat].label}</span>
                      <strong className="tabular-nums">{euros(c.totalCents)}</strong>
                      <span className="text-sm text-muted-strong">· {nb(c.articles)} article{c.articles > 1 ? 's' : ''}</span>
                    </p>
                    <p className="mt-1 text-sm">
                      {c.client ? (
                        <>
                          <strong>{c.client.nom ?? c.client.email}</strong>
                          {c.client.nom ? <span className="text-muted-strong"> · {c.client.email}</span> : null}
                        </>
                      ) : (
                        <span className="text-muted-strong">Visiteur non connecté</span>
                      )}
                      {c.vehicule ? <span className="text-muted-strong"> · {c.vehicule}</span> : null}
                      {c.promotionCode ? <span className="text-muted-strong"> · code {c.promotionCode}</span> : null}
                    </p>
                  </div>
                  <p className="text-right text-xs text-muted-strong">
                    Créé le {formatJourHeure(c.createdAt)}
                    <br />
                    Dernier mouvement le {formatJourHeure(c.updatedAt)}
                    {c.commande ? (
                      <>
                        <br />
                        <Link href={`/admin/commandes/${c.commande.id}`} className="font-semibold text-brand underline">
                          {c.commande.reference}
                        </Link>{' '}
                        ({PAIEMENTS[c.commande.paiement] ?? c.commande.paiement})
                      </>
                    ) : null}
                  </p>
                </div>
                <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
                  {c.lignes.map((l, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        <a href={`/p/${l.slug}`} target="_blank" rel="noreferrer" className="block truncate hover:underline">{l.produit}</a>
                        {l.variante && l.variante !== l.produit ? <span className="block truncate text-xs text-muted-strong">{l.variante}</span> : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-strong">
                        {l.quantite} × {euros(l.prixCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-strong">
        Les montants sont ceux du catalogue aujourd’hui, port non compris. Un panier est « abandonné » s’il n’a pas bougé depuis une heure et qu’aucune commande n’en est née. Les paniers sont effacés trente jours après leur création.
      </p>
    </div>
  )
}
