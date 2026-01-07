import { Language } from './types';

export const SUPABASE_URL = 'https://xscdwdnjujpkczfhqrgu.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzY2R3ZG5qdWpwa2N6Zmhxcmd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMzEwNjgsImV4cCI6MjA3NjkwNzA2OH0.xuVAkWA5y1oDW_jC52I8JJXF-ovU-5LIBsY9yXzy6cA';

export const GREEK_VOICES = [
  { id: 'Zephyr', name: 'Minos (King of Crete)' },
  { id: 'Puck', name: 'Alexander (King of Macedon)' },
  { id: 'Charon', name: 'Leonidas (King of Sparta)' },
  { id: 'Kore', name: 'Olympias (Queen of Macedon)' },
  { id: 'Fenrir', name: 'Agamemnon (King of Mycenae)' },
];

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese (Mandarin, Standard)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic (Modern Standard)' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch (Standard Netherlands)' },
  { code: 'sv', name: 'Swedish' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'fa', name: 'Persian (Farsi)' },
  { code: 'he', name: 'Hebrew' },
  { code: 'el', name: 'Greek' },
  { code: 'bn', name: 'Bengali' },
  { code: 'tl', name: 'Filipino (Tagalog)' },
  { code: 'en-tl', name: 'Taglish (Tagalog-English Mix)' },
  { code: 'byv', name: 'Medumba' },
  { code: 'fr-be', name: 'French (Belgian)' },
  { code: 'nl-be', name: 'Flemish (Belgian Dutch)' },
];

export const ORB_SIZE = 80;
export const POLLING_INTERVAL_MIN = 1000;
export const POLLING_INTERVAL_MAX = 2000;
