'use client'

import { useEffect, useState } from 'react'
import { provenance } from './file'

/**
 * Le champ caché qui recopie la provenance de la visite dans la commande.
 *
 * **Pourquoi un champ caché plutôt qu'un cookie.** Un cookie de provenance
 * serait un cookie de mesure publicitaire, donc soumis à accord, alors que la
 * provenance est déjà relevée sans cookie par la mesure maison. Ce champ se
 * contente de recopier ce que l'onglet sait déjà, au moment où le client
 * valide — rien de nouveau n'est stocké chez lui.
 *
 * **Ce qui passe, et ce qui ne passe pas.** Le NOM de la provenance
 * (« google (publicité) », « direct », un domaine), jamais le numéro de la
 * visite : la commande ne doit pas permettre de retrouver un parcours
 * anonyme. Le serveur retronque de toute façon à 80 caractères.
 *
 * Rendu vide tant que le navigateur n'a pas répondu : le serveur ne peut pas
 * deviner, et écrire quelque chose avant ferait diverger les deux rendus.
 */
export function ProvenanceDeLaVisite() {
  const [source, setSource] = useState('')
  useEffect(() => {
    setSource(provenance() ?? '')
  }, [])
  return <input type="hidden" name="source" value={source} />
}
