import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { Project, UserLocation } from '@/entities/types';
import { Navigation } from 'lucide-react';

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

export interface JourneyStopPoint {
  id: string;
  order: number;
  userId: string;
  userName: string;
  projectName: string;
  clientName: string;
  latitude: number;
  longitude: number;
  timeLabel: string;
  statusLabel: string;
}

interface AllProjectsMapProps {
  projects: Project[];
  userLocations: UserLocation[];
  height?: string;
  mode?: 'live' | 'journey';
  selectedUserId?: string | null;
  journeyStops?: JourneyStopPoint[];
}

export const AllProjectsMap: React.FC<AllProjectsMapProps> = ({
  projects,
  userLocations,
  height = '440px',
  mode = 'live',
  selectedUserId = null,
  journeyStops = [],
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Leaflet Map once on mount with zoom animations disabled to prevent `_leaflet_pos` race on unmount/tab switch
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.stop();
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
      } catch {
        // ignore cleanup race
      }
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        center: [-6.200000, 106.816666],
        zoom: 12,
        zoomControl: false,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      const group = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      layerGroupRef.current = group;
    } catch (e) {
      console.warn('Leaflet init fallback:', e);
    }

    return () => {
      const map = mapInstanceRef.current;
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
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
  }, []);

  // Update markers & bounds without destroying/recreating the map instance
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup || !(map as any)._mapPane) return;

    try {
      layerGroup.clearLayers();
      const bounds = L.latLngBounds([]);

      const filteredLocations = selectedUserId
        ? userLocations.filter(l => l.userId === selectedUserId)
        : userLocations;

      const filteredStops = selectedUserId
        ? journeyStops.filter(s => s.userId === selectedUserId)
        : journeyStops;

      if (mode === 'journey' && filteredStops.length > 0) {
        // Group stops by technician to draw route polylines per technician
        const stopsByUser = new Map<string, JourneyStopPoint[]>();
        filteredStops.forEach(st => {
          const list = stopsByUser.get(st.userId) || [];
          list.push(st);
          stopsByUser.set(st.userId, list);
        });

        stopsByUser.forEach((stops, uid) => {
          const sorted = [...stops].sort((a, b) => a.order - b.order);
          const latlngs: [number, number][] = [];

          sorted.forEach((stop, idx) => {
            if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) return;
            latlngs.push([stop.latitude, stop.longitude]);
            bounds.extend([stop.latitude, stop.longitude]);

            const stopIcon = L.divIcon({
              className: 'custom-leaflet-journey-stop',
              html: `
                <div style="background-color:#1E5B45; color:#ffffff; border-radius:50%; border:2px solid #ffffff; box-shadow:0 2px 6px rgba(0,0,0,0.28); display:flex; align-items:center; justify-content:center; width:26px; height:26px; font-size:11px; font-weight:800; font-family:monospace;">
                  ${idx + 1}
                </div>
              `,
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });

            L.marker([stop.latitude, stop.longitude], { icon: stopIcon })
              .addTo(layerGroup)
              .bindPopup(`
                <div class="p-1">
                  <div class="text-[10px] text-emerald-700 font-bold uppercase mb-0.5">Kunjungan #${idx + 1} • ${stop.timeLabel}</div>
                  <div class="font-bold text-xs mb-0.5">${stop.projectName}</div>
                  <div class="text-[11px] text-slate-600">${stop.userName} (${stop.statusLabel})</div>
                </div>
              `);
          });

          const lastLive = filteredLocations.find(l => l.userId === uid);
          if (lastLive && Number.isFinite(lastLive.latitude) && Number.isFinite(lastLive.longitude)) {
            latlngs.push([lastLive.latitude, lastLive.longitude]);
            bounds.extend([lastLive.latitude, lastLive.longitude]);
          }

          if (latlngs.length >= 2) {
            L.polyline(latlngs, {
              color: '#1E5B45',
              weight: 3.5,
              opacity: 0.85,
              dashArray: '6, 6',
            }).addTo(layerGroup);
          }
        });
      } else {
        projects.forEach(project => {
          if (!Number.isFinite(project.latitude) || !Number.isFinite(project.longitude)) return;
          if (!selectedUserId) {
            bounds.extend([project.latitude, project.longitude]);
          }

          L.circle([project.latitude, project.longitude], {
            radius: project.radius || 100,
            color: '#1a5c38',
            fillColor: '#1a5c38',
            fillOpacity: 0.1,
            weight: 1,
            dashArray: '4, 4',
          }).addTo(layerGroup);

          const projectIcon = L.divIcon({
            className: 'custom-leaflet-project-pin',
            html: `
              <div style="background-color:#1e293b; color:#ffffff; padding:3px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 2px 5px rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center; width:24px; height:24px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h1M9 13h1M9 17h1M14 13h1M14 17h1"/></svg>
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          L.marker([project.latitude, project.longitude], { icon: projectIcon })
            .addTo(layerGroup)
            .bindPopup(`
              <div class="p-1">
                <div class="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Lokasi Pelanggan</div>
                <div class="font-bold text-xs mb-0.5">${project.projectName}</div>
                <div class="text-[11px] text-slate-600">${project.clientName}</div>
              </div>
            `);
        });
      }

      filteredLocations.forEach(loc => {
        if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) return;
        bounds.extend([loc.latitude, loc.longitude]);

        const userIcon = L.divIcon({
          className: 'custom-leaflet-user-pin',
          html: `
            <div style="background-color:#10b981; color:#ffffff; padding:3px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 2px 5px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; width:26px; height:26px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        L.marker([loc.latitude, loc.longitude], { icon: userIcon })
          .addTo(layerGroup)
          .bindPopup(`
            <div class="p-1">
              <div class="text-[10px] text-emerald-600 font-bold uppercase mb-0.5">Posisi Teknisi Terakhir</div>
              <div class="font-bold text-xs mb-0.5">${loc.userName}</div>
              <div class="text-[11px] text-slate-600">Update: ${new Date(loc.trackedAt).toLocaleTimeString('id-ID')}</div>
            </div>
          `);
      });

      if (bounds.isValid() && (map as any)._loaded && (map as any)._mapPane) {
        map.invalidateSize({ animate: false });
        map.fitBounds(bounds.pad(0.15), { animate: false, maxZoom: selectedUserId ? 14 : 13 });
      }
    } catch (e) {
      console.warn('Leaflet update fallback:', e);
    }
  }, [projects, userLocations, mode, selectedUserId, journeyStops]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner">
      <div ref={mapContainerRef} style={{ height, width: '100%' }} className="z-10" />

      {/* Legend (Clean, tanpa ikon dekoratif) */}
      <div className="absolute top-2.5 left-2.5 z-[400] bg-white/95 border border-slate-200 rounded-lg p-2.5 text-[11px] shadow-sm">
        <h4 className="font-bold text-slate-800 mb-1.5 border-b border-slate-100 pb-1">
          {mode === 'journey' ? 'Keterangan Rute Perjalanan' : 'Keterangan Peta'}
        </h4>
        <div className="space-y-1">
          {mode === 'journey' ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-[#1E5B45] text-white text-[9px] font-bold flex items-center justify-center">
                  1
                </span>
                <span className="text-slate-600 font-medium">Urutan Titik Kunjungan ({journeyStops.length})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-[#1E5B45] inline-block" />
                <span className="text-slate-600 font-medium">Jalur Perjalanan Teknisi</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-800 inline-block border border-white shadow-xs" />
              <span className="text-slate-600 font-medium">Lokasi Pelanggan ({projects.length})</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block border border-white shadow-xs" />
            <span className="text-slate-600 font-medium">Posisi Teknisi ({userLocations.length})</span>
          </div>
        </div>
      </div>
    </div>
  );
};
