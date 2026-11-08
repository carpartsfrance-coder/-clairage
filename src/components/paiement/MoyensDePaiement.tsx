import { IconLock } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

/**
 * Les moyens de paiement acceptés, en pastilles de texte.
 *
 * Ceux activés chez Mollie sur le profil LEDVROOM (vérifié le 8 novembre
 * 2026) : carte (Visa, Mastercard, CB) et Apple Pay. Des pastilles de texte
 * plutôt que les logos des réseaux : elles se lisent aussi bien, et le site
 * ne reproduit pas de marques déposées.
 *
 * Voir aussi la page « Moyens de paiement » (`app/paiement`).
 */
const MOYENS = ['CB', 'Visa', 'Mastercard', 'Apple Pay'] as const

export function MoyensDePaiement({
  className,
  ton = 'clair',
}: {
  className?: string
  /** `sombre` pour le pied de page. */
  ton?: 'clair' | 'sombre'
}) {
  const sombre = ton === 'sombre'
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span
        className={cn(
          'mr-1 flex items-center gap-1 text-[11px]',
          sombre ? 'text-[#bdc8ca]' : 'text-[#55585b]',
        )}
      >
        <IconLock className="size-3.5 shrink-0" />
        Paiement sécurisé
      </span>
      <ul className="flex list-none flex-wrap gap-1.5 p-0" aria-label="Moyens de paiement acceptés">
        {MOYENS.map((moyen) => (
          <li
            key={moyen}
            className={cn(
              'rounded-[4px] border px-1.5 py-0.5 text-[10px] font-bold tracking-[0.2px]',
              sombre ? 'border-[#3c4448] text-[#e2e7e8]' : 'border-[#d9d9d9] bg-white text-[#2b2f33]',
            )}
          >
            {moyen}
          </li>
        ))}
      </ul>
    </div>
  )
}
