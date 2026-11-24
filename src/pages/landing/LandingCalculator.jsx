import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLang } from '../../contexts/LanguageContext';
import { copy } from '../../data/landingCopy';

export default function LandingCalculator() {
  const { lang } = useLang();
  const c = copy[lang].calculator;
  const [revenue, setRevenue] = useState(50000000);
  const [costPct, setCostPct] = useState(35);
  const [outlets, setOutlets] = useState(2);

  const savings = useMemo(() => {
    const monthlyCost = revenue * (costPct / 100);
    const saved = monthlyCost * 0.37 * outlets;
    return saved;
  }, [revenue, costPct, outlets]);

  const fmt = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

  return (
    <section id="calculator" className="landing-calculator landing-section">
      <div className="landing-container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} style={{ marginBottom: 48 }}>
          <div className="section-label">{c.section_label}</div>
          <h2 className="section-headline">{c.headline}</h2>
          <p style={{ fontSize: '1.05rem', color: 'var(--landing-text-muted)', marginTop: -40 }}>{c.sub}</p>
        </motion.div>

        <div className="calc-grid">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <div className="calc-form-group">
              <label className="calc-label">{c.revenue_label}</label>
              <input type="number" className="calc-input" value={revenue} onChange={e => setRevenue(Number(e.target.value) || 0)} />
            </div>
            <div className="calc-form-group">
              <label className="calc-label">{c.cost_pct_label}</label>
              <input type="number" className="calc-input" value={costPct} onChange={e => setCostPct(Number(e.target.value) || 0)} />
            </div>
            <div className="calc-form-group">
              <label className="calc-label">{c.outlets_label}</label>
              <input type="number" className="calc-input" value={outlets} onChange={e => setOutlets(Number(e.target.value) || 1)} />
            </div>
          </motion.div>

          <motion.div className="calc-result" initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.15 }}>
            <div className="calc-result-label">{c.result_label}</div>
            <motion.div key={savings} className="calc-result-value" initial={{ scale: 0.95, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
              {fmt(savings)}
            </motion.div>
            <div className="calc-result-sub">{c.result_sub}</div>
            <div style={{ marginTop: 32 }}>
              <a href="#cta" className="landing-btn landing-btn-primary">{c.cta}</a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
