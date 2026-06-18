import { renderComingSoonPage, type RouteHostProps } from '../_routeHost'

export { generateStaticParams } from '../_routeHost'

export default function FeedPage({ params }: RouteHostProps) {
  return renderComingSoonPage(params, (messages) => messages.nav.linkTravelers)
}
