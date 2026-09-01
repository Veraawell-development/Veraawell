import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { API_CONFIG } from '../config/api';

/**
 * Shared upload logic for ProfileImageUpload and BannerImageUpload, which
 * previously duplicated this file-select/validate -> crop -> upload flow
 * almost verbatim, differing only in the endpoint, form-field name, and
 * default image. Also standardizes on react-hot-toast instead of the bespoke
 * Toast component those two were the only users of (a differently
 * positioned/styled notification than the rest of the app).
 */
export function useImageUploadWithCrop(uploadEndpoint: string, fieldName: string, onImageUpdate: (imageUrl: string) => void) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFile(reader.result as string);
      setIsCropModalOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedImage: Blob, successMessage: string) => {
    setIsUploading(true);
    setIsCropModalOpen(false);

    try {
      const formData = new FormData();
      formData.append('image', croppedImage, `${fieldName}.jpg`);

      const response = await fetch(`${API_CONFIG.BASE_URL}${uploadEndpoint}`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      onImageUpdate(data.imageUrl);
      setSelectedFile(null);
      toast.success(successMessage);
    } catch (error) {
      toast.error(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleCloseCropModal = () => {
    setIsCropModalOpen(false);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return {
    selectedFile,
    isUploading,
    isCropModalOpen,
    fileInputRef,
    handleFileSelect,
    handleCropComplete,
    handleClick,
    handleCloseCropModal
  };
}
