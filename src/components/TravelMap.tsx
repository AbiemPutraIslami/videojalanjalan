import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMapEvents, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';

interface Point {
  lng: number;
  lat: number;
}

interface TravelMapProps {
  points: Point[];
  onAddPoint: (point: Point) => void;
  isAnimating: boolean;
  onAnimationComplete: () => void;
  speed: number;
  vehicleType: 'motorcycle' | 'walking';
  pointNames: string[];
  onRouteCalculated?: (distanceMeters: number, durationSeconds: number) => void;
  is3D?: boolean;
  mapStyle?: string;
  routeColor?: string;
}

const getTransformStyle = (bearing: number, lean: number, type: string = 'motorcycle') => {
  const rotZ = bearing - 90;
  const normalized = ((bearing % 360) + 360) % 360;
  // If vehicle points "West" (180 to 360 deg), flip vertically so wheels don't point inside out
  // For walking person, we usually don't want to flip them upside down
  const flipY = (type === 'motorcycle' && normalized > 180 && normalized < 360) ? -1 : 1;
  return `perspective(400px) rotateZ(${rotZ}deg) scaleY(${flipY}) rotateX(${lean}deg)`;
};

const getVehicleIcon = (bearing: number, type: 'motorcycle' | 'walking', placeName: string, is3D: boolean = false) => {
  const speedDisplay = placeName || "Area Peta";
  
  let iconHtml = '';

  if (is3D) {
    const imgUrl = type === 'motorcycle' 
      ? 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@latest/assets/Motorcycle/3D/motorcycle_3d.png'
      : 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@latest/assets/Person%20walking/Default/3D/person_walking_3d_default.png';
    // Native faces left. scaleX(-1) makes it face right.
    iconHtml = `<img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 15px 15px rgba(0,0,0,0.5)); transform: scaleX(-1) scale(1.3);" />`;
  } else {
    // 2D emoji
    const emoji = type === 'motorcycle' ? '🏍️' : '🚶';
    // Native usually Left. scaleX(-1) makes it face Right.
    iconHtml = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; transform: scaleX(-1);">${emoji}</div>`;
  }
  
  return L.divIcon({
    className: 'bg-transparent border-0 vehicle-icon-container',
    html: `
      <div style="position: relative; width: 44px; height: 44px;">
        <div class="vehicle-icon-inner" style="transform: ${getTransformStyle(bearing, 0)}; width: 100%; height: 100%; background: ${is3D ? 'transparent' : 'white'}; ${is3D ? '' : 'border-radius: 50%; box-shadow: 0 8px 16px rgba(0,0,0,0.3);'} display: flex; align-items: center; justify-content: center; transition: none; position: relative; z-index: 2; transform-style: preserve-3d;">
          ${iconHtml}
        </div>
        <div id="vehicle-label-container" style="position: absolute; top: -38px; left: 50%; transform: translateX(-50%); z-index: 3; background: rgba(255, 255, 255, 0.95); color: #000000; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2); white-space: nowrap; font-family: 'Inter', system-ui, sans-serif; letter-spacing: 0.02em; display: flex; align-items: center; gap: 6px; pointer-events: none; opacity: 0; transition: opacity 0.4s ease; backdrop-filter: blur(8px);">
           <div style="width: 6px; height: 6px; background: #3b82f6; border-radius: 50%; box-shadow: 0 0 8px #3b82f6;"></div>
           <span id="vehicle-location-label">${speedDisplay}</span>
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
};

const getPinIcon = (color: string = '#3b82f6') => L.divIcon({
  className: 'bg-transparent border-0',
  html: `<div style="width: 20px; height: 20px; background: ${color}; border: 4px solid #fff; border-radius: 50%; box-shadow: 0 0 15px ${color}88;"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

function MapEvents({ onAddPoint }: { onAddPoint: (p: Point) => void }) {
  useMapEvents({
    click(e) {
      onAddPoint({ lng: e.latlng.lng, lat: e.latlng.lat });
    }
  });
  return null;
}

function AnimationController({
  points, routeLine, isAnimating, onAnimationComplete, speed, vehicleType, is3D, pointNames, routeColor = '#3b82f6'
}: {
  points: Point[], routeLine: any, isAnimating: boolean, onAnimationComplete: () => void, speed: number, vehicleType: string, is3D: boolean, pointNames: string[], routeColor?: string
}) {
  const map = useMap();
  const animRef = useRef<number>();
  const markerRef = useRef<L.Marker>(null);
  const polylineRef = useRef<L.Polyline>(null);
  const polylineGlowRef = useRef<L.Polyline>(null);

  useEffect(() => {
    if (!isAnimating || !routeLine || points.length < 2) return;

    let animationActive = true;
    const length = turf.length(routeLine, { units: 'kilometers' });
    const baseDurationMs = typeof speed === 'number' && speed > 0 ? (100 / speed) * 3000 : 3000;
    // Hapus batas maksimal durasi (10000) agar user bisa membuat animasi sangat lambat
    const duration = Math.max(500, baseDurationMs);
    
    let startTime: number | null = null;
    const initialPos: [number, number] = [points[0].lat, points[0].lng];
    let collectedCoords: [number, number][] = [initialPos];

    let currentMapZoom = map.getZoom();
    let currentMapCenterLat = initialPos[0];
    let currentMapCenterLng = initialPos[1];

    // Reset components without causing a react re-render cascade
    if (markerRef.current) markerRef.current.setLatLng(initialPos);
    if (polylineRef.current) polylineRef.current.setLatLngs([initialPos]);
    if (polylineGlowRef.current) polylineGlowRef.current.setLatLngs([initialPos]);

    map.setView([points[0].lat, points[0].lng], map.getZoom(), { animate: false });

    let currentBearing = 0;
    if (points.length > 1) {
      currentBearing = turf.bearing(
        turf.point([points[0].lng, points[0].lat]),
        turf.point([points[1].lng, points[1].lat])
      );
    }
    let currentLean = 0;

    let isCompletionHandled = false;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp + 100; // Small buffer for setView sync
      const elapsed = timestamp - startTime;
      
      if (elapsed < 0) {
        if (animationActive) animRef.current = requestAnimationFrame(animate);
        return;
      }

      // Linear Progress (Constant Speed) for Motor, but subtle ease for Walking
      const rawProgress = Math.min(1, elapsed / duration);
      let progress = rawProgress;
      
      if (vehicleType === 'walking') {
        // Subtle ease-in-out for walking to make it feel more natural and less "robot-like"
        progress = rawProgress < 0.5 
          ? 2 * rawProgress * rawProgress 
          : 1 - Math.pow(-2 * rawProgress + 2, 2) / 2;
      }

      const distance = progress * length;

      const currentPoint = turf.along(routeLine, distance, { units: 'kilometers' });
      const coord = currentPoint.geometry.coordinates; // [lng, lat]
      const latLng: [number, number] = [coord[1], coord[0]];
      
      // Smooth lookahead and banking (lean) physics
      const lookAheadDist = Math.min(distance + 0.05, length);
      const aheadPoint = turf.along(routeLine, lookAheadDist, { units: 'kilometers' });
      
      let targetBearing = currentBearing;
      if (distance < length && turf.distance(currentPoint, aheadPoint) > 0.001) {
        targetBearing = turf.bearing(currentPoint, aheadPoint);
      }

      // Shortest path difference for smooth rotation
      const isWalking = vehicleType === 'walking';
      const bearingSmooth = isWalking ? 0.04 : 0.18;

      let bearingDiff = ((targetBearing - currentBearing + 180) % 360 + 360) % 360 - 180;
      currentBearing += bearingDiff * bearingSmooth;

      // Calculate lean (banking) based on turning sharpness - Disabled for walking
      const maxLean = 40;
      let targetLean = isWalking ? 0 : bearingDiff * 2.5; 
      targetLean = Math.max(-maxLean, Math.min(maxLean, targetLean));
      currentLean += (targetLean - currentLean) * 0.15;

      if (animationActive) {
        collectedCoords.push(latLng);

        if (markerRef.current) {
          markerRef.current.setLatLng(latLng);
          const iconEl = markerRef.current.getElement()?.querySelector('.vehicle-icon-inner') as HTMLElement | null;
          if (iconEl) {
            iconEl.style.transform = getTransformStyle(currentBearing, currentLean, vehicleType);
          }
          
          const labelEl = document.getElementById('vehicle-location-label');
          const containerEl = document.getElementById('vehicle-label-container');
          
          if (containerEl && rawProgress < 1) {
              containerEl.style.opacity = '1';
          } else if (containerEl) {
              containerEl.style.opacity = '0';
          }

          if (labelEl) {
              let closestIdx = 0;
              let minDistance = Infinity;
              
              for (let i = 0; i < points.length; i++) {
                 const d = Math.pow(coord[0] - points[i].lng, 2) + Math.pow(coord[1] - points[i].lat, 2);
                 if (d < minDistance) {
                     minDistance = d;
                     closestIdx = i;
                 }
              }
              const locationName = pointNames[closestIdx] || 'Area Peta';
              if (labelEl.innerText !== locationName) {
                  labelEl.innerText = locationName;
              }
          }
        }

        if (polylineRef.current) polylineRef.current.setLatLngs(collectedCoords);
        if (polylineGlowRef.current) polylineGlowRef.current.setLatLngs(collectedCoords);

        // Dynamically adjust center and zoom
        let targetZoom = currentMapZoom;
        let targetCenterLat = latLng[0];
        let targetCenterLng = latLng[1];
        
        if (distance < length) {
           // Fixed navigation zoom level for that Google Maps feel
           targetZoom = isWalking ? 18 : 17;
           
           // Peek slightly ahead (not kilometers ahead)
           const maxAhead = isWalking ? 0.02 : 0.06; // 20m or 60m peek
           const viewAheadDist = Math.min(distance + maxAhead, length);
           const aheadPt = turf.along(routeLine, viewAheadDist, { units: 'kilometers' }).geometry.coordinates;
           
           // Bias heavily towards the vehicle to keep it centered-ish like navigation
           targetCenterLat = (latLng[0] * 0.8) + (aheadPt[1] * 0.2);
           targetCenterLng = (latLng[1] * 0.8) + (aheadPt[0] * 0.2);
        }
        
        // High-performance smooth pursuit for camera (snappier for navigation)
        const camPursuit = isWalking ? 0.1 : 0.25;
        currentMapCenterLat += (targetCenterLat - currentMapCenterLat) * camPursuit;
        currentMapCenterLng += (targetCenterLng - currentMapCenterLng) * camPursuit;
        currentMapZoom += (targetZoom - currentMapZoom) * 0.05;
        
        map.setView([currentMapCenterLat, currentMapCenterLng], currentMapZoom, { animate: false });
      }

      if (rawProgress < 1) {
        if (animationActive) animRef.current = requestAnimationFrame(animate);
      } else if (!isCompletionHandled) {
        isCompletionHandled = true;
        // Memberikan waktu 3 detik di akhir animasi agar jalur yang sudah dilalui tetap terlihat
        setTimeout(() => {
          if (animationActive) onAnimationComplete();
        }, 3000);
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      animationActive = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const containerEl = document.getElementById('vehicle-label-container');
      if (containerEl) containerEl.style.opacity = '0';
    };
  }, [isAnimating, points, routeLine, speed, vehicleType, map, onAnimationComplete]);

  if (!isAnimating || points.length < 2) return null;

  const initialBearing = points.length > 1 
    ? turf.bearing(turf.point([points[0].lng, points[0].lat]), turf.point([points[1].lng, points[1].lat])) 
    : 0;

  return (
    <>
      <Marker 
        ref={markerRef}
        position={[points[0].lat, points[0].lng]} 
        icon={getVehicleIcon(initialBearing, vehicleType as any, pointNames[0] || 'Area Peta', is3D)} 
        zIndexOffset={1000}
      />
      <Polyline 
        ref={polylineGlowRef}
        positions={[[points[0].lat, points[0].lng]]} 
        pathOptions={{ color: routeColor, weight: 8, opacity: 0.4, lineJoin: 'round', className: 'route-active-glow' }} 
      />
      <Polyline 
        ref={polylineRef}
        positions={[[points[0].lat, points[0].lng]]} 
        pathOptions={{ color: routeColor, weight: 4, opacity: 1, lineJoin: 'round' }} 
      />
    </>
  );
}

const INDONESIA_BOUNDS = L.latLngBounds([-11.0, 94.0], [6.0, 141.0]);

export default function TravelMap(props: TravelMapProps) {
  const { 
    points, 
    onAddPoint, 
    isAnimating, 
    onAnimationComplete, 
    speed, 
    vehicleType, 
    pointNames, 
    onRouteCalculated, 
    is3D = false,
    mapStyle = 'voyager',
    routeColor = '#3b82f6'
  } = props;

  const [routeLine, setRouteLine] = useState<any>(null);

  const getTileSettings = (style: string) => {
    switch (style) {
      case 'satellite':
        return {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
        };
      case 'hybrid':
        return {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community',
          labels: "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
        };
      case 'topography':
        return {
          url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
          attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
        };
      case 'dark':
        return {
          url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        };
      case 'voyager':
      default:
        return {
          url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        };
    }
  };

  const tileSettings = useMemo(() => getTileSettings(mapStyle), [mapStyle]);

  useEffect(() => {
    let cancelled = false;

    if (points.length < 2) {
      setRouteLine(null);
      if (onRouteCalculated) onRouteCalculated(0, 0);
      return;
    }

    // Instantly set straight-line fallback for immediate "Calculated Route" preview
    // This will be replaced by the more accurate OSRM route once the fetch completes
    const lineCoords = points.map(p => [p.lng, p.lat]);
    const uniqueCoords = lineCoords.filter((coord, index, self) => 
      index === 0 || coord[0] !== self[index - 1][0] || coord[1] !== self[index - 1][1]
    );
    if (uniqueCoords.length >= 2) {
      setRouteLine(turf.lineString(uniqueCoords));
    }

    const applyFallback = (uCoords: any[]) => {
      if (uCoords.length < 2) return;
      const lineInfo = turf.lineString(uCoords);
      if (!cancelled) {
        setRouteLine(lineInfo);
        const distKm = turf.length(lineInfo);
        const assumedSpeedKmh = vehicleType === 'motorcycle' ? 35 : 4.5;
        if (onRouteCalculated) onRouteCalculated(distKm * 1000, (distKm / assumedSpeedKmh) * 3600);
      }
    };

    const fetchRoute = async () => {
      try {
        const profile = vehicleType === 'motorcycle' ? 'driving' : 'foot';
        const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
        const res = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson`);
        const data = await res.json();
        
        if (cancelled) return;

        if (data.code === 'Ok' && data.routes && data.routes[0]) {
           setRouteLine(turf.lineString(data.routes[0].geometry.coordinates));
           const distMeters = data.routes[0].distance;
           const distKm = distMeters / 1000;
           const assumedSpeedKmh = vehicleType === 'motorcycle' ? 35 : 4.5;
           if (onRouteCalculated) onRouteCalculated(distMeters, (distKm / assumedSpeedKmh) * 3600);
        } else {
           // Fallback to straight line
           const lineCoords = points.map(p => [p.lng, p.lat]);
           const uniqueCoords = lineCoords.filter((coord, index, self) => 
             index === 0 || coord[0] !== self[index - 1][0] || coord[1] !== self[index - 1][1]
           );
           applyFallback(uniqueCoords);
        }
      } catch (e) {
        if (cancelled) return;
        const lineCoords = points.map(p => [p.lng, p.lat]);
        const uniqueCoords = lineCoords.filter((coord, index, self) => 
          index === 0 || coord[0] !== self[index - 1][0] || coord[1] !== self[index - 1][1]
        );
        applyFallback(uniqueCoords);
      }
    };

    fetchRoute();
    return () => { cancelled = true; };
  }, [points, vehicleType, onRouteCalculated]);

  const polylinePositions: [number, number][] = routeLine 
    ? routeLine.geometry.coordinates.map((c: any) => [c[1], c[0]]) 
    : [];

  return (
    <MapContainer 
      center={[-2.5489, 118.0149]} // Center of Indonesia
      zoom={5} 
      minZoom={3}
      maxZoom={19}
      zoomSnap={0.5}
      zoomDelta={0.5}
      fadeAnimation={false}
      markerZoomAnimation={false}
      style={{ height: '100%', width: '100%', zIndex: 0, backgroundColor: '#f0f0f0' }}
      zoomControl={false}
      attributionControl={false}
    >
      <ZoomControl position="topright" />
      <TileLayer
        url={tileSettings.url}
        attribution={tileSettings.attribution}
        keepBuffer={24}
        updateWhenZooming={false}
        updateWhenIdle={true}
        maxZoom={19}
      />
      {mapStyle === 'hybrid' && (
        <TileLayer
          url={tileSettings.labels!}
          attribution={tileSettings.attribution}
          pane="overlayPane"
          keepBuffer={24}
          updateWhenZooming={false}
          updateWhenIdle={true}
          maxZoom={19}
        />
      )}
      
      {!isAnimating && <MapEvents onAddPoint={onAddPoint} />}

      {/* Static Markers */}
      <style dangerouslySetInnerHTML={{__html: `
        .animated-route-path {
          animation: dashFlow 1.5s linear infinite;
          filter: drop-shadow(0 0 3px rgba(0,0,0,0.2));
        }
        @keyframes dashFlow {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
        .route-active-glow {
          filter: drop-shadow(0 0 6px ${routeColor}cc);
        }
      `}} />

      {points.map((p, i) => {
        const isStart = i === 0;
        const isEnd = i === points.length - 1 && points.length > 1;
        
        return (
          <Marker 
            key={`pin-${i}-${p.lat}-${p.lng}`} 
            position={[p.lat, p.lng]} 
            icon={getPinIcon(routeColor)}
          >
            {pointNames[i] && (
              <Tooltip direction="top" offset={[0, -10]} permanent className="font-bold text-xs bg-[#1e293b] text-white border-transparent backdrop-blur-md px-3 py-1.5 shadow-[0_4px_15px_rgba(0,0,0,0.3)] rounded-lg">
                {isStart ? (
                  <>Berangkat:<br/><span className="text-[#3b82f6] font-black tracking-tight">{pointNames[i]}</span></>
                ) : isEnd ? (
                  <>Tujuan:<br/><span className="text-emerald-400 font-black tracking-tight">{pointNames[i]}</span></>
                ) : (
                  <span className="text-[#94a3b8] font-bold tracking-tight">{pointNames[i]}</span>
                )}
              </Tooltip>
            )}
          </Marker>
        );
      })}

      {/* Balanced route preview: Always visible as a guide/path preview */}
      {polylinePositions.length > 0 && (
        <Polyline 
          positions={polylinePositions} 
          pathOptions={{ 
            color: routeColor, 
            weight: 3, 
            dashArray: '8, 12', 
            opacity: isAnimating ? 0.3 : 0.6, 
            className: 'animated-route-path',
            interactive: false
          }} 
        />
      )}

      {/* Animated layer */}
      <AnimationController 
        points={points} 
        routeLine={routeLine} 
        isAnimating={isAnimating} 
        onAnimationComplete={onAnimationComplete} 
        speed={speed} 
        vehicleType={vehicleType}
        is3D={is3D}
        pointNames={pointNames}
        routeColor={routeColor}
      />
    </MapContainer>
  );
}
