import Link from 'next/link'

/**
 * Une ligne sous un formulaire : à quoi servent les données saisies, et le
 * lien vers la politique de confidentialité.
 *
 * Le RGPD (article 13) veut que la personne soit informée **au moment où elle
 * donne ses données**, pas seulement dans une page du pied de page. Une ligne
 * suffit, à condition de dire l'usage réel du formulaire et de renvoyer au
 * détail.
 */
export function MentionDonnees({ usage, className }: { usage: string; className?: string }) {
  return (
    <p className={`text-[10px] leading-[1.6] text-muted ${className ?? ''}`}>
      {usage}{' '}
      <Link href="/confidentialite" className="underline underline-offset-2">
        Vos données et vos droits
      </Link>
      .
    </p>
  )
}
