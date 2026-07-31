'use client'

import { useEffect } from 'react'
import {
  trackTravellerEvent,
  type TravellerAnalyticsMetadataByEvent,
} from '@/lib/analytics/client'

type AnalyticsEntityViewProps = TravellerAnalyticsMetadataByEvent['entity_viewed']

export function AnalyticsEntityView(props: AnalyticsEntityViewProps) {
  useEffect(() => {
    trackTravellerEvent('entity_viewed', props)
  }, [])

  return null
}
