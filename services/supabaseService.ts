import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { Language } from '../types';

const HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export async function fetchLanguages(): Promise<Language[] | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/languages?select=code,name&order=name.asc`, {
      method: 'GET',
      mode: 'cors',
      headers: HEADERS
    });
    return response.ok ? await response.json() : null;
  } catch (error) {
    return null;
  }
}

export async function fetchVoices(): Promise<{id: string, name: string}[] | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/voices?select=id,name&order=name.asc`, {
      method: 'GET',
      mode: 'cors',
      headers: HEADERS
    });
    return response.ok ? await response.json() : null;
  } catch (error) {
    return null;
  }
}

export async function fetchRecentTranscriptions(meetingId: string, sinceIso: string): Promise<{text: string, created_at: string}[]> {
  if (!meetingId) return [];
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/transcriptions?meeting_id=eq.${meetingId}&created_at=gt.${sinceIso}&transcribe_text_segment=not.eq.&select=transcribe_text_segment,created_at&order=created_at.asc`,
      {
        method: 'GET',
        mode: 'cors',
        headers: HEADERS
      }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((item: any) => ({
      text: item.transcribe_text_segment,
      created_at: item.created_at
    }));
  } catch (error) {
    console.error('[ORBIT]: Segment fetch failed.', error);
    return [];
  }
}

export async function pushTranscription(meetingId: string, text: string): Promise<boolean> {
  if (!meetingId || !text.trim()) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/transcriptions`, {
      method: 'POST',
      mode: 'cors',
      headers: { ...HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify([{ 
        meeting_id: meetingId, 
        transcribe_text_segment: text.trim(),
        created_at: new Date().toISOString()
      }])
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

export async function getOrbitKeys(): Promise<string[]> {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/admin_config?key=eq.orbit_api_keys&select=value`, {
      method: 'GET',
      mode: 'cors',
      headers: HEADERS
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data && data.length > 0) ? data[0].value.keys : [];
  } catch (e) {
    return [];
  }
}

export async function addOrbitKey(newKey: string): Promise<boolean> {
  try {
    const existingKeys = await getOrbitKeys();
    if (existingKeys.includes(newKey)) return true;
    const updatedKeys = [...existingKeys, newKey];
    const response = await fetch(`${SUPABASE_URL}/rest/v1/admin_config?on_conflict=key`, {
      method: 'POST',
      mode: 'cors',
      headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'orbit_api_keys', value: { keys: updatedKeys } })
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}
