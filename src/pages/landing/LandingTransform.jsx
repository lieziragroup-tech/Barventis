
import { motion } from 'framer-motion';
import { X, Check, ArrowRight } from 'lucide-react';
import { useLang } from '../../contexts/LanguageContext';
import { copy } from '../../data/landingCopy';

export default function LandingTransform() {
  const { lang } = useLang();
  const c = copy[lang].transform;

  return (
    <section className="landing-transform landing-section landing-noise">
      <div className="landing-container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} style={{ textAlign: 'center', marginBottom: 56 }}>
          <div className="section-label">{c.label}</div>
          <h2 className="section-headline" style={{ maxWidth: 'none' }}>{c.headline}</h2>
        </motion.div>

        <div className="transform-grid">
          <motion.div className="transform-card before" initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="transform-card-label">{c.before_title}</div>
            {c.before_items.map((item, i) => (
              <div key={i} className="transform-item">
                <div className="transform-item-icon"><X size={12} /></div>
                {item}
              </div>
            ))}
          </motion.div>

          <motion.div className="transform-card after" initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.15 }}>
            <div className="transform-card-label">{c.after_title}</div>
            {c.after_items.map((item, i) => (
              <div key={i} className="transform-item">
                <div className="transform-item-icon"><Check size={12} /></div>
                {item}
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.4 }} style={{ textAlign: 'center', marginTop: 48 }}>
          <a href="#calculator" className="landing-btn landing-btn-secondary" style={{ gap: 12 }}>
            {c.cta} <ArrowRight size={16} />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
