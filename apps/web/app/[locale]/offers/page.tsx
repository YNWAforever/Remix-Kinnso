import { renderComingSoonPage, type RouteHostProps } from '../_routeHost'
export { generateStaticParams } from '../_routeHost'
export default function OffersPage({ params }: RouteHostProps) {
  return renderComingSoonPage(params, (messages) => messages.studioHome.offersTitle)
}
