import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_WALLPAPER } from '../../../services/wallpaperService';

export default function WallpaperPanel({
  open,
  onClose,
  presets = [],
  value = DEFAULT_WALLPAPER,
  onChange,
  onSave,
  onReset,
  onUpload,
  saving
}) {
  const [draft, setDraft] = useState(value);
  const [customUrl, setCustomUrl] = useState(value.imageUrl || '');
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);

  // Sync prop value to draft
  useEffect(() => {
    setDraft(value);
    setCustomUrl(value.imageUrl || '');
  }, [value]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  const updateDraft = (updates) => {
    const next = { ...draft, ...updates };
    setDraft(next);
    if (onChange) onChange(next);
  };

  const getPreviewStyle = () => {
    const bg = draft.sourceType === 'preset'
      ? presets.find(p => p.key === draft.presetKey)?.value
      : draft.imageUrl;

    // Handle gradient vs url
    const isGradient = bg?.startsWith('linear-gradient') || bg?.startsWith('radial-gradient');
    const backgroundImage = isGradient ? bg : `url(${bg})`;

    return {
      backgroundImage: backgroundImage || 'none',
      backgroundColor: '#0f172a',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      filter: `blur(${draft.blur || 0}px)`,
      opacity: draft.opacity ?? 0.95
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        ref={panelRef}
        className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[85vh] md:h-[600px]"
      >
        {/* Left: Controls & Grid */}
        <div className="flex-1 flex flex-col min-h-0 bg-gray-900/50">
          <div className="p-5 border-b border-gray-800 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-white">Choose Wallpaper</h2>
              <p className="text-xs text-gray-400 mt-1">Personalize your chat background</p>
            </div>
            {/* Mobile Close Button */}
            <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Default/None */}
              <button
                onClick={() => updateDraft(DEFAULT_WALLPAPER)}
                className={`relative aspect-[3/4] rounded-xl border-2 overflow-hidden transition-all group ${draft.sourceType === 'default' ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-gray-800 hover:border-gray-700'
                  }`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                  <span className="text-gray-400 text-sm font-medium">Default</span>
                </div>
              </button>

              {/* Upload Tile */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                className="relative aspect-[3/4] rounded-xl border-2 border-dashed border-gray-700 hover:border-gray-500 hover:bg-gray-800/50 transition-all flex flex-col items-center justify-center gap-2 group"
              >
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-primary-500/20 group-hover:text-primary-400 transition-colors">
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                </div>
                <span className="text-xs text-gray-400 font-medium">{saving ? 'Uploading...' : 'Upload'}</span>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && onUpload) onUpload(file);
                }} />
              </button>

              {/* Presets */}
              {presets.map((preset) => {
                const isActive = draft.sourceType === 'preset' && draft.presetKey === preset.key;
                return (
                  <button
                    key={preset.key}
                    onClick={() => updateDraft({ sourceType: 'preset', presetKey: preset.key, imageUrl: preset.value })}
                    className={`relative aspect-[3/4] rounded-xl border-2 overflow-hidden transition-all group ${isActive ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-transparent hover:border-gray-700'
                      }`}
                  >
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform group-hover:scale-110 duration-500"
                      style={{ background: preset.value }}
                    />
                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-xs text-white font-medium truncate">{preset.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* URL Input Section */}
            <div className="mt-6 pt-6 border-t border-gray-800">
              <label className="text-xs text-gray-400 font-medium ml-1">Or paste an image URL</label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  placeholder="https://example.com/image.png"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="flex-1 h-10 bg-gray-950 border border-gray-800 text-sm rounded-xl px-4 text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all placeholder:text-gray-600"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customUrl.trim()) {
                      updateDraft({ sourceType: 'custom', imageUrl: customUrl.trim() });
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (customUrl.trim()) updateDraft({ sourceType: 'custom', imageUrl: customUrl.trim() });
                  }}
                  disabled={!customUrl.trim()}
                  className="h-10 px-5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Use
                </button>
              </div>
            </div>
          </div>

          {/* Sliders Area */}
          <div className="p-5 border-t border-gray-800 bg-gray-900/80 backdrop-blur">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Blur</span>
                  <span className="text-white">{draft.blur || 0}px</span>
                </div>
                <input
                  type="range" min="0" max="20" value={draft.blur || 0}
                  onChange={(e) => updateDraft({ blur: Number(e.target.value) })}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Dimming</span>
                  <span className="text-white">{Math.round((1 - (draft.opacity ?? 1)) * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="0.8" step="0.05"
                  value={1 - (draft.opacity ?? 1)}
                  onChange={(e) => updateDraft({ opacity: 1 - Number(e.target.value) })}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Preview (Desktop Only) */}
        <div className="hidden md:flex w-[380px] bg-black relative flex-col border-l border-gray-800">
          <div className="flex-1 relative overflow-hidden">
            {/* Mock Chat Interface */}
            <div className="absolute inset-0 transition-all duration-300" style={getPreviewStyle()} />
            <div className="absolute inset-0 bg-black/10" /> {/* Simulate overlay */}

            <div className="absolute inset-0 flex flex-col justify-end p-6 space-y-4">
              <div className="self-start bg-gray-800/80 backdrop-blur-md text-white px-4 py-2 rounded-2xl rounded-tl-none max-w-[80%] text-sm shadow-sm">
                Hey, how do you like this wallpaper?
              </div>
              <div className="self-end bg-primary-600 text-white px-4 py-2 rounded-2xl rounded-tr-none max-w-[80%] text-sm shadow-sm">
                It looks amazing! So clean. ✨
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-gray-800 bg-gray-900 flex justify-between items-center">
            <button
              onClick={onClose}
              className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave?.(draft)}
              disabled={saving}
              className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-full shadow-lg shadow-primary-900/20 transition-all transform hover:scale-105"
            >
              {saving ? 'Saving...' : 'Set Wallpaper'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
