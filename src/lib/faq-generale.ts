import 'server-only'
import { commercialTerms, dureeGarantie, formatPrice } from './identity'
import { getZonesDeLivraison } from './shipping'

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
          answer: `Oui : vous avez ${retour} jours à compter de la réception pour changer d’avis, sans avoir à vous justifier. Prévenez-nous avec votre numéro de commande, puis renvoyez l’article ; nous vous remboursons par le même moyen de paiement.`,
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
