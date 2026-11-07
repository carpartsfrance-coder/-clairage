import Link from 'next/link'
import { cn } from '@/lib/cn'

/**
 * « Votre véhicule n'est pas dans la liste ? Contactez-nous »
 *
 * Le sélecteur ne propose que les véhicules pour lesquels un éclairage est
 * effectivement en ligne. C'est volontaire — mener un client jusqu'à sa voiture
 * pour lui annoncer qu'il n'y a rien lui fait perdre trois clics et la
 * confiance qui va avec. Mais cela crée un silence : le client dont la voiture
 * n'apparaît pas n'a aucun moyen de savoir s'il est au mauvais endroit, si le
 * site ne couvre pas sa marque, ou si ses éclairages arrivent bientôt. Les
 * trois sont faux, et il repart.
 *
 * Ce lien est la sortie. Il est **discret par construction** : le parcours
 * normal est de trouver son véhicule, et une invitation trop visible à écrire
 * ferait douter de la couverture du catalogue avant même d'avoir essayé. Il se
 * lit quand on le cherche, et pas avant.
 *
 * Il arrive sur le formulaire de contact avec le sujet « Véhicule non listé »
 * déjà choisi, ce qui fait apparaître le champ « Votre véhicule ». La
 * présélection n'est qu'une présélection : l'action revalide le sujet contre
 * `CONTACT_SUBJECTS` avant d'écrire quoi que ce soit.
 *
 * Ces demandes ont une seconde utilité, côté exploitant : elles disent quels
 * véhicules les clients cherchent sans les trouver, donc quelles photos
 * produire ensuite.
 */
export function LienVehiculeAbsent({ className }: { className?: string }) {
  return (
    <p className={cn('text-[11px] leading-[1.7] text-muted', className)}>
      Votre véhicule n&apos;est pas dans la liste ?{' '}
      <Link
        href="/contact?sujet=vehicule"
        className="font-semibold text-ink underline-offset-[3px] hover:underline"
      >
        Contactez-nous
      </Link>
    </p>
  )
}
