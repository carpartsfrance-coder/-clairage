'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { IconArrowRight, IconSearch } from '@/components/ui/icons'

/**
 * Recherche du header.
 *
 * Elle accepte trois entrées : un nom de produit, une référence (SKU) et un
 * culot (H7, D1S, W5W…). Le tri de ces trois cas se fait côté serveur, dans
 * /recherche : ici on se contente de transmettre la requête telle quelle.
 *
 * Les suggestions sont servies par /api/recherche/suggestions. Tant que la
 * base ne contient rien, la liste reste vide — aucune suggestion fabriquée.
 */

type Suggestion = {
  label: string
  href: string
  kind: 'produit' | 'référence' | 'culot' | 'catégorie'
}

export function HeaderSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const inputId = useId()
  const listId = `${inputId}-suggestions`
  const [value, setValue] = useState('')
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const abortRef = useRef<AbortController | null>(null)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchSuggestions(query: string) {
    abortRef.current?.abort()
    if (query.trim().length < 2) {
      setItems([])
      setOpen(false)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await fetch(`/api/recherche/suggestions?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('suggestions indisponibles')
      const data = (await response.json()) as { items: Suggestion[] }
      setItems(data.items ?? [])
      setOpen(true)
      setActiveIndex(-1)
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      // Pas de suggestion plutôt qu'une suggestion inventée.
      setItems([])
      setOpen(false)
    }
  }

  function submit(query = value) {
    const trimmed = query.trim()
    if (!trimmed) return
    setOpen(false)
    router.push(`/recherche?q=${encodeURIComponent(trimmed)}`)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) {
      if (event.key === 'Escape') setValue('')
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index <= 0 ? items.length - 1 : index - 1))
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      router.push(items[activeIndex].href)
      setOpen(false)
    } else if (event.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <search className="relative block">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex"
      >
        <label htmlFor={inputId} className="sr-only">
          Rechercher une ampoule, une référence ou un culot
        </label>

        <div
          className={cn(
            'flex w-full items-stretch overflow-hidden rounded-md border border-line bg-surface-muted',
            'focus-within:border-line-strong',
            compact ? 'h-12' : 'h-[60px]',
          )}
        >
          <IconSearch
            className={cn(
              'ml-4 shrink-0 self-center text-slate-ink',
              compact ? 'size-5' : 'size-6',
            )}
          />
          <input
            id={inputId}
            type="search"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              void fetchSuggestions(event.target.value)
            }}
            onKeyDown={onKeyDown}
            onFocus={() => items.length > 0 && setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 120)
            }}
            placeholder="Rechercher une ampoule, un culot, un kit…"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            className={cn(
              'min-w-0 flex-1 bg-transparent px-3 text-slate-ink outline-none placeholder:text-muted',
              compact ? 'text-sm' : 'text-[1.0625rem]',
            )}
          />
          <button
            type="submit"
            aria-label="Lancer la recherche"
            className={cn(
              'flex shrink-0 items-center justify-center bg-brand text-white transition-colors hover:bg-brand-dark',
              compact ? 'w-12' : 'w-[61px]',
            )}
          >
            <IconArrowRight className={compact ? 'size-5' : 'size-6'} />
          </button>
        </div>
      </form>

      {open && items.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-md border border-line bg-white shadow-pop"
        >
          {items.map((item, index) => (
            <li key={`${item.href}-${index}`} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current)
                }}
                onClick={() => {
                  router.push(item.href)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm',
                  index === activeIndex ? 'bg-surface-muted' : 'hover:bg-surface-soft',
                )}
              >
                <span className="truncate">{item.label}</span>
                <span className="shrink-0 text-xs uppercase tracking-wide text-muted">{item.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </search>
  )
}
