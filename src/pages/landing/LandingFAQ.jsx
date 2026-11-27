import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useLang } from '../../contexts/LanguageContext';
import { copy } from '../../data/landingCopy';

export default function LandingFAQ() {
  const { lang } = useLang();
  const c = copy[lang].faq;
  const [openIdx, setOpenIdx] = useState(null);

  return (
    <section id="faq" className="landing-faq landing-section">
      <div className="landing-container">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} style={{ marginBottom: 48 }}>
          <div className="section-label">{c.section_label}</div>
          <h2 className="section-headline">{c.section_headline}</h2>
        </motion.div>

        <div className="faq-grid">
          {c.items.map((item, i) => (
            <motion.div key={i} className={`faq-item${openIdx === i ? ' open' : ''}`} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.06 }} onClick={() => setOpenIdx(openIdx === i ? null : i)}>
              <div className="faq-question">
                {item.q}
                <ChevronDown size={18} className="faq-chevron" />
              </div>
              <AnimatePresence>
                {openIdx === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                    <div className="faq-answer">{item.a}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
