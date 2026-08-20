import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default class WidgetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Widget error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-card" style={{ 
          display: 'flex', flexDirection: 'column', alignItems: 'center', 
          justifyContent: 'center', padding: '24px', textAlign: 'center',
          minHeight: this.props.minHeight || '200px',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          <AlertTriangle size={24} style={{ color: 'var(--danger)', marginBottom: '8px' }} />
          <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '4px' }}>
            Data Gagal Dimuat
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Widget {this.props.name || ''} mengalami kendala.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
