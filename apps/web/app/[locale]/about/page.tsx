import { renderComingSoonPage, type RouteHostProps } from '../_routeHost'

export { generateStaticParams } from '../_routeHost'

export default function AboutPage({ params }: RouteHostProps) {
  return renderComingSoonPage(params, (messages) => messages.footer.lAbout)
}
