import React from 'react';
import { CheckCircle2, AlertCircle, Info, Lock } from 'lucide-react';

/**
 * Standardized header for all Sub Menu / Hub Tab pages.
 * Matches the exact design pattern requested:
 * Icon badge + Title + Status Pill + Subtitle + Divider + Optional Action Toolbar.
 *
 * @param {{
 *   icon: React.ElementType;
 *   title: string;
 *   subtitle?: string;
 *   badgeText?: string;
 *   badgeType?: 'success' | 'warning' | 'info' | 'danger' | 'neutral';
 *   badgeIcon?: React.ElementType;
 *   actions?: React.ReactNode;
 *   colorTheme?: 'emerald' | 'amber' | 'blue' | 'indigo' | 'purple' | 'red';
 *   className?: string;
 * }} props
 */
export default function SubMenuHeader({
  icon: Icon,
  title,
  subtitle,
  badgeText,
  badgeType = 'success',
  badgeIcon: CustomBadgeIcon,
  actions,
  colorTheme = 'emerald',
  className = ''
}) {
  // Theme styling for Icon wrapper
  const themeClasses = {
    emerald: {
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-500/20 dark:border-emerald-500/30'
    },
    amber: {
      bg: 'bg-amber-500/10 dark:bg-amber-500/15',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-500/20 dark:border-amber-500/30'
    },
    blue: {
      bg: 'bg-blue-500/10 dark:bg-blue-500/15',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-500/20 dark:border-blue-500/30'
    },
    indigo: {
      bg: 'bg-indigo-500/10 dark:bg-indigo-500/15',
      text: 'text-indigo-600 dark:text-indigo-400',
      border: 'border-indigo-500/20 dark:border-indigo-500/30'
    },
    purple: {
      bg: 'bg-purple-500/10 dark:bg-purple-500/15',
      text: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-500/20 dark:border-purple-500/30'
    },
    red: {
      bg: 'bg-red-500/10 dark:bg-red-500/15',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-500/20 dark:border-red-500/30'
    }
  };

  const theme = themeClasses[colorTheme] || themeClasses.emerald;

  // Badge styling
  const badgeConfig = {
    success: {
      bg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
      Icon: CheckCircle2
    },
    warning: {
      bg: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
      Icon: AlertCircle
    },
    info: {
      bg: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
      Icon: Info
    },
    danger: {
      bg: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
      Icon: AlertCircle
    },
    neutral: {
      bg: 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)]',
      Icon: Info
    }
  };

  const selectedBadge = badgeConfig[badgeType] || badgeConfig.success;
  const BadgeIcon = CustomBadgeIcon || (badgeType === 'warning' ? Lock : selectedBadge.Icon);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 pb-3 sm:pb-3.5 mb-3.5 sm:mb-4 border-b border-[var(--border)]/70 no-print ${className}`}>
      {/* Left: Icon container + Title + Status Pill + Subtitle */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {Icon && (
          <div className={`p-2 sm:p-2.5 rounded-xl ${theme.bg} ${theme.text} border ${theme.border} shadow-2xs shrink-0 flex items-center justify-center`}>
            <Icon size={19} />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] m-0 tracking-tight">
              {title}
            </h1>
            {badgeText && (
              <span className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${selectedBadge.bg}`}>
                <BadgeIcon size={10} />
                <span>{badgeText}</span>
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] m-0 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: Actions or Mode Switchers */}
      {actions && (
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
