import React, { useState, useCallback, useRef, useEffect } from 'react';
import TravelMap from './components/TravelMap';
import { Play, RotateCcw, MapPin, Bike, Footprints, Trash2, Download, Navigation, Clock, Layers, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type Point = { lng: number; lat: number };
type Vehicle = 'motorcycle' | 'walking';

export default function App() {
  const [points, setPoints] = useState<Point[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle>('motorcycle');
  const [speed, setSpeed] = useState(80);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pointNames, setPointNames] = useState<string[]>([]);
  const [routeInfo, setRouteInfo] = useState<{distance: number, duration: number} | null>(null);
  const [is3D, setIs3D] = useState(false);
  const [mapStyle, setMapStyle] = useState('voyager');
  const [routeColor, setRouteColor] = useState('#3b82f6');
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showPointsList, setShowPointsList] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    let isCancelled = false;
    
    const fetchLocationName = async (lat: number, lng: number) => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`);
            const data = await res.json();
            const a = data.address;
            return a?.road || a?.pedestrian || a?.path || a?.route || a?.village || a?.neighbourhood || a?.hamlet || a?.suburb || a?.residential || a?.town || data.name || "Jalan Tanpa Nama";
        } catch(e) {
            return "Area Peta";
        }
    };

    const updateNames = async () => {
        if (points.length === 0) {
            if (!isCancelled) setPointNames([]);
            return;
        }
        // Only fetch the newly added point
        if (points.length > pointNames.length) {
            const name = await fetchLocationName(points[points.length - 1].lat, points[points.length - 1].lng);
            if (!isCancelled) setPointNames(prev => {
                const newNames = [...prev];
                newNames[points.length - 1] = name;
                return newNames;
            });
        } else if (points.length < pointNames.length) {
            if (!isCancelled) setPointNames(prev => prev.slice(0, points.length));
        }
    };

    const timer = setTimeout(updateNames, 500);
    return () => { clearTimeout(timer); isCancelled = true; };
  }, [points, pointNames.length]);

  const handleAddPoint = useCallback((p: Point) => {
    setPoints(prev => [...prev, p]);
  }, []);

  const handleRouteCalculated = useCallback((distance: number, duration: number) => {
    if (distance === 0 && duration === 0) setRouteInfo(null);
    else setRouteInfo({ distance, duration });
  }, []);

  const handleClear = () => {
    if (isAnimating) return;
    setPoints([]);
    setPointNames([]);
  };

  const popLastPoint = () => {
    if (isAnimating) return;
    setPoints(prev => prev.slice(0, -1));
    setPointNames(prev => prev.slice(0, -1));
  };

  const handleRemoveSpecificPoint = (indexToRemove: number) => {
    if (isAnimating) return;
    setPoints(prev => prev.filter((_, i) => i !== indexToRemove));
    setPointNames(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  const handlePlay = () => {
    if (points.length < 2) return;
    setIsAnimating(true);
  };

  const handleDownload = async () => {
    if (points.length < 2) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setToastMessage("Browser tidak mendukung rekam layar otomatis di sini. Gunakan Rekam Layar bawaan HP, atau Buka Aplikasi di Tab Baru.");
      setTimeout(() => setToastMessage(null), 8000);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
      });

      const recorder = new MediaRecorder(stream, { 
        mimeType: 'video/webm',
        videoBitsPerSecond: 6000000 // 6Mbps for smoother high-motion video
      });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `travel-animation-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsAnimating(true);
    } catch (err: any) {
      if (err.name !== 'NotAllowedError' && !err.message?.includes('Permission denied')) {
        console.error("Perekaman layar dibatalkan atau gagal:", err);
      }
      
      if (err.message?.includes('permissions policy') || err.name === 'SecurityError') {
        setToastMessage("Izin rekam layar dicegah oleh pratinjau (iFrame). Solusi: Klik ikon 'Buka di Tab Baru' (↗) di pojok atas, atau rekam manual menggunakan alat rekam HP/Desktop Anda.");
      } else if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setToastMessage("Perekaman dibatalkan oleh pengguna.");
      } else {
        setToastMessage("Perekaman dibatalkan atau terjadi kesalahan teknis.");
      }
      setTimeout(() => setToastMessage(null), 8000);
    }
  };

  const stopAnimationAndRecording = useCallback(() => {
    setIsAnimating(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scroll
        if (isAnimating) {
          stopAnimationAndRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnimating, stopAnimationAndRecording]);

  return (
    <div className="flex w-full h-screen bg-[#050505] text-[#f8fafc] items-center justify-center font-sans overflow-hidden">
      
      {/* 9:16 Aspect Ratio Frame */}
      <div className="relative w-full h-full sm:h-[95vh] sm:aspect-[9/16] sm:rounded-[2.5rem] overflow-hidden bg-[#0f172a] shadow-2xl sm:border-[8px] sm:border-[#1e293b]">
        
        <TravelMap
          points={points}
          onAddPoint={handleAddPoint}
          isAnimating={isAnimating}
          onAnimationComplete={stopAnimationAndRecording}
          vehicleType={vehicle}
          speed={speed}
          pointNames={pointNames}
          onRouteCalculated={handleRouteCalculated}
          is3D={is3D}
          mapStyle={mapStyle}
          routeColor={routeColor}
        />

        {/* Top Info Banner for Route Stats */}
        <AnimatePresence>
          {points.length >= 2 && routeInfo && routeInfo.distance > 0 && (
            <motion.div
               key="route-stats-banner"
               initial={{ y: -50, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               exit={{ y: -50, opacity: 0 }}
               className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] bg-[#1e293b]/90 backdrop-blur-xl border border-[#334155] shadow-[0_10px_30px_rgba(0,0,0,0.5)] rounded-2xl px-5 py-3 flex items-center justify-between gap-6 whitespace-nowrap min-w-[280px]"
            >
               <div className="flex items-center gap-2">
                  <Navigation size={18} style={{ color: routeColor }} />
                  <div className="flex flex-col items-start leading-none gap-1">
                    <span className="text-[10px] text-[#94a3b8] font-bold uppercase tracking-wider">Total Jarak</span>
                    <span className="text-sm font-black text-[#f8fafc] tracking-tight">
                       {(routeInfo.distance / 1000).toFixed(1)} <span className="text-xs font-semibold text-[#94a3b8]">km</span>
                    </span>
                  </div>
               </div>
               <div className="w-px h-8 bg-[#334155]"></div>
               <div className="flex items-center gap-2">
                  <Clock size={18} className="text-emerald-400" />
                  <div className="flex flex-col items-start leading-none gap-1">
                    <span className="text-[10px] text-[#94a3b8] font-bold uppercase tracking-wider">Waktu Tempuh</span>
                    <span className="text-sm font-black text-[#f8fafc] tracking-tight">
                       {routeInfo.duration >= 3600 
                         ? `${Math.floor(routeInfo.duration/3600)}j ${Math.round((routeInfo.duration%3600)/60)}m`
                         : `${Math.round(routeInfo.duration/60) || 1} mnt`
                       }
                    </span>
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Overlay / Controls */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              key="toast-overlay"
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 24, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="absolute top-0 left-1/2 -translate-x-1/2 z-[2000] bg-amber-500/90 text-[#0f172a] text-xs font-bold leading-relaxed px-5 py-3 rounded-full shadow-[0_10px_20px_rgba(245,158,11,0.3)] w-[90%] max-w-sm text-center backdrop-blur-md border border-amber-300"
            >
              {toastMessage}
            </motion.div>
          )}

          {!isAnimating ? (
            <motion.div 
              key="controls-panel"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0, scale: 0.9 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-[#1e293b]/95 backdrop-blur-xl border border-[#334155] shadow-2xl rounded-2xl p-5 flex flex-col gap-5 w-[90%] max-w-sm"
            >
              <div className="flex items-center justify-between px-1">
                <button 
                  onClick={() => { setShowPointsList(!showPointsList); setShowCustomizer(false); }}
                  className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-all border ${showPointsList ? 'bg-white/10 border-white/20' : 'border-transparent hover:bg-white/5'}`}
                >
                  <MapPin style={{ color: routeColor }} size={18} />
                  <span className="font-semibold text-[#f8fafc] tracking-tight text-sm">
                    {points.length} Titik Rute
                  </span>
                </button>
                <button 
                  onClick={() => { setShowCustomizer(!showCustomizer); setShowPointsList(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                    showCustomizer ? 'bg-[#f8fafc] text-[#0f172a] border-white' : 'bg-[#0f172a] text-[#94a3b8] border-[#334155]'
                  }`}
                >
                  {showCustomizer ? 'Tutup' : 'Kustomisasi'}
                </button>
              </div>

              <AnimatePresence>
                {showPointsList && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden flex flex-col gap-3 py-2 border-t border-[#334155]/50"
                  >
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                        <Search size={14} className="text-[#64748b]" />
                      </div>
                      <input
                        type="text"
                        placeholder="Cari lokasi rute..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[#0f172a] text-[#f8fafc] text-xs pl-8 pr-3 py-2.5 rounded-xl border border-[#334155] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]/50 transition-all placeholder-[#64748b]"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                      {points.length === 0 ? (
                        <div className="text-center text-[#64748b] text-xs py-3 font-medium">Belum ada titik rute. Klik di peta untuk menambahkan.</div>
                      ) : (
                        points.map((p, i) => ({ point: p, name: pointNames[i] || 'Mencari...', index: i }))
                          .filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
                          .map((item) => (
                            <div key={item.index} className="flex items-center justify-between bg-[#0f172a] rounded-xl p-2.5 border border-[#334155]/50 shadow-sm transition duration-200">
                               <div className="flex items-center gap-2.5 overflow-hidden">
                                  <div className="flex items-center justify-center bg-[#334155] text-white text-[9px] font-black rounded-full min-w-[20px] h-[20px]">
                                     {item.index + 1}
                                  </div>
                                  <div className="text-xs font-medium text-[#e2e8f0] truncate">{item.name}</div>
                               </div>
                               <button 
                                  onClick={() => handleRemoveSpecificPoint(item.index)} 
                                  className="text-[#94a3b8] hover:text-[#f43f5e] hover:bg-[#f43f5e]/10 p-1.5 rounded-lg transition-all"
                                  title="Hapus Titik"
                               >
                                  <Trash2 size={14} />
                               </button>
                            </div>
                          ))
                      )}
                      
                      {points.length > 0 && points.filter((_, i) => (pointNames[i] || '').toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                        <div className="text-center text-[#64748b] text-xs py-3">Lokasi tidak ditemukan.</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showCustomizer && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden flex flex-col gap-4 py-2 border-t border-[#334155]/50"
                  >
                    {/* Map Style Selector */}
                    <div className="flex flex-col gap-2">
                      <div className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider">Gaya Peta</div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[
                          { id: 'voyager', label: 'Default' },
                          { id: 'satellite', label: 'Satelit' },
                          { id: 'hybrid', label: 'Hybrid' },
                          { id: 'topography', label: 'Topo' },
                          { id: 'dark', label: 'Gelap' }
                        ].map(style => (
                          <button
                            key={style.id}
                            onClick={() => setMapStyle(style.id)}
                            className={`py-1.5 px-1 rounded-lg text-[9px] font-bold border transition-all ${
                              mapStyle === style.id 
                                ? 'bg-white text-[#0f172a] border-white' 
                                : 'bg-[#0f172a] text-[#94a3b8] border-[#334155] hover:border-[#475569]'
                            }`}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color Selector */}
                    <div className="flex flex-col gap-2">
                      <div className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider">Warna Rute</div>
                      <div className="flex gap-2.5">
                        {[
                          { val: '#3b82f6', label: 'Blue' },
                          { val: '#10b981', label: 'Green' },
                          { val: '#f43f5e', label: 'Rose' },
                          { val: '#f59e0b', label: 'Amber' },
                          { val: '#8b5cf6', label: 'Violet' },
                          { val: '#06b6d4', label: 'Cyan' }
                        ].map(color => (
                          <button
                            key={color.val}
                            onClick={() => setRouteColor(color.val)}
                            className={`w-7 h-7 rounded-full border-2 transition-all ${
                              routeColor === color.val ? 'border-white scale-110' : 'border-transparent opacity-80'
                            }`}
                            style={{ backgroundColor: color.val }}
                            title={color.label}
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => { setVehicle('motorcycle'); setSpeed(80); }}
                  className={`py-2 rounded-[10px] flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-all border ${
                    vehicle === 'motorcycle' ? 'bg-[#3b82f6]/15 border-[#3b82f6] text-[#3b82f6]' : 'bg-[#334155] border-transparent text-[#94a3b8] hover:text-[#f8fafc]'
                  }`}
                >
                  <Bike size={14} /> Motor
                </button>
                <button
                  onClick={() => { setVehicle('walking'); setSpeed(30); }}
                  className={`py-2 rounded-[10px] flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-all border ${
                    vehicle === 'walking' ? 'bg-[#10b981]/15 border-[#10b981] text-[#10b981]' : 'bg-[#334155] border-transparent text-[#94a3b8] hover:text-[#f8fafc]'
                  }`}
                >
                  <Footprints size={14} /> Jalan
                </button>
                <button
                  onClick={() => setIs3D(!is3D)}
                  className={`py-2 rounded-[10px] flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-all border ${
                    is3D ? 'bg-indigo-500/15 border-indigo-500 text-indigo-400' : 'bg-[#334155] border-transparent text-[#94a3b8] hover:text-[#f8fafc]'
                  }`}
                >
                  <Layers size={14} /> 3D View
                </button>
              </div>

              <div className="flex flex-col gap-2 px-1">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-[0.1em]">
                  <span className="text-[#94a3b8]">Kecepatan</span>
                  <div className="flex items-center gap-1">
                    <input 
                      type="number" 
                      value={speed} 
                      onChange={(e) => setSpeed(Number(e.target.value) || 1)}
                      className="bg-[#0f172a] text-[#3b82f6] px-2 py-0.5 w-14 rounded border border-[#334155] text-right focus:outline-none focus:border-[#3b82f6] transition-colors"
                      min="1"
                      max="1000"
                    />
                    <span className="text-[#3b82f6] font-semibold">%</span>
                  </div>
                </div>
                <div className="relative flex items-center h-2 mt-1">
                  <input 
                    type="range" 
                    min="1" 
                    max="300" 
                    value={speed} 
                    onChange={(e) => setSpeed(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#0f172a] rounded-full appearance-none cursor-pointer outline-none relative z-10 custom-range-slider"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #8b5cf6 ${Math.min(100, Math.max(0, (speed - 1) / 299 * 100))}%, #0f172a ${Math.min(100, Math.max(0, (speed - 1) / 299 * 100))}%, #0f172a 100%)`
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-[auto_auto_1fr] gap-2 mt-1">
                <button 
                  onClick={popLastPoint}
                  disabled={points.length === 0}
                  className="p-3 bg-[#334155] text-[#94a3b8] border border-transparent rounded-xl hover:bg-[#475569] hover:text-[#f8fafc] disabled:opacity-50 transition"
                  title="Urungkan"
                >
                  <RotateCcw size={18} />
                </button>
                <button 
                  onClick={handleClear}
                  disabled={points.length === 0}
                  className="p-3 bg-[#334155] text-red-400 border border-transparent rounded-xl hover:bg-[#475569] hover:text-red-300 disabled:opacity-50 transition"
                  title="Hapus Semua"
                >
                  <Trash2 size={18} />
                </button>

                <div className="flex rounded-xl overflow-hidden shadow-lg" style={{ boxShadow: `0 0 20px ${routeColor}44` }}>
                  <button
                    onClick={handlePlay}
                    disabled={points.length < 2}
                    className="flex-1 py-3 text-white font-bold disabled:bg-[#334155] disabled:text-[#94a3b8] transition-all flex items-center justify-center gap-2 text-sm border-r border-black/10"
                    style={{ backgroundColor: points.length < 2 ? undefined : routeColor }}
                    title="Mulai Animasi"
                  >
                    <Play fill="currentColor" size={16} />
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={points.length < 2}
                    className="px-4 text-white font-bold disabled:bg-[#334155] disabled:text-[#94a3b8] transition-all flex items-center justify-center gap-2 text-sm"
                    style={{ backgroundColor: points.length < 2 ? undefined : routeColor }}
                    title="Rekam Video & Mulai"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

      </div>
    </div>
  );
}
