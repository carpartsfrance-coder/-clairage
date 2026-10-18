import Link from 'next/link'
import { logout } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/**
 * Navigation de l'espace client.
 *
 * Composant serveur : il ne porte aucun état. La page active est désignée par
 * la clé `current`, fournie par la page elle-même — rien n'est déduit de
 * `usePathname`, ce qui éviterait de faire de ce composant un composant client
 * pour une information que la route connaît déjà.
 *
 * Sur mobile, la liste devient une rangée qui défile horizontalement : une
 * colonne de cinq liens repousserait le contenu sous la ligne de flottaison, et
 * le défilement reste contenu dans la nav, jamais dans la page.
 */

const links = [
  { key: 'tableau', label: 'Tableau de bord', href: '/compte' },
  { key: 'commandes', label: 'Mes commandes', href: '/compte/commandes' },
  { key: 'adresses', label: 'Mes adresses', href: '/compte/adresses' },
  { key: 'vehicules', label: 'Mes véhicules', href: '/compte/vehicules' },
  { key: 'profil', label: 'Mon profil', href: '/compte/profil' },
] as const

export function AccountNav({ current, className }: { current: string; className?: string }) {
  return (
    <div className={cn('lg:w-64 lg:shrink-0', className)}>
      <nav aria-label="Espace client">
        {/*
          Les marges négatives rendent la zone de défilement bord à bord sur
          mobile sans rogner l'anneau de focus du premier et du dernier lien.
        */}
        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
          {links.map((link) => {
            const active = link.key === current
            return (
              <li key={link.key} className="shrink-0 lg:shrink">
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center rounded-sm px-3 text-sm whitespace-nowrap transition-colors',
                    active
                      ? 'bg-surface-muted font-bold text-slate-ink'
                      : 'font-medium text-muted-strong hover:bg-surface-soft hover:text-slate-ink',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* La déconnexion est une action, pas une navigation : elle reste hors du <nav>. */}
      <form action={logout} className="mt-4">
        <Button type="submit" variant="secondary" block>
          Se déconnecter
        </Button>
      </form>
    </div>
  )
}
