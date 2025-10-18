import React, { useState } from 'react';
import ImageUploader from './components/ImageUploader';
import SceneCard from './components/SceneCard';
import Loader from './components/Loader';
import VideoPreviewer from './components/VideoPreviewer';
import { MagicWandIcon, PlayIcon, DownloadIcon, PencilIcon, CloseIcon, FolderIcon, ArrowsUpDownIcon, CropIcon, EyeSlashIcon, DocumentTextIcon } from './components/icons';
import type { UploadedImage, Scene } from './types';
import { generateScriptsForAllImages, generateVoiceOver, processAudio } from './services/geminiService';
import { renderVideo } from './services/videoRenderer';

const DEFAULT_PROMPT = `आप एक विशेषज्ञ मंगा और कॉमिक्स स्क्रिप्ट लेखक हैं। आपका काम इन छवियों को एक आकर्षक कहानी में बदलना है।
नीचे दी गई छवियों का क्रम एक कहानी बताता है। प्रत्येक छवि के लिए, एक विस्तृत, सिनेमाई और आकर्षक स्क्रिप्ट लिखें। केवल यह न बताएं कि क्या हो रहा है, उसे दिखाएं। पात्रों की भावनाओं, किसी भी संवाद और माहौल का स्पष्ट रूप से वर्णन करें। सुनिश्चित करें कि कहानी सुसंगत रूप से आगे बढ़े।

- 'कैमरा एंगल' या 'ज़ूम इन' जैसे सिनेमाई शब्दों से बचें।
- इसे एक कहानी के रूप में लिखें, न कि किसी फिल्मी दृश्य की तरह।
- 'दर्शक,' 'दृश्य बदला,' 'पाठक,' या 'दृष्टिकोण बदला' जैसे शब्दों से बचें - एक कथा शैली में लिखें।
- कोई भी विवरण न छोड़ें। यदि सारांश लंबा हो जाता है तो कोई बात नहीं।
- संवाद उद्धरणों का उपयोग न करें; इसके बजाय, उन्हें कहानी के हिस्से के रूप में सुनाएं।`;

/**
 * Converts an AudioBuffer to a WAV Blob.
 * @param buffer The AudioBuffer to convert.
 * @returns A Blob representing the WAV file.
 */
const audioBufferToWavBlob = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitDepth = 16;
    const format = 1; // PCM

    const pcmData = buffer.getChannelData(0);
    const dataLength = pcmData.length * (bitDepth / 8);
    const bufferLength = 44 + dataLength;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };
    
    let offset = 0;
    
    writeString(offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + dataLength, true); offset += 4;
    writeString(offset, 'WAVE'); offset += 4;
    writeString(offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, format, true); offset += 2;
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numChannels * (bitDepth / 8), true); offset += 4;
    view.setUint16(offset, numChannels * (bitDepth / 8), true); offset += 2;
    view.setUint16(offset, bitDepth, true); offset += 2;
    writeString(offset, 'data'); offset += 4;
    view.setUint32(offset, dataLength, true); offset += 4;
    
    // Write PCM data
    for (let i = 0; i < pcmData.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, pcmData[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    
    return new Blob([view], { type: 'audio/wav' });
};

// Component for the main functional tool
const RecapScriptMakerTool: React.FC = () => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [generatingAudioFor, setGeneratingAudioFor] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [selectedTone, setSelectedTone] = useState('dramatic');
  const [characterDefinitions, setCharacterDefinitions] = useState([{ id: Date.now(), name: '', description: '' }]);
  const [mainPrompt, setMainPrompt] = useState(DEFAULT_PROMPT);

  const availableVoices = [
    { id: 'Kore', name: 'कोर (शांत, कथात्मक)' },
    { id: 'Puck', name: 'पक (उत्साही, कहानीकार)' },
    { id: 'Charon', name: 'शेरॉन (गहरी, आधिकारिक)' },
    { id: 'Fenrir', name: 'फेनरिर (कठोर, महाकाव्य)' },
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
  
  const handleAddCharacter = () => {
    setCharacterDefinitions([...characterDefinitions, { id: Date.now(), name: '', description: '' }]);
  };

  const handleRemoveCharacter = (id: number) => {
    if (characterDefinitions.length > 1) {
      setCharacterDefinitions(characterDefinitions.filter(c => c.id !== id));
    } else {
      setCharacterDefinitions([{ id: Date.now(), name: '', description: '' }]);
    }
  };
  
  const handleCharacterChange = (id: number, field: 'name' | 'description', value: string) => {
    setCharacterDefinitions(characterDefinitions.map(c => c.id === id ? { ...c, [field]: value } : c));
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
      
      const scripts = await generateScriptsForAllImages(
        imagePayload,
        characterDefinitions.filter(c => c.name.trim()),
        selectedTone,
        mainPrompt
      );
      
      const generatedScenes: Scene[] = uploadedImages.map((image, i) => ({
          id: image.id,
          imageSrc: image.base64Src,
          script: scripts[i],
      }));
      setScenes(generatedScenes);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "एक अज्ञात त्रुटि हुई।";
      console.error("स्क्रिप्ट निर्माण के दौरान एक त्रुटि हुई:", error);
      alert(`कुछ गलत हो गया! कृपया विवरण के लिए कंसोल देखें।\nत्रुटि: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleGenerateSingleVoiceOver = async (sceneId: string) => {
    const sceneToProcess = scenes.find(s => s.id === sceneId);
    if (!sceneToProcess) return;

    setGeneratingAudioFor(sceneId);
    try {
      const audioBase64 = await generateVoiceOver(sceneToProcess.script, selectedVoice);
      const { audioSrc, duration } = await processAudio(audioBase64);

      setScenes(currentScenes =>
        currentScenes.map(s =>
          s.id === sceneId
            ? { ...s, audioSrc, duration, originalScript: s.script }
            : s
        )
      );
    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : "एक अज्ञात त्रुटि हुई।";
       console.error(`दृश्य ${sceneId} के लिए वॉयस-ओवर बनाते समय त्रुटि:`, error);
       alert(`एक दृश्य के लिए वॉयस-ओवर बनाने में विफल।\nत्रुटि: ${errorMessage}`);
    } finally {
       setGeneratingAudioFor(null);
    }
  };

  const handleGenerateAllVoiceOvers = async () => {
    if (scenes.length === 0) return;

    setIsLoading(true);
    const scenesToProcess = [...scenes];

    try {
      for (let i = 0; i < scenesToProcess.length; i++) {
        const scene = scenesToProcess[i];
        if (scene.audioSrc && scene.script === scene.originalScript) continue;
        
        setLoadingMessage(`दृश्य ${i + 1} के लिए वॉयस-ओवर जेनरेट किया जा रहा है...`);
        setGeneratingAudioFor(scene.id);
        const audioBase64 = await generateVoiceOver(scene.script, selectedVoice);
        
        setLoadingMessage(`दृश्य ${i + 1} के लिए ऑडियो संसाधित किया जा रहा है...`);
        const { audioSrc, duration } = await processAudio(audioBase64);

        scenesToProcess[i] = { ...scene, audioSrc, duration, originalScript: scene.script };
        setScenes([...scenesToProcess]);
        setGeneratingAudioFor(null);
      }
    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : "एक अज्ञात त्रुटि हुई।";
       console.error("वॉयस-ओवर निर्माण के दौरान एक त्रुटि हुई:", error);
       alert(`कुछ गलत हो गया! कृपया विवरण के लिए कंसोल देखें।\nत्रुटि: ${errorMessage}`);
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
        setGeneratingAudioFor(null);
    }
  };

  const handleScriptChange = (sceneId: string, newScript: string) => {
    setScenes(currentScenes => 
        currentScenes.map(scene => 
            scene.id === sceneId ? { ...scene, script: newScript } : scene
        )
    );
  };
  
  const handleDownloadAudio = async () => {
      if (!isStoryReady) return;

      setIsProcessingAudio(true);
      setLoadingMessage("ऑडियो फ़ाइलें संयोजित की जा रही हैं...");

      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        const audioBuffers = await Promise.all(
          scenes.map(async (scene) => {
            const response = await fetch(scene.audioSrc!);
            const arrayBuffer = await response.arrayBuffer();
            return await audioContext.decodeAudioData(arrayBuffer);
          })
        );

        const totalLength = audioBuffers.reduce((acc, buffer) => acc + buffer.length, 0);
        const combinedBuffer = audioContext.createBuffer(1, totalLength, 24000);
        const channelData = combinedBuffer.getChannelData(0);
        let offset = 0;
        for (const buffer of audioBuffers) {
          channelData.set(buffer.getChannelData(0), offset);
          offset += buffer.length;
        }

        const wavBlob = audioBufferToWavBlob(combinedBuffer);

        setLoadingMessage("डाउनलोड के लिए ऑडियो तैयार किया जा रहा है...");
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recap-audio.wav';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

      } catch (error) {
        console.error("ऑडियो निर्यात के दौरान त्रुटि:", error);
        alert("ऑडियो निर्यात करने में विफल। कृपया कंसोल देखें।");
      } finally {
        setIsProcessingAudio(false);
        setLoadingMessage("");
      }
    };

  const handleDownloadVideo = async () => {
    if (scenes.length === 0 || !scenes.every(s => s.audioSrc && s.duration)) return;

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
      a.download = 'recap-story.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("वीडियो रेंडरिंग के दौरान त्रुटि:", error);
      alert("वीडियो रेंडर करने में विफल। कृपया कंसोल देखें।");
    } finally {
      setIsRenderingVideo(false);
      setLoadingMessage('');
    }
  };

  const handleStartOver = () => {
    setUploadedImages([]);
    setScenes([]);
    setCharacterDefinitions([{ id: Date.now(), name: '', description: '' }]);
    setSelectedTone('dramatic');
    setIsVideoPreviewOpen(false);
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  }

  const isBusy = isLoading || isRenderingVideo || isProcessingAudio || !!generatingAudioFor;
  const isEditingScripts = scenes.length > 0 && !scenes.some(s => s.audioSrc);
  const isAnyAudioStale = scenes.some(s => s.audioSrc && s.script !== s.originalScript);
  const isStoryReady = scenes.length > 0 && scenes.every(s => s.audioSrc && s.duration);

  return (
    <div className="space-y-8">
      <ImageUploader onImagesUpload={handleImagesUpload} disabled={isBusy} />

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        <h3 className='text-2xl font-bold text-indigo-600'>कहानी कॉन्फ़िगरेशन</h3>
        
        <div className='space-y-3'>
            <label className="font-semibold text-gray-700">पात्र परिभाषाएँ (वैकल्पिक)</label>
            <p className="text-sm text-gray-500">AI को पात्रों को लगातार पहचानने में मदद करें। परिभाषाओं का उपयोग करने के लिए नामों की आवश्यकता है।</p>
            {characterDefinitions.map((char, index) => (
                <div key={char.id} className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder={`पात्र ${index + 1} का नाम`}
                        value={char.name}
                        onChange={(e) => handleCharacterChange(char.id, 'name', e.target.value)}
                        disabled={isBusy}
                        className="flex-grow bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                    />
                     <input
                        type="text"
                        placeholder="संक्षिप्त विवरण (उदा., 'नायक, लाल स्कार्फ पहनता है')"
                        value={char.description}
                        onChange={(e) => handleCharacterChange(char.id, 'description', e.target.value)}
                        disabled={isBusy}
                        className="flex-grow-[2] bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                    />
                    <button onClick={() => handleRemoveCharacter(char.id)} disabled={isBusy} className='p-2 text-gray-400 hover:text-red-500 disabled:opacity-50'>
                        <CloseIcon className='w-5 h-5'/>
                    </button>
                </div>
            ))}
             <button onClick={handleAddCharacter} disabled={isBusy} className='text-sm text-indigo-600 hover:text-indigo-500 font-semibold disabled:opacity-50'>
                + पात्र जोड़ें
            </button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div>
                <label htmlFor="tone-select" className="font-semibold text-gray-700 block mb-2">कहानी का टोन</label>
                <select
                    id="tone-select"
                    value={selectedTone}
                    onChange={(e) => setSelectedTone(e.target.value)}
                    disabled={isBusy || uploadedImages.length === 0}
                    className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-4 py-3 focus:ring-indigo-500 focus:border-indigo-500 transition disabled:opacity-50 cursor-pointer hover:bg-gray-50"
                >
                    {availableTones.map(tone => <option key={tone.id} value={tone.id}>{tone.name}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="voice-select" className="font-semibold text-gray-700 block mb-2">आवाज की शैली</label>
                <select
                    id="voice-select"
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    disabled={isBusy || uploadedImages.length === 0}
                    className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg px-4 py-3 focus:ring-indigo-500 focus:border-indigo-500 transition disabled:opacity-50 cursor-pointer hover:bg-gray-50"
                >
                    {availableVoices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
                </select>
            </div>
        </div>

        <div>
             <label htmlFor="master-prompt" className="font-semibold text-gray-700 block mb-2">मास्टर प्रॉम्प्ट</label>
             <textarea
                id="master-prompt"
                value={mainPrompt}
                onChange={(e) => setMainPrompt(e.target.value)}
                disabled={isBusy}
                rows={8}
                className="w-full bg-gray-50 border border-gray-300 text-gray-700 rounded-lg px-4 py-3 focus:ring-indigo-500 focus:border-indigo-500 transition disabled:opacity-50"
             />
        </div>
        
        {isEditingScripts ? (
             <button
                onClick={handleGenerateAllVoiceOvers}
                disabled={isBusy || scenes.length === 0}
                className="w-full flex items-center justify-center gap-2 px-8 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition-all duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed transform hover:scale-105 disabled:scale-100"
                >
                <PencilIcon className="w-6 h-6" />
                {isLoading ? 'जेनरेट हो रहा है...' : 'सभी वॉयस-ओवर जेनरेट करें'}
            </button>
        ) : (
            <button
                onClick={handleGenerateStory}
                disabled={isBusy || uploadedImages.length === 0}
                className="w-full flex items-center justify-center gap-2 px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed transform hover:scale-105 disabled:scale-100"
                >
                <MagicWandIcon className="w-6 h-6" />
                {isLoading ? 'जेनरेट हो रहा है...' : 'कहानी जेनरेट करें'}
            </button>
        )}
      </div>

      {isBusy && !generatingAudioFor && (
          <section className="mt-10">
            <Loader message={loadingMessage} />
          </section>
        )}

        {scenes.length > 0 && !(isLoading && !generatingAudioFor) && (
          <section className="mt-12">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h3 className="text-3xl font-bold text-center sm:text-left text-gray-800">
                    {isEditingScripts ? 'स्क्रिप्ट संपादित करें' : 'जेनरेट किए गए दृश्य'}
                </h3>
                <div className='flex gap-4 flex-wrap justify-center'>
                    <button
                        onClick={handleStartOver}
                        className="px-4 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                    >
                        फिर से शुरू करें
                    </button>
                    {isStoryReady && (
                        <div className="relative" title={isAnyAudioStale ? "जारी रखने से पहले पुराने ऑडियो को फिर से जेनरेट करें" : ""}>
                        <div className={`flex gap-4 flex-wrap justify-center ${isAnyAudioStale ? 'opacity-50' : ''}`}>
                            <button
                                onClick={() => setIsVideoPreviewOpen(true)}
                                disabled={isBusy || isAnyAudioStale}
                                className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition-all duration-300 transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:scale-100"
                            >
                                <PlayIcon className="w-5 h-5" />
                                वीडियो का पूर्वावलोकन करें
                            </button>
                             <button
                                onClick={handleDownloadVideo}
                                disabled={isBusy || isAnyAudioStale}
                                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-all duration-300 transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:scale-100"
                            >
                                <DownloadIcon className="w-5 h-5" />
                                वीडियो डाउनलोड करें
                            </button>
                        </div>
                        </div>
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
                    onGenerateAudio={() => handleGenerateSingleVoiceOver(scene.id)}
                    isGeneratingAudio={generatingAudioFor === scene.id}
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
    </div>
  );
};

// --- New Layout Components ---

const ToolCard: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
      <button 
        className="w-full text-left text-xl font-bold p-4 bg-gray-50 hover:bg-gray-100 border-b border-gray-200 text-gray-700 focus:outline-none"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        {title}
      </button>
      {isOpen && (
        <div className="p-6">
          {children}
        </div>
      )}
    </div>
  );
};


const PlaceholderContent: React.FC<{ actionName: string; icon: React.ReactNode }> = ({ actionName, icon }) => (
  <>
    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
      <div className="space-y-3 text-sm text-gray-600">
        <div className="flex items-center gap-4">
            <span className="font-semibold w-16">इनपुट:</span>
            <span>कोई फ़ोल्डर चयनित नहीं है</span>
            <button disabled className="w-32 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md flex items-center gap-2 disabled:bg-indigo-300 disabled:cursor-not-allowed">
              <FolderIcon className="w-4 h-4" />
              चुनें
            </button>
        </div>
         <div className="flex items-center gap-4">
            <span className="font-semibold w-16">आउटपुट:</span>
            <span>कोई फ़ोल्डर चयनित नहीं है</span>
            <button disabled className="w-32 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md flex items-center gap-2 disabled:bg-indigo-300 disabled:cursor-not-allowed">
              <FolderIcon className="w-4 h-4" />
              चुनें
            </button>
        </div>
      </div>
      <div className="flex justify-end mt-4 md:mt-0">
          <button disabled className="px-5 py-2 bg-gray-200 text-gray-500 text-sm font-semibold rounded-md cursor-not-allowed flex items-center gap-2">
            {icon}
            {actionName}
          </button>
      </div>
    </div>
    <p className="text-xs text-gray-400 mt-4 text-center">नोट: डायरेक्ट फोल्डर एक्सेस एक डेस्कटॉप ऐप फीचर है। वेब संस्करण भविष्य में फ़ाइल अपलोड का समर्थन करेगा।</p>
  </>
);

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans">
      <header className="bg-indigo-700 text-white shadow-md">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-3xl font-bold">मनहवा टूल्स</h1>
          <p className="text-sm text-indigo-200">मंगा और मनहवा रचनाकारों के लिए AI-संचालित उपकरण</p>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <ToolCard title="AI वॉयस-ओवर के साथ रिकैप वीडियो बनाएं" defaultOpen={true}>
            <RecapScriptMakerTool />
          </ToolCard>
          <ToolCard title="छवियाँ मिलाएं">
            <PlaceholderContent actionName="मिलाएं" icon={<ArrowsUpDownIcon className="w-4 h-4" />} />
          </ToolCard>
          <ToolCard title="पैनल क्रॉप करें">
            <PlaceholderContent actionName="क्रॉप" icon={<CropIcon className="w-4 h-4" />} />
          </ToolCard>
          <ToolCard title="टेक्स्ट धुंधला करें">
            <PlaceholderContent actionName="पैनल धुंधला करें" icon={<EyeSlashIcon className="w-4 h-4" />} />
          </ToolCard>
           <ToolCard title="टेक्स्ट निकालें">
            <PlaceholderContent actionName="टेक्स्ट निकालें" icon={<DocumentTextIcon className="w-4 h-4" />} />
          </ToolCard>
        </div>
      </main>
      <footer className="text-center py-6 text-gray-500 text-sm">
        <p>जेमिनी द्वारा संचालित। रचनात्मक कहानी कहने के लिए बनाया गया।</p>
      </footer>
    </div>
  );
};

export default App;
