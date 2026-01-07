import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { TranscriptionEngine, InputSource } from '../types';

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class TranscriptionService {
  private socket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recognition: any = null;
  private liveSessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;

  public stop() {
    if (this.socket) { this.socket.close(); this.socket = null; }
    if (this.mediaRecorder) { try { this.mediaRecorder.stop(); } catch(e) {} this.mediaRecorder = null; }
    if (this.recognition) { this.recognition.stop(); this.recognition = null; }
    if (this.inputAudioContext) { this.inputAudioContext.close(); this.inputAudioContext = null; }
    this.liveSessionPromise = null;
  }

  async start(
    engine: TranscriptionEngine,
    source: InputSource,
    apiKey: string,
    onTranscript: (text: string) => void,
    onError: (err: any) => void
  ) {
    this.stop();

    try {
      if (engine === 'main') {
        const ai = new GoogleGenAI({ apiKey });
        this.liveSessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          callbacks: {
            onopen: () => console.log("[ORBIT]: Transcriber Matrix Linked."),
            onmessage: async (message: LiveServerMessage) => {
              if (message.serverContent?.inputTranscription) {
                onTranscript(message.serverContent.inputTranscription.text);
              }
            },
            onerror: (e) => {
              console.error("[ORBIT]: Matrix Error", e);
              onError(new Error("Network Link Failure (Matrix)"));
            },
            onclose: () => console.log("[ORBIT]: Matrix Link Severed.")
          },
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            systemInstruction: 'You are a transcription engine whitelisted to EBURON.AI. Capture every word accurately.'
          }
        });

        if (source === 'mic') {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.inputAudioContext = new AudioContext({ sampleRate: 16000 });
          const sourceNode = this.inputAudioContext.createMediaStreamSource(stream);
          const processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
          
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              int16[i] = inputData[i] * 32768;
            }
            const pcmBase64 = encode(new Uint8Array(int16.buffer));
            this.liveSessionPromise?.then(session => {
              session.sendRealtimeInput({ media: { data: pcmBase64, mimeType: 'audio/pcm;rate=16000' } });
            }).catch(() => {});
          };

          sourceNode.connect(processor);
          processor.connect(this.inputAudioContext.destination);
        }
      } else {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
          onError(new Error("WebSpeech Engine Unavailable."));
          return;
        }
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.onresult = (e: any) => {
          const text = Array.from(e.results).map((r: any) => r[0].transcript).join('');
          onTranscript(text);
        };
        this.recognition.onerror = (e: any) => onError(e);
        this.recognition.start();
      }
    } catch (err) {
      onError(err);
    }
  }
}
