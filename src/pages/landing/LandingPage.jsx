import React from 'react';
import LandingNavbar from './LandingNavbar';
import LandingHero from './LandingHero';
import LandingMetrics from './LandingMetrics';
import LandingFeatures from './LandingFeatures';
import LandingTransform from './LandingTransform';
import LandingCalculator from './LandingCalculator';
import LandingTestimonials from './LandingTestimonials';
import LandingPricing from './LandingPricing';
import LandingFAQ from './LandingFAQ';
import LandingFooter from './LandingFooter';
import './landing.css';

export default function LandingPage() {
  return (
    <div className="landing-page">
      <LandingNavbar />
      <LandingHero />
      <LandingMetrics />
      <LandingFeatures />
      <LandingTransform />
      <LandingCalculator />
      <LandingTestimonials />
      <LandingPricing />
      <LandingFAQ />
      <LandingFooter />
    </div>
  );
}
