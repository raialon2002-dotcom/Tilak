
import React, { useState, useEffect, useRef } from 'react';
import type { Scene } from '../types';
import { CloseIcon, PlayIcon } from './icons';

interface VideoPreviewerProps {
  scenes: Scene[];
  isOpen: boolean;
  onClose: () => void;
}

const VideoPreviewer: React.FC<VideoPreviewerProps> = ({ scenes, isOpen, onClose }) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen && scenes.length > 0) {
      setCurrentSceneIndex(0);
      playScene(0);
    } else {
      stopPlayback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scenes]);
  
  const playScene = (index: number) => {
    if (index >= scenes.length) {
      // End of scenes, reset to beginning
      setCurrentSceneIndex(0);
      return;
    }
    
    setCurrentSceneIndex(index);
    const scene = scenes[index];

    if (audioRef.current) {
        // Use a key to force re-render of audio element for new src
        audioRef.current.src = scene.audioSrc;
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
    }
    
    // Clear previous timeout if it exists
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = window.setTimeout(() => {
      playScene(index + 1);
    }, scene.duration * 1000);
  };
  
  const stopPlayback = () => {
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const handleClose = () => {
    stopPlayback();
    onClose();
  };
  
  if (!isOpen) return null;
  
  const currentScene = scenes[currentSceneIndex];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-md">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-4xl aspect-video relative flex flex-col overflow-hidden">
        <button onClick={handleClose} className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full hover:bg-red-500 z-20">
          <CloseIcon className="w-6 h-6" />
        </button>
        
        {currentScene && (
          <>
            <img 
              key={currentScene.id}
              src={currentScene.imageSrc} 
              alt={`Scene ${currentSceneIndex + 1}`} 
              className="absolute inset-0 w-full h-full object-cover animate-fade-in"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
            <div className="relative mt-auto p-8 text-white z-10">
              <p className="text-xl md:text-3xl font-serif italic animate-slide-up">
                "{currentScene.script}"
              </p>
            </div>
            <audio ref={audioRef} hidden />
          </>
        )}
      </div>
      <style>{`
        @keyframes fade-in {
          from { opacity: 0.8; transform: scale(1.02); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }

        @keyframes slide-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.5s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default VideoPreviewer;
