import { GoogleGenAI, Modality, Type } from "@google/genai";

// Assume API_KEY is set in the environment
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  // In a real app, you'd want to handle this more gracefully.
  // For this context, we assume it's always available.
  console.warn("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

const SCRIPT_GENERATION_MODEL = 'gemini-2.5-flash';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

// --- Helper Functions for Base64 and Audio Decoding ---

// Decodes a base64 string into a Uint8Array.
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Decodes raw PCM audio data into an AudioBuffer for playback and duration calculation.
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Helper to create a valid WAV Blob from raw PCM data
const createWavBlob = (pcmData: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample: number = 16): Blob => {
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // file-size - 8
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk1 size (16 for PCM)
  view.setUint16(20, 1, true); // audio format (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // byte rate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // block align
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM data
  new Uint8Array(buffer, 44).set(pcmData);

  return new Blob([view], { type: 'audio/wav' });
};


// --- API Service Functions ---

/**
 * Analyzes a sequence of images and generates a cinematic script for each in Hindi.
 * @param images - An array of image data containing base64 strings and mime types.
 * @param mainCharacterName - The optional name of the main character.
 * @param tone - The desired tone for the script (e.g., 'dramatic', 'comedic').
 * @returns A promise that resolves to an array of generated script texts in Hindi.
 */
export const generateScriptsForAllImages = async (
  images: { base64Image: string; mimeType: string }[],
  mainCharacterName: string,
  tone: string
): Promise<string[]> => {
  try {
    const imageParts = images.map(img => ({
      inlineData: {
        data: img.base64Image,
        mimeType: img.mimeType,
      },
    }));

    const characterPrompt = mainCharacterName
      ? `मुख्य पात्र (MC) का नाम "${mainCharacterName}" है। अपनी स्क्रिप्ट में इस नाम का प्रयोग करें।`
      : 'कहानी में मुख्य पात्र (MC) को पहचानें और लगातार उसका उल्लेख करें।';
    
    const toneInstruction = `स्क्रिप्ट का लहजा "${tone}" होना चाहिए।`;

    const prompt = `तुम एक विशेषज्ञ मंगा और कॉमिक्स स्क्रिप्टराइटर हो। तुम्हारा काम इन छवियों को एक आकर्षक कहानी में बदलना है।
      नीचे दी गई छवियों का क्रम एक कहानी बताता है। ${characterPrompt}
      ${toneInstruction}

      प्रत्येक छवि के लिए, एक विस्तृत, सिनेमाई और आकर्षक स्क्रिप्ट हिंदी में लिखो। सिर्फ यह मत बताओ कि क्या हो रहा है, बल्कि उसे दिखाओ। पात्रों की भावनाओं, उनके बीच के आकर्षक संवादों और माहौल का जीवंत वर्णन करो। सुनिश्चित करो कि कहानी का प्रवाह सुसंगत हो और पात्रों का विकास हो।

      अपनी प्रतिक्रिया JSON प्रारूप में एक ऐरे के रूप में दो। यह अत्यंत महत्वपूर्ण है कि JSON ऐरे में स्ट्रिंग्स की संख्या प्रदान की गई छवियों की संख्या (${images.length}) के ठीक बराबर हो। यदि ${images.length} छवियाँ हैं, तो JSON ऐरे में ठीक ${images.length} स्ट्रिंग्स होनी चाहिए, प्रत्येक छवि के लिए एक। कोई भी आइटम जोड़ें या हटाएं नहीं। केवल JSON ऐरे ही आउटपुट करें।

      उदाहरण प्रारूप:
      [
        "पहली छवि के लिए स्क्रिप्ट यहाँ...",
        "दूसरी छवि के लिए स्क्रिप्ट यहाँ...",
        "और इसी तरह..."
      ]`;
      
    const textPart = { text: prompt };
    
    const response = await ai.models.generateContent({
      model: SCRIPT_GENERATION_MODEL,
      contents: { parts: [textPart, ...imageParts] },
       config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            description: 'कहानी के एक दृश्य का वर्णन करने वाली कथात्मक स्क्रिप्ट।',
          },
        },
      },
    });
    
    // The response is expected to be a JSON string of an array of strings.
    const responseText = response.text.trim();
    const scripts = JSON.parse(responseText);

    if (!Array.isArray(scripts) || scripts.length !== images.length) {
      console.error("Mismatched script and image count. Raw response:", responseText);
      throw new Error(`AI से स्क्रिप्ट और छवियों की संख्या मेल नहीं खाती। अपेक्षित ${images.length}, प्राप्त ${scripts.length}।`);
    }

    return scripts;
  } catch (error) {
    console.error("Error generating scripts:", error);
    throw new Error("छवियों के लिए स्क्रिप्ट बनाने में विफल।");
  }
};


/**
 * Converts a Hindi script text into a voice-over audio.
 * @param script - The Hindi text to be converted to speech.
 * @param voiceName - The name of the pre-built voice to use.
 * @returns A promise that resolves to the base64 encoded audio string.
 */
export const generateVoiceOver = async (script: string, voiceName: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: `शांति से, कथात्मक लहजे में बोलें: ${script}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
          },
        },
    });
    
    const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioBase64) {
      throw new Error("No audio data received from API.");
    }
    
    return audioBase64;
  } catch (error) {
    console.error("Error generating voice-over:", error);
    throw new Error("Failed to generate voice-over.");
  }
};

/**
 * Converts base64 PCM audio data to a playable Blob URL and calculates its duration.
 * @param audioBase64 - The base64 encoded raw PCM audio data.
 * @returns A promise resolving to an object with the audio Blob URL and its duration in seconds.
 */
export const processAudio = async (audioBase64: string): Promise<{ audioSrc: string; duration: number }> => {
    // We must use a 24000 sample rate for Gemini TTS output
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const decodedBytes = decode(audioBase64);
    const audioBuffer = await decodeAudioData(decodedBytes, audioContext, 24000, 1);
    
    // Create a playable WAV Blob from the raw bytes
    const blob = createWavBlob(decodedBytes, 24000, 1);
    const audioSrc = URL.createObjectURL(blob);
    
    return { audioSrc, duration: audioBuffer.duration };
};