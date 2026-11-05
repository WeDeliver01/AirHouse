import { cn } from '../../lib/utils'
import Icon from './Icon'

/**
 * Stitch SidebarItem — single nav row inside the dashboard sidebar.
 * Active state uses surface-container fill + primary text; inactive items
 * stay muted on the surface.
 */
export default function SidebarItem({
  icon,
  label,
  active = false,
  badge,
  className,
  as: Tag = 'a',
  ...props
}) {
  return (
    <Tag
      className={cn(
        'group flex items-center gap-sm px-sm py-sm rounded font-label-lg text-label-lg transition-colors cursor-pointer',
        active
          ? 'bg-surface-container text-primary'
          : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
        className,
      )}
      {...props}
    >
      {icon && (
        <Icon
          name={icon}
          size={20}
          className={cn(active ? 'text-primary' : 'text-on-surface-variant group-hover:text-on-surface')}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {badge != null && (
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-xs rounded bg-secondary-container text-on-secondary-container font-label-md text-label-md">
          {badge}
        </span>
      )}
    </Tag>
  )
}
