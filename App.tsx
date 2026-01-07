import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { OrbStatus, Language, AppMode, TranscriptionEngine, InputSource, SynthesisEngine } from './types';
import {
  POLLING_INTERVAL_MIN,
  POLLING_INTERVAL_MAX,
  LANGUAGES as FALLBACK_LANGUAGES,
  GREEK_VOICES as FALLBACK_VOICES,
  ORB_SIZE
} from './constants';
import { useDraggable } from './hooks/useDraggable';
import Orb from './components/Orb';
import { GeminiLiveService } from './services/geminiService';
import { TranscriptionService } from './services/transcriptionService';
import { 
  fetchRecentTranscriptions, 
  pushTranscription,
  getOrbitKeys,
  addOrbitKey
} from './services/supabaseService';

const App: React.FC = () => {
  const isEmbedded = useMemo(() => {
    try { return window.self !== window.top; } catch (e) { return true; }
  }, []);

  const [status, setStatus] = useState<OrbStatus>(OrbStatus.IDLE);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<AppMode | 'embed'>('translate');
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTranscriptionText, setCurrentTranscriptionText] = useState<string>("");
  const [fullTranscription, setFullTranscription] = useState<string>(() => localStorage.getItem('orb_full_transcript') || "");
  const [showSubtitles, setShowSubtitles] = useState<boolean>(() => localStorage.getItem('orb_show_subtitles') !== 'false');
  const [subtitleProgress, setSubtitleProgress] = useState(0);
  const [isSubtitleVisible, setIsSubtitleVisible] = useState(false);

  const [transcriptionEngine, setTranscriptionEngine] = useState<TranscriptionEngine>(() => (localStorage.getItem('orb_engine') as TranscriptionEngine) || 'main');
  const [synthesisEngine, setSynthesisEngine] = useState<SynthesisEngine>(() => (localStorage.getItem('orb_synthesis_engine') as SynthesisEngine) || 'standard');
  const [inputSource, setInputSource] = useState<InputSource>(() => (localStorage.getItem('orb_input') as InputSource) || 'mic');
  const [orbitKeys, setOrbitKeys] = useState<string[]>([]);
  const [currentKeyIndex, setCurrentKeyIndex] = useState(0);
  const [newOrbitToken, setNewOrbitToken] = useState('');
  const [isAddingToken, setIsAddingToken] = useState(false);
  
  const [selectedLanguage, setSelectedLanguage] = useState(() => localStorage.getItem('orb_lang') || 'en-tl');
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem('orb_voice') || 'Zephyr');
  const [meetingId, setMeetingId] = useState(() => localStorage.getItem('orb_meeting_id') || '43f847a2-6836-4d5f-b16e-bf67f12972e5');
  
  const textQueueRef = useRef<string[]>([]);
  const isBusyRef = useRef<boolean>(false);
  const lastProcessedTimeRef = useRef<string>(new Date().toISOString());
  
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  const transcriptionServiceRef = useRef<TranscriptionService>(new TranscriptionService());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  
  const initialX = isEmbedded ? window.innerWidth - ORB_SIZE - 40 : 100;
  const initialY = isEmbedded ? window.innerHeight - ORB_SIZE - 40 : 200;
  const { position, isDragging, handleMouseDown: dragMouseDown } = useDraggable(initialX, initialY);

  const triggerError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setStatus(OrbStatus.ERROR);
    setIsMonitoring(false);
    setTimeout(() => { setErrorMessage(null); setStatus(OrbStatus.IDLE); }, 5000);
  }, []);

  const loadOrbitKeys = useCallback(async () => {
    const keys = await getOrbitKeys();
    setOrbitKeys(keys);
    if (keys.length > 0 && liveServiceRef.current) liveServiceRef.current.updateApiKey(keys[0]);
  }, []);

  const handleAddToken = async () => {
    if (!newOrbitToken) return;
    setIsAddingToken(true);
    if (await addOrbitKey(newOrbitToken)) {
      setNewOrbitToken('');
      await loadOrbitKeys();
    } else triggerError("Token storage failed.");
    setIsAddingToken(false);
  };

  const updateTranscriptionState = useCallback((text: string) => {
    if (!text.trim()) return;
    setCurrentTranscriptionText(text);
    setFullTranscription(prev => {
      const updated = prev ? `${prev} ${text}` : text;
      localStorage.setItem('orb_full_transcript', updated);
      return updated;
    });
  }, []);

  const animateSubtitleProgress = useCallback((duration: number) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setSubtitleProgress(0);
    setIsSubtitleVisible(true);
    const totalMs = duration * 1000;
    const start = Date.now();
    progressIntervalRef.current = window.setInterval(() => {
      const progress = Math.min(((Date.now() - start) / totalMs) * 100, 100);
      setSubtitleProgress(progress);
      if (progress >= 100) {
        clearInterval(progressIntervalRef.current!);
        setTimeout(() => setIsSubtitleVisible(false), 500);
      }
    }, 32);
  }, []);

  const processNextInQueue = useCallback(async () => {
    if (isBusyRef.current || textQueueRef.current.length === 0 || !liveServiceRef.current) return;
    isBusyRef.current = true;
    const text = textQueueRef.current.shift()!;
    updateTranscriptionState(text);
    setStatus(OrbStatus.FETCHING);
    
    const lang = FALLBACK_LANGUAGES.find(l => l.code === selectedLanguage)?.name || 'English';
    const callbacks = {
      onTranscription: () => {},
      onAudioStarted: (d: number) => { setStatus(OrbStatus.SPEAKING); animateSubtitleProgress(d); },
      onAudioEnded: () => {},
      onTurnComplete: () => { setStatus(OrbStatus.IDLE); isBusyRef.current = false; processNextInQueue(); },
      onError: () => { setStatus(OrbStatus.IDLE); isBusyRef.current = false; }
    };
    liveServiceRef.current.sendText(text, lang, synthesisEngine, callbacks);
  }, [selectedLanguage, synthesisEngine, updateTranscriptionState, animateSubtitleProgress]);

  useEffect(() => {
    if (!isMonitoring || !meetingId || settingsTab === 'speaker') return;
    const poll = async () => {
      const segments = await fetchRecentTranscriptions(meetingId, lastProcessedTimeRef.current);
      if (segments.length > 0) {
        lastProcessedTimeRef.current = segments[segments.length - 1].created_at;
        textQueueRef.current.push(...segments.map(s => s.text));
        processNextInQueue();
      }
    };
    poll();
    const interval = Math.random() * (POLLING_INTERVAL_MAX - POLLING_INTERVAL_MIN) + POLLING_INTERVAL_MIN;
    pollingTimerRef.current = window.setInterval(poll, interval);
    return () => { if (pollingTimerRef.current) clearInterval(pollingTimerRef.current); };
  }, [isMonitoring, meetingId, settingsTab, processNextInQueue]);

  useEffect(() => {
    if (!isMonitoring || settingsTab !== 'speaker') {
      transcriptionServiceRef.current.stop();
      return;
    }
    const startRecording = async () => {
      setStatus(OrbStatus.RECORDING);
      const key = orbitKeys[currentKeyIndex] || process.env.API_KEY || '';
      await transcriptionServiceRef.current.start(
        transcriptionEngine, inputSource, key,
        (text) => { pushTranscription(meetingId, text); updateTranscriptionState(text); },
        (err) => triggerError(err.message)
      );
    };
    startRecording();
    return () => transcriptionServiceRef.current.stop();
  }, [isMonitoring, settingsTab, transcriptionEngine, inputSource, meetingId, orbitKeys, currentKeyIndex, triggerError, updateTranscriptionState]);

  useEffect(() => {
    loadOrbitKeys();
    const service = new GeminiLiveService();
    liveServiceRef.current = service;
    analyserRef.current = service.getAnalyser();
    return () => service.disconnect();
  }, [loadOrbitKeys]);

  const handleOrbMouseDown = (e: any) => {
    dragMouseDown(e);
    const start = Date.now();
    const end = () => {
      window.removeEventListener('mouseup', end);
      if (Date.now() - start < 200) setIsMonitoring(p => !p);
    };
    window.addEventListener('mouseup', end);
  };

  return (
    <div className="fixed inset-0 pointer-events-none text-white font-sans bg-transparent">
      {isMonitoring && showSubtitles && isSubtitleVisible && currentTranscriptionText && (
        <div className="absolute left-1/2 -translate-x-1/2 w-fit max-w-[80vw] z-[40]" style={{ bottom: isEmbedded ? '120px' : '3rem' }}>
          <div className="relative bg-black/80 backdrop-blur-2xl border border-white/20 rounded-[2rem] py-4 px-10 shadow-2xl overflow-hidden">
            <span className="text-[16px] font-black text-cyan-50 uppercase tracking-widest italic">{currentTranscriptionText}</span>
            <div className="absolute bottom-0 left-0 h-[3px] bg-cyan-500 transition-all ease-linear" style={{ width: `${subtitleProgress}%` }} />
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-rose-600 px-6 py-2 rounded-full text-xs font-black uppercase z-[100]">{errorMessage}</div>
      )}

      {isSidebarOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 pointer-events-none">
          <div className="resizable-modal bg-slate-950/98 border-2 border-white/20 pointer-events-auto flex flex-col rounded-[2.5rem] w-[440px] h-[85vh] overflow-hidden">
            <div className="flex justify-between items-center px-8 pt-8 pb-4 border-b border-white/10">
              <h2 className="text-2xl font-black text-cyan-400 italic">Matrix Prime</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-3 bg-white/5 rounded-2xl">×</button>
            </div>
            
            <div className="flex px-8 pt-4 gap-2">
              <button onClick={() => setSettingsTab('translate')} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${settingsTab === 'translate' ? 'bg-cyan-500 text-black' : 'bg-white/5'}`}>Translator</button>
              <button onClick={() => setSettingsTab('speaker')} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${settingsTab === 'speaker' ? 'bg-emerald-500 text-black' : 'bg-white/5'}`}>Speaker</button>
              <button onClick={() => setSettingsTab('embed')} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${settingsTab === 'embed' ? 'bg-purple-500 text-black' : 'bg-white/5'}`}>Embed</button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
               {settingsTab === 'translate' && (
                 <>
                   <div className="space-y-4">
                     <input type="password" value={newOrbitToken} onChange={e => setNewOrbitToken(e.target.value)} placeholder="Orbit Token..." className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3" />
                     <button onClick={handleAddToken} className="w-full bg-cyan-500 text-black py-3 rounded-xl font-black uppercase">Inject Link</button>
                   </div>
                   <input type="text" value={meetingId} onChange={e => setMeetingId(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4" placeholder="Stream ID" />
                   <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-2xl px-5 py-4">
                     {FALLBACK_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                   </select>
                 </>
               )}
               {settingsTab === 'speaker' && (
                 <div className="space-y-6">
                   <select value={inputSource} onChange={e => setInputSource(e.target.value as InputSource)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3">
                     <option value="mic">Microphone</option>
                     <option value="screen">System Audio (Loopback)</option>
                   </select>
                   <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                     <p className="text-[10px] text-white/40 italic break-words">{fullTranscription || "Ready for neural feed..."}</p>
                   </div>
                 </div>
               )}
               {settingsTab === 'embed' && (
                 <textarea readOnly value={`<iframe src="${window.location.href}" allow="microphone; display-capture"></iframe>`} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 h-32 font-mono text-[10px]" />
               )}
               <button onClick={() => setSaveFeedback(true)} className="w-full py-5 rounded-2xl font-black uppercase border border-cyan-500/40 text-cyan-400">Sync Matrix</button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-auto absolute" style={{ left: position.x, top: position.y }}>
        <Orb status={status} mode={settingsTab === 'embed' ? 'translate' : (settingsTab as AppMode)} analyser={analyserRef.current} onMouseDown={handleOrbMouseDown} onSettingsClick={() => setIsSidebarOpen(true)} isDragging={isDragging} isPressed={false} isMonitoring={isMonitoring} />
      </div>

      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/70 backdrop-blur-md pointer-events-auto z-[55]" />}
    </div>
  );
};

export default App;
