import React, { useEffect, useRef, useState } from 'react';
import ImageCropper from '../../common/ImageCropper';
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

  // Crop state
  const [cropImage, setCropImage] = useState(null);
  const [showCropper, setShowCropper] = useState(false);

  // Sync prop value to draft
  useEffect(() => {
    setDraft(value);
    setCustomUrl(value.imageUrl || '');
  }, [value]);

  // Click outside to close
  useEffect(() => {
    if (!open || showCropper) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose, showCropper]);

  if (!open) return null;

  const updateDraft = (updates) => {
    // If we are setting a custom image url directly (not via crop), just update
    const next = { ...draft, ...updates };
    setDraft(next);
    if (onChange) onChange(next);

    // Auto-save logic mimicking the simplified flow for presets/custom
    if (updates.sourceType === 'preset' || updates.sourceType === 'custom') {
      onSave?.({ ...draft, ...updates });
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Create object URL for cropper
      const url = URL.createObjectURL(file);
      setCropImage(url);
      setShowCropper(true);
    }
    // Reset input
    e.target.value = '';
  };

  const handleCropComplete = (croppedImageUrl) => {
    setShowCropper(false);
    // Use the cropped image data URL directly - acts as immediate set
    updateDraft({ sourceType: 'custom', imageUrl: croppedImageUrl });
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
    <>
      {/* Cropper Modal */}
      <ImageCropper
        open={showCropper}
        image={cropImage}
        onCancel={() => setShowCropper(false)}
        onCropComplete={handleCropComplete}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div
          ref={panelRef}
          className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[70vh] md:h-[500px]"
        >
          {/* Header */}
          <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
            <div>
              <h2 className="text-lg font-bold text-white">Choose Wallpaper</h2>
              <p className="text-xs text-gray-400 mt-1">Select a background for this conversation</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Default/None */}
              <button
                onClick={() => onSave?.(DEFAULT_WALLPAPER)}
                className="relative aspect-[3/4] rounded-xl border-2 border-gray-800 hover:border-gray-700 overflow-hidden transition-all group"
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
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </button>

              {/* Presets */}
              {presets.map((preset) => {
                const isActive = draft.sourceType === 'preset' && draft.presetKey === preset.key;
                return (
                  <button
                    key={preset.key}
                    onClick={() => onSave?.({ sourceType: 'preset', presetKey: preset.key, imageUrl: preset.value })}
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
                      setCropImage(customUrl.trim());
                      setShowCropper(true);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (customUrl.trim()) {
                      setCropImage(customUrl.trim());
                      setShowCropper(true);
                    }
                  }}
                  disabled={!customUrl.trim()}
                  className="h-10 px-5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Use
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
