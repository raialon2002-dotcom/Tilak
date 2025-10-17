import React, { useState } from 'react';
import ImageUploader from './components/ImageUploader';
import SceneCard from './components/SceneCard';
import Loader from './components/Loader';
import VideoPreviewer from './components/VideoPreviewer';
import { MagicWandIcon, PlayIcon, DownloadIcon, PencilIcon } from './components/icons';
import type { UploadedImage, Scene } from './types';
import { generateScriptsForAllImages, generateVoiceOver, processAudio } from './services/geminiService';
import { renderVideo } from './services/videoRenderer';

const App: React.FC = () => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [mainCharacterName, setMainCharacterName] = useState('');
  const [selectedTone, setSelectedTone] = useState('dramatic');

  const availableVoices = [
    { id: 'Kore', name: 'कोर (शांत, कथात्मक)' },
    { id: 'Puck', name: 'पक (उत्साहित, कथावाचक)' },
    { id: 'Charon', name: 'शेरॉन (गहरी, आधिकारिक)' },
    { id: 'Fenrir', name: 'फेनरिर (कर्कश, महाकाव्य)' },
  ];
  
  const availableTones = [
    { id: 'dramatic', name: 'नाटकीय' },
    { id: 'comedic', name: 'हास्य' },
    { id: 'adventurous', name: 'साहसिक' },
    { id: 'mysterious', name: 'रहस्यमय' },
    { id: 'romantic', name: 'रोमांटिक' },
  ];

  const handleImagesUpload = (images: UploadedImage[]) => {
    setUploadedImages(images);
    if (scenes.length > 0) {
      setScenes([]);
    }
  };

  const handleGenerateStory = async () => {
    if (uploadedImages.length === 0) return;

    setIsLoading(true);
    setScenes([]);
    
    try {
      setLoadingMessage(`कहानी और पात्रों का विश्लेषण किया जा रहा है...`);
      const imagePayload = uploadedImages.map(img => ({
        base64Image: img.base64Src.split(',')[1],
        mimeType: img.file.type,
      }));
      
      const scripts = await generateScriptsForAllImages(imagePayload, mainCharacterName, selectedTone);
      
      const generatedScenes: Scene[] = uploadedImages.map((image, i) => ({
          id: image.id,
          imageSrc: image.base64Src,
          script: scripts[i],
      }));
      setScenes(generatedScenes);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "एक अज्ञात त्रुटि हुई।";
      console.error("स्क्रिप्ट बनाने के दौरान एक त्रुटि हुई:", error);
      alert(`कुछ गलत हो गया! कृपया विवरण के लिए कंसोल देखें।\nत्रुटि: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleGenerateVoiceOvers = async () => {
    if (scenes.length === 0) return;

    setIsLoading(true);
    const scenesToProcess = [...scenes];

    try {
      for (let i = 0; i < scenesToProcess.length; i++) {
        const scene = scenesToProcess[i];
        
        setLoadingMessage(`दृश्य ${i + 1} के लिए वॉयस-ओवर बनाया जा रहा है...`);
        const audioBase64 = await generateVoiceOver(scene.script, selectedVoice);
        
        setLoadingMessage(`दृश्य ${i + 1} के लिए ऑडियो संसाधित किया जा रहा है...`);
        const { audioSrc, duration } = await processAudio(audioBase64);

        scenesToProcess[i] = { ...scene, audioSrc, duration };
        setScenes([...scenesToProcess]);
      }
    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : "एक अज्ञात त्रुटि हुई।";
       console.error("वॉयस-ओवर बनाने के दौरान एक त्रुटि हुई:", error);
       alert(`कुछ गलत हो गया! कृपया विवरण के लिए कंसोल देखें।\nत्रुटि: ${errorMessage}`);
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
    }
  };

  const handleScriptChange = (sceneId: string, newScript: string) => {
    setScenes(currentScenes => 
        currentScenes.map(scene => 
            scene.id === sceneId ? { ...scene, script: newScript } : scene
        )
    );
  };

  const handleDownloadVideo = async () => {
    if (scenes.length === 0) return;

    setIsRenderingVideo(true);
    setLoadingMessage("वीडियो रेंडरिंग शुरू हो रही है...");
    try {
      const videoBlob = await renderVideo(scenes as Required<Scene>[], (message) => {
        setLoadingMessage(message);
      });

      setLoadingMessage("डाउनलोड के लिए वीडियो तैयार किया जा रहा है...");
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kahani.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("वीडियो रेंडरिंग के दौरान त्रुटि:", error);
      alert("वीडियो बनाने में विफल। कृपया कंसोल देखें।");
    } finally {
      setIsRenderingVideo(false);
      setLoadingMessage('');
    }
  };


  const handleStartOver = () => {
    setUploadedImages([]);
    setScenes([]);
    setMainCharacterName('');
    setSelectedTone('dramatic');
    setIsVideoPreviewOpen(false);
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  }

  const isBusy = isLoading || isRenderingVideo;
  const isEditingScripts = scenes.length > 0 && !scenes[0]?.audioSrc;
  const isStoryReady = scenes.length > 0 && !!scenes[0]?.audioSrc;

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      <main className="container mx-auto px-4 py-8 md:py-12">
        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">
            एआई स्टोरी सिंक
          </h1>
          <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
            छवियों का एक क्रम अपलोड करें, और एआई को अपनी कहानी को जीवंत करने के लिए एक सिनेमाई स्क्रिप्ट और वॉयस-ओवर बनाने दें।
          </p>
        </header>

        <section className="max-w-4xl mx-auto">
          <ImageUploader onImagesUpload={handleImagesUpload} disabled={isBusy} />

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-center">
             <div className="lg:col-span-3">
                <label htmlFor="mc-name" className="sr-only">मुख्य पात्र का नाम</label>
                <input
                    id="mc-name"
                    type="text"
                    value={mainCharacterName}
                    onChange={(e) => setMainCharacterName(e.target.value)}
                    placeholder="मुख्य पात्र का नाम (वैकल्पिक)"
                    disabled={isBusy || uploadedImages.length === 0}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-3 focus:ring-cyan-500 focus:border-cyan-500 transition disabled:opacity-50"
                />
            </div>
             <div className="w-full">
                <label htmlFor="tone-select" className="sr-only">कहानी का लहजा चुनें</label>
                 <select
                    id="tone-select"
                    value={selectedTone}
                    onChange={(e) => setSelectedTone(e.target.value)}
                    disabled={isBusy || uploadedImages.length === 0}
                    aria-label="कहानी के लिए एक लहजा चुनें"
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-3 focus:ring-cyan-500 focus:border-cyan-500 transition disabled:opacity-50 cursor-pointer hover:bg-gray-600"
                >
                    {availableTones.map(tone => (
                    <option key={tone.id} value={tone.id}>{tone.name}</option>
                    ))}
                </select>
            </div>
            <div className="w-full">
                <label htmlFor="voice-select" className="sr-only">एक आवाज चुनें</label>
                <select
                    id="voice-select"
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    disabled={isBusy || uploadedImages.length === 0}
                    aria-label="कथा के लिए एक आवाज चुनें"
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-3 focus:ring-cyan-500 focus:border-cyan-500 transition disabled:opacity-50 cursor-pointer hover:bg-gray-600"
                >
                    {availableVoices.map(voice => (
                    <option key={voice.id} value={voice.id}>{voice.name}</option>
                    ))}
                </select>
            </div>
            
            {isEditingScripts ? (
                 <button
                    onClick={handleGenerateVoiceOvers}
                    disabled={isBusy || scenes.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-8 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-lg hover:bg-purple-500 transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed transform hover:scale-105 disabled:scale-100"
                    >
                    <PencilIcon className="w-6 h-6" />
                    {isLoading ? 'बनाया जा रहा है...' : 'वॉयस-ओवर बनाएं'}
                </button>
            ) : (
                <button
                    onClick={handleGenerateStory}
                    disabled={isBusy || uploadedImages.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-8 py-3 bg-cyan-500 text-white font-semibold rounded-lg shadow-lg hover:bg-cyan-400 transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed transform hover:scale-105 disabled:scale-100"
                    >
                    <MagicWandIcon className="w-6 h-6" />
                    {isLoading ? 'बनाया जा रहा है...' : 'कहानी बनाएं'}
                </button>
            )}

          </div>
        </section>

        {isBusy && (
          <section className="mt-10">
            <Loader message={loadingMessage} />
          </section>
        )}

        {scenes.length > 0 && !isBusy && (
          <section className="mt-12 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-center sm:text-left">
                    {isEditingScripts ? 'स्क्रिप्ट संपादित करें' : 'निर्मित दृश्य'}
                </h2>
                <div className='flex gap-4 flex-wrap justify-center'>
                    <button
                        onClick={handleStartOver}
                        className="px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors"
                    >
                        फिर से शुरू करें
                    </button>
                    {isStoryReady && (
                        <>
                        <button
                            onClick={() => setIsVideoPreviewOpen(true)}
                            className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow-lg hover:bg-purple-500 transition-all duration-300 transform hover:scale-105"
                        >
                            <PlayIcon className="w-5 h-5" />
                            वीडियो पूर्वावलोकन
                        </button>
                        <button
                            onClick={handleDownloadVideo}
                            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-lg hover:bg-green-500 transition-all duration-300 transform hover:scale-105"
                        >
                            <DownloadIcon className="w-5 h-5" />
                            वीडियो डाउनलोड करें
                        </button>
                        </>
                    )}
                </div>
            </div>
            <div className="space-y-6">
              {scenes.map((scene, index) => (
                <SceneCard 
                    key={scene.id} 
                    scene={scene} 
                    sceneNumber={index + 1}
                    onScriptChange={(newScript) => handleScriptChange(scene.id, newScript)}
                />
              ))}
            </div>
          </section>
        )}

        <VideoPreviewer
          scenes={scenes.every(s => s.audioSrc) ? scenes as Required<Scene>[] : []}
          isOpen={isVideoPreviewOpen}
          onClose={() => setIsVideoPreviewOpen(false)}
        />
      </main>
      <footer className="text-center py-6 text-gray-500 text-sm">
        <p>जेमिनी द्वारा संचालित। <a href="https://www.recapscriptmaker.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-cyan-400">Recap Script Maker</a> द्वारा रचनात्मक कहानी कहने के लिए बनाया गया।</p>
      </footer>
    </div>
  );
};

export default App;