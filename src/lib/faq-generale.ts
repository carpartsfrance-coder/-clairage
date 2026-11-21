import 'server-only'
import { commercialTerms, dureeGarantie, formatPrice } from './identity'
import { getZonesDeLivraison } from './shipping'
import { leVehicule, typeHorsAmpoules } from './types-produit'
import type { Caracteristiques } from './caracteristiques'

/**
 * Questions fréquentes par défaut, tant que le back-office n'en publie pas.
 *
 * Ce sont les questions qu'un client se pose avant un premier achat sur une
 * boutique qu'il ne connaît pas. **Chaque réponse est tirée de la
 * configuration** (garantie, livraison, retours) ou de ce que le site fait
 * réellement : rien ne peut annoncer un tarif ou une durée qui ne serait pas
 * celui du panier. Des questions publiées en base (`FaqItem`, portée
 * « general ») prennent la place de celles-ci.
 */
export type QuestionReponse = { question: string; answer: string }

export async function faqGeneraleParDefaut(): Promise<QuestionReponse[]> {
  const zones = await getZonesDeLivraison()
  const france = zones.find((zone) => zone.countries.includes('FR'))
  const offre = france?.offres
    .slice()
    .sort((a, b) => a.priceCents - b.priceCents)[0]
  const garantie = dureeGarantie()
  const retour = commercialTerms.returnWindowDays

  const questions: Array<QuestionReponse | null> = [
    {
      question: 'Comment être sûr que le pack convient à ma voiture ?',
      answer:
        'Choisissez votre véhicule (marque, modèle, année) : le site ne vous montre que les packs composés pour lui, emplacement par emplacement, et chaque fiche indique le véhicule pour lequel le pack est fait. En cas de doute sur votre version ou son équipement d’origine, écrivez-nous avec le modèle exact : nous vérifions avant l’envoi.',
    },
    {
      question: 'Faut-il modifier le câblage ?',
      answer:
        'Non, sur les véhicules compatibles : les ampoules et les LED se montent à la place de celles d’origine. Quand un adaptateur est nécessaire, la fiche du produit le signale.',
    },
    garantie
      ? {
          question: 'Quelle est la garantie ?',
          answer: `Tous nos produits sont garantis ${garantie} à compter de la livraison. Si une ampoule ou une LED tombe en panne, nous la remplaçons à nos frais. Le détail est sur la page Garanties.`,
        }
      : null,
    offre
      ? {
          question: 'Combien coûte la livraison, et en combien de temps ?',
          answer: [
            `${offre.label}${offre.carrier ? ` (${offre.carrier})` : ''} : ${formatPrice(offre.priceCents)}`,
            offre.freeFromCents ? `, offerte dès ${formatPrice(offre.freeFromCents)} d’achat en France` : '',
            offre.minDays && offre.maxDays
              ? `. Délai estimé : ${offre.minDays} à ${offre.maxDays} jours ouvrés après l’expédition.`
              : '.',
            ' Le prix exact est toujours affiché dans le panier, avant le paiement.',
          ].join(''),
        }
      : null,
    retour
      ? {
          question: 'Puis-je retourner un produit ?',
          answer: commercialTerms.satisfaitDays
            ? `Oui : satisfait ou remboursé pendant ${commercialTerms.satisfaitDays} jours après réception. Les ${retour} premiers jours, c’est sans condition (droit de rétractation). Ensuite, jusqu’au ${commercialTerms.satisfaitDays}e jour, l’article doit être neuf et complet, dans son emballage d’origine. Prévenez-nous avec votre numéro de commande, puis renvoyez l’article ; nous vous remboursons par le même moyen de paiement.`
            : `Oui : vous avez ${retour} jours à compter de la réception pour changer d’avis, sans avoir à vous justifier. Prévenez-nous avec votre numéro de commande, puis renvoyez l’article ; nous vous remboursons par le même moyen de paiement.`,
        }
      : null,
    {
      question: 'Le paiement est-il sécurisé ?',
      answer:
        'Oui. Vous payez par carte bancaire (CB, Visa, Mastercard) ou Apple Pay sur la page sécurisée de Mollie, établissement de paiement agréé. Votre numéro de carte ne nous est jamais transmis.',
    },
    {
      question: 'Un message d’erreur s’affiche au tableau de bord après le montage : que faire ?',
      answer:
        'Certains véhicules surveillent la consommation des ampoules. Écrivez-nous avec le modèle de votre voiture : nous vous indiquons la solution pour elle.',
    },
  ]

  return questions.filter((question): question is QuestionReponse => question !== null)
}

/**
 * Questions par défaut d'une fiche produit, tant que le back-office ne lui en
 * donne pas (`product.faq`).
 *
 * Sans elles, la fiche n'avait aucune section « Vos questions » : le client
 * qui hésite repartait chercher ailleurs ce qu'il voulait savoir. Ce sont les
 * questions générales, sauf le paiement (déjà dit dans le bloc d'achat), avec
 * en tête la compatibilité, dite pour le véhicule de la fiche quand on le
 * connaît. Elles ne partent pas en données structurées : le même texte sur des
 * milliers de fiches n'apporte rien à Google.
 */
export async function faqFicheParDefaut(
  concuPour: string | null,
  nomDuProduit = '',
  moto = false,
  /**
   * Atouts relevés sur la même fiche chez LedPerf (lib/caracteristiques.ts).
   * Quand ils sont connus, les réponses les disent au lieu de rester
   * générales : « sans erreur OBD » répond à la question du tableau de bord,
   * « plug & play » à celle du câblage, le temps de montage a sa question.
   */
  atouts: Pick<Caracteristiques, 'sansErreur' | 'plugAndPlay' | 'montageMinutes' | 'notice' | 'homologue'> | null = null,
): Promise<QuestionReponse[]> {
  const generales = await faqGeneraleParDefaut()
  // Feux additionnels, centrale… : la réponse sur le câblage est la leur.
  const type = typeHorsAmpoules(nomDuProduit)
  const sansPaiement = generales
    .filter(
      (question) => !question.question.startsWith('Le paiement') && !question.question.startsWith('Comment être sûr'),
    )
    // Sans erreur OBD relevé : la question est reposée plus haut, avec sa vraie réponse.
    .filter((question) => !((type || atouts?.sansErreur) && question.question.startsWith('Un message d’erreur')))
    // Un accessoire sans branchement (outils, gants) n'a pas de question de câblage.
    .filter((question) => !(type && !type.cablage && question.question === 'Faut-il modifier le câblage ?'))
    .map((question) => {
      if (question.question !== 'Faut-il modifier le câblage ?') return question
      // Feux additionnels, centrale… : la réponse sur le branchement est la leur.
      if (type) return { question: 'Comment se branche ce produit ?', answer: type.cablage }
      // Plug & play relevé : on l'affirme, sans le « sur les véhicules compatibles ».
      if (atouts?.plugAndPlay) {
        return {
          question: question.question,
          answer: 'Non. Ce produit est plug & play : il se monte à la place de l’origine, sans modification ni soudure.',
        }
      }
      return question
    })
  const compatibilite: QuestionReponse = concuPour
    ? {
        question: type ? 'Ce produit convient-il à mon véhicule ?' : `Ce pack convient-il à mon véhicule ?`,
        answer: type
          ? `Il est prévu pour ${leVehicule(concuPour, moto)}. En cas de doute sur votre version, écrivez-nous avec le modèle exact avant de commander : nous vérifions.`
          : `Il est composé pour ${leVehicule(concuPour, moto)} : les ampoules et les LED correspondent aux emplacements d’origine de ce véhicule. Si le vôtre a reçu des phares différents de ceux montés en usine (xénon, LED d’origine), écrivez-nous avec le modèle exact avant de commander : nous vérifions.`,
      }
    : type
      ? generales.find((question) => question.question.startsWith('Comment être sûr')) ?? generales[0]
      : /*
          Ampoule vendue à la référence : la question générale parlait de
          « pack », hors de propos ici (relecture du 17 novembre 2026). Le
          client a une référence en main ; ce qu'il doit savoir, c'est qu'elle
          ne suffit pas toujours.
        */
        {
          question: /^kit\b/i.test(nomDuProduit.trim())
            ? 'Ce kit convient-il à mon véhicule ?'
            : 'Cette ampoule convient-elle à mon véhicule ?',
          answer:
            'La référence de l’ampoule ne suffit pas toujours : le bloc optique et l’équipement d’origine comptent aussi. Choisissez votre véhicule (marque, modèle, année) : la fiche vous dit alors si cette référence lui convient. En cas de doute, écrivez-nous avec le modèle exact : nous vérifions avant l’envoi.',
        }
  /*
    Ce que le relevé permet d'affirmer, juste après le câblage : le temps de
    montage, la notice, et l'absence d'erreur au tableau de bord — la
    question que les visiteurs hésitants ouvraient le plus (relevé des
    paniers abandonnés, 21 novembre 2026).
  */
  const affirmees: QuestionReponse[] = []
  // Homologué route : la réponse la plus attendue, en premier (exploitant, 21 novembre 2026).
  if (atouts?.homologue === true) {
    affirmees.push({
      question: 'Ce produit est-il homologué pour la route ?',
      answer: 'Oui : ce produit est homologué pour la route.',
    })
  }
  if (atouts?.montageMinutes) {
    const n = atouts.montageMinutes
    const duree = n < 60 ? `${n} minutes` : `${Math.floor(n / 60)} h${n % 60 ? ` ${String(n % 60).padStart(2, '0')}` : ''}`
    affirmees.push({
      question: 'Combien de temps faut-il pour le monter ?',
      answer: `Environ ${duree}${atouts.notice ? ', avec la notice de montage PDF personnalisée' : ''}.`,
    })
  } else if (atouts?.notice) {
    affirmees.push({
      question: 'Une notice de montage est-elle fournie ?',
      answer: 'Oui : une notice de montage PDF personnalisée accompagne le produit.',
    })
  }
  if (atouts?.sansErreur) {
    affirmees.push({
      question: 'Y aura-t-il un message d’erreur au tableau de bord ?',
      answer: 'Non. Ce produit est sans erreur OBD : il ne déclenche pas de message d’erreur au tableau de bord.',
    })
  }
  const cablage = sansPaiement.findIndex(
    (question) => question.question === 'Faut-il modifier le câblage ?' || question.question === 'Comment se branche ce produit ?',
  )
  const suite =
    cablage >= 0
      ? [...sansPaiement.slice(0, cablage + 1), ...affirmees, ...sansPaiement.slice(cablage + 1)]
      : [...affirmees, ...sansPaiement]
  return [compatibilite, ...suite]
}
