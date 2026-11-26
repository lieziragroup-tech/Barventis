import React from 'react';
import { ArrowRight } from 'lucide-react';
import { getWorkflowStatusVisual } from '../../services/modules/roleBoundaryUtils';

const TONE_MAP = {
  neutral: {
    border: 'var(--border)',
    accentBar: 'var(--accent)',
    badgeBg: 'var(--bg-tertiary)',
    badgeText: 'var(--text-secondary)',
    valueColor: 'var(--text-primary)',
  },
  success: {
    border: 'rgba(16, 185, 129, 0.25)',
    accentBar: '#10b981',
    badgeBg: 'rgba(16, 185, 129, 0.12)',
    badgeText: '#047857',
    valueColor: '#047857',
  },
  warning: {
    border: 'rgba(245, 158, 11, 0.30)',
    accentBar: '#f59e0b',
    badgeBg: 'rgba(245, 158, 11, 0.12)',
    badgeText: '#b45309',
    valueColor: '#b45309',
  },
  danger: {
    border: 'rgba(239, 68, 68, 0.28)',
    accentBar: '#ef4444',
    badgeBg: 'rgba(239, 68, 68, 0.10)',
    badgeText: '#b91c1c',
    valueColor: '#b91c1c',
  },
};

/**
 * F-Pattern Focal Action Banner:
 * Places the single most important operational signal and 1 primary CTA
 * at the top-left eye entry point to minimize cognitive load (Hick's Law).
 */
export function FocalActionBanner({
  eyebrow,
  title,
  description,
  tone = 'neutral',
  primaryAction,
  secondaryActions = [],
}) {
  const palette = TONE_MAP[tone] || TONE_MAP.neutral;

  return (
    <div
      className="glass-card mb-5 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      style={{
        borderLeft: `4px solid ${palette.accentBar}`,
        background: 'var(--bg-secondary)',
      }}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
            style={{ background: palette.badgeBg, color: palette.badgeText }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: palette.accentBar }} />
            <span>{eyebrow}</span>
          </div>
        )}
        <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] m-0 leading-snug">
          {title}
        </h2>
        {description && (
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] m-0 leading-relaxed max-w-[68ch]">
            {description}
          </p>
        )}
      </div>

      {(primaryAction || secondaryActions.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="btn btn-primary text-xs sm:text-sm font-bold px-4 py-2.5 inline-flex items-center gap-2 whitespace-nowrap min-h-[44px]"
            >
              {primaryAction.icon}
              <span>{primaryAction.label}</span>
            </button>
          )}
          {secondaryActions.map((act) => (
            <button
              key={act.label}
              type="button"
              onClick={act.onClick}
              className="btn btn-secondary text-xs font-semibold px-3.5 py-2.5 inline-flex items-center gap-1.5 whitespace-nowrap min-h-[44px]"
            >
              {act.icon}
              <span>{act.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Calm Visual-Psychology KPI Card:
 * Emphasizes tabular numerals, clear hierarchy, and subtle pre-attentive borders
 * only when a metric requires immediate attention.
 */
export function CalmKpiCard({
  label,
  value,
  subtext,
  icon,
  tone = 'neutral',
  onClick,
  actionHint,
}) {
  const palette = TONE_MAP[tone] || TONE_MAP.neutral;
  const clickable = typeof onClick === 'function';

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`glass-card kpi-card transition-all ${clickable ? 'cursor-pointer hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-[var(--accent)]' : ''}`}
      style={{
        borderColor: tone === 'neutral' ? 'var(--border)' : palette.border,
      }}
    >
      <div className="kpi-header">
        <span className="kpi-title text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        {icon && (
          <div
            className="kpi-icon-wrap"
            style={{
              background: palette.badgeBg,
              color: palette.badgeText,
            }}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
      </div>

      <div
        className="kpi-value tabular-nums leading-tight"
        style={{ color: tone === 'neutral' ? 'var(--text-primary)' : palette.valueColor }}
      >
        {value}
      </div>

      <div className="kpi-footer flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
        <span className="truncate">{subtext}</span>
        {actionHint && (
          <span className="inline-flex items-center gap-1 font-semibold shrink-0" style={{ color: palette.badgeText }}>
            {actionHint} <ArrowRight size={12} />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Pre-Attentive Status Pill with colored dot + tinted background.
 */
export function StatusPill({ status }) {
  const vis = getWorkflowStatusVisual(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ background: vis.bg, color: vis.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: vis.dot }} />
      <span>{vis.label}</span>
    </span>
  );
}

/**
 * Consistent Gestalt Section Header for dashboard panels.
 */
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
      <div className="min-w-0">
        <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] m-0 leading-snug">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-[var(--text-secondary)] m-0 mt-0.5 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
