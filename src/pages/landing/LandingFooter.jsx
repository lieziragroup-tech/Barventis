
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useLang } from '../../contexts/LanguageContext';
import { copy } from '../../data/landingCopy';

export default function LandingFooter() {
  const { lang } = useLang();
  const c = copy[lang].footer;

  return (
    <>
      <section id="cta" className="landing-cta landing-noise">
        <div className="landing-container" style={{ position: 'relative', zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <h2 className="cta-headline">{c.cta_headline}</h2>
            <p className="cta-sub">{c.tagline}</p>
            <Link to="/login" className="landing-btn landing-btn-primary" style={{ fontSize: '1rem', padding: '14px 36px' }}>
              {c.cta_button} <ArrowRight size={18} />
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="footer-grid">
            <div>
              <a href="/" className="landing-nav-brand">
                <div className="landing-nav-logo">B</div>
                <span className="landing-nav-name" style={{ color: 'white' }}>Barventis</span>
              </a>
              <p className="footer-brand-desc">{c.tagline}</p>
            </div>
            <div>
              <div className="footer-col-title">{c.col_product}</div>
              <ul className="footer-links">
                <li><a href="#features">{copy[lang].features.section_label}</a></li>
                <li><a href="#pricing">{copy[lang].pricing.section_label}</a></li>
                <li><a href="#calculator">{c.link_calculator}</a></li>
              </ul>
            </div>
            <div>
              <div className="footer-col-title">{c.col_company}</div>
              <ul className="footer-links">
                <li><a href="#faq">{copy[lang].faq.section_label}</a></li>
                <li><a href="#">{c.link_about}</a></li>
                <li><a href="#">{c.link_blog}</a></li>
              </ul>
            </div>
            <div>
              <div className="footer-col-title">{c.col_support}</div>
              <ul className="footer-links">
                <li><a href="#">{c.link_docs}</a></li>
                <li><a href="#">{c.link_contact}</a></li>
                <li><a href="#">{c.link_status}</a></li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <div className="footer-copyright">{c.copyright}</div>
            <div className="footer-made">{c.made_with}</div>
          </div>
        </div>
      </footer>
    </>
  );
}
