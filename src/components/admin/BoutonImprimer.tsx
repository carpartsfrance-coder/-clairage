'use client'

export function BoutonImprimer() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center rounded-sm border border-line-strong px-3 text-sm font-semibold hover:border-slate-ink"
    >
      Imprimer
    </button>
  )
}
