import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import Icon from './Icon'

/**
 * Stitch Modal — surface-container-lowest dialog with the canonical
 * ambient-shadow elevation and a scrim overlay.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
  size = 'md',
  showCloseButton = true,
  footer,
}) {
  const overlayRef = useRef(null)

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[90vw]',
  }

  useEffect(() => {
    if (!isOpen) return undefined
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handleEscape)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = prev
    }
  }, [isOpen, onClose])

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose?.()
  }

  if (!isOpen) return null

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-md bg-inverse-surface/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'w-full bg-surface-container-lowest border border-outline-variant rounded ambient-shadow',
          sizes[size] || sizes.md,
          className,
        )}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-md p-md border-b border-outline-variant">
            <div className="min-w-0">
              {title && (
                <h2 className="font-headline-md text-headline-md text-on-surface">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-xs font-body-sm text-body-sm text-on-surface-variant">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex items-center justify-center w-8 h-8 rounded text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors"
              >
                <Icon name="close" size={20} />
              </button>
            )}
          </div>
        )}
        <div className="p-md">{children}</div>
        {footer && (
          <div className="flex justify-end gap-sm p-md border-t border-outline-variant">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
