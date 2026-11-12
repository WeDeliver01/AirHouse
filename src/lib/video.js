// URL detection/parsing for the video embeds a developer can attach to a
// property listing (property.video_urls), alongside its photos.

const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
const TIKTOK_RE = /tiktok\.com/i
const INSTAGRAM_RE = /instagram\.com\/(?:p|reel|tv)\//i

export const VIDEO_PLATFORM_LABELS = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
}

export function detectVideoPlatform(url) {
  if (!url) return null
  if (YOUTUBE_RE.test(url)) return 'youtube'
  if (INSTAGRAM_RE.test(url)) return 'instagram'
  if (TIKTOK_RE.test(url)) return 'tiktok'
  return null
}

export function isValidVideoUrl(url) {
  return detectVideoPlatform(url) !== null
}

export function getYouTubeEmbedUrl(url) {
  const match = url.match(YOUTUBE_RE)
  return match ? `https://www.youtube.com/embed/${match[1]}` : null
}
