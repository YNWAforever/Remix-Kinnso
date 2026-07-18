import Image from 'next/image'
import { MediaPlaceholder } from '@/components/kinnso/media/MediaPlaceholder'
import { isApprovedEntityMediaUrl } from '@/lib/media/entity-media'
import { cn } from '@/lib/utils'

export interface EntityMediaProps {
  src: string | null | undefined
  title: string
  location?: string | null
  alt: string
  sizes: string
  priority?: boolean
  className?: string
  imageClassName?: string
}

export function EntityMedia({
  src,
  title,
  location,
  alt,
  sizes,
  priority,
  className,
  imageClassName,
}: EntityMediaProps) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {isApprovedEntityMediaUrl(src) ? (
        <Image
          src={src!}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cn('object-cover', imageClassName)}
        />
      ) : (
        <MediaPlaceholder title={title} location={location} />
      )}
    </div>
  )
}
