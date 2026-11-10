/**
 * Le titre et la phrase d'une carte de la page véhicule.
 *
 * Demande de l'exploitant (9 novembre 2026) : sur l'Audi A1, six cartes
 * s'appelaient « Feux de croisement » ; ce qui les distinguait (effet xénon,
 * kit xénon, ballast, kit LED…) était écrit en petit, à la troisième ligne. Le
 * titre dit désormais CE QU'EST le produit, l'emplacement passe en étiquette,
 * et une phrase dit ce qu'il change. Rien n'est promis que la fiche ne tienne :
 * pas de puissance chiffrée, pas d'homologation.
 *
 * Volontairement sans 'server-only' : la grille est un composant client.
 */

import { typeDeProduit } from './types-produit'

type Regle = [RegExp, string, string]

const REGLES: Regle[] = [
  [/^Pack ampoules effet xénon/, 'Ampoules effet xénon', 'Des halogènes à la lumière plus blanche, sans modification.'],
  [/^Kit bi-xénon HID/, 'Kit bi-xénon HID', 'Croisement et route au xénon : ampoules, ballasts et câbles.'],
  [/^Kit xénon HID/, 'Kit xénon HID', 'Ampoules et ballasts : une lumière blanche, bien plus forte que l’halogène.'],
  [/^Kit ampoules bi-LED/, 'Kit bi-LED', 'Croisement et route en LED, plus blancs et plus puissants que l’halogène.'],
  [/^Kit ampoules LED (phares|haute performance)/, 'Kit LED haute puissance', 'Plus blanches et plus puissantes que les ampoules halogènes.'],
  [/^(Kit ampoule LED taille mini|Ampoule LED phare)/, 'Ampoule LED compacte', 'Un format court, pour les phares où la place manque.'],
  [/^Ampoules LED pour phares xénon/, 'Ampoules LED pour phares xénon', 'Remplacent les ampoules xénon d’origine par des LED.'],
  [/^Ampoules xénon d’origine/, 'Ampoules xénon de rechange', 'Identiques à l’origine, pour remplacer une ampoule fatiguée.'],
  [/^Ballast xénon/, 'Ballast xénon de rechange', 'Le boîtier qui allume l’ampoule xénon, type origine.'],
  [/^(Ampoule LED feu stop|Pack ampoules LED feux stop)/, 'Ampoules LED feux stop', 'Un rouge vif qui s’allume instantanément.'],
  /*
    Avant / arrière dans le titre : sur le Dacia Duster, deux cartes « Ampoules
    LED de clignotants » se suivaient, à 9,90 € et 35,90 €, sans rien pour les
    distinguer (parcours client du 10 novembre 2026).
  */
  [/^Pack LED clignotants avant/, 'Ampoules LED de clignotants avant', 'Une lumière orange vive à la place des ampoules d’origine, à l’avant.'],
  [/^Pack LED clignotants arrière/, 'Ampoules LED de clignotants arrière', 'Une lumière orange vive à la place des ampoules d’origine, à l’arrière.'],
  [/^Pack LED clignotants/, 'Ampoules LED de clignotants', 'Orange vif, avec de quoi éviter le clignotement trop rapide.'],
  [/^Pack LED répétiteurs/, 'Ampoules LED de répétiteurs', 'Une lumière orange vive sur les côtés de la voiture.'],
  [/^Pack LED phares/, 'Ampoules LED de phares', 'Plus blanches et plus puissantes que les ampoules halogènes.'],
  [/^Pack LED antibrouillard arrière/, 'Ampoules LED antibrouillard arrière', 'Un feu de brouillard arrière rouge vif.'],
  [/^Pack LED antibrouillards/, 'Ampoules LED antibrouillards', 'Une lumière blanche à la place du jaune de l’halogène.'],
  /* Même raison : trois cartes « Ampoules LED » sous « Veilleuses ». */
  [/^Pack LED veilleuses et feux de jour/, 'Ampoules LED veilleuses + feux de jour', 'Les deux emplacements dans un seul pack.'],
  [/^Pack LED veilleuses/, 'Ampoules LED de veilleuses', 'Un blanc pur, assorti aux phares xénon ou LED.'],
  [/^Pack LED feux de jour/, 'Ampoules LED de feux de jour', 'Des feux de jour d’un blanc net, allumés dès le démarrage.'],
  [/^Pack LED feux de recul/, 'Ampoules LED de recul', 'Plus de lumière derrière la voiture en marche arrière.'],
  [/^Pack LED feux de route/, 'Ampoules LED de feux de route', 'Des pleins phares plus blancs et plus puissants.'],
  [/^Pack (ampoules )?LED (éclairage de plaque|plaque)/, 'Ampoules LED de plaque', 'Une plaque éclairée en blanc pur.'],
  [/^Pack LED (habitacle|plafonnier|intérieur)/, 'Ampoules LED d’habitacle', 'Un intérieur éclairé en blanc, sans ampoules jaunes.'],
  [/^Modules LED de plaque/, 'Modules LED de plaque', 'Les boîtiers complets, à clipser à la place de ceux d’origine.'],
  [/^Centrale de clignotants/, 'Centrale de clignotants', 'Rend la cadence normale aux clignotants LED.'],
]

export function presentationDeCarte(
  nomDuProduit: string,
  conditionnement: string | null,
): { titre: string | null; phrase: string | null } {
  const nom = nomDuProduit.trim()
  const regle = REGLES.find(([re]) => re.test(nom))
  if (regle) return { titre: regle[1], phrase: regle[2] }
  const type = typeDeProduit(nom)
  return {
    titre: type?.libelle ?? conditionnement ?? (nom.split(' pour ')[0].trim() || null),
    phrase: type?.contenu || null,
  }
}
