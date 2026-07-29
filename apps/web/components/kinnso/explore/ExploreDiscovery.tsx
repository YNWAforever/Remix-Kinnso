"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GuideCard from '@/components/kinnso/GuideCard'
import { ExploreControls } from '@/components/kinnso/explore/ExploreControls'
import {
  EXPLORE_SEARCH_DEBOUNCE_MS,
  canSortByMostSaved,
  eligibleExploreDestinations,
  indexExploreGuides,
  parseExploreState,
  selectExploreResults,
  serializeExploreState,
  type ExploreSort,
  type ExploreState,
} from '@/lib/explore/discovery'
import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

const DEFAULT_STATE: ExploreState = { destination: null, q: '', sort: 'newest', page: 1 }
const withCount = (template: string, count: number) => template.replace('{count}', String(count))
const normalizeSearch = (value: string) => value.trim().replace(/\s+/g, ' ')

export interface ExploreDiscoveryProps {
  locale: Locale
  t: Messages['explore']
  guides: Guide[]
  destinations: Destination[]
}

export function ExploreDiscovery({ locale, t, guides, destinations }: ExploreDiscoveryProps) {
  const eligible = useMemo(() => eligibleExploreDestinations(destinations), [destinations])
  const indexed = useMemo(() => indexExploreGuides(guides, eligible), [guides, eligible])
  const allowMostSaved = useMemo(() => canSortByMostSaved(guides), [guides])
  const destinationSlugs = useMemo(() => new Set(eligible.map(({ slug }) => slug)), [eligible])
  const [state, setState] = useState<ExploreState>(DEFAULT_STATE)
  const [searchValue, setSearchValue] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const stateRef = useRef<ExploreState>(DEFAULT_STATE)
  const didHydrate = useRef(false)

  const replaceUrl = useCallback((next: ExploreState) => {
    const query = serializeExploreState(next).toString()
    const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState(window.history.state, '', url)
  }, [])

  const commit = useCallback((next: ExploreState) => {
    stateRef.current = next
    setState(next)
    replaceUrl(next)
  }, [replaceUrl])

  useEffect(() => {
    if (didHydrate.current) return
    didHydrate.current = true
    const restored = parseExploreState(
      new URLSearchParams(window.location.search),
      destinationSlugs,
      allowMostSaved,
    )
    stateRef.current = restored
    setState(restored)
    setSearchValue(restored.q)
    setHydrated(true)
  }, [allowMostSaved, destinationSlugs])

  useEffect(() => {
    if (!hydrated || searchValue === stateRef.current.q) return
    const timeout = window.setTimeout(() => {
      const q = normalizeSearch(searchValue)
      if (q === stateRef.current.q) return
      commit({ ...stateRef.current, q, page: 1 })
    }, EXPLORE_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [commit, hydrated, searchValue])

  const results = useMemo(() => selectExploreResults(indexed, state), [indexed, state])
  const reset = () => {
    setSearchValue('')
    commit(DEFAULT_STATE)
  }

  return (
    <section aria-labelledby="explore-grid-heading" className="mt-10">
      <ExploreControls
        t={t}
        destinations={eligible}
        destination={state.destination}
        searchValue={searchValue}
        sort={state.sort}
        total={results.total}
        allowMostSaved={allowMostSaved}
        onDestinationChange={(destination) => {
          commit({ ...stateRef.current, destination, page: 1 })
        }}
        onSearchChange={setSearchValue}
        onSortChange={(sort: ExploreSort) => {
          commit({ ...stateRef.current, sort, page: 1 })
        }}
      >
        <p role="status" aria-live="polite" className="mt-5 text-sm text-kinnso-muted">
          {withCount(t.resultsLabel, results.total)}
        </p>
        <h2 id="explore-grid-heading" className="sr-only">{t.gridHeading}</h2>
        {results.total ? (
          <>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.visible.map((guide) => (
                <GuideCard
                  key={guide.slug}
                  g={guide}
                  locale={locale}
                  savesLabel={t.savesLabel}
                />
              ))}
            </div>
            {results.hasMore ? (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  className="k-btn-secondary"
                  onClick={() => {
                    commit({ ...stateRef.current, page: stateRef.current.page + 1 })
                  }}
                >
                  {t.loadMore}
                </button>
              </div>
            ) : (
              <p className="mt-8 text-sm text-kinnso-muted">{t.emptyNote}</p>
            )}
          </>
        ) : guides.length && (state.destination || state.q || state.sort !== 'newest') ? (
          <div className="mt-8 rounded-3xl border border-kinnso-edge bg-white p-8 text-center">
            <h3 className="text-xl font-semibold text-kinnso-ink">{t.emptyFilteredTitle}</h3>
            <p className="mt-2 text-kinnso-muted">{t.emptyFilteredBody}</p>
            <button type="button" className="k-btn-secondary mt-5" onClick={reset}>
              {t.resetFilters}
            </button>
          </div>
        ) : (
          <p className="mt-8 text-sm text-kinnso-muted">{t.emptyNote}</p>
        )}
      </ExploreControls>
    </section>
  )
}
