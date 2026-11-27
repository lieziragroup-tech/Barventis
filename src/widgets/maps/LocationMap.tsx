import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { formatDistance } from '@/shared/utils/geo';
import { MapPin, ShieldCheck, AlertTriangle } from 'lucide-react';

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

interface LocationMapProps {
  projectName: string;
  projectLat: number;
  projectLng: number;
  projectRadius: number; // meters
  executorLat?: number | null;
  executorLng?: number | null;
  executorAccuracy?: number | null;
  distanceMeters?: number | null;
  isWithinRadius?: boolean | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  height?: string;
  interactive?: boolean;
}

export const LocationMap: React.FC<LocationMapProps> = ({
  projectName,
  projectLat,
  projectLng,
  projectRadius,
  executorLat,
  executorLng,
  executorAccuracy = 10,
  distanceMeters,
  isWithinRadius,
  checkOutLat,
  checkOutLng,
  height = '280px',
  interactive = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const hasExecutorLoc = typeof executorLat === 'number' && Number.isFinite(executorLat) && typeof executorLng === 'number' && Number.isFinite(executorLng);
  const safeProjectLat = typeof projectLat === 'number' && Number.isFinite(projectLat) ? projectLat : -6.200000;
  const safeProjectLng = typeof projectLng === 'number' && Number.isFinite(projectLng) ? projectLng : 106.816666;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.stop();
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
      } catch {
        // ignore
      }
      mapInstanceRef.current = null;
    }

    if (mapContainerRef.current) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    try {
      const centerLat = hasExecutorLoc ? (safeProjectLat + executorLat!) / 2 : safeProjectLat;
      const centerLng = hasExecutorLoc ? (safeProjectLng + executorLng!) / 2 : safeProjectLng;

      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: hasExecutorLoc && distanceMeters && distanceMeters > 500 ? 15 : 17,
        zoomControl: false,
        dragging: interactive,
        scrollWheelZoom: false,
        attributionControl: false,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      });

      mapInstanceRef.current = map;

      if (interactive) {
        L.control.zoom({ position: 'bottomright' }).addTo(map);
      }

      L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        maxNativeZoom: 18,
        attribution: '© Google Maps',
      }).addTo(map);

      const circleColor = isWithinRadius === false ? '#ef4444' : '#10b981';
      L.circle([safeProjectLat, safeProjectLng], {
        radius: projectRadius,
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: 0.15,
        weight: 2,
        dashArray: '4, 6',
      }).addTo(map);

      const projectIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: `
          <div style="background-color:#1e293b; color:#ffffff; padding:5px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 4px 10px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; width:30px; height:30px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h1M9 13h1M9 17h1M14 13h1M14 17h1"/></svg>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      L.marker([safeProjectLat, safeProjectLng], { icon: projectIcon })
        .addTo(map)
        .bindPopup(`<b>Titik Proyek:</b> ${projectName}<br/>Radius: ${projectRadius}m`);

      if (hasExecutorLoc) {
        const execPinColor = isWithinRadius === false ? '#dc2626' : '#059669';
        const executorIcon = L.divIcon({
          className: 'custom-leaflet-exec-pin',
          html: `
            <div style="background-color:${execPinColor}; color:#ffffff; padding:5px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; width:30px; height:30px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        L.marker([executorLat!, executorLng!], { icon: executorIcon })
          .addTo(map)
          .bindPopup(`<b>Lokasi Check-In Pelaksana</b><br/>Akurasi GPS: ±${Math.round(executorAccuracy || 10)}m<br/>Jarak: ${distanceMeters ? formatDistance(distanceMeters) : '-'}`);

        L.polyline(
          [
            [projectLat, projectLng],
            [executorLat!, executorLng!],
          ],
          {
            color: isWithinRadius === false ? '#ef4444' : '#059669',
            weight: 3,
            dashArray: '6, 6',
            opacity: 0.85,
          }
        ).addTo(map);

        if (checkOutLat && checkOutLng && (checkOutLat !== executorLat || checkOutLng !== executorLng)) {
          const checkOutIcon = L.divIcon({
            className: 'custom-leaflet-cout-pin',
            html: `
              <div style="background-color:#2563eb; color:#ffffff; padding:4px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 4px 10px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; width:26px; height:26px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              </div>
            `,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });

          L.marker([checkOutLat, checkOutLng], { icon: checkOutIcon })
            .addTo(map)
            .bindPopup('<b>Titik Check-Out</b>');
        }

        const group = L.featureGroup([
          L.marker([projectLat, projectLng]),
          L.marker([executorLat!, executorLng!]),
        ]);
        if ((map as any)._loaded && (map as any)._mapPane) {
          map.fitBounds(group.getBounds().pad(0.25), { animate: false });
        }
      }
    } catch (e) {
      console.warn('Leaflet render fallback:', e);
    }

    return () => {
      const map = mapInstanceRef.current;
      mapInstanceRef.current = null;
      if (map) {
        try {
          map.stop();
          map.off();
          map.remove();
        } catch {
          // ignore
        }
      }
    };
  }, [projectLat, projectLng, projectRadius, executorLat, executorLng, distanceMeters, isWithinRadius, checkOutLat, checkOutLng, projectName, executorAccuracy, interactive, hasExecutorLoc]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner">
      <div ref={mapContainerRef} style={{ height, width: '100%' }} className="z-10" />

      {/* Floating Status Card Overlay */}
      <div className="absolute top-2.5 left-2.5 z-[400] bg-white/95 border border-slate-200/80 rounded-lg p-2 shadow-sm text-[11px] max-w-xs">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <MapPin size={13} className="text-slate-600 shrink-0" />
          <span className="truncate">{projectName}</span>
        </div>
        <div className="mt-0.5 text-[10px] text-slate-500">
          Radius Toleransi: <span className="font-semibold text-slate-700">{projectRadius} meter</span>
        </div>

        {distanceMeters !== undefined && distanceMeters !== null && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-slate-500 text-[10px]">Jarak Pelaksana:</span>
            {isWithinRadius ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                <ShieldCheck size={11} /> {formatDistance(distanceMeters)} (Valid)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                <AlertTriangle size={11} /> {formatDistance(distanceMeters)} (Di Luar)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-2.5 left-2.5 z-[400] bg-white/90 border border-slate-200 rounded-md px-2 py-1 text-[10px] text-slate-600 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5 shadow-xs">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-slate-800 inline-block" /> Proyek
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" /> Pelaksana
        </div>
      </div>
    </div>
  );
};
