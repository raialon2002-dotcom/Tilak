import React, { useRef, useState } from 'react';
import type { Scene } from '../types';
import { PlayIcon, MagicWandIcon } from './icons';

interface SceneCardProps {
  scene: Scene;
  sceneNumber: number;
  onScriptChange: (newScript: string) => void;
  onGenerateAudio: () => void;
  isGeneratingAudio: boolean;
}

const SceneCard: React.FC<SceneCardProps> = ({ scene, sceneNumber, onScriptChange, onGenerateAudio, isGeneratingAudio }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const isAudioStale = scene.audioSrc && scene.script !== scene.originalScript;

  const playAudio = () => {
    if (audioRef.current) {
        audioRef.current.play();
        setIsPlaying(true);
    }
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-md flex flex-col md:flex-row gap-4 p-4 border border-gray-200">
      <div className="relative md:w-1/3 flex-shrink-0">
        <img src={scene.imageSrc} alt={`Scene ${sceneNumber}`} className="w-full h-48 md:h-full object-cover rounded-lg" />
        <div className="absolute top-2 left-2 bg-black/60 text-white text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center backdrop-blur-sm">
            {sceneNumber}
        </div>
      </div>
      <div className="flex flex-col justify-between md:w-2/3 space-y-3">
         <div className="relative">
             <textarea
                value={scene.script}
                onChange={(e) => onScriptChange(e.target.value)}
                className="w-full h-32 bg-gray-100 text-gray-800 p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                aria-label={`दृश्य ${sceneNumber} के लिए स्क्रिप्ट`}
                disabled={isGeneratingAudio}
            />
            <button 
                onClick={onGenerateAudio}
                disabled={isGeneratingAudio || !scene.script.trim()}
                title={scene.audioSrc ? 'ऑडियो फिर से जेनरेट करें' : 'ऑडियो जेनरेट करें'}
                className={`absolute bottom-3 right-3 p-2 rounded-full text-white transition-all duration-300
                    ${isGeneratingAudio ? 'bg-gray-400' : ''}
                    ${!scene.audioSrc ? 'bg-indigo-600 hover:bg-indigo-500' : ''}
                    ${scene.audioSrc && !isAudioStale ? 'bg-green-600 hover:bg-green-500' : ''}
                    ${isAudioStale ? 'bg-yellow-500 hover:bg-yellow-400 animate-pulse' : ''}
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:animate-none`}
            >
                <MagicWandIcon className="w-5 h-5" />
            </button>
         </div>

        {isGeneratingAudio && (
            <div className="flex items-center justify-center gap-2 h-[68px] bg-gray-100 p-3 rounded-lg">
                <div className="w-5 h-5 border-2 border-dashed rounded-full animate-spin border-indigo-500"></div>
                <span className="text-sm text-indigo-600">ऑडियो जेनरेट हो रहा है...</span>
            </div>
        )}

        {!isGeneratingAudio && scene.audioSrc && typeof scene.duration === 'number' && (
            <div className={`flex items-center gap-4 h-[68px] bg-gray-100 p-3 rounded-lg border ${isAudioStale ? 'border-yellow-500/50' : 'border-transparent'}`}>
                <button onClick={playAudio} className="p-2 bg-indigo-600 rounded-full text-white hover:bg-indigo-500 transition-colors disabled:opacity-50" disabled={isPlaying}>
                    <PlayIcon className="w-6 h-6" />
                </button>
                <div className="text-sm">
                    <p className="font-semibold text-gray-800">
                        {isAudioStale ? 'पुराना वॉयस-ओवर' : 'वॉयस-ओवर'}
                    </p>
                    <p className="text-gray-500">अवधि: {scene.duration.toFixed(2)}s</p>
                </div>
              <audio ref={audioRef} src={scene.audioSrc} onEnded={() => setIsPlaying(false)} hidden />
            </div>
        )}
      </div>
    </div>
  );
};

export default SceneCard;