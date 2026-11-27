import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { MapPin, Crosshair } from 'lucide-react';

// Global guard against Leaflet zoom-transition race when map container unmounts mid-transition
if (typeof L !== 'undefined' && L.Map && L.Map.prototype) {
  const proto = L.Map.prototype as any;
  if (!proto.__safePanePosPatched) {
    proto.__safePanePosPatched = true;
    const origGetMapPanePos = proto._getMapPanePos;
    if (typeof origGetMapPanePos === 'function') {
      proto._getMapPanePos = function () {
        if (!this._mapPane) return new L.Point(0, 0);
        return origGetMapPanePos.call(this);
      };
    }
    const origOnZoomEnd = proto._onZoomTransitionEnd;
    if (typeof origOnZoomEnd === 'function') {
      proto._onZoomTransitionEnd = function () {
        if (!this._mapPane) return;
        return origOnZoomEnd.call(this);
      };
    }
  }
}

interface MapPickerProps {
  latitude: number;
  longitude: number;
  onChange?: (lat: number, lng: number) => void;
  readOnly?: boolean;
  className?: string;
}

export const MapPicker: React.FC<MapPickerProps> = ({
  latitude,
  longitude,
  onChange,
  readOnly = false,
  className = 'h-56 w-full rounded-xl overflow-hidden z-10',
}) => {
  const safeLat = typeof latitude === 'number' && Number.isFinite(latitude) ? latitude : -6.200000;
  const safeLng = typeof longitude === 'number' && Number.isFinite(longitude) ? longitude : 106.816666;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const isInternalMove = useRef(false);

  // Inisialisasi peta Leaflet murni sekali pada saat mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
      } catch {
        // ignore
      }
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        center: [safeLat, safeLng],
        zoom: 15,
        zoomControl: false,
        dragging: !readOnly,
        scrollWheelZoom: true,
        attributionControl: false,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      if (!readOnly && onChange) {
        map.on('moveend', () => {
          if (!isInternalMove.current) {
            const center = map.getCenter();
            onChange(center.lat, center.lng);
          }
        });
      }

      mapInstanceRef.current = map;

      // Invalidate size to ensure proper tile layout in modals
      const t = setTimeout(() => {
        try {
          map.invalidateSize({ animate: false });
        } catch {}
      }, 150);

      return () => {
        clearTimeout(t);
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.off();
            mapInstanceRef.current.remove();
          } catch {}
          mapInstanceRef.current = null;
        }
      };
    } catch (e) {
      console.error('Failed to initialize Leaflet MapPicker:', e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sinkronisasi view peta saat koordinat berubah dari luar (mis. pilihan alamat autocomplete)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      const current = map.getCenter();
      const distance = map.distance(current, [safeLat, safeLng]);
      if (distance > 10) {
        isInternalMove.current = true;
        map.setView([safeLat, safeLng], 16, { animate: false });
        setTimeout(() => {
          isInternalMove.current = false;
        }, 60);
      }
    } catch {}
  }, [safeLat, safeLng]);

  const handleGetMyLocation = useCallback(() => {
    if (!navigator.geolocation || readOnly) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (onChange) {
          onChange(pos.coords.latitude, pos.coords.longitude);
        }
      },
      err => {
        console.warn('MapPicker GPS error:', err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [onChange, readOnly]);

  return (
    <div className={`relative ${className} bg-slate-100`}>
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Center Pin Indicator */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[400] pb-7">
        <MapPin
          size={30}
          className="text-rose-600 drop-shadow-xl animate-bounce"
          style={{ filter: 'drop-shadow(0px 4px 4px rgba(0,0,0,0.4))' }}
          fill="currentColor"
        />
      </div>

      {!readOnly && (
        <>
          <button
            type="button"
            onClick={handleGetMyLocation}
            className="absolute top-3 right-3 z-[400] bg-white hover:bg-slate-50 text-slate-700 p-2 rounded-xl shadow-md border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Pusatkan ke Posisi GPS Saya Saat Ini (Akurat)"
          >
            <Crosshair size={16} className="text-emerald-600" />
            <span className="hidden sm:inline text-[11px]">GPS Saya</span>
          </button>
          <div className="absolute bottom-2 left-2 z-[400] bg-slate-900/80 backdrop-blur text-white px-2.5 py-1 rounded-md text-[10px] font-mono pointer-events-none">
            {safeLat.toFixed(6)}, {safeLng.toFixed(6)}
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[400] bg-slate-900/90 backdrop-blur text-white px-3 py-1.5 rounded-full shadow-md text-[10px] font-bold tracking-wide pointer-events-none whitespace-nowrap border border-white/10">
            GESER PETA KE TITIK LOKASI
          </div>
        </>
      )}
    </div>
  );
};
