import React from 'react';
import { motion } from 'framer-motion';
import { useLang } from '../../contexts/LanguageContext';
import { copy } from '../../data/landingCopy';

export default function LandingMetrics() {
  const { lang } = useLang();
  const c = copy[lang].metrics;

  return (
    <section className="landing-metrics">
      <div className="landing-container">
        <div className="metrics-grid">
          {c.items.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}>
              <div className="metric-value">{m.value}</div>
              <div className="metric-label">{m.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
