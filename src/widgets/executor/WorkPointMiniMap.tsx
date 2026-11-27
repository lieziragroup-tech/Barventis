import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, Copy, Crosshair, MapPin } from 'lucide-react';
import { formatDistance } from '@/shared/utils/geo';
import { formatTimeWib } from './techLiteUtils';
import {
  formatAccuracyLabel,
  formatWorkPointCoordinates,
  ResolvedWorkPointLocation,
} from './workPointLocationUtils';

// Guard Leaflet's internal pane lookup against unmount mid-transition
if (typeof window !== 'undefined' && (L.Map.prototype as any)._getMapPanePos && !(L.Map.prototype as any).__safePanePosPatched) {
  const originalGetMapPanePos = (L.Map.prototype as any)._getMapPanePos;
  (L.Map.prototype as any)._getMapPanePos = function () {
    if (!this._mapPane || !this._mapPane._leaflet_pos) {
      return new L.Point(0, 0);
    }
    return originalGetMapPanePos.call(this);
  };
  (L.Map.prototype as any).__safePanePosPatched = true;
}

interface WorkPointMiniMapProps {
  location: ResolvedWorkPointLocation;
  projectName?: string;
}

export const WorkPointMiniMap: React.FC<WorkPointMiniMapProps> = ({
  location,
  projectName,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [copied, setCopied] = useState(false);

  const coordsText = formatWorkPointCoordinates(location.latitude, location.longitude);
  const accuracyLabel = formatAccuracyLabel(location.accuracy);
  const capturedTimeLabel = location.capturedAt ? formatTimeWib(location.capturedAt) : null;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    if ((el as any)._leaflet_id) {
      delete (el as any)._leaflet_id;
    }

    const map = L.map(el, {
      center: [location.latitude, location.longitude],
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);

    // Subtle accuracy halo around tagged point
    const haloRadius = Math.max(10, Math.min(80, location.accuracy || 18));
    L.circle([location.latitude, location.longitude], {
      radius: haloRadius,
      color: '#1b4332',
      weight: 1.5,
      fillColor: '#2d6a4f',
      fillOpacity: 0.16,
      interactive: false,
    }).addTo(map);

    const isManual = location.source === 'MANUAL_GPS';
    const primaryPinIcon = L.divIcon({
      className: 'gep-minimap-pin',
      html: `
        <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:${
            isManual ? 'rgba(1,45,29,0.22)' : 'rgba(45,106,79,0.18)'
          };"></span>
          <span style="position:relative;width:14px;height:14px;border-radius:9999px;background:#012d1d;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(1,45,29,0.45);"></span>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const primaryMarker = L.marker([location.latitude, location.longitude], {
      icon: primaryPinIcon,
    }).addTo(map);

    primaryMarker.bindTooltip(
      `${location.label}${projectName ? ` · ${projectName}` : ''}`,
      { direction: 'top', offset: [0, -10] }
    );

    // If project target exists and differs meaningfully (> 15 m), render subtle reference pin
    const showTargetPin =
      location.source !== 'PROJECT' &&
      location.projectTarget !== null &&
      typeof location.distanceToProjectMeters === 'number' &&
      location.distanceToProjectMeters > 15;

    if (showTargetPin && location.projectTarget) {
      const targetPinIcon = L.divIcon({
        className: 'gep-minimap-target-pin',
        html: `
          <div style="width:12px;height:12px;border-radius:9999px;background:#ffffff;border:2.5px solid #6b7280;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>
        `,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      L.marker([location.projectTarget.latitude, location.projectTarget.longitude], {
        icon: targetPinIcon,
        interactive: false,
      }).addTo(map);

      L.polyline(
        [
          [location.latitude, location.longitude],
          [location.projectTarget.latitude, location.projectTarget.longitude],
        ],
        {
          color: '#1b4332',
          weight: 1.5,
          dashArray: '4 4',
          opacity: 0.65,
          interactive: false,
        }
      ).addTo(map);

      const bounds = L.latLngBounds(
        [location.latitude, location.longitude],
        [location.projectTarget.latitude, location.projectTarget.longitude]
      );
      map.fitBounds(bounds, { padding: [26, 26], maxZoom: 17, animate: false });
    }

    const resizeTimer = window.setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize(false);
      }
    }, 120);

    return () => {
      window.clearTimeout(resizeTimer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if ((el as any)._leaflet_id) {
        delete (el as any)._leaflet_id;
      }
    };
  }, [
    location.latitude,
    location.longitude,
    location.accuracy,
    location.source,
    location.label,
    location.distanceToProjectMeters,
    location.projectTarget?.latitude,
    location.projectTarget?.longitude,
    projectName,
  ]);

  const handleCopyCoords = async () => {
    try {
      await navigator.clipboard.writeText(coordsText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      data-testid="workpoint-mini-map-card"
      className="rounded-xl bg-[var(--tl-low)] overflow-hidden border border-[var(--tl-container)]"
    >
      {/* Header strip */}
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Crosshair size={13} className="text-[var(--tl-secondary)] shrink-0" />
          <span className="text-[11px] font-semibold text-[var(--tl-text)] truncate">
            {location.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-[var(--tl-text-variant)] shrink-0">
          {accuracyLabel && <span>{accuracyLabel}</span>}
          {accuracyLabel && capturedTimeLabel && capturedTimeLabel !== '-' && <span>·</span>}
          {capturedTimeLabel && capturedTimeLabel !== '-' && (
            <span className="font-mono">{capturedTimeLabel}</span>
          )}
        </div>
      </div>

      {/* Mini-map canvas with crisp topographic-grid fallback when tiles are offline */}
      <div className="relative h-[164px] w-full bg-[#e6efe9] overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-45"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(1,45,29,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(1,45,29,0.09) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div
          ref={containerRef}
          data-testid="workpoint-mini-map"
          aria-label={`Peta mini ${location.label} pada koordinat ${coordsText}`}
          className="relative z-[1] h-full w-full"
        />

        {/* Subtle non-obstructive legend tag at bottom-left */}
        <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-lg bg-[var(--tl-card)]/92 backdrop-blur-sm px-2 py-1 text-[10px] font-semibold text-[var(--tl-text)] shadow-sm inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--tl-primary)] shrink-0" />
          <span>Titik Pengerjaan</span>
        </div>
      </div>

      {/* Coordinate readout & copy bar */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 bg-[var(--tl-low)]">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-[var(--tl-secondary)] shrink-0" />
            <span
              data-testid="workpoint-coords-text"
              className="text-[11px] font-mono font-semibold text-[var(--tl-text)] truncate"
            >
              {coordsText}
            </span>
          </div>
          {typeof location.distanceToProjectMeters === 'number' && (
            <p className="text-[10.5px] text-[var(--tl-text-variant)] mt-0.5 pl-[18px]">
              Jarak {formatDistance(location.distanceToProjectMeters)} dari titik lokasi proyek
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopyCoords}
          aria-label="Salin koordinat GPS"
          className="min-h-[30px] px-2.5 rounded-lg bg-[var(--tl-card)] hover:bg-[var(--tl-container)] text-[var(--tl-primary)] text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Tersalin' : 'Salin'}</span>
        </button>
      </div>
    </div>
  );
};
