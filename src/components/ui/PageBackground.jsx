import { useLocation } from 'react-router-dom'

// High-quality luxury real estate images from Unsplash
const BACKGROUND_IMAGES = {
  // Creator pages
  '/creator': 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&q=80',
  '/creator/campaigns': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80',
  '/creator/applications': 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1920&q=80',
  '/creator/active': 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1920&q=80',
  '/creator/wallet': 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1920&q=80',
  '/creator/scorecard': 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1920&q=80',
  '/creator/profile': 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1920&q=80',
  '/creator/settings': 'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=1920&q=80',
  
  // Developer pages
  '/developer': 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1920&q=80',
  '/developer/campaigns': 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1920&q=80',
  '/developer/creators': 'https://images.unsplash.com/photo-1600585154363-67eb9e2e2099?w=1920&q=80',
  '/developer/leads': 'https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?w=1920&q=80',
  '/developer/wallet': 'https://images.unsplash.com/photo-1600210492493-0946911123ea?w=1920&q=80',
  '/developer/analytics': 'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1920&q=80',
  '/developer/profile': 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=1920&q=80',
  '/developer/settings': 'https://images.unsplash.com/photo-1600585152915-d208bec867a1?w=1920&q=80',
  
  // Admin pages  
  '/admin': 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&q=80',
  '/admin/users': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1920&q=80',
  '/admin/campaigns': 'https://images.unsplash.com/photo-1600047509782-20d39509f26d?w=1920&q=80',
  '/admin/leads': 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1920&q=80',
  '/admin/financials': 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1920&q=80',
  '/admin/payments': 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1920&q=80',
  '/admin/verification': 'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=1920&q=80',
  '/admin/settings': 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=1920&q=80',
  
  // Default fallback
  default: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&q=80',
}

const PageBackground = () => {
  const location = useLocation()
  
  const getBackgroundImage = () => {
    const path = location.pathname
    
    if (BACKGROUND_IMAGES[path]) {
      return BACKGROUND_IMAGES[path]
    }
    
    const pathParts = path.split('/')
    while (pathParts.length > 1) {
      const testPath = pathParts.join('/')
      if (BACKGROUND_IMAGES[testPath]) {
        return BACKGROUND_IMAGES[testPath]
      }
      pathParts.pop()
    }
    
    const basePath = '/' + path.split('/')[1]
    if (BACKGROUND_IMAGES[basePath]) {
      return BACKGROUND_IMAGES[basePath]
    }
    
    return BACKGROUND_IMAGES.default
  }

  const backgroundImage = getBackgroundImage()

  return (
    <>
      {/* Background Image Layer */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* White overlay to reduce opacity - adjust the alpha value to control visibility */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundColor: 'rgba(249, 250, 251, 0.92)', // 92% white overlay = 8% image showing
        }}
      />
    </>
  )
}

export default PageBackground
