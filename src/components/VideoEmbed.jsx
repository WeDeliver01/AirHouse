import { useEffect, useRef } from 'react'
import { detectVideoPlatform, getYouTubeEmbedUrl } from '../lib/video'

// TikTok's embed.js only scans the DOM for `.tiktok-embed` blockquotes once,
// when it loads. If one mounts after that (route change, new item added),
// re-running the script is the only way to get it to notice.
function reloadTikTokScript() {
  document.getElementById('tiktok-embed-script')?.remove()
  const script = document.createElement('script')
  script.id = 'tiktok-embed-script'
  script.src = 'https://www.tiktok.com/embed.js'
  script.async = true
  document.body.appendChild(script)
}

function loadInstagramEmbed() {
  if (window.instgrm?.Embeds) {
    window.instgrm.Embeds.process()
    return
  }
  if (document.getElementById('instagram-embed-script')) return
  const script = document.createElement('script')
  script.id = 'instagram-embed-script'
  script.src = 'https://www.instagram.com/embed.js'
  script.async = true
  document.body.appendChild(script)
}

/** Renders a YouTube/TikTok/Instagram video given its public URL. */
export function VideoEmbed({ url, className = '' }) {
  const platform = detectVideoPlatform(url)
  const mountedRef = useRef(null)

  useEffect(() => {
    if (platform === 'tiktok') reloadTikTokScript()
    else if (platform === 'instagram') loadInstagramEmbed()
  }, [platform, url])

  if (!platform) return null

  if (platform === 'youtube') {
    const embedUrl = getYouTubeEmbedUrl(url)
    if (!embedUrl) return null
    return (
      <div className={`relative w-full aspect-video rounded-xl overflow-hidden bg-black ${className}`}>
        <iframe
          src={embedUrl}
          title="YouTube video"
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    )
  }

  if (platform === 'tiktok') {
    return (
      <div ref={mountedRef} className={className}>
        <blockquote
          className="tiktok-embed"
          cite={url}
          style={{ maxWidth: '605px', minWidth: '325px', margin: '0 auto' }}
        >
          <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
        </blockquote>
      </div>
    )
  }

  // instagram
  return (
    <div ref={mountedRef} className={className}>
      <blockquote
        className="instagram-media"
        data-instgrm-permalink={url}
        data-instgrm-version="14"
        style={{ margin: '0 auto', maxWidth: '540px' }}
      >
        <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
      </blockquote>
    </div>
  )
}

export default VideoEmbed
