'use client'

import { useEffect, useState } from 'react'
import { CLE_REFUS } from './Mesure'

/** Bouton de la page Cookies : refuser (ou accepter de nouveau) la mesure d'audience. */
export function RefusMesure() {
  const [refuse, setRefuse] = useState<boolean | null>(null)
  useEffect(() => {
    try {
      setRefuse(localStorage.getItem(CLE_REFUS) === '1')
    } catch {
      setRefuse(false)
    }
  }, [])
  if (refuse === null) return null
  return (
    <p>
      {refuse ? 'Vos visites ne sont pas mesurées sur ce navigateur. ' : 'Vos visites sont mesurées de façon anonyme. '}
      <button
        type="button"
        onClick={() => {
          try {
            if (refuse) localStorage.removeItem(CLE_REFUS)
            else localStorage.setItem(CLE_REFUS, '1')
          } catch {}
          setRefuse(!refuse)
        }}
        className="font-semibold underline underline-offset-2"
      >
        {refuse ? 'Accepter de nouveau la mesure' : 'Ne plus mesurer mes visites'}
      </button>
    </p>
  )
}
