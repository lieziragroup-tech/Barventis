import React from 'react';

export default function HeroMockup() {
  return (
    <div className="hero-mockup">
      <div className="mockup-header">
        <div className="mockup-dot red" />
        <div className="mockup-dot yellow" />
        <div className="mockup-dot green" />
        <div className="mockup-url">barventis.app/dashboard</div>
      </div>
      <div className="mockup-body">
        <div className="mockup-sidebar">
          {['Dashboard', 'Stok', 'Resep', 'POS', 'Opname', 'Laporan'].map((item, i) => (
            <div key={item} className={`mockup-sidebar-item${i === 0 ? ' active' : ''}`}>
              <div className="mockup-sidebar-icon" />
              {item}
            </div>
          ))}
        </div>
        <div className="mockup-content">
          <div className="mockup-kpi-row">
            <div className="mockup-kpi">
              <div className="mockup-kpi-label">Total Stok</div>
              <div className="mockup-kpi-value">Rp 24.5M</div>
            </div>
            <div className="mockup-kpi">
              <div className="mockup-kpi-label">HPP Rata-rata</div>
              <div className="mockup-kpi-value green">32.4%</div>
            </div>
            <div className="mockup-kpi">
              <div className="mockup-kpi-label">Menu Aktif</div>
              <div className="mockup-kpi-value blue">48</div>
            </div>
          </div>
          <div className="mockup-chart">
            {[45, 62, 38, 75, 55, 82, 48, 70, 58, 88, 42, 78].map((h, i) => (
              <div key={i} className="mockup-bar" style={{ height: `${h}%`, flex: 1 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
