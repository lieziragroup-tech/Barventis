import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, UploadCloud, ChefHat, MapPin, Shield, ClipboardCheck } from 'lucide-react';
import { useLang } from '../../contexts/LanguageContext';
import { copy } from '../../data/landingCopy';

const icons = [TrendingUp, UploadCloud, ChefHat, MapPin, Shield, ClipboardCheck];

export default function LandingFeatures() {
  const { lang } = useLang();
  const c = copy[lang].features;

  return (
    <section id="features" className="landing-features landing-section">
      <div className="landing-container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <div className="section-label">{c.section_label}</div>
          <h2 className="section-headline">{c.section_headline}</h2>
        </motion.div>

        <div className="features-grid">
          {c.items.map((f, i) => {
            const Icon = icons[i];
            const isLarge = i < 2;
            return (
              <motion.div key={i} className={`feature-card${isLarge ? ' large' : ''}`} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}>
                <div className="feature-icon"><Icon size={22} /></div>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
                {isLarge && (
                  <div className="feature-screenshot">
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[1,2,3,4].map(n => (
                        <div key={n} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '10px 12px' }}>
                          <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>Sample Data</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{['Rp 2.4M', '32.4%', '142', '98.2%'][n-1]}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
