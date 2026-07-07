import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';

interface ImageUploadProps {
    value: string;
    onChange: (url: string) => void;
    onUpload: (file: File) => Promise<string>;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ value, onChange, onUpload }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        setError(null);

        const file = e.dataTransfer.files[0];
        if (file) {
            await processFile(file);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await processFile(file);
        }
    };

    const processFile = async (file: File) => {
        // Validate type
        if (!file.type.startsWith('image/')) {
            setError('Please upload an image file');
            return;
        }

        // Validate size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            setError('Image must be less than 5MB');
            return;
        }

        try {
            setUploading(true);
            const url = await onUpload(file);
            onChange(url);
        } catch (err: any) {
            setError(err.message || 'Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    const clearImage = () => {
        onChange('');
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="w-full">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
            />

            {value ? (
                <div className="relative group rounded-xl overflow-hidden border border-gray-200 aspect-video bg-gray-50 shadow-sm">
                    <img
                        src={value}
                        alt="Article preview"
                        className={`w-full h-full object-cover transition-opacity duration-300 ${uploading ? 'opacity-30 blur-sm' : ''}`}
                    />
                    
                    {uploading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                            <Loader2 className="w-10 h-10 text-[#0097b2] animate-spin mb-2 drop-shadow-md" />
                            <p className="text-sm font-semibold text-neutral-800 drop-shadow-md">Uploading...</p>
                        </div>
                    )}

                    {!uploading && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                            <button
                                onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
                                className="p-2.5 bg-white/20 hover:bg-white/40 text-white rounded-xl backdrop-blur-md transition-all hover:scale-105 shadow-sm"
                                title="Change Image"
                            >
                                <Upload className="w-5 h-5" />
                            </button>
                            <button
                                onClick={(e) => { e.preventDefault(); clearImage(); }}
                                className="p-2.5 bg-red-500/80 hover:bg-red-600 text-white rounded-xl backdrop-blur-md transition-all hover:scale-105 shadow-sm"
                                title="Remove Image"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                        relative flex flex-col items-center justify-center aspect-video rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer shadow-sm
                        ${isDragging
                            ? 'border-[#0097b2] bg-[#0097b2]/5 scale-[0.98]'
                            : 'border-neutral-300 hover:border-[#0097b2] hover:bg-neutral-50'
                        }
                        ${uploading ? 'pointer-events-none opacity-80' : ''}
                    `}
                >
                    {uploading ? (
                        <div className="text-center">
                            <Loader2 className="w-10 h-10 text-[#0097b2] animate-spin mx-auto mb-2" />
                            <p className="text-sm font-medium text-neutral-500">Uploading...</p>
                        </div>
                    ) : (
                        <div className="text-center p-6 transition-transform group-hover:scale-105">
                            <div className="w-14 h-14 bg-[#0097b2]/10 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors group-hover:bg-[#0097b2]/20">
                                <ImageIcon className="w-7 h-7 text-[#0097b2]" />
                            </div>
                            <p className="text-sm font-semibold text-neutral-800 mb-1">
                                Click or drag image here
                            </p>
                            <p className="text-xs text-neutral-500 font-medium">
                                JPG, PNG, WEBP up to 5MB
                            </p>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                    <X className="w-4 h-4" />
                    {error}
                </p>
            )}
        </div>
    );
};

export default ImageUpload;
