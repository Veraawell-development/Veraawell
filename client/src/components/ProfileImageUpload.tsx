import React, { useState, useRef } from 'react';
import ImageCropModal from './ImageCropModal';
import Toast from './Toast';
import { API_CONFIG } from '../config/api';

interface ProfileImageUploadProps {
    currentImage?: string;
    onImageUpdate: (imageUrl: string) => void;
    onImageRemove?: () => void;
    defaultImage?: string;
}

const ProfileImageUpload: React.FC<ProfileImageUploadProps> = ({
    currentImage,
    onImageUpdate,
    onImageRemove,
    defaultImage = '/male.png'
}) => {
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                setToast({ message: 'Please select an image file', type: 'error' });
                return;
            }

            // Validate file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                setToast({ message: 'Image size should be less than 5MB', type: 'error' });
                return;
            }

            // Read file and open crop modal
            const reader = new FileReader();
            reader.onload = () => {
                setSelectedFile(reader.result as string);
                setIsCropModalOpen(true);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCropComplete = async (croppedImage: Blob) => {
        setIsUploading(true);
        setIsCropModalOpen(false);

        try {
            console.log('[UPLOAD] Starting upload...', { size: croppedImage.size, type: croppedImage.type });

            // Create form data
            const formData = new FormData();
            formData.append('image', croppedImage, 'profile.jpg');

            console.log('[UPLOAD] Sending to:', `${API_CONFIG.BASE_URL}/upload/profile-image`);

            // Upload to server
            const response = await fetch(`${API_CONFIG.BASE_URL}/upload/profile-image`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            console.log('[UPLOAD] Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[UPLOAD] Upload failed:', errorText);
                throw new Error(`Upload failed: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('[UPLOAD] Upload successful!', data);

            // Update parent component with new image URL
            onImageUpdate(data.imageUrl);

            // Reset selected file
            setSelectedFile(null);

            setToast({ message: 'Image uploaded successfully!', type: 'success' });
        } catch (error) {
            console.error('[UPLOAD] Upload error:', error);
            setToast({
                message: `Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error'
            });
        } finally {
            setIsUploading(false);
        }
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering upload
        // Show confirmation via toast
        if (window.confirm('Remove profile image? You will use the default placeholder instead.')) {
            onImageRemove?.();
            setToast({ message: 'Profile image removed', type: 'info' });
        }
    };

    const handleCloseCropModal = () => {
        setIsCropModalOpen(false);
        setSelectedFile(null);
        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Determine which image to display - SIMPLIFIED
    const hasUploadedImage = currentImage &&
        currentImage.trim() !== '' &&
        !currentImage.includes('doctor-0') &&
        !currentImage.includes('doctor-placeholder');

    const imageSrc = hasUploadedImage ? currentImage : defaultImage;

    return (
        <>
            <div className="flex flex-col items-center">
                {/* Image Preview */}
                <div className="relative group">
                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-200 bg-gray-50">
                        {!imageError ? (
                            <img
                                key={imageSrc}
                                src={imageSrc}
                                alt="Profile"
                                className="w-full h-full object-cover"
                                onError={() => {
                                    console.error('[IMAGE] Failed to load:', imageSrc);
                                    setImageError(true);
                                }}
                                onLoad={() => {
                                    console.log('[IMAGE] Loaded successfully:', imageSrc);
                                    setImageError(false);
                                }}
                            />
                        ) : (
                            // Fallback if image fails
                            <div className="w-full h-full flex items-center justify-center bg-gray-200">
                                <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* Remove Button - Only show if image is uploaded */}
                    {hasUploadedImage && (
                        <button
                            type="button"
                            onClick={handleRemove}
                            className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all duration-200 z-10"
                            title="Remove image"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}

                    {/* Upload Overlay */}
                    <button
                        type="button"
                        onClick={handleClick}
                        disabled={isUploading}
                        className="absolute inset-0 rounded-full bg-transparent hover:bg-black hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
                    >
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-white text-center">
                            {isUploading ? (
                                <div className="flex flex-col items-center">
                                    <svg className="animate-spin h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span className="text-xs font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        Uploading...
                                    </span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span className="text-xs font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        Change Photo
                                    </span>
                                </div>
                            )}
                        </div>
                    </button>
                </div>

                {/* Upload Instructions */}
                <p className="mt-3 text-xs text-gray-500 text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Click to upload a new photo
                </p>
            </div>

            {/* Hidden File Input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Crop Modal */}
            {selectedFile && (
                <ImageCropModal
                    isOpen={isCropModalOpen}
                    imageSrc={selectedFile}
                    onClose={handleCloseCropModal}
                    onCropComplete={handleCropComplete}
                />
            )}

            {/* Toast Notification */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </>
    );
};

export default ProfileImageUpload;
