import { renderComingSoonPage, type RouteHostProps } from '../../../_routeHost'
export { generateStaticParams } from '../../../_routeHost'
export default function StudioNewGuidePage({ params }: RouteHostProps) {
  return renderComingSoonPage(params, (messages) => messages.studioHome.guidesTitle)
}
