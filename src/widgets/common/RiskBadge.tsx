import React from 'react';
import { RiskLevel } from '@/entities/types';
import { getRiskLevelMeta } from '@/shared/utils/riskMeta';
import { ShieldCheck, AlertTriangle, AlertCircle, ShieldAlert, Shield } from 'lucide-react';

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level,
  score,
  showScore = true,
  size = 'md',
  className = '',
}) => {
  const meta = getRiskLevelMeta(level);

  const getIcon = () => {
    const iconSize = size === 'sm' ? 12 : size === 'lg' ? 18 : 14;
    switch (level) {
      case 'CRITICAL':
        return <ShieldAlert size={iconSize} className="shrink-0 text-current" aria-hidden="true" />;
      case 'HIGH_RISK':
        return <AlertCircle size={iconSize} className="shrink-0 text-current" aria-hidden="true" />;
      case 'REVIEW':
        return <AlertTriangle size={iconSize} className="shrink-0 text-current" aria-hidden="true" />;
      case 'LOW_RISK':
        return <Shield size={iconSize} className="shrink-0 text-current" aria-hidden="true" />;
      case 'NORMAL':
      default:
        return <ShieldCheck size={iconSize} className="shrink-0 text-current" aria-hidden="true" />;
    }
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1 font-semibold',
    md: 'text-xs font-semibold px-2.5 py-1 gap-1.5',
    lg: 'text-sm font-bold px-3 py-1.5 gap-2',
  }[size];

  return (
    <span
      id={`risk-badge-${level.toLowerCase()}`}
      title={meta.description}
      className={`inline-flex items-center rounded-md border ${meta.badgeClass} ${sizeClasses} ${className}`}
    >
      {getIcon()}
      <span>{meta.label}</span>
      {showScore && score !== undefined && (
        <span className="ml-0.5 px-1.5 py-0.2 rounded bg-current/10 text-current font-mono tabular-nums">
          {score}
        </span>
      )}
    </span>
  );
};
