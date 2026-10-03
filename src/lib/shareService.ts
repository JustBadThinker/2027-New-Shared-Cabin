import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import { Cabin, DriveFile, SavedNote, Boat } from '../store';
import { ShareLinkSnapshot, BoatSnapshot, WhatsAppConfig, DEFAULT_WHATSAPP_CONFIG, CabinSnapshot } from '../types/share';
import { isValidLink } from './utils';

const STORAGE_KEY_WHATSAPP = 'admin_whatsapp_config';
const STORAGE_KEY_LINKS = 'cabin_share_links';

// Unguessable token generator avoiding ambiguous chars (0, O, 1, I, l)
export function generateShareId(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = 'cb_';
  const array = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
    for (let i = 0; i < 8; i++) {
      result += chars[array[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return result;
}

export function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9]/g, '');
  // If starts with Indonesian local 08..., convert to 628...
  if (cleaned.startsWith('08')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

export function validateWhatsAppNumber(phone: string): { isValid: boolean; error?: string } {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) {
    return { isValid: false, error: 'WhatsApp number is required.' };
  }
  if (cleaned.length < 8 || cleaned.length > 16) {
    return { isValid: false, error: 'Please enter a valid international phone number (8 to 16 digits).' };
  }
  return { isValid: true };
}

export function buildWhatsAppMessage(
  boatName: string,
  cabins: CabinSnapshot[],
  dates: string,
  language: 'FR' | 'ENG'
): string {
  const cleanDates = dates?.trim() || '';
  const dateStr = cleanDates ? ` for ${cleanDates}` : '';
  const dateStrFr = cleanDates ? ` pour les dates du ${cleanDates}` : '';

  if (!cabins || cabins.length === 0) {
    if (language === 'FR') {
      return `Bonjour, je suis intéressé(e) par le bateau ${boatName}${dateStrFr}. Pourriez-vous me renseigner sur les disponibilités ?`;
    }
    return `Hello, I'm interested in the boat ${boatName}${dateStr}. Could you please share more details?`;
  }

  const names = cabins.map(c => (language === 'ENG' && c.nameEng ? c.nameEng : c.name).trim());
  let cabinNamesJoined = '';
  if (names.length === 1) {
    cabinNamesJoined = names[0];
  } else if (names.length === 2) {
    cabinNamesJoined = language === 'FR' ? `${names[0]} et ${names[1]}` : `${names[0]} and ${names[1]}`;
  } else {
    const allButLast = names.slice(0, -1).join(', ');
    const last = names[names.length - 1];
    cabinNamesJoined = language === 'FR' ? `${allButLast} et ${last}` : `${allButLast}, and ${last}`;
  }

  if (language === 'FR') {
    if (cabins.length === 1) {
      return `Bonjour, je suis intéressé(e) par la cabine ${cabinNamesJoined} sur ${boatName}${dateStrFr}.`;
    }
    return `Bonjour, je suis intéressé(e) par les cabines ${cabinNamesJoined} sur ${boatName}${dateStrFr}.`;
  }

  if (cabins.length === 1) {
    return `Hello, I'm interested in the ${cabinNamesJoined} on ${boatName}${dateStr}.`;
  }
  return `Hello, I'm interested in the ${cabinNamesJoined} on ${boatName}${dateStr}.`;
}

export function buildWhatsAppLink(whatsappNumber: string, message: string): string {
  const clean = cleanPhoneNumber(whatsappNumber);
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

export function getDriveThumbnailUrl(urlOrId: string): string {
  if (!urlOrId) return '';
  let id = urlOrId;
  if (urlOrId.startsWith('http')) {
    const m = urlOrId.match(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/) || urlOrId.match(/[&?]id=([a-zA-Z0-9_-]{25,50})/) || urlOrId.match(/\/d\/([a-zA-Z0-9_-]{25,50})/);
    if (m && m[1]) id = m[1];
    else return urlOrId;
  }
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;
}

// Convert Drive ID or URL to directly viewable high-res CDN URL
export function getDisplayImageUrl(urlOrId: string): string {
  if (!urlOrId) return '';
  if (!urlOrId.startsWith('http')) {
    return `https://lh3.googleusercontent.com/d/${urlOrId}`;
  }
  const fileDMatch = urlOrId.match(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/);
  if (fileDMatch && fileDMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${fileDMatch[1]}`;
  }
  const idParamMatch = urlOrId.match(/[&?]id=([a-zA-Z0-9_-]{25,50})/);
  if (idParamMatch && idParamMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
  }
  return urlOrId;
}

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Elegant luxury yacht cabin fallback photos
const FALLBACK_CABIN_IMAGES = [
  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80'
];

export function resolveCabinImageUrl(
  boatName: string,
  cabin: Cabin,
  kicFiles: DriveFile[],
  lebaliblogFiles: DriveFile[],
  wiredUrls: string[] = []
): string {
  const allFiles = [...kicFiles, ...lebaliblogFiles];
  const cabinNameFr = removeAccents(cabin.name || '').toLowerCase();
  const cabinNameEng = removeAccents(cabin.nameEng || '').toLowerCase();

  // 1. Check for Drive files directly matching the cabin name
  if (allFiles.length > 0) {
    // Try exact cabin name in filename
    const exactMatch = allFiles.find(f => {
      const fName = removeAccents(f.name || '').toLowerCase();
      return (cabinNameFr && fName.includes(cabinNameFr)) || (cabinNameEng && fName.includes(cabinNameEng));
    });
    if (exactMatch) {
      return getDisplayImageUrl(exactMatch.id);
    }

    // Try token matching (at least one substantive keyword of cabin name)
    const keywords = (cabin.nameEng || cabin.name)
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length >= 4 && !['cabin', 'chambre', 'room', 'avec', 'with', 'the'].includes(w));
    
    if (keywords.length > 0) {
      const tokenMatch = allFiles.find(f => {
        const fName = removeAccents(f.name || '').toLowerCase();
        return keywords.some(k => fName.includes(k));
      });
      if (tokenMatch) {
        return getDisplayImageUrl(tokenMatch.id);
      }
    }
  }

  // 2. Check custom wired boat images if available
  if (wiredUrls && wiredUrls.length > 0) {
    // Check if any wired URL contains cabin keyword
    const matchWired = wiredUrls.find(u => {
      const uLower = u.toLowerCase();
      return (cabinNameFr && uLower.includes(cabinNameFr)) || (cabinNameEng && uLower.includes(cabinNameEng));
    });
    if (matchWired) {
      return getDisplayImageUrl(matchWired);
    }
    // Fall back to first wired boat image
    return getDisplayImageUrl(wiredUrls[0]);
  }

  // 3. Check if any Drive file matches the boat name
  if (allFiles.length > 0 && boatName) {
    const boatClean = removeAccents(boatName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const boatFile = allFiles.find(f => {
      const fClean = removeAccents(f.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return fClean.includes(boatClean);
    });
    if (boatFile) {
      return getDisplayImageUrl(boatFile.id);
    }
  }

  // 4. Fallback luxury nautical placeholder
  const hash = Math.abs(
    (cabin.id || cabin.name).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  );
  return FALLBACK_CABIN_IMAGES[hash % FALLBACK_CABIN_IMAGES.length];
}

// Resolve multiple images for a cabin gallery
export function resolveCabinImages(
  boatName: string,
  cabin: Cabin,
  kicFiles: DriveFile[],
  lebaliblogFiles: DriveFile[],
  wiredUrls: string[] = []
): string[] {
  const images: string[] = [];
  const allFiles = [...kicFiles, ...lebaliblogFiles];
  const cabinNameFr = removeAccents(cabin.name || '').toLowerCase();
  const cabinNameEng = removeAccents(cabin.nameEng || '').toLowerCase();

  // 1. Direct drive files matching cabin name
  if (allFiles.length > 0) {
    allFiles.forEach(f => {
      const fName = removeAccents(f.name || '').toLowerCase();
      if ((cabinNameFr && fName.includes(cabinNameFr)) || (cabinNameEng && fName.includes(cabinNameEng))) {
        const url = getDisplayImageUrl(f.id);
        if (url && !images.includes(url)) images.push(url);
      }
    });

    // Token matches
    if (images.length === 0) {
      const keywords = (cabin.nameEng || cabin.name)
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length >= 4 && !['cabin', 'chambre', 'room', 'avec', 'with', 'the'].includes(w));
      
      if (keywords.length > 0) {
        allFiles.forEach(f => {
          const fName = removeAccents(f.name || '').toLowerCase();
          if (keywords.some(k => fName.includes(k))) {
            const url = getDisplayImageUrl(f.id);
            if (url && !images.includes(url)) images.push(url);
          }
        });
      }
    }
  }

  // 2. Wired images
  if (wiredUrls && wiredUrls.length > 0) {
    wiredUrls.forEach(u => {
      const uLower = u.toLowerCase();
      if ((cabinNameFr && uLower.includes(cabinNameFr)) || (cabinNameEng && uLower.includes(cabinNameEng))) {
        const url = getDisplayImageUrl(u);
        if (url && !images.includes(url)) images.push(url);
      }
    });
    // Add first wired images if still empty
    if (images.length === 0) {
      wiredUrls.slice(0, 3).forEach(u => {
        const url = getDisplayImageUrl(u);
        if (url && !images.includes(url)) images.push(url);
      });
    }
  }

  // 3. Boat drive files if still empty
  if (images.length === 0 && allFiles.length > 0 && boatName) {
    const boatClean = removeAccents(boatName).toLowerCase().replace(/[^a-z0-9]/g, '');
    allFiles.forEach(f => {
      const fClean = removeAccents(f.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (fClean.includes(boatClean)) {
        const url = getDisplayImageUrl(f.id);
        if (url && !images.includes(url)) images.push(url);
      }
    });
  }

  // 4. Fallback if empty
  if (images.length === 0) {
    const primary = resolveCabinImageUrl(boatName, cabin, kicFiles, lebaliblogFiles, wiredUrls);
    images.push(primary);
  }

  return images.slice(0, 5);
}

// Extract standard amenities & features for cabin card
export function extractCabinFeatures(cabin: Cabin, language: 'FR' | 'ENG', extraBeds = 0): string[] {
  const features: string[] = [];
  const text = `${cabin.name} ${cabin.nameEng || ''}`.toLowerCase();

  // Bed type
  if (text.includes('master') || text.includes('suite')) {
    features.push(language === 'FR' ? 'Lit King Size' : '1 King Bed');
  } else if (text.includes('family') || text.includes('famille')) {
    features.push(language === 'FR' ? 'Lit Queen + Lits simples' : '1 Queen Bed + Single Beds');
  } else if (text.includes('twin') || text.includes('single')) {
    features.push(language === 'FR' ? '2 Lits simples' : '2 Twin Beds');
  } else if (text.includes('bunk') || text.includes('superpos')) {
    features.push(language === 'FR' ? 'Lits superposés' : 'Bunk Beds');
  } else if (text.includes('sharing') || text.includes('partage')) {
    features.push(language === 'FR' ? 'Lit en cabine partagée' : 'Sharing Cabin Bed');
  } else {
    features.push(language === 'FR' ? '1 Lit Queen / Double' : '1 Queen Bed');
  }

  // Extra beds
  if (extraBeds > 0) {
    features.push(
      language === 'FR'
        ? `+ ${extraBeds} Lit${extraBeds > 1 ? 's' : ''} d'appoint`
        : `+ ${extraBeds} Extra Bed${extraBeds > 1 ? 's' : ''}`
    );
  }

  // Bathroom
  if (!text.includes('sharing') && !text.includes('shared')) {
    features.push(language === 'FR' ? 'Salle de bain privée attenante' : 'Private Ensuite Bathroom');
  } else {
    features.push(language === 'FR' ? 'Salle de bain dédiée' : 'Dedicated Bathroom');
  }

  // View & Deck
  if (text.includes('sea view') || text.includes('vue mer') || text.includes('ocean')) {
    features.push(language === 'FR' ? 'Vue mer panoramique' : 'Panoramic Sea View');
  } else if (text.includes('upper') || text.includes('top')) {
    features.push(language === 'FR' ? 'Pont supérieur (Upper Deck)' : 'Upper Deck');
  } else {
    features.push(language === 'FR' ? 'Vue sur l\'océan' : 'Sea View');
  }

  // Air conditioning & Hot water
  features.push(language === 'FR' ? 'Climatisation' : 'Air Conditioning');
  features.push(language === 'FR' ? 'Eau chaude' : 'Hot Water');

  return features;
}

export function buildDynamicWhatsAppMessage(
  boatName: string,
  cabinName: string | undefined,
  dates: string,
  language: 'FR' | 'ENG'
): string {
  const cleanDates = dates?.trim();
  const dateStr = cleanDates ? ` for ${cleanDates}` : '';
  const dateStrFr = cleanDates ? ` pour les dates du ${cleanDates}` : '';

  if (language === 'FR') {
    if (cabinName) {
      return `Bonjour, je suis intéressé(e) par la cabine ${cabinName} sur ${boatName}${dateStrFr}. Est-elle toujours disponible ?`;
    }
    return `Bonjour, je suis intéressé(e) par le bateau ${boatName}${dateStrFr}. Pourriez-vous me renseigner sur les disponibilités ?`;
  }

  if (cabinName) {
    return `Hello, I'm interested in the ${cabinName} cabin on ${boatName}${dateStr}. Is it still available?`;
  }
  return `Hello, I'm interested in ${boatName}${dateStr}. Could you please share more details?`;
}
export function getCleanWebsiteUrl(cabin: Cabin, language: 'FR' | 'ENG', linkPreference: 'AUTO' | 'FR' | 'ENG' = 'AUTO'): string {
  let link = '';
  if (linkPreference === 'ENG') {
    link = cabin.linkEng || cabin.link;
  } else if (linkPreference === 'FR') {
    link = cabin.link || cabin.linkEng;
  } else {
    link = language === 'ENG' ? (cabin.linkEng || cabin.link) : (cabin.link || cabin.linkEng);
  }

  if (!link) return '';
  
  const fuelPattern = /(?:⚠️\s*)?⛽?\s*(?:Surcharge\s*Carburant|Fuel\s*Surcharge)\s*[:\-]?\s*[^.\n\r]+[.\s]*/gi;
  const notePattern = /(?:Note\s*[:\-]\s*)?(?:Service\s*client\s*limité\s*en\s*cas\s*de\s*problème\s*sur\s*ce\s*bateau|Limited\s*(?:client|customer)\s*service\s*in\s*case\s*of\s*problems\s*on\s*this\s*boat)[.\s]*/gi;

  const cleaned = link.replace(fuelPattern, '').replace(notePattern, '').trim();
  if (isValidLink(cleaned)) {
    return cleaned;
  }
  return '';
}

// Helper to safely wrap Firestore promises with a timeout
function withTimeout<T>(promise: Promise<T>, timeoutMs = 10000, fallbackVal?: T): Promise<T> {
  const timeout = new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      if (fallbackVal !== undefined) {
        resolve(fallbackVal);
      } else {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]);
}

// WhatsApp Configuration Storage
export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  // 1. Try local cache first
  const localCached = localStorage.getItem(STORAGE_KEY_WHATSAPP);
  let localConfig: WhatsAppConfig = DEFAULT_WHATSAPP_CONFIG;
  if (localCached) {
    try {
      localConfig = { ...DEFAULT_WHATSAPP_CONFIG, ...JSON.parse(localCached) };
    } catch (_) {}
  }

  // 2. Try Firestore if signed in, but never block longer than 1.5s
  if (auth.currentUser) {
    try {
      const docRef = doc(db, 'config', 'whatsapp');
      const snap = await withTimeout(getDoc(docRef), 1500, null as any);
      if (snap && snap.exists && snap.exists()) {
        const cloudData = snap.data() as Partial<WhatsAppConfig>;
        const merged = { ...localConfig, ...cloudData };
        localStorage.setItem(STORAGE_KEY_WHATSAPP, JSON.stringify(merged));
        return merged;
      }
    } catch (e) {
      console.warn('WhatsApp cloud config fetch timed out or offline, using local config:', e);
    }
  }

  return localConfig;
}

export function getWiredImages(boatName: string): string[] {
  try {
    const id1 = `wired_images_kic_${boatName.replace(/[^a-zA-Z0-9_\-]+/g, '_').toLowerCase()}`;
    const id2 = `wired_images_lbb_${boatName.replace(/[^a-zA-Z0-9_\-]+/g, '_').toLowerCase()}`;
    const cached = localStorage.getItem(id1) || localStorage.getItem(id2);
    if (cached) return JSON.parse(cached);
  } catch (_) {}
  return [];
}

export async function saveWhatsAppConfig(config: WhatsAppConfig): Promise<void> {
  const rawNumber = (config.number || '').trim();
  const normalizedNumber = cleanPhoneNumber(rawNumber);

  const cleanConfig: WhatsAppConfig = {
    number: rawNumber.startsWith('+') ? `+${normalizedNumber}` : normalizedNumber,
    businessName: (config.businessName || '').trim(),
    defaultCaption: (config.defaultCaption || '').trim(),
    defaultDurationDays: Number(config.defaultDurationDays) || 3,
  };

  // 1. Immediately save to localStorage (guaranteed, synchronous, never hangs)
  try {
    localStorage.setItem(STORAGE_KEY_WHATSAPP, JSON.stringify(cleanConfig));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }

  // 2. Broadcast event to any open tabs/components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('whatsapp-config-updated', { detail: cleanConfig }));
  }

  // 3. Non-blocking background Firestore sync (never blocks or hangs the UI)
  (async () => {
    try {
      const docRef = doc(db, 'config', 'whatsapp');
      await setDoc(docRef, {
        ...cleanConfig,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid || 'local_admin',
      });
    } catch (e) {
      console.warn('Firestore WhatsApp config sync deferred/offline (saved locally):', e);
    }
  })();
}

export function parseNoteToBoatSnapshot(
  note: { title: string; content: string; boatSnapshot?: BoatSnapshot },
  boats: Boat[],
  kicFiles: DriveFile[] = [],
  lebaliblogFiles: DriveFile[] = []
): BoatSnapshot {
  if (note.boatSnapshot && note.boatSnapshot.cabins && note.boatSnapshot.cabins.length > 0) {
    return note.boatSnapshot;
  }

  const content = note.content || '';
  
  // 1. Boat Name
  let boatName = '';
  const boatMatch = content.match(/(?:Bateau|Boat)\s*:\s*([^\n\r]+)/i);
  if (boatMatch && boatMatch[1]) {
    boatName = boatMatch[1].replace(/\s*\([^)]*\)/g, '').trim();
  }
  if (!boatName) {
    boatName = note.title.replace(/\s*\([^)]*\)/g, '').trim();
  }

  const matchedBoat = boats.find(b => b.name.toLowerCase() === boatName.toLowerCase()) || 
                      boats.find(b => boatName.toLowerCase().includes(b.name.toLowerCase())) ||
                      boats.find(b => b.name.toLowerCase().includes(boatName.toLowerCase()));
  
  const finalBoatName = matchedBoat ? matchedBoat.name : boatName;

  // 2. Dates
  let dates = '';
  const datesMatch = content.match(/(?:Dates?)\s*:\s*([^\n\r]+)/i);
  if (datesMatch && datesMatch[1]) {
    dates = datesMatch[1].trim();
  }

  // 3. Duration
  let duration: string | undefined = undefined;
  const durMatch = (dates || content).match(/(?:2D1N|3D2N|4D3N|4D2N|5D4N|3J2N|2J1N|4J3N)/i);
  if (durMatch) {
    duration = durMatch[0].toUpperCase();
  }

  // 4. Itinerary
  let itinerary: string | undefined = undefined;
  const itinMatch = content.match(/(?:Itinéraire|Itinerary)\s*:\s*([^\n\r]+)/i);
  if (itinMatch && itinMatch[1]) {
    itinerary = itinMatch[1].trim();
  }

  // 5. Departure
  let departure: string | undefined = undefined;
  const depMatch = content.match(/(?:Départ|Departure)\s*:\s*([^\n\r]+)/i);
  if (depMatch && depMatch[1]) {
    departure = depMatch[1].trim();
  }

  // 6. Fuel surcharge
  let fuelSurcharge: string | undefined = undefined;
  const fuelMatch = content.match(/(?:⚠️\s*)?⛽?\s*(?:Surcharge\s*Carburant|Fuel\s*Surcharge)\s*[:\-]?\s*([^.\n\r]+)/i);
  if (fuelMatch && fuelMatch[1]) {
    fuelSurcharge = fuelMatch[1].trim();
  }

  // 7. Limited service note
  let limitedServiceNote: string | undefined = undefined;
  if (/(?:Service\s*client\s*limité|Limited\s*(?:client|customer)\s*service)/i.test(content)) {
    limitedServiceNote = /Service\s*client\s*limité/i.test(content)
      ? "Note : Service client limité en cas de problème sur ce bateau"
      : "Note: Limited client service in case of problems on this boat";
  }

  // 8. Extract Cabins
  const cabinSnapshots: CabinSnapshot[] = [];
  const boatWired = getWiredImages(finalBoatName);

  const cabinSectionMatch = content.match(/(?:Chambre|Cabin)\s*:\s*([\s\S]*?)(?=(?:⚠️|⛽|Note\s*:|$))/i);
  const cabinText = cabinSectionMatch ? cabinSectionMatch[1] : '';

  const rawCabinBlocks = cabinText.split(/\n(?=\s*-\s*)/);

  for (const block of rawCabinBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const firstLine = trimmed.split('\n')[0].replace(/^-\s*/, '').trim();
    if (!firstLine) continue;

    let cabinName = firstLine;
    let extractedUrl = '';

    if (firstLine.includes(':')) {
      const parts = firstLine.split(':');
      cabinName = parts[0].trim();
      const possibleUrl = parts.slice(1).join(':').trim();
      if (possibleUrl.startsWith('http://') || possibleUrl.startsWith('https://')) {
        extractedUrl = possibleUrl;
      }
    }

    const detailMatch = block.match(/(?:Detail|Détail|Details)\s*:\s*(https?:\/\/[^\s\n\r]+)/i);
    const urlMatch = block.match(/https?:\/\/[^\s\n\r]+/);
    const websiteUrl = extractedUrl || (detailMatch ? detailMatch[1].trim() : '') || (urlMatch ? urlMatch[0].trim() : '');

    let count = 1;
    const countMatch = cabinName.match(/^(\d+)x\s*/i);
    if (countMatch) {
      count = parseInt(countMatch[1], 10);
      cabinName = cabinName.replace(/^(\d+)x\s*/i, '').trim();
    }

    const cleanCabinName = cabinName.replace(/\s*\([^)]*\)/g, '').trim();
    const matchedCabin = matchedBoat?.cabins.find(c => 
      c.name.toLowerCase().includes(cleanCabinName.toLowerCase()) || 
      (c.nameEng && c.nameEng.toLowerCase().includes(cleanCabinName.toLowerCase())) ||
      cleanCabinName.toLowerCase().includes(c.name.toLowerCase())
    );

    const cabinId = matchedCabin ? matchedCabin.id : `cab_${Math.random().toString(36).substring(2, 9)}`;
    const finalName = matchedCabin ? matchedCabin.name : cleanCabinName;
    const finalNameEng = matchedCabin?.nameEng;
    
    let images: string[] = [];
    if (matchedCabin) {
      images = resolveCabinImages(finalBoatName, matchedCabin, kicFiles, lebaliblogFiles, boatWired);
    }
    const imageUrl = images[0] || (matchedCabin ? resolveCabinImageUrl(finalBoatName, matchedCabin, kicFiles, lebaliblogFiles, boatWired) : undefined);
    const features = matchedCabin ? extractCabinFeatures(matchedCabin, 'ENG', 0) : undefined;

    cabinSnapshots.push({
      id: cabinId,
      name: finalName,
      nameEng: finalNameEng,
      count,
      extraBeds: 0,
      imageUrl,
      images,
      features,
      websiteUrl: websiteUrl || (matchedCabin ? getCleanWebsiteUrl(matchedCabin, 'ENG', 'AUTO') : ''),
      itinerary,
      departure
    });
  }

  if (cabinSnapshots.length === 0 && matchedBoat && matchedBoat.cabins.length > 0) {
    const firstCabin = matchedBoat.cabins[0];
    const images = resolveCabinImages(finalBoatName, firstCabin, kicFiles, lebaliblogFiles, boatWired);
    cabinSnapshots.push({
      id: firstCabin.id,
      name: firstCabin.name,
      nameEng: firstCabin.nameEng,
      count: 1,
      extraBeds: 0,
      imageUrl: images[0] || resolveCabinImageUrl(finalBoatName, firstCabin, kicFiles, lebaliblogFiles, boatWired),
      images,
      features: extractCabinFeatures(firstCabin, 'ENG', 0),
      websiteUrl: getCleanWebsiteUrl(firstCabin, 'ENG', 'AUTO'),
      itinerary,
      departure
    });
  }

  return {
    boatName: finalBoatName,
    itinerary,
    dates,
    duration,
    departure,
    cabins: cabinSnapshots,
    fuelSurcharge,
    limitedServiceNote
  };
}

// Share Link Management
export async function createShareLinkSnapshot(snapshot: ShareLinkSnapshot): Promise<{ success: boolean; cloudSynced: boolean; error?: string }> {
  // 1. Save to local storage cache immediately
  try {
    const existing = getLocalShareLinks();
    const updated = [snapshot, ...existing.filter(l => l.shareId !== snapshot.shareId)];
    localStorage.setItem(STORAGE_KEY_LINKS, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to store share link in localStorage:', err);
  }

  // 2. Persist to Firestore with a 10s safety timeout and 2 attempts
  let cloudSynced = false;
  let lastError: string | undefined = undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const docRef = doc(db, 'shareLinks', snapshot.shareId);
      await withTimeout(
        setDoc(docRef, {
          ...snapshot,
          createdBy: auth.currentUser?.uid || 'anonymous',
        }),
        10000
      );
      cloudSynced = true;
      break;
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`Firestore write attempt ${attempt} for share link failed (saved locally):`, err);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }

  return { success: true, cloudSynced, error: lastError };
}

export function getLocalShareLinks(): ShareLinkSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LINKS);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (_) {}
  return [];
}

export interface GetShareLinkResult {
  snapshot: ShareLinkSnapshot | null;
  status: 'success' | 'not_found' | 'network_error';
  errorMessage?: string;
}

export async function getShareLink(shareId: string): Promise<GetShareLinkResult> {
  if (!shareId) return { snapshot: null, status: 'not_found' };

  // Clean shareId in case URL had trailing slashes or spaces
  const cleanId = shareId.trim().replace(/\/+$/, '');

  // 1. Try Firestore first with up to 2 attempts and 10s timeout
  let lastError: any = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const docRef = doc(db, 'shareLinks', cleanId);
      const snap = await withTimeout(getDoc(docRef), 10000);
      if (snap && snap.exists()) {
        return { snapshot: snap.data() as ShareLinkSnapshot, status: 'success' };
      } else {
        // Document does not exist in Firestore. Check local storage before giving up
        const localList = getLocalShareLinks();
        const found = localList.find(l => l.shareId === cleanId);
        if (found) {
          return { snapshot: found, status: 'success' };
        }
        return { snapshot: null, status: 'not_found' };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Firestore fetch attempt ${attempt} for share link failed:`, err);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  // 2. Fallback to local storage if Firestore connection failed
  const localList = getLocalShareLinks();
  const found = localList.find(l => l.shareId === cleanId);
  if (found) {
    return { snapshot: found, status: 'success' };
  }

  return { 
    snapshot: null, 
    status: 'network_error', 
    errorMessage: lastError?.message || 'Connection timed out while retrieving availability.' 
  };
}

// Resilient expiration check with clock-skew tolerance
export function isShareLinkExpired(snapshot: ShareLinkSnapshot | null): boolean {
  if (!snapshot) return false;
  if (snapshot.status === 'revoked') return true;

  const now = Date.now();
  const expiresAt = Number(snapshot.expiresAt);
  const createdAt = Number(snapshot.createdAt);

  if (!expiresAt || isNaN(expiresAt)) {
    // If expiresAt is missing, fall back to 3 days from createdAt
    if (createdAt && !isNaN(createdAt)) {
      return now > (createdAt + 3 * 24 * 60 * 60 * 1000);
    }
    return false;
  }

  // If createdAt and expiresAt are provided, protect against device clock skew:
  if (createdAt && !isNaN(createdAt) && expiresAt > createdAt) {
    const duration = expiresAt - createdAt;
    const elapsed = now - createdAt;
    // Only expire if both now > expiresAt AND elapsed time exceeds duration
    if (elapsed > 0) {
      return elapsed > duration;
    }
  }

  return now > expiresAt;
}

export async function listAllShareLinks(): Promise<ShareLinkSnapshot[]> {
  const localMap = new Map<string, ShareLinkSnapshot>();
  getLocalShareLinks().forEach(item => localMap.set(item.shareId, item));

  // If signed in, fetch from Firestore with safety timeout
  if (auth.currentUser) {
    try {
      const q = query(collection(db, 'shareLinks'), orderBy('createdAt', 'desc'), limit(100));
      const snaps = await withTimeout(getDocs(q), 2500, null as any);
      if (snaps && snaps.forEach) {
        snaps.forEach((docSnap: any) => {
          const data = docSnap.data() as ShareLinkSnapshot;
          localMap.set(data.shareId, data);
        });
      }
    } catch (err) {
      console.warn('Firestore list for share links failed, using local list:', err);
    }
  }

  const combined = Array.from(localMap.values());
  combined.sort((a, b) => b.createdAt - a.createdAt);
  return combined;
}

export async function revokeShareLink(shareId: string): Promise<void> {
  // Update local
  const localList = getLocalShareLinks();
  const updated = localList.map(l => l.shareId === shareId ? { ...l, status: 'revoked' as const } : l);
  localStorage.setItem(STORAGE_KEY_LINKS, JSON.stringify(updated));

  // Update Firestore with timeout
  try {
    const docRef = doc(db, 'shareLinks', shareId);
    await withTimeout(updateDoc(docRef, { status: 'revoked' }), 2000);
  } catch (err) {
    console.warn('Failed to update revoke status in Firestore (updated locally):', err);
  }
}

export async function deleteShareLink(shareId: string): Promise<void> {
  // Update local
  const localList = getLocalShareLinks();
  const updated = localList.filter(l => l.shareId !== shareId);
  localStorage.setItem(STORAGE_KEY_LINKS, JSON.stringify(updated));

  // Update Firestore with timeout
  try {
    const docRef = doc(db, 'shareLinks', shareId);
    await withTimeout(deleteDoc(docRef), 2000);
  } catch (err) {
    console.warn('Failed to delete share link from Firestore (deleted locally):', err);
  }
}
