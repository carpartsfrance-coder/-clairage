import { IconStar } from '@/components/ui/icons'
import { avisGoogle, noteGoogle } from '@/lib/identity'
import { cn } from '@/lib/cn'

/**
 * La note Google de l'entreprise, posée là où l'achat se décide.
 *
 * **Pourquoi en évidence.** Les promesses d'achat (garantie, retours,
 * paiement sécurisé) sont ce que la boutique dit d'elle-même ; la note est ce
 * que d'autres clients en ont dit. C'est le seul argument de la fiche qui ne
 * vienne pas du vendeur, et il ne vaut que s'il se voit.
 *
 * **Deux formes, parce que deux emplacements.**
 *
 * - `bloc` : étoiles de 23 px centrées, pour le panier et la commande, où
 *   rien d'autre ne tient cette place et où la note est le dernier appui
 *   avant de payer.
 * - `ligne` : étoiles de 15 px sur une seule ligne, pour le haut de la fiche
 *   produit, juste au-dessus du titre (demande de l'exploitant, 19 novembre
 *   2026, sur l'exemple d'un concurrent). Là, la note est la première chose
 *   lue de la page, pas un encart de plus dans la colonne d'achat.
 *
 * **Le libellé de la forme `ligne` nomme l'entreprise, et ce n'est pas un
 * détail.** Au-dessus d'un titre de produit, des étoiles sont lues partout
 * comme la note DE CE PRODUIT — c'est la convention de tout le commerce en
 * ligne, et c'est ce que fait le concurrent qui a servi d'exemple, avec ses
 * vrais avis produit. Afficher ici la note de l'entreprise sans le dire
 * laisserait croire que cette ampoule-ci a été notée par ses acheteurs.
 * « Société notée 4,4/5 sur Google » coûte trois mots et dit la vérité.
 *
 * Le mot est « Société », pas « Boutique » (exploitant, 19 novembre 2026) :
 * c'est l'entreprise qui est notée sur Google, pas le site.
 *
 * **Sans cadre** (relecture de l'exploitant, 19 novembre 2026). La première
 * version encadrait la note : bordure, fond gris, coins arrondis. Tout le
 * bloc d'achat est fait de lignes posées les unes sous les autres, sans
 * aucune boîte — la note y devenait un badge rapporté, collé par-dessus la
 * fiche. Ce qui lui donne son poids, c'est l'air autour d'elle et la taille
 * des étoiles, pas une bordure.
 *
 * **Sans lien, volontairement** (consigne de l'exploitant, 19 novembre 2026).
 * Un lien vers la fiche Google sortirait le client du tunnel à la seconde
 * exacte où il décide. La note rassure sur place ; qui veut vérifier
 * trouvera la fiche Google en cherchant le nom de la boutique.
 *
 * **Sans le logo Google**, pour la même raison que les moyens de paiement
 * s'écrivent en toutes lettres (`paiement/MoyensDePaiement.tsx`) : le site ne
 * reproduit pas de marques déposées. Le mot « Google » cité pour dire d'où
 * vient le chiffre suffit, et c'est l'usage le plus honnête.
 *
 * **Sans données structurées.** Voir `avisGoogle` dans `lib/identity.ts` : un
 * balisage d'avis qu'on publie sur soi-même expose à une action manuelle de
 * Google. Ce bloc est de l'affichage, rien d'autre.
 *
 * Le chiffre et son libellé viennent de `lib/identity.ts`. Sans note
 * renseignée, le composant ne rend rien — jamais d'étoiles vides, qui
 * feraient plus de mal que pas d'étoiles du tout.
 */
export function NoteGoogle({
  className,
  variante = 'bloc',
}: {
  className?: string
  variante?: 'bloc' | 'ligne'
}) {
  const note = noteGoogle()
  if (note === null || avisGoogle.note === null) return null

  const proportion = Math.max(0, Math.min(100, (avisGoogle.note / 5) * 100))
  const mention = avisGoogle.nombre
    ? `${avisGoogle.nombre.toLocaleString('fr-FR')} avis Google`
    : 'Avis Google'

  /*
    `role="img"` plus un libellé complet : les étoiles, le chiffre et la
    mention forment une seule information. Énumérés un à un par un lecteur
    d'écran, ils donneraient « étoile étoile étoile étoile étoile 4,4 5 avis
    Google » — du bruit à la place d'une note.
  */
  const libelle = `Société notée ${note} sur 5 sur Google${
    avisGoogle.nombre ? `, ${avisGoogle.nombre.toLocaleString('fr-FR')} avis` : ''
  }`

  if (variante === 'ligne') {
    return (
      <p
        role="img"
        aria-label={libelle}
        className={cn(
          'flex items-center gap-[7px] text-[12px] leading-[1.2] text-muted-strong fiche:text-[12.5px]',
          className,
        )}
      >
        <Rangee proportion={proportion} taille="petite" />
        <span>
          Société notée <strong className="font-semibold text-ink">{note}/5</strong> sur Google
        </span>
      </p>
    )
  }

  return (
    <div role="img" aria-label={libelle} className={cn('text-center', className)}>
      <span className="flex justify-center">
        <Rangee proportion={proportion} taille="grande" />
      </span>
      <span className="mt-1.5 block text-[13px] leading-[1.2] text-muted-strong">
        <strong className="text-[15px] text-ink">{note} sur 5</strong>
        <span aria-hidden="true" className="mx-1.5">
          ·
        </span>
        {mention}
      </span>
    </div>
  )
}

/**
 * Les étoiles exactes : une rangée grise, et la même rangée dorée par-dessus,
 * coupée à la proportion de la note. Arrondir à l'étoile pleine la plus proche
 * afficherait quatre étoiles et demie pour 4,4 comme pour 4,6 — autant écrire
 * le chiffre seul.
 */
function Rangee({ proportion, taille }: { proportion: number; taille: Taille }) {
  return (
    <span className="relative block w-max shrink-0">
      <Etoiles taille={taille} className="text-[#d9dadb]" />
      <span className="absolute top-0 left-0 overflow-hidden" style={{ width: `${proportion}%` }}>
        <Etoiles taille={taille} className="text-[#f0a202]" />
      </span>
    </span>
  )
}

type Taille = 'grande' | 'petite'

/** Taille et espacement fixes : les deux rangées doivent se superposer au pixel. */
function Etoiles({ className, taille }: { className?: string; taille: Taille }) {
  return (
    <span
      className={cn('flex w-max', taille === 'grande' ? 'gap-0.5' : 'gap-px', className)}
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4].map((rang) => (
        <IconStar
          key={rang}
          className={cn('shrink-0', taille === 'grande' ? 'size-[23px]' : 'size-[15px]')}
        />
      ))}
    </span>
  )
}
