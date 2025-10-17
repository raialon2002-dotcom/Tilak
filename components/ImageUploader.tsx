import React, { useState, useCallback } from 'react';
import type { UploadedImage } from '../types';
import { UploadIcon, CloseIcon } from './icons';

interface ImageUploaderProps {
  onImagesUpload: (images: UploadedImage[]) => void;
  disabled: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesUpload, disabled }) => {
  const [images, setImages] = useState<UploadedImage[]>([]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newImages: UploadedImage[] = [];
    const promises: Promise<void>[] = [];

    // FIX: Replaced `for...of` with a standard `for` loop to correctly infer the type of `file` from the FileList.
    // This resolves issues where `file` was being typed as `unknown`.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const promise = new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === 'string') {
            newImages.push({
              id: `${file.name}-${Date.now()}`,
              file,
              base64Src: e.target.result,
            });
            resolve();
          } else {
            reject(new Error("Failed to read file"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      promises.push(promise);
    }
    
    Promise.all(promises).then(() => {
        const allImages = [...images, ...newImages];
        setImages(allImages);
        onImagesUpload(allImages);
    });

  }, [images, onImagesUpload]);

  const removeImage = (idToRemove: string) => {
    const filteredImages = images.filter(img => img.id !== idToRemove);
    setImages(filteredImages);
    onImagesUpload(filteredImages);
  };

  return (
    <div className="w-full p-4 md:p-6 bg-gray-800 border-2 border-dashed border-gray-600 rounded-xl transition-all duration-300 hover:border-cyan-400">
      <div className="flex flex-col items-center justify-center">
        <label htmlFor="file-upload" className={`cursor-pointer flex flex-col items-center justify-center text-gray-400 hover:text-cyan-300 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <UploadIcon className="w-12 h-12 mb-2" />
          <span className="font-semibold">अपलोड करने के लिए क्लिक करें या खींचें और छोड़ें</span>
          <span className="text-sm">पीएनजी, जेपीजी, या वेबपी</span>
        </label>
        <input 
          id="file-upload" 
          type="file" 
          multiple 
          accept="image/png, image/jpeg, image/webp" 
          className="hidden" 
          onChange={handleFileChange}
          disabled={disabled}
        />
      </div>
      {images.length > 0 && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {images.map((image, index) => (
            <div key={image.id} className="relative group aspect-square">
              <span className="absolute -top-2 -left-2 z-10 bg-cyan-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">{index + 1}</span>
              <img src={image.base64Src} alt={`upload-preview-${index}`} className="w-full h-full object-cover rounded-lg shadow-md" />
              <button 
                onClick={() => !disabled && removeImage(image.id)}
                className={`absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity ${disabled ? 'cursor-not-allowed' : 'hover:bg-red-500'}`}
                disabled={disabled}
                aria-label="Remove image"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ImageUploader;