'use client'

import { useActionState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { IconClose, IconPencil, IconPlus } from '@/components/ui/icons'
import { texteSaisi } from '@/lib/admin/catalogue'
import {
  COMPOSANT_QUANTITE_MAX,
  avertissementComposition,
  raisonCompositionImpossible,
} from '@/lib/admin/produit-liens'
import {
  addKitComponent,
  moveKitComponent,
  removeKitComponent,
  updateKitComponent,
} from '@/lib/actions/admin-product-links'
import { ETAT_VIDE, FlechesOrdre, Retour } from './ContentFields'
import { RechercheLien, ReponseRecherche } from './LinkSearch'

/**
 * La composition des kits d'une fiche produit.
 *
 * Elle était affichée en lecture dans le bloc des conditionnements, et ne
 * s'écrivait nulle part : un kit créé au back-office naissait vide. Or un kit
 * vide n'est pas un kit presque prêt, c'est un produit que la boutique déclare
 * en rupture — `availabilityForKit` refuse de déclarer disponible un kit sans
 * composant obligatoire.
 *
 * **Ce bloc décide d'un stock, pas d'un affichage.** Dès qu'une référence a un
 * composant, la boutique cesse de lire le stock saisi sur elle : elle calcule
 * combien de kits les composants obligatoires permettent de monter, réserve
 * les composants au panier, et liste les pièces à prendre en rayon dans la
 * préparation de commande. Le nombre de kits montables est donc affiché ici,
 * avec le composant qui le limite : c'est la seule façon de voir qu'une
 * quantité vient de diviser par deux ce qu'on peut vendre.
 *
 * Deux refus se prennent aux deux bouts, pour la même raison. Un kit ne
 * s'inclut pas dans un kit (son stock n'est pas physique, il est calculé : le
 * parent lirait zéro) ; et une référence déjà incluse dans un kit ne peut pas
 * recevoir de composition, sans quoi l'imbrication s'obtiendrait par la porte
 * de derrière.
 */

export type ComposantFiche = {
  /** L'identifiant de la ligne de composition, pas celui de la référence. */
  ligneId: string
  componentId: string
  sku: string
  libelle: string
  quantite: number
  requis: boolean
  vendable: number
}

export type ConditionnementComposable = {
  id: string
  sku: string
  name: string
  composants: ComposantFiche[]
  /** Nombre de kits qui incluent ce conditionnement. */
  dansDesKits: number
  /** Kits montables d'après la composition, et le composant qui le limite. */
  montables: number | null
  composantLimitant: string | null
}

export type ComposantCandidat = {
  id: string
  sku: string
  libelle: string
  estKit: boolean
  vendable: number
  statutProduit: string
}

function LigneComposant({
  composant,
  premier,
  dernier,
}: {
  composant: ComposantFiche
  premier: boolean
  dernier: boolean
}) {
  const [edition, actionEdition, editionPending] = useActionState(updateKitComponent, ETAT_VIDE)
  const [retrait, actionRetrait, retraitPending] = useActionState(removeKitComponent, ETAT_VIDE)

  return (
    <li className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">
            {composant.quantite} × {composant.libelle}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-strong">
            <span className="font-mono">{composant.sku}</span>
            <span>{composant.vendable} vendables</span>
            {composant.requis ? (
              <Badge tone="info">indispensable</Badge>
            ) : (
              <Badge tone="neutral">facultatif</Badge>
            )}
          </p>
        </div>
        <FlechesOrdre
          action={moveKitComponent}
          nomChamp="ligneId"
          id={composant.ligneId}
          premier={premier}
          dernier={dernier}
          designation="ce composant"
          occupe={editionPending || retraitPending}
        />
      </div>

      {/*
        Le retrait vit dans le dépliant de modification : une composition de
        dix lignes avec dix croix se vide d'un clic distrait, et c'est le stock
        annoncé du kit qui changerait dans la seconde.
      */}
      <details className="mt-2">
        <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand">
          <IconPencil className="size-3.5 shrink-0" />
          Modifier
        </summary>

        <form action={actionEdition} className="mt-2 border-t border-line pt-3">
          <input type="hidden" name="ligneId" value={composant.ligneId} />
          <TextField
            id={`quantite-${composant.ligneId}`}
            name="quantity"
            label="Quantité par kit"
            hint="Dix composants requis par deux ne font que cinq kits."
            fieldSize="sm"
            inputMode="numeric"
            defaultValue={texteSaisi(edition.saisie, 'quantity', String(composant.quantite))}
            wrapperClassName="sm:w-48"
            required
          />
          <label className="mt-3 flex min-h-9 items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="required"
              defaultChecked={composant.requis}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0">
              Composant indispensable
              <span className="mt-0.5 block text-xs text-muted-strong">
                Décoché, il n’entre plus dans le calcul du stock du kit et n’est plus réservé à
                la commande.
              </span>
            </span>
          </label>
          <Button type="submit" size="sm" className="mt-3" disabled={editionPending}>
            {editionPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Retour state={edition} />
        </form>

        <form action={actionRetrait} className="mt-3">
          <input type="hidden" name="ligneId" value={composant.ligneId} />
          <Button type="submit" size="sm" variant="ghost" disabled={retraitPending}>
            {/* La couleur est portée par le contenu : `cn` ne déduplique pas
                les utilitaires Tailwind. */}
            <span className="flex items-center gap-1.5 text-danger">
              <IconClose className="size-4 shrink-0" />
              {retraitPending ? 'Retrait…' : 'Retirer ce composant'}
            </span>
          </Button>
          {retrait.error ? (
            <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
              {retrait.error}
            </p>
          ) : null}
        </form>
      </details>
    </li>
  )
}

function AjoutComposant({
  conditionnement,
  terme,
  candidats,
}: {
  conditionnement: ConditionnementComposable
  terme: string
  candidats: ComposantCandidat[]
}) {
  const [state, action, pending] = useActionState(addKitComponent, ETAT_VIDE)
  /*
    La référence choisie est réaffichée depuis la saisie refusée : React 19
    réinitialise le formulaire dès que l'action se termine, et un refus de
    quantité ferait autrement perdre le choix qu'on venait de faire.
  */
  const choisi = texteSaisi(state.saisie, 'composantId', '')

  return (
    <div className="mt-3 rounded-md border border-line p-3">
      <h5 className="flex items-center gap-1.5 text-sm font-semibold">
        <IconPlus className="size-4 shrink-0" />
        Ajouter un composant
      </h5>
      <RechercheLien
        nomChamp="composant"
        terme={terme}
        label="Chercher une référence"
        placeholder="H7, adaptateur, OSR-…"
        hint="Par référence, nom de conditionnement ou nom de produit."
        champsCaches={{ onglet: 'prix', kit: conditionnement.id }}
      />

      <ReponseRecherche
        terme={terme}
        nombre={candidats.length}
        invitation="Cherchez les références que ce kit contient : les ampoules, et les pièces nécessaires au montage."
        aucunResultat="Seules les références actives sont proposées : leur stock est celui qui fera le stock du kit."
      />

      {candidats.length > 0 ? (
        <form action={action} className="mt-3">
          <input type="hidden" name="kitId" value={conditionnement.id} />
          <fieldset>
            <legend className="text-[11px] font-bold">Référence à inclure</legend>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {candidats.map((candidat) => (
                <li key={candidat.id}>
                  <label className="flex min-h-9 items-start gap-2 rounded-md border border-line bg-surface-soft px-3 py-2 text-sm">
                    <input
                      type="radio"
                      name="composantId"
                      value={candidat.id}
                      defaultChecked={choisi === candidat.id}
                      className="mt-0.5 size-4 shrink-0"
                      disabled={candidat.estKit}
                      required
                    />
                    <span className="min-w-0">
                      {candidat.libelle}
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-strong">
                        <span className="font-mono">{candidat.sku}</span>
                        <span>{candidat.vendable} vendables</span>
                        {candidat.statutProduit === 'DRAFT' ? (
                          <Badge tone="warn">brouillon</Badge>
                        ) : null}
                      </span>
                      {candidat.estKit ? (
                        <span className="mt-0.5 block text-xs text-danger">
                          Cette référence est elle-même un kit : son stock est calculé, pas
                          physique. L’inclure mettrait ce kit en rupture définitive.
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <TextField
              id={`ajout-quantite-${conditionnement.id}`}
              name="quantity"
              label="Quantité par kit"
              fieldSize="sm"
              inputMode="numeric"
              defaultValue={texteSaisi(state.saisie, 'quantity', '1')}
              placeholder="1"
              wrapperClassName="sm:w-40"
              required
            />
            <label className="flex min-h-9 items-start gap-2 pb-1 text-sm">
              <input
                type="checkbox"
                name="required"
                defaultChecked
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="min-w-0">
                Indispensable
                <span className="mt-0.5 block text-xs text-muted-strong">
                  Entre dans le calcul du stock du kit.
                </span>
              </span>
            </label>
          </div>

          <Button type="submit" className="mt-3" size="sm" disabled={pending}>
            {pending ? 'Ajout…' : 'Ajouter à la composition'}
          </Button>
          <p className="mt-1.5 text-[10px] text-muted">
            Quantité entre 1 et {COMPOSANT_QUANTITE_MAX}.
          </p>
          <Retour state={state} />
        </form>
      ) : (
        <Retour state={state} />
      )}
    </div>
  )
}

function BlocConditionnement({
  conditionnement,
  terme,
  candidats,
  mayEdit,
}: {
  conditionnement: ConditionnementComposable
  terme: string
  candidats: ComposantCandidat[]
  mayEdit: boolean
}) {
  const impossible = raisonCompositionImpossible({ dansDesKits: conditionnement.dansDesKits })
  const avertissement = avertissementComposition(
    conditionnement.composants.map((composant) => ({ required: composant.requis })),
  )

  return (
    <div className="rounded-md border border-line bg-surface-soft p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">
          {conditionnement.name}{' '}
          <span className="font-mono text-xs text-muted">{conditionnement.sku}</span>
        </h4>
        {conditionnement.montables === null ? null : (
          <p className="text-xs text-muted-strong">
            <strong className="font-semibold tabular-nums">{conditionnement.montables}</strong>{' '}
            kit{conditionnement.montables > 1 ? 's' : ''} montable
            {conditionnement.montables > 1 ? 's' : ''}
            {conditionnement.composantLimitant
              ? ` — limité par ${conditionnement.composantLimitant}`
              : ''}
          </p>
        )}
      </div>

      {conditionnement.composants.length === 0 ? (
        <p className="mt-1 text-xs text-muted-strong">
          Aucune composition : la boutique vend ce conditionnement tel quel, avec son propre
          stock.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {conditionnement.composants.map((composant, index) => (
            <LigneComposant
              key={composant.ligneId}
              composant={composant}
              premier={index === 0}
              dernier={index === conditionnement.composants.length - 1}
            />
          ))}
        </ul>
      )}

      {avertissement ? (
        <Alert tone="warn" className="mt-2">
          {avertissement}
        </Alert>
      ) : null}

      {!mayEdit ? null : impossible ? (
        <p className="mt-2 text-xs text-muted-strong">{impossible}</p>
      ) : (
        <AjoutComposant
          conditionnement={conditionnement}
          terme={terme}
          candidats={candidats}
        />
      )}
    </div>
  )
}

export function ProductKitManager({
  conditionnements,
  kitCible,
  terme,
  candidats,
  mayEdit,
}: {
  conditionnements: ConditionnementComposable[]
  /** Le conditionnement dont on cherche un composant, d'après l'adresse. */
  kitCible: string | null
  terme: string
  candidats: ComposantCandidat[]
  mayEdit: boolean
}) {
  if (conditionnements.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted-strong">
        Aucun conditionnement : il n’y a donc rien à composer.
      </p>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      {conditionnements.map((conditionnement) => (
        <BlocConditionnement
          key={conditionnement.id}
          conditionnement={conditionnement}
          /*
            Un seul bloc à la fois porte la recherche : le terme est dans
            l'adresse, et l'adresse dit aussi de quel conditionnement il
            s'agit. Sans cela, chercher « H7 » proposerait les mêmes candidats
            sous les trois conditionnements de la fiche.
          */
          terme={kitCible === conditionnement.id ? terme : ''}
          candidats={kitCible === conditionnement.id ? candidats : []}
          mayEdit={mayEdit}
        />
      ))}
    </div>
  )
}
