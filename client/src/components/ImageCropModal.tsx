import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';

// Define Area type inline since react-easy-crop doesn't export types separately
type Area = {
    x: number;
    y: number;
    width: number;
    height: number;
};

interface ImageCropModalProps {
    isOpen: boolean;
    imageSrc: string;
    onClose: () => void;
    onCropComplete: (croppedImage: Blob) => void;
}

const ImageCropModal: React.FC<ImageCropModalProps> = ({
    isOpen,
    imageSrc,
    onClose,
    onCropComplete
}) => {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const onCropChange = useCallback((crop: { x: number; y: number }) => {
        setCrop(crop);
    }, []);

    const onZoomChange = useCallback((zoom: number) => {
        setZoom(zoom);
    }, []);

    const onCropCompleteCallback = useCallback(
        (_croppedArea: Area, croppedAreaPixels: Area) => {
            setCroppedAreaPixels(croppedAreaPixels);
        },
        []
    );

    const createImage = (url: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
            const image = new Image();
            image.addEventListener('load', () => resolve(image));
            image.addEventListener('error', (error) => reject(error));
            image.src = url;
        });

    const getCroppedImg = async (
        imageSrc: string,
        pixelCrop: Area
    ): Promise<Blob> => {
        const image = await createImage(imageSrc);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('No 2d context');
        }

        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;

        ctx.drawImage(
            image,
            pixelCrop.x,
            pixelCrop.y,
            pixelCrop.width,
            pixelCrop.height,
            0,
            0,
            pixelCrop.width,
            pixelCrop.height
        );

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Canvas is empty'));
                }
            }, 'image/jpeg', 0.9);
        });
    };

    const handleUpload = async () => {
        if (!croppedAreaPixels) return;

        setIsProcessing(true);
        try {
            const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
            onCropComplete(croppedImage);
        } catch (error) {
            console.error('Error cropping image:', error);
            alert('Failed to process image. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
            }}
        >
            <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Crop Your Photo
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Crop Area */}
                <div className="relative h-96 bg-gray-900">
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={onCropChange}
                        onZoomChange={onZoomChange}
                        onCropComplete={onCropCompleteCallback}
                    />
                </div>

                {/* Controls */}
                <div className="px-6 py-4 bg-gray-50">
                    {/* Zoom Slider */}
                    <div className="mb-4">
                        <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Zoom
                        </label>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.1}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            style={{
                                background: `linear-gradient(to right, #0093AE 0%, #0093AE ${((zoom - 1) / 2) * 100}%, #E5E7EB ${((zoom - 1) / 2) * 100}%, #E5E7EB 100%)`
                            }}
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            <span>1x</span>
                            <span>3x</span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                            disabled={isProcessing}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={isProcessing}
                            className="flex-1 px-4 py-3 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: '#0093AE', fontFamily: 'Inter, sans-serif' }}
                        >
                            {isProcessing ? 'Processing...' : 'Upload Photo'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageCropModal;
