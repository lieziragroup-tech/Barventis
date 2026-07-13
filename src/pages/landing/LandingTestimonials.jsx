import React from 'react';
import { motion } from 'framer-motion';
import { useLang } from '../../contexts/LanguageContext';
import { copy } from '../../data/landingCopy';

export default function LandingTestimonials() {
  const { lang } = useLang();
  const c = copy[lang].testimonials;

  return (
    <section className="landing-testimonials landing-section">
      <div className="landing-container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} style={{ marginBottom: 48 }}>
          <div className="section-label">{c.section_label}</div>
          <h2 className="section-headline">{c.section_headline}</h2>
        </motion.div>

        <div className="testimonials-grid">
          {c.items.map((t, i) => (
            <motion.div key={i} className="testimonial-card" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.12 }}>
              <div className="testimonial-quote-mark">"</div>
              <div className="testimonial-text">{t.quote}</div>
              <div className="testimonial-author">
                <div className="testimonial-avatar">{t.name.charAt(0)}</div>
                <div>
                  <div className="testimonial-name">{t.name}</div>
                  <div className="testimonial-role">{t.role} — {t.company}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
