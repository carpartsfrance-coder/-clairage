import Link from 'next/link'
import { IconLock, IconReturn, IconShield, IconTruck } from '@/components/ui/icons'
import { dureeGarantie, formatPrice, promesseRetour } from '@/lib/identity'
import { getSeuilLivraisonOfferte } from '@/lib/shipping'
import { cn } from '@/lib/cn'

/**
 * Les quatre promesses d'achat, en une ligne : garantie, livraison offerte,
 * retours, paiement sécurisé.
 *
 * Pour les pages où le client choisit ses packs (page d'une génération,
 * résultats véhicule) : c'est là qu'il compare avec une autre boutique, et ce
 * sont les questions qu'il se pose avant d'ajouter au panier. Chaque mention
 * vient de la configuration (`commercialTerms`, méthodes de livraison) : une
 * mention sans valeur ne s'affiche pas, plutôt que d'être inventée. Chacune
 * mène à la page qui en donne les conditions.
 */
export async function PromessesAchat({ className }: { className?: string }) {
  const seuil = await getSeuilLivraisonOfferte()
  const garantie = dureeGarantie()
  const retours = promesseRetour()

  const promesses = [
    garantie ? { icone: IconShield, texte: `Garantie ${garantie}`, href: '/garanties' } : null,
    seuil
      ? { icone: IconTruck, texte: `Livraison offerte dès ${formatPrice(seuil)}`, href: '/livraison-retours' }
      : null,
    retours ? { icone: IconReturn, texte: retours, href: '/livraison-retours#retours' } : null,
    { icone: IconLock, texte: 'Paiement sécurisé', href: '/paiement' },
  ].filter((promesse) => promesse !== null)

  return (
    <ul
      aria-label="Nos engagements"
      className={cn(
        'grid list-none grid-cols-2 gap-x-3 gap-y-2 rounded-[7px] border border-line bg-white p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6',
        className,
      )}
    >
      {promesses.map(({ icone: Icone, texte, href }) => (
        <li key={texte} className="min-w-0">
          <Link
            href={href}
            className="flex items-center gap-1.5 text-[12px] font-bold text-slate-ink hover:text-brand"
          >
            <Icone className="size-4 shrink-0 text-brand" strokeWidth={1.5} />
            <span className="min-w-0">{texte}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
