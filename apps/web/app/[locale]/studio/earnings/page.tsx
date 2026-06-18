import { renderComingSoonPage, type RouteHostProps } from '../../_routeHost'

export { generateStaticParams } from '../../_routeHost'

export default function StudioEarningsPage({ params }: RouteHostProps) {
  return renderComingSoonPage(params, (messages) => messages.footer.lEarnings)
}
