import { forwardRef } from 'react'
import { cn } from '../../lib/utils'
import Icon from './Icon'

const VARIANTS = {
  primary:
    'bg-secondary text-on-secondary hover:opacity-90 active:opacity-80 disabled:bg-surface-container-high disabled:text-on-surface-variant',
  secondary:
    'bg-primary text-on-primary hover:opacity-90 active:opacity-80 disabled:bg-surface-container-high disabled:text-on-surface-variant',
  ghost:
    'bg-transparent text-on-surface border border-outline hover:bg-surface-variant active:bg-surface-container-high disabled:text-on-surface-variant disabled:border-outline-variant',
  destructive:
    'bg-error text-on-error hover:opacity-90 active:opacity-80 disabled:bg-surface-container-high disabled:text-on-surface-variant',
}

const SIZES = {
  sm: 'px-sm py-xs text-label-md font-label-md',
  md: 'px-md py-sm text-label-lg font-label-lg',
  lg: 'px-lg py-sm text-label-lg font-label-lg',
}

/**
 * Stitch Button — primary | secondary | ghost | destructive.
 * Always rectangular with `rounded` (4px) per the Stitch DESIGN.md shape language.
 */
const Button = forwardRef(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-sm rounded transition-colors',
        'disabled:cursor-not-allowed',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        className,
      )}
      {...props}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={18} />}
    </button>
  )
})

export default Button
