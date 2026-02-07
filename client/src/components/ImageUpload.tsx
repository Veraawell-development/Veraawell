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
                <div className="relative group rounded-xl overflow-hidden border border-gray-200 aspect-video bg-gray-50">
                    <img
                        src={value}
                        alt="Article preview"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-sm transition-colors"
                            title="Change Image"
                        >
                            <Upload className="w-5 h-5" />
                        </button>
                        <button
                            onClick={clearImage}
                            className="p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg backdrop-blur-sm transition-colors"
                            title="Remove Image"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                        relative flex flex-col items-center justify-center aspect-video rounded-xl border-2 border-dashed transition-all cursor-pointer
                        ${isDragging
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'
                        }
                    `}
                >
                    {uploading ? (
                        <div className="text-center">
                            <Loader2 className="w-10 h-10 text-teal-600 animate-spin mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Uploading...</p>
                        </div>
                    ) : (
                        <div className="text-center p-6">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <ImageIcon className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="text-sm font-medium text-gray-700 mb-1">
                                Click or drag image here
                            </p>
                            <p className="text-xs text-gray-500">
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
