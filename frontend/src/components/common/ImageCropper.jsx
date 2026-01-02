import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css'; // Import CSS

// Helper to center the crop initially
function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
    return centerCrop(
        makeAspectCrop(
            {
                unit: '%',
                width: 90,
            },
            aspect,
            mediaWidth,
            mediaHeight,
        ),
        mediaWidth,
        mediaHeight,
    );
}

// Canvas helper
async function canvasPreview(image, crop, scale = 1, rotate = 0) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('No 2d context');
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    // Device/Screen pixel ratio
    const pixelRatio = window.devicePixelRatio;

    canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
    canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

    ctx.scale(pixelRatio, pixelRatio);
    ctx.imageSmoothingQuality = 'high';

    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;

    const centerX = image.naturalWidth / 2;
    const centerY = image.naturalHeight / 2;

    ctx.save();

    // 5) Move the crop origin to the canvas origin (0,0)
    ctx.translate(-cropX, -cropY);
    ctx.translate(centerX, centerY);
    ctx.translate(-centerX, -centerY);

    ctx.drawImage(
        image,
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
    );

    ctx.restore();

    // Return as data URL
    return canvas.toDataURL('image/jpeg', 0.9);
}

export default function ImageCropper({ image, onCancel, onCropComplete, aspect = undefined, open = false }) {
    const [crop, setCrop] = useState();
    const [completedCrop, setCompletedCrop] = useState();
    const imgRef = useRef(null);
    const [loading, setLoading] = useState(false);

    // Initial center crop when image loads
    function onImageLoad(e) {
        const { width, height } = e.currentTarget;
        setCrop(centerAspectCrop(width, height, aspect));
    }

    const handleSave = async () => {
        if (!completedCrop || !imgRef.current) return;

        try {
            setLoading(true);
            const croppedImage = await canvasPreview(imgRef.current, completedCrop);
            onCropComplete(croppedImage);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col">
            <div className="flex justify-between items-center p-4 z-10 bg-black/50 backdrop-blur-sm">
                <h3 className="text-white font-semibold">Crop Image</h3>
                <button onClick={onCancel} className="text-gray-300 hover:text-white p-2 text-sm">
                    Cancel
                </button>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-black">
                <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={aspect}
                    className="max-h-[80vh]"
                >
                    <img
                        ref={imgRef}
                        src={image}
                        alt="Crop me"
                        onLoad={onImageLoad}
                        style={{ maxHeight: '70vh', maxWidth: '100%', objectFit: 'contain' }}
                        crossOrigin="anonymous"
                    />
                </ReactCrop>
            </div>

            <div className="p-6 bg-gray-900 border-t border-gray-800 safe-area-bottom">
                <p className="text-xs text-center text-gray-500 mb-4">Drag corners to resize</p>
                <button
                    onClick={handleSave}
                    disabled={loading || !completedCrop}
                    className="w-full py-3 bg-white text-black font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                >
                    {loading ? 'Processing...' : 'Set Wallpaper'}
                </button>
            </div>
        </div>
    );
}
