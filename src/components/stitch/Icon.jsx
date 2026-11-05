import { cn } from '../../lib/utils'

/**
 * Material Symbols Outlined icon glyph.
 * Pass the icon name (e.g. "notifications", "settings", "chevron_right").
 * Browse names at https://fonts.google.com/icons?selected=Material+Symbols+Outlined
 */
export default function Icon({ name, className, size, style, ...props }) {
  return (
    <span
      className={cn('material-symbols-outlined leading-none align-middle', className)}
      style={size ? { fontSize: typeof size === 'number' ? `${size}px` : size, ...style } : style}
      aria-hidden="true"
      {...props}
    >
      {name}
    </span>
  )
}
