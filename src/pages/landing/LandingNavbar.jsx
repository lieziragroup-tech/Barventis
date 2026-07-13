import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../../contexts/LanguageContext';
import { copy } from '../../data/landingCopy';

export default function LandingNavbar() {
  const { lang, setLang } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const c = copy[lang];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`landing-nav${scrolled ? ' scrolled' : ''}`}>
      <a href="/" className="landing-nav-brand">
        <div className="landing-nav-logo">B</div>
        <span className="landing-nav-name">Barventis</span>
      </a>

      <div className="landing-nav-links">
        <a href="#features">{c.features.section_label}</a>
        <a href="#pricing">{c.pricing.section_label}</a>
        <a href="#faq">{c.faq.section_label}</a>
      </div>

      <div className="landing-nav-actions">
        <div className="lang-toggle">
          <button className={lang === 'id' ? 'active' : ''} onClick={() => setLang('id')}>ID</button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <Link to="/login" className="landing-btn landing-btn-ghost">{c.nav.login}</Link>
        <Link to="/login" className="landing-btn landing-btn-primary">{c.nav.cta}</Link>
      </div>
    </nav>
  );
}
