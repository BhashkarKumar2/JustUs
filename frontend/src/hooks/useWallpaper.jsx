import { useState, useEffect } from 'react';
import { buildWallpaperUrl, DEFAULT_WALLPAPER, fetchWallpaper } from '../services/wallpaperService';

const WALLPAPER_PRESETS = [
    { key: 'aurora', label: 'Aurora Mist', value: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)' },
    { key: 'sunset', label: 'Sunset Bloom', value: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
    { key: 'noir', label: 'Noir Grid', value: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0b1220 100%)' },
    { key: 'waves', label: 'Pacific Waves', value: 'linear-gradient(135deg, #74ebd5 0%, #9face6 100%)' },
    { key: 'dune', label: 'Desert Dusk', value: 'linear-gradient(135deg, #f8fafc 0%, #fee2e2 45%, #fef3c7 100%)' },
    { key: 'forest', label: 'Evergreen', value: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 50%, #22c55e 100%)' },
    { key: 'midnight', label: 'Midnight Blue', value: '#0F172A' },
    { key: 'charcoal', label: 'Deep Charcoal', value: '#18181B' },
    { key: 'slate', label: 'Slate Grey', value: '#334155' },
    { key: 'black', label: 'Pure Black', value: '#000000' }
];

export default function useWallpaper(conversationId) {
    const [wallpaperSettings, setWallpaperSettings] = useState(DEFAULT_WALLPAPER);
    const [wallpaperPreview, setWallpaperPreview] = useState(DEFAULT_WALLPAPER);
    const [wallpaperPanelOpen, setWallpaperPanelOpen] = useState(false);
    const [resolvedWallpaperUrl, setResolvedWallpaperUrl] = useState('');

    // Load wallpaper when conversation changes
    useEffect(() => {
        const loadWallpaper = async () => {
            if (!conversationId) return;
            try {
                const settings = await fetchWallpaper(conversationId);
                const hydrated = { ...DEFAULT_WALLPAPER, ...(settings || {}) };
                setWallpaperSettings(hydrated);
                setWallpaperPreview(hydrated);
            } catch (err) {
                console.error('Failed to load wallpaper', err);
            }
        };
        loadWallpaper();
    }, [conversationId]);

    // Resolve wallpaper URL (handles blobs/presets)
    useEffect(() => {
        const resolveWallpaper = async () => {
            const activePreset = WALLPAPER_PRESETS.find(p => p.key === wallpaperPreview.presetKey);
            const rawWallpaper = wallpaperPreview.sourceType === 'preset'
                ? activePreset?.value || ''
                : wallpaperPreview.imageUrl;

            if (wallpaperPreview.sourceType === 'none' || !rawWallpaper) {
                setResolvedWallpaperUrl('');
                return;
            }

            try {
                const resolved = await buildWallpaperUrl(rawWallpaper);
                setResolvedWallpaperUrl(resolved || '');
            } catch (err) {
                console.error('Failed to resolve wallpaper URL', err);
                setResolvedWallpaperUrl('');
            }
        };
        resolveWallpaper();
    }, [wallpaperPreview]);

    const openWallpaperPanel = () => {
        setWallpaperPreview(wallpaperSettings);
        setWallpaperPanelOpen(true);
    };

    const closeWallpaperPanel = () => {
        setWallpaperPanelOpen(false);
    };

    return {
        wallpaperSettings,
        setWallpaperSettings,
        wallpaperPreview,
        setWallpaperPreview,
        wallpaperPanelOpen,
        openWallpaperPanel,
        closeWallpaperPanel,
        resolvedWallpaperUrl,
        presets: WALLPAPER_PRESETS
    };
}
