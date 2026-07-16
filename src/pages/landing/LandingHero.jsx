
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Play } from 'lucide-react';
import { useLang } from '../../contexts/LanguageContext';
import { copy } from '../../data/landingCopy';
import HeroMockup from './HeroMockup';

export default function LandingHero() {
  const { lang } = useLang();
  const c = copy[lang].hero;

  return (
    <section className="landing-hero landing-noise">
      <div className="landing-container">
        <div className="hero-grid">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}>
            <h1 className="hero-headline" dangerouslySetInnerHTML={{ __html: c.headline.replace(/_(.*?)_/g, '<em>$1</em>') }} />
            <p className="hero-sub">{c.sub}</p>
            <div className="hero-ctas">
              <Link to="/login" className="landing-btn landing-btn-primary">
                {c.cta_primary} <ArrowRight size={16} />
              </Link>
              <a href="#features" className="landing-btn landing-btn-secondary">
                <Play size={14} /> {c.cta_secondary}
              </a>
            </div>
            <div className="hero-trust">
              <div className="hero-trust-dot" />
              {c.trust}
            </div>
          </motion.div>

          <motion.div className="hero-mockup-wrap" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}>
            <div className="hero-annotation">{c.annotation}</div>
            <HeroMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
