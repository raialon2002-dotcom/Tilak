import React, { useRef, useState } from 'react';
import type { Scene } from '../types';
import { PlayIcon } from './icons';

interface SceneCardProps {
  scene: Scene;
  sceneNumber: number;
  onScriptChange: (newScript: string) => void;
}

const SceneCard: React.FC<SceneCardProps> = ({ scene, sceneNumber, onScriptChange }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const isEditable = !scene.audioSrc;

  const playAudio = () => {
    if (audioRef.current) {
        audioRef.current.play();
        setIsPlaying(true);
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden shadow-lg flex flex-col md:flex-row gap-4 p-4 border border-gray-700">
      <div className="relative md:w-1/3 flex-shrink-0">
        <img src={scene.imageSrc} alt={`Scene ${sceneNumber}`} className="w-full h-48 md:h-full object-cover rounded-lg" />
        <div className="absolute top-2 left-2 bg-black/60 text-white text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center backdrop-blur-sm">
            {sceneNumber}
        </div>
      </div>
      <div className="flex flex-col justify-between md:w-2/3">
        {isEditable ? (
            <textarea
                value={scene.script}
                onChange={(e) => onScriptChange(e.target.value)}
                className="w-full h-32 bg-gray-700 text-gray-200 p-3 rounded-lg border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition"
                aria-label={`Script for scene ${sceneNumber}`}
            />
        ) : (
             <p className="text-gray-300 italic">" {scene.script} "</p>
        )}

        {scene.audioSrc && typeof scene.duration === 'number' && (
            <div className="flex items-center gap-4 mt-4 bg-gray-700/50 p-3 rounded-lg">
                <button onClick={playAudio} className="p-2 bg-cyan-500 rounded-full text-white hover:bg-cyan-400 transition-colors disabled:opacity-50" disabled={isPlaying}>
                    <PlayIcon className="w-6 h-6" />
                </button>
                <div className="text-sm">
                    <p className="font-semibold text-gray-200">वॉयस-ओवर</p>
                    <p className="text-gray-400">अवधि: {scene.duration.toFixed(2)}s</p>
                </div>
              <audio ref={audioRef} src={scene.audioSrc} onEnded={() => setIsPlaying(false)} hidden />
            </div>
        )}
      </div>
    </div>
  );
};

export default SceneCard;