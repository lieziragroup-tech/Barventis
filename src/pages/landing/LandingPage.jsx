import React, { Suspense, lazy } from 'react';
import LandingNavbar from './LandingNavbar';
import LandingHero from './LandingHero';
import LandingMetrics from './LandingMetrics';
import './landing.css';

const LandingFeatures = lazy(() => import('./LandingFeatures'));
const LandingTransform = lazy(() => import('./LandingTransform'));
const LandingCalculator = lazy(() => import('./LandingCalculator'));
const LandingTestimonials = lazy(() => import('./LandingTestimonials'));
const LandingPricing = lazy(() => import('./LandingPricing'));
const LandingFAQ = lazy(() => import('./LandingFAQ'));
const LandingFooter = lazy(() => import('./LandingFooter'));

export default function LandingPage() {
  return (
    <div className="landing-page">
      <LandingNavbar />
      <LandingHero />
      <LandingMetrics />
      
      <Suspense fallback={<div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
        <LandingFeatures />
        <LandingTransform />
        <LandingCalculator />
        <LandingTestimonials />
        <LandingPricing />
        <LandingFAQ />
        <LandingFooter />
      </Suspense>
    </div>
  );
}
