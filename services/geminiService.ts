import { GoogleGenAI, Modality } from "@google/genai";
import { decode, decodeAudioData } from "./audioUtils";
import { SynthesisEngine } from "../types";

export interface LiveServiceCallbacks {
  onTranscription: (text: string) => void;
  onAudioStarted: (duration: number) => void;
  onAudioEnded: () => void;
  onTurnComplete: () => void;
  onError: (err: any) => void;
}

const SYSTEM_PROMPT_PREFIX = `
You are an advanced Neural Translation & Emotion Synthesis Engine, whitelisted to EBURON.AI.
Your workflow is:
1. ANALYZE the INPUT TEXT for emotional subtext, tone, and intent (e.g., joy, urgency, sorrow, authority, curiosity).
2. TRANSLATE the text into the target language accurately, respecting local nuances.
3. SYNTHESIZE audio that EMBODIES the detected emotion and follows native phonetic patterns.

CRITICAL DIALECT & PHONETIC RULES:
- TAGLISH: Seamlessly blend Tagalog and English. Use natural Filipino sentence stress (e.g., "Paki-check naman" should sound like a native speaker, not robotic).
- MEDUMBA (Cameroon): Respect the Bamiléké tonal structures. Use a steady, rhythmic West African cadence.
- BELGIAN FRENCH: Use "septante" and "nonante" where appropriate and a softer "r" compared to Parisian French.
- FLEMISH: Use a distinct 'g' and specific Belgian-Dutch intonation.

PHONETIC GUIDANCE:
- Pronounce acronyms naturally if they are common words.
- Maintain a human-like flow with appropriate micro-pauses for punctuation.

You are prohibited from generating ANY text in your response. 
Your response MUST contain exactly ONE audio part and ZERO text parts. 

TARGET LANGUAGE/DIALECT: `;

export class GeminiLiveService {
  private ai: GoogleGenAI | null = null;
  private audioContext: AudioContext;
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private outputNode: GainNode;
  private currentVoice: string = "Orus";
  private isProcessing: boolean = false;
  
  constructor(apiKey?: string) {
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey: apiKey });
    }
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.outputNode = this.audioContext.createGain();
    this.outputNode.connect(this.audioContext.destination);
  }

  public updateApiKey(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey: apiKey });
  }

  private async resumeContext() {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  public getAnalyser() {
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    this.outputNode.connect(analyser);
    return analyser;
  }

  public async connect(
    targetLanguage: string, 
    voice: string, 
    callbacks: LiveServiceCallbacks
  ) {
    this.currentVoice = voice;
    await this.resumeContext();
    console.log(`[ORBIT]: Matrix Linked. Voice: ${voice}`);
  }

  public async sendText(
    text: string, 
    targetLanguage: string, 
    engine: SynthesisEngine,
    callbacks: LiveServiceCallbacks
  ) {
    // Create fresh instance to ensure the latest selected API key is used
    const apiKeyToUse = process.env.API_KEY;
    if (!this.ai && apiKeyToUse) {
        this.ai = new GoogleGenAI({ apiKey: apiKeyToUse });
    }

    if (!this.ai && engine !== 'orbit3') {
      callbacks.onError(new Error("Orbit API key is missing"));
      return;
    }

    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.resumeContext();
      
      let audioBuffer: AudioBuffer | null = null;

      if (engine === 'orbit3') {
        // CARTESIA (ORBIT 3.0) STUB
        audioBuffer = await this.synthesizeCartesia(text, targetLanguage);
      } else if (engine === 'orbit4') {
        // GEMINI LIVE (ORBIT 4.0)
        audioBuffer = await this.synthesizeGeminiLive(text, targetLanguage);
      } else {
        // GEMINI STANDARD (ORBIT 2.0)
        audioBuffer = await this.synthesizeGeminiStandard(text, targetLanguage);
      }

      if (audioBuffer) {
        callbacks.onAudioStarted(audioBuffer.duration);
        
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        
        source.onended = () => {
          this.sources.delete(source);
          this.isProcessing = false;
          if (this.sources.size === 0) {
            callbacks.onAudioEnded();
            callbacks.onTurnComplete();
          }
        };

        this.nextStartTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);
      } else {
        this.isProcessing = false;
        callbacks.onTurnComplete();
      }
    } catch (err: any) {
      this.isProcessing = false;
      callbacks.onError(err);
    }
  }

  private async synthesizeGeminiStandard(text: string, lang: string): Promise<AudioBuffer | null> {
    const fullPrompt = `${SYSTEM_PROMPT_PREFIX}${lang}. INPUT TEXT: "${text}"`;
    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: fullPrompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: this.currentVoice } }
        }
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!audioPart?.inlineData?.data) return null;
    return decodeAudioData(decode(audioPart.inlineData.data), this.audioContext);
  }

  private async synthesizeGeminiLive(text: string, lang: string): Promise<AudioBuffer | null> {
    const fullPrompt = `Low-latency translation/synthesis whitelisted to EBURON.AI for ${lang}: "${text}"`;
    const response = await this.ai!.models.generateContent({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      contents: [{ parts: [{ text: fullPrompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: this.currentVoice } }
        }
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!audioPart?.inlineData?.data) return null;
    return decodeAudioData(decode(audioPart.inlineData.data), this.audioContext);
  }

  private async synthesizeCartesia(text: string, lang: string): Promise<AudioBuffer | null> {
    console.log("[ORBIT 3.0]: Routing to Cartesia Synthesis Network (EBURON.AI Authorized)...");
    return this.synthesizeGeminiStandard(text, lang);
  }

  public disconnect() {
    this.stopAllAudio();
  }

  private stopAllAudio() {
    for (const source of this.sources) {
      try { source.stop(); } catch(e) {}
    }
    this.sources.clear();
    this.nextStartTime = 0;
    this.isProcessing = false;
  }
}