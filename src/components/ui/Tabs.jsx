import { useState } from 'react'
import { cn } from '../../lib/utils'

export const Tabs = ({ 
  tabs, 
  defaultTab, 
  onChange,
  className 
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id)

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    onChange?.(tabId)
  }

  return (
    <div className={className}>
      {/* Tab Headers */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors relative',
              activeTab === tab.id
                ? 'text-primary'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <div className="flex items-center gap-2">
              {tab.icon && <tab.icon className="w-4 h-4" />}
              {tab.label}
              {tab.count !== undefined && (
                <span className={cn(
                  'px-2 py-0.5 text-xs rounded-full',
                  activeTab === tab.id 
                    ? 'bg-primary text-white' 
                    : 'bg-gray-100 text-text-secondary'
                )}>
                  {tab.count}
                </span>
              )}
            </div>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="pt-4">
        {tabs.find(t => t.id === activeTab)?.content}
      </div>
    </div>
  )
}

export default Tabs
