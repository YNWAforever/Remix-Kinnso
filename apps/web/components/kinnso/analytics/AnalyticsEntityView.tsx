'use client'

import { useEffect, useRef } from 'react'
import {
  trackTravellerEvent,
  type TravellerAnalyticsMetadataByEvent,
} from '@/lib/analytics/client'

type AnalyticsEntityViewProps = TravellerAnalyticsMetadataByEvent['entity_viewed']

export function AnalyticsEntityView(props: AnalyticsEntityViewProps) {
  const initialProps = useRef(props)

  useEffect(() => {
    trackTravellerEvent('entity_viewed', initialProps.current)
  }, [])

  return null
}
