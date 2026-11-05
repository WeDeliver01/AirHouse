import { useState } from 'react'
import { cn, getInitials } from '../../lib/utils'

const Avatar = ({
  src,
  alt,
  name,
  size = 'default',
  className,
  ...props
}) => {
  const [imgError, setImgError] = useState(false)

  const sizes = {
    sm: 'w-8 h-8 text-xs',
    default: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
    '2xl': 'w-24 h-24 text-2xl',
  }

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={alt || name}
        onError={() => setImgError(true)}
        className={cn(
          'rounded-full object-cover bg-gray-100',
          sizes[size],
          className
        )}
        {...props}
      />
    )
  }

  return (
    <div
      className={cn(
        'rounded-full bg-primary-soft text-primary font-semibold flex items-center justify-center',
        sizes[size],
        className
      )}
      {...props}
    >
      {getInitials(name)}
    </div>
  )
}

export default Avatar
