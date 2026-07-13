import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLang } from '../../contexts/LanguageContext';
import { copy } from '../../data/landingCopy';

export default function LandingPricing() {
  const { lang } = useLang();
  const c = copy[lang].pricing;

  return (
    <section id="pricing" className="landing-pricing landing-section">
      <div className="landing-container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} style={{ textAlign: 'center', marginBottom: 56 }}>
          <div className="section-label">{c.section_label}</div>
          <h2 className="section-headline" style={{ maxWidth: 'none', margin: '0 auto' }}>{c.section_headline}</h2>
        </motion.div>

        <div className="pricing-grid">
          {c.tiers.map((tier, i) => (
            <motion.div key={i} className={`pricing-card${tier.highlighted ? ' highlighted' : ''}`} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}>
              {tier.highlighted && <div className="pricing-badge">{c.badge_popular}</div>}
              <div className="pricing-name">{tier.name}</div>
              <div className="pricing-price">{tier.price}</div>
              <div className="pricing-period">{tier.period}</div>
              <div className="pricing-desc">{tier.desc}</div>
              <ul className="pricing-features">
                {tier.features.map((f, fi) => (
                  <li key={fi}><Check size={16} className="pricing-check" />{f}</li>
                ))}
              </ul>
              <Link to="/login" className={`landing-btn ${tier.highlighted ? 'landing-btn-primary' : 'landing-btn-secondary'}`}>{tier.cta}</Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
