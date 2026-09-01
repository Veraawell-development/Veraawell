import React, { useState } from 'react';
import toast from 'react-hot-toast';
import ImageCropModal from './ImageCropModal';
import { useImageUploadWithCrop } from '../hooks/useImageUploadWithCrop';

interface BannerImageUploadProps {
    currentImage?: string;
    onImageUpdate: (imageUrl: string) => void;
    onImageRemove?: () => void;
    defaultImage?: string;
}

const BannerImageUpload: React.FC<BannerImageUploadProps> = ({
    currentImage,
    onImageUpdate,
    onImageRemove,
    defaultImage = '/profile-bg.svg'
}) => {
    const [imageError, setImageError] = useState(false);
    const {
        selectedFile,
        isUploading,
        isCropModalOpen,
        fileInputRef,
        handleFileSelect,
        handleCropComplete: uploadCroppedImage,
        handleClick,
        handleCloseCropModal
    } = useImageUploadWithCrop('/upload/banner-image', 'banner', onImageUpdate);

    const handleCropComplete = (croppedImage: Blob) => uploadCroppedImage(croppedImage, 'Banner image uploaded successfully!');

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering upload
        if (window.confirm('Remove banner image? You will use the default background instead.')) {
            onImageRemove?.();
            toast('Banner image removed');
        }
    };

    const hasUploadedImage = currentImage && currentImage.trim() !== '' && !currentImage.includes('profile-bg.svg');
    const imageSrc = hasUploadedImage ? currentImage : defaultImage;

    return (
        <>
            <div className="flex flex-col mb-6">
                <div className="relative group w-full h-32 sm:h-48 rounded-xl overflow-hidden bg-gray-50 border border-gray-200">
                    {!imageError ? (
                        <img
                            key={imageSrc}
                            src={imageSrc}
                            alt="Banner"
                            className="w-full h-full object-cover transition-opacity duration-300"
                            style={{ opacity: isUploading ? 0.5 : 1 }}
                            onError={() => {
                                console.error('[IMAGE] Failed to load banner:', imageSrc);
                                setImageError(true);
                            }}
                            onLoad={() => {
                                setImageError(false);
                            }}
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                            <svg className="w-8 h-8 mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Failed to load banner</span>
                        </div>
                    )}

                    {/* Loading Overlay */}
                    {isUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                                <span className="mt-2 text-sm font-semibold text-teal-700" style={{ fontFamily: 'Inter, sans-serif' }}>Uploading...</span>
                            </div>
                        </div>
                    )}

                    {/* Hover Overlay */}
                    <div 
                        className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-all duration-300 flex items-center justify-center gap-4 ${isUploading ? 'hidden' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                        <button
                            type="button"
                            onClick={handleClick}
                            className="p-3 bg-white text-gray-800 rounded-full hover:scale-105 hover:bg-gray-50 transition-all shadow-lg"
                            title="Update banner"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>

                        {hasUploadedImage && (
                            <button
                                type="button"
                                onClick={handleRemove}
                                className="p-3 bg-red-50 text-red-600 rounded-full hover:scale-105 hover:bg-red-100 transition-all shadow-lg"
                                title="Remove banner"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Hidden File Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*"
                    className="hidden"
                />
            </div>

            {/* Crop Modal */}
            {selectedFile && (
                <ImageCropModal
                    isOpen={isCropModalOpen}
                    imageSrc={selectedFile}
                    onClose={handleCloseCropModal}
                    onCropComplete={handleCropComplete}
                    aspect={4 / 1}
                    cropShape="rect"
                />
            )}
        </>
    );
};

export default BannerImageUpload;
