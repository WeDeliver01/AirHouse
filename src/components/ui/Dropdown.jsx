import { useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/utils'

export const Dropdown = ({
  trigger,
  children,
  align = 'right',
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full mt-1 min-w-[200px] bg-white border border-border rounded-card shadow-lg py-1 z-50 animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export const DropdownItem = ({
  children,
  onClick,
  icon: Icon,
  danger = false,
  disabled = false,
  className,
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 w-full px-4 py-2 text-sm text-left transition-colors',
        danger 
          ? 'text-danger hover:bg-danger-soft' 
          : 'text-text-primary hover:bg-gray-50',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  )
}

export const DropdownDivider = () => (
  <div className="border-t border-border my-1" />
)

export default Dropdown
