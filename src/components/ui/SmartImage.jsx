import { useState, useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

const ALLOWED_WIDTHS = [64, 96, 128, 200, 256, 400, 600, 800, 1200, 1600, 1920]

const STORAGE_PREFIX = `${import.meta.env.VITE_SUPABASE_URL || ''}/storage/v1/object/public/`

function snapWidth(requested) {
  for (const w of ALLOWED_WIDTHS) {
    if (w >= requested) return w
  }
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1]
}

function variantUrl(src, width, format = 'webp') {
  return `/img?src=${encodeURIComponent(src)}&w=${width}&f=${format}`
}

/** A Supabase Storage object this project owns, which the /img endpoint can resize. */
function isTransformable(src) {
  return !!src && !!STORAGE_PREFIX && src.startsWith(STORAGE_PREFIX)
}

/**
 * Responsive, optimized image — the same strategy used across our other
 * properties: a developer's uploaded photo is stored full-size in Supabase
 * Storage, so this requests resized WebP variants from the /img endpoint
 * (server/imageTransform.js) with a 1x/2x srcset, lazy-loads by default,
 * decodes async, and fades in once decoded. Anything that isn't a Supabase
 * Storage object (an external URL, a data URL, a bundled asset) passes
 * straight through unchanged.
 */
export function SmartImage({
  src,
  alt,
  width = 800,
  sizes,
  eager = false,
  className,
  onLoad,
  onError,
  ...rest
}) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef(null)

  useEffect(() => {
    setLoaded(false)
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true)
    }
  }, [src])

  const transformable = isTransformable(src)
  const w1 = snapWidth(width)
  const w2 = snapWidth(width * 2)

  const finalSrc = transformable ? variantUrl(src, w1) : src || undefined
  const srcSet = transformable
    ? `${variantUrl(src, w1)} ${w1}w, ${variantUrl(src, w2)} ${w2}w`
    : undefined
  const finalSizes = sizes ?? (transformable ? `${w1}px` : undefined)

  return (
    <img
      ref={imgRef}
      src={finalSrc}
      srcSet={srcSet}
      sizes={finalSizes}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={(e) => {
        setLoaded(true)
        onLoad?.(e)
      }}
      onError={(e) => {
        setLoaded(true)
        onError?.(e)
      }}
      className={cn('transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0', className)}
      {...rest}
    />
  )
}

export default SmartImage
