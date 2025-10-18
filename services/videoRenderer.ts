import type { Scene } from '../types';

const WIDTH = 1920;
const HEIGHT = 1080;
const FRAME_RATE = 30;

/**
 * Renders a sequence of scenes into a single video Blob.
 * @param scenes The array of scenes to render.
 * @param onProgress A callback function to report rendering progress.
 * @returns A promise that resolves with the rendered video as a Blob.
 */
export const renderVideo = (
  scenes: Scene[],
  onProgress: (message: string) => void
): Promise<Blob> => {
  return new Promise(async (resolve, reject) => {
    let audioContext: AudioContext | null = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("कैनवास संदर्भ नहीं बनाया जा सका");
      }

      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioDestination = audioContext.createMediaStreamDestination();

      const videoStream = canvas.captureStream(FRAME_RATE);
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks()
      ]);

      if (!MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
         console.warn('VP9 कोडेक समर्थित नहीं है, फॉलबैक किया जा रहा है। गुणवत्ता कम हो सकती है।');
      }
      const recorder = new MediaRecorder(combinedStream, {
         mimeType: 'video/webm; codecs=vp9',
         videoBitsPerSecond: 2500000, // 2.5 Mbps for 1080p
      });
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close();
        }
        resolve(new Blob(chunks, { type: 'video/webm' }));
      };
      recorder.onerror = (e) => {
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close();
        }
        reject(e);
      };

      recorder.start();

      let audioScheduleTime = 0;

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        onProgress(`दृश्य ${i + 1} / ${scenes.length} रेंडर किया जा रहा है...`);
        
        // Schedule audio playback in the audio context
        const response = await fetch(scene.audioSrc);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioDestination);
        source.start(audioScheduleTime);
        
        // Render video frames for the duration of the audio
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = scene.imageSrc;
        await new Promise(res => img.onload = res);

        await renderImageWithEffect(ctx, img, scene.duration);
        
        audioScheduleTime += scene.duration;
      }

      // Allow a small buffer for the final audio chunk to process
      await new Promise(res => setTimeout(res, 500));
      
      recorder.stop();

    } catch(error) {
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
      reject(error);
    }
  });
};

/**
 * Renders an image to the canvas with a Ken Burns effect for a specific duration.
 * @param ctx The canvas rendering context.
 * @param img The image to render.
 * @param duration The duration in seconds to render the image.
 */
const renderImageWithEffect = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  duration: number
): Promise<void> => {
  return new Promise(resolve => {
    const durationMs = duration * 1000;
    const startTime = performance.now();
    let elapsed = 0;

    const animationFrame = () => {
      elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);

      // --- Calculate image size to cover the 16:9 canvas ---
      const canvasAspect = WIDTH / HEIGHT;
      const imgAspect = img.width / img.height;
      let renderWidth, renderHeight, renderX, renderY;

      if (imgAspect > canvasAspect) {
        renderHeight = HEIGHT;
        renderWidth = img.width * (HEIGHT / img.height);
        renderX = (WIDTH - renderWidth) / 2;
        renderY = 0;
      } else {
        renderWidth = WIDTH;
        renderHeight = img.height * (WIDTH / img.width);
        renderX = 0;
        renderY = (HEIGHT - renderHeight) / 2;
      }

      // --- Apply Ken Burns effect (subtle zoom-in) ---
      const scale = 1 + progress * 0.05; // Zoom from 100% to 105%
      const scaledWidth = renderWidth * scale;
      const scaledHeight = renderHeight * scale;
      const x = renderX - (scaledWidth - renderWidth) / 2;
      const y = renderY - (scaledHeight - renderHeight) / 2;
      
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
      
      if (progress < 1) {
        requestAnimationFrame(animationFrame);
      } else {
        resolve();
      }
    };
    
    requestAnimationFrame(animationFrame);
  });
};