import { renderComingSoonPage, type RouteHostProps } from '../../_routeHost'
export { generateStaticParams } from '../../_routeHost'
export default function StudioInboxPage({ params }: RouteHostProps) {
  return renderComingSoonPage(params, (messages) => messages.studioHome.inboxTitle)
}
