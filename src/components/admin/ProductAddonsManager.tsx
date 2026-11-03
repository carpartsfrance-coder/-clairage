'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'
import { IconClose, IconPlus } from '@/components/ui/icons'
import {
  COMPLEMENTS_MAX,
  RAISON_AUTRES_RELATIONS,
  noteComplementInvisible,
} from '@/lib/admin/produit-liens'
import {
  attachProductAddon,
  detachProductAddon,
  moveProductAddon,
} from '@/lib/actions/admin-product-links'
import { ETAT_VIDE, FlechesOrdre, Retour } from './ContentFields'
import { RechercheLien, ReponseRecherche } from './LinkSearch'

/**
 * Les compléments facultatifs d'une fiche produit.
 *
 * La fiche publique en fait un bloc cochable sous l'achat — « Complétez votre
 * commande » — et rien ne le remplissait : les six relations du jeu de données
 * étaient les seules que la boutique ait jamais connues. Un produit créé au
 * back-office ne pouvait donc proposer ni adaptateur, ni décodeur, ni veilleuse
 * assortie.
 *
 * Trois choses que cet écran rend visibles, parce que ce sont elles qui
 * décident de ce que le client voit :
 *
 * - **L'ordre est celui que la fiche propose.** D'où les flèches.
 * - **Un complément vers un brouillon ne se voit pas.** La fiche ne propose
 *   que des produits publiés, avec une référence active : sinon le lien
 *   mènerait à une page que la boutique ne sert pas, ou à un bouton d'ajout
 *   sans rien à ajouter. La ligne le dit, elle ne le devine pas.
 * - **Un complément déjà fourni par le pack retenu disparaît tout seul.**
 *   C'est `addonsProposables` qui s'en charge côté fiche, par produit et non
 *   par référence ; rien à régler ici.
 *
 * Les alternatives et les montées en gamme ne sont pas offertes : le schéma
 * les prévoit, aucune page ne les lit.
 */

export type ComplementFiche = {
  /** L'identifiant du lien, pas celui du produit : c'est lui qu'on déplace. */
  relationId: string
  produitId: string
  name: string
  slug: string
  statut: string
  referencesActives: number
}

export type ComplementCandidat = {
  id: string
  name: string
  slug: string
  statut: string
  referencesActives: number
}

function LigneComplement({
  complement,
  premier,
  dernier,
}: {
  complement: ComplementFiche
  premier: boolean
  dernier: boolean
}) {
  const [state, action, pending] = useActionState(detachProductAddon, ETAT_VIDE)
  const note = noteComplementInvisible({
    statut: complement.statut,
    referencesActives: complement.referencesActives,
  })

  return (
    <li className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {complement.statut === 'PUBLISHED' ? (
              <Link
                href={`/p/${complement.slug}`}
                className="text-sm font-semibold text-brand underline underline-offset-4"
              >
                {complement.name}
              </Link>
            ) : (
              <span className="text-sm font-semibold break-words">{complement.name}</span>
            )}
            {complement.statut === 'DRAFT' ? <Badge tone="warn">brouillon</Badge> : null}
            {complement.statut === 'ARCHIVED' ? <Badge tone="neutral">archivé</Badge> : null}
          </div>
          {/*
            L'adresse publique, sous le nom : deux produits peuvent porter
            exactement le même nom — le catalogue en contient — et seule
            l'adresse les distingue.
          */}
          <p className="mt-0.5 font-mono text-xs text-muted">/p/{complement.slug}</p>
          {note ? <p className="mt-1 text-xs text-muted-strong">{note}</p> : null}
        </div>

        <div className="flex items-center gap-1">
          <FlechesOrdre
            action={moveProductAddon}
            nomChamp="relationId"
            id={complement.relationId}
            premier={premier}
            dernier={dernier}
            designation="ce complément"
            occupe={pending}
          />
          <form action={action}>
            <input type="hidden" name="relationId" value={complement.relationId} />
            <Button type="submit" size="sm" variant="ghost" disabled={pending}>
              {/* La couleur est portée par le contenu : `cn` ne déduplique pas
                  les utilitaires Tailwind. */}
              <span className="flex items-center gap-1.5 text-danger">
                <IconClose className="size-4 shrink-0" />
                {pending ? 'Retrait…' : 'Retirer'}
              </span>
            </Button>
          </form>
        </div>
      </div>
      {state.error ? (
        <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
    </li>
  )
}

function AjoutComplement({
  productId,
  terme,
  candidats,
}: {
  productId: string
  terme: string
  candidats: ComplementCandidat[]
}) {
  const [state, action, pending] = useActionState(attachProductAddon, ETAT_VIDE)

  return (
    <div className="rounded-md border border-line p-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold">
        <IconPlus className="size-4 shrink-0" />
        Rattacher un complément
      </h4>
      <RechercheLien
        nomChamp="complement"
        terme={terme}
        label="Chercher un produit"
        placeholder="Adaptateur, décodeur, W5W…"
        hint="Par nom, adresse, culot ou référence. Le catalogue est trop grand pour une liste."
        /* La recherche navigue : sans l'onglet, elle retomberait sur le premier. */
        champsCaches={{ onglet: 'fiche' }}
      />

      <ReponseRecherche
        terme={terme}
        nombre={candidats.length}
        invitation="Cherchez le produit à proposer en complément : un adaptateur, un décodeur, une veilleuse assortie."
        aucunResultat="Vérifiez l’orthographe, ou cherchez par référence. Les produits déjà rattachés, et la fiche elle-même, ne sont pas proposés."
      />

      {candidats.length > 0 ? (
        /*
          Un seul formulaire, et l'identifiant porté par le bouton cliqué
          (`name` + `value` sur le `<button type="submit">`) : rattacher
          demande alors un clic, là où une liste de boutons radio en
          demanderait deux, et l'action n'a qu'un seul état de retour à
          afficher.
        */
        <form action={action} className="mt-3">
          <input type="hidden" name="productId" value={productId} />
          <ul className="flex flex-col gap-2">
            {candidats.map((candidat) => (
              <li
                key={candidat.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-soft px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium break-words">{candidat.name}</span>
                  {candidat.statut === 'DRAFT' ? (
                    <Badge tone="warn" className="ml-2">
                      brouillon
                    </Badge>
                  ) : null}
                  <span className="mt-0.5 block font-mono text-xs text-muted">
                    /p/{candidat.slug}
                  </span>
                  {candidat.referencesActives === 0 ? (
                    <span className="mt-0.5 block text-xs text-muted-strong">
                      Aucune référence active : rien à ajouter au panier.
                    </span>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  name="cibleId"
                  value={candidat.id}
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                >
                  Rattacher
                </Button>
              </li>
            ))}
          </ul>
        </form>
      ) : null}

      <Retour state={state} />
    </div>
  )
}

export function ProductAddonsManager({
  productId,
  complements,
  terme,
  candidats,
  mayEdit,
}: {
  productId: string
  complements: ComplementFiche[]
  terme: string
  candidats: ComplementCandidat[]
  mayEdit: boolean
}) {
  if (!mayEdit) {
    return complements.length === 0 ? (
      <p className="mt-2 text-sm text-muted-strong">Aucun complément proposé.</p>
    ) : (
      <ul className="mt-2 flex flex-col gap-2">
        {complements.map((complement) => (
          <li
            key={complement.relationId}
            className="rounded-md border border-line bg-white p-3 text-sm"
          >
            {complement.name}
            {complement.statut === 'PUBLISHED' ? null : (
              <span className="ml-2 text-xs text-muted">non publié</span>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      {complements.length === 0 ? (
        <Alert tone="info" title="Aucun complément">
          Le bloc «&nbsp;Complétez votre commande&nbsp;» n’apparaît pas sur la fiche. C’est là que
          se vendent l’adaptateur et le décodeur dont le montage a besoin.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-2">
          {complements.map((complement, index) => (
            <LigneComplement
              key={complement.relationId}
              complement={complement}
              premier={index === 0}
              dernier={index === complements.length - 1}
            />
          ))}
        </ul>
      )}

      {complements.length >= COMPLEMENTS_MAX ? (
        <p className="text-xs text-muted-strong">
          Cette fiche propose {COMPLEMENTS_MAX} compléments : au-delà, le bloc devient un second
          catalogue. Retirez-en un pour en proposer un autre.
        </p>
      ) : (
        <AjoutComplement productId={productId} terme={terme} candidats={candidats} />
      )}

      <p className="text-xs text-muted">{RAISON_AUTRES_RELATIONS}</p>
    </div>
  )
}
