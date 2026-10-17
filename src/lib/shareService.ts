import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import { Cabin, DriveFile, SavedNote, Boat } from '../store';
import { ShareLinkSnapshot, BoatSnapshot, WhatsAppConfig, DEFAULT_WHATSAPP_CONFIG, CabinSnapshot } from '../types/share';
import { isValidLink, translateDate } from './utils';

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

/**
 * Returns a globally accessible public URL for the share link.
 * In AI Studio environments, transforms the private dev domain (ais-dev-*)
 * to the publicly reachable shared domain (ais-pre-*) so external clients can view without authentication.
 */
export function getPublicShareUrl(shareId: string): string {
  const origin = window.location.origin;
  const publicOrigin = origin.replace('ais-dev-', 'ais-pre-');
  return `${publicOrigin}/share/${shareId}`;
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

// Elegant luxury yacht cabin fallback photos (neutral, unbranded, watermark-free, 100% public CDN)
export const FALLBACK_CABIN_IMAGES = [
  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80'
];

/**
 * Generates all search variations and aliases for a boat name (handling spacing, punctuation, and numerals)
 */
export function getBoatSearchAliases(boatName: string | null | undefined): string[] {
  if (!boatName) return [];
  const raw = removeAccents(boatName).toLowerCase().trim();
  const base = raw.split('(')[0].split('-')[0].trim();
  
  const aliases = new Set<string>();
  
  const addVariants = (name: string) => {
    if (!name) return;
    aliases.add(name);
    const noSpecial = name.replace(/[^a-z0-9]/g, '');
    if (noSpecial.length >= 2) aliases.add(noSpecial);
    const underscored = name.replace(/[\s-]+/g, '_');
    if (underscored.length >= 2) aliases.add(underscored);
    const hyphenated = name.replace(/[\s_]+/g, '-');
    if (hyphenated.length >= 2) aliases.add(hyphenated);

    if (/\b1\b/.test(name)) {
      addVariants(name.replace(/\b1\b/g, 'one'));
      addVariants(name.replace(/\b1\b/g, 'i'));
    }
    if (/\b2\b/.test(name)) {
      addVariants(name.replace(/\b2\b/g, 'two'));
      addVariants(name.replace(/\b2\b/g, 'ii'));
    }
    if (/\b3\b/.test(name)) {
      addVariants(name.replace(/\b3\b/g, 'three'));
      addVariants(name.replace(/\b3\b/g, 'iii'));
    }
    if (/\b4\b/.test(name)) {
      addVariants(name.replace(/\b4\b/g, 'four'));
      addVariants(name.replace(/\b4\b/g, 'iv'));
    }
  };

  addVariants(raw);
  if (base && base !== raw) {
    addVariants(base);
  }

  // Custom known vessel aliases
  if (raw.includes('alf 3') || raw.includes('alf3') || raw.includes('al fathran') || raw.includes('alfathran')) {
    aliases.add('alf 3');
    aliases.add('alf3');
    aliases.add('al fathran 3');
    aliases.add('alfathran 3');
    aliases.add('al fathran iii');
    aliases.add('alfathran iii');
    aliases.add('al fathran');
    aliases.add('alfathran');
  }
  if (raw.includes('nk jaya') || raw.includes('nkjaya')) {
    aliases.add('nk jaya');
    aliases.add('nkjaya');
    aliases.add('nk_jaya');
    aliases.add('n k jaya');
  }
  if (raw.includes('dunia baru') || raw.includes('duniabaru')) {
    aliases.add('dunia baru');
    aliases.add('duniabaru');
    aliases.add('dunia_baru');
  }
  if (raw.includes('3 island') || raw.includes('3island')) {
    aliases.add('3 island');
    aliases.add('3island');
    aliases.add('3_island');
    aliases.add('3-island');
    aliases.add('three island');
    aliases.add('threeisland');
  }

  return Array.from(aliases).filter(a => a.length >= 2);
}

/**
 * Checks whether a given drive filename belongs strictly to the requested boat
 */
export function isFileBelongingToBoat(fileName: string, boatName: string): boolean {
  if (!fileName || !boatName) return false;
  const fRaw = removeAccents(fileName).toLowerCase();
  const fNormal = fRaw.replace(/[^a-z0-9]/g, '');

  const aliases = getBoatSearchAliases(boatName);
  for (const alias of aliases) {
    const aliasNormal = alias.replace(/[^a-z0-9]/g, '');
    if (aliasNormal.length >= 3 && fNormal.includes(aliasNormal)) {
      return true;
    }
    if (fRaw.includes(alias)) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts distinctive cabin keywords (including room names in parentheses like 'Jember', 'Padar')
 */
function extractCabinKeywords(cabin: Cabin): string[] {
  const words: string[] = [];
  const addNames = (nameStr?: string) => {
    if (!nameStr) return;
    // Extract text in parentheses (e.g., 'Private Cabin (Jember)' -> 'jember', 'Master Cabin (Padar)' -> 'padar')
    const parenMatches = nameStr.match(/\(([^)]+)\)/g);
    if (parenMatches) {
      parenMatches.forEach(p => {
        const inside = removeAccents(p.replace(/[()]/g, '')).toLowerCase().trim();
        if (inside.length >= 3) words.push(inside);
      });
    }

    const clean = removeAccents(nameStr).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const parts = clean.split(/\s+/).filter(Boolean);
    const exclude = ['cabin', 'cabine', 'chambre', 'room', 'avec', 'with', 'the', 'for', 'and', 'de', 'du', 'la', 'le'];
    parts.forEach(p => {
      if (p.length >= 3 && !exclude.includes(p)) {
        words.push(p);
      }
    });
  };

  addNames(cabin.name);
  addNames(cabin.nameEng);

  return Array.from(new Set(words));
}

export function resolveCabinImageUrl(
  boatName: string,
  cabin: Cabin,
  kicFiles: DriveFile[],
  lebaliblogFiles: DriveFile[],
  wiredUrls: string[] = []
): string {
  const allFiles = [...kicFiles, ...lebaliblogFiles];
  const boatWired = wiredUrls && wiredUrls.length > 0 ? wiredUrls : getWiredImages(boatName);

  // 1. Isolate Drive files strictly belonging to THIS boat
  const boatFiles = allFiles.filter(f => isFileBelongingToBoat(f.name, boatName));

  const cabinNameFr = removeAccents(cabin.name || '').toLowerCase();
  const cabinNameEng = removeAccents(cabin.nameEng || '').toLowerCase();
  const cabinKeywords = extractCabinKeywords(cabin);

  // 2. Check if this cabin has a direct drive link in cabin.link or cabin.linkEng
  const checkDriveLink = (link?: string): string | null => {
    if (!link) return null;
    const fileDMatch = link.match(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/);
    if (fileDMatch && fileDMatch[1]) {
      return getDisplayImageUrl(fileDMatch[1]);
    }
    const idParamMatch = link.match(/[&?]id=([a-zA-Z0-9_-]{25,50})/);
    if (idParamMatch && idParamMatch[1]) {
      return getDisplayImageUrl(idParamMatch[1]);
    }
    return null;
  };
  const directLinkUrl = checkDriveLink(cabin.link) || checkDriveLink(cabin.linkEng);
  if (directLinkUrl) {
    return directLinkUrl;
  }

  // 3. Search this boat's drive files for cabin match
  if (boatFiles.length > 0) {
    // Exact cabin name match within this boat's files
    const exactMatch = boatFiles.find(f => {
      const fName = removeAccents(f.name || '').toLowerCase();
      return (cabinNameFr && fName.includes(cabinNameFr)) || (cabinNameEng && fName.includes(cabinNameEng));
    });
    if (exactMatch) {
      return getDisplayImageUrl(exactMatch.id);
    }

    // Keyword match within this boat's files
    if (cabinKeywords.length > 0) {
      const keywordMatch = boatFiles.find(f => {
        const fName = removeAccents(f.name || '').toLowerCase();
        return cabinKeywords.some(k => fName.includes(k));
      });
      if (keywordMatch) {
        return getDisplayImageUrl(keywordMatch.id);
      }
    }
  }

  // 4. Search wired images for this boat
  if (boatWired.length > 0) {
    // Check if any wired URL contains cabin keyword
    if (cabinKeywords.length > 0) {
      const matchedWired = boatWired.find(u => {
        const uLower = u.toLowerCase();
        return cabinKeywords.some(k => uLower.includes(k));
      });
      if (matchedWired) {
        return getDisplayImageUrl(matchedWired);
      }
    }
    // Return first wired image for this boat
    return getDisplayImageUrl(boatWired[0]);
  }

  // 5. Fallback to any photo of THIS boat in Google Drive
  if (boatFiles.length > 0) {
    return getDisplayImageUrl(boatFiles[0].id);
  }

  // 6. Universal fallback (neutral yacht photo)
  // NEVER use files belonging to a different boat!
  const hash = Math.abs(
    (boatName + (cabin.id || cabin.name)).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
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
  const boatWired = wiredUrls && wiredUrls.length > 0 ? wiredUrls : getWiredImages(boatName);

  // 1. Isolate Drive files strictly belonging to THIS boat
  const boatFiles = allFiles.filter(f => isFileBelongingToBoat(f.name, boatName));

  const cabinNameFr = removeAccents(cabin.name || '').toLowerCase();
  const cabinNameEng = removeAccents(cabin.nameEng || '').toLowerCase();
  const cabinKeywords = extractCabinKeywords(cabin);

  // 2. Check if cabin has a direct drive link
  const checkDriveLink = (link?: string): string | null => {
    if (!link) return null;
    const fileDMatch = link.match(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/);
    if (fileDMatch && fileDMatch[1]) return getDisplayImageUrl(fileDMatch[1]);
    const idParamMatch = link.match(/[&?]id=([a-zA-Z0-9_-]{25,50})/);
    if (idParamMatch && idParamMatch[1]) return getDisplayImageUrl(idParamMatch[1]);
    return null;
  };
  const directLinkUrl = checkDriveLink(cabin.link) || checkDriveLink(cabin.linkEng);
  if (directLinkUrl && !images.includes(directLinkUrl)) {
    images.push(directLinkUrl);
  }

  // 3. Cabin-specific matches within THIS boat's Drive files
  if (boatFiles.length > 0) {
    boatFiles.forEach(f => {
      const fName = removeAccents(f.name || '').toLowerCase();
      const isExact = (cabinNameFr && fName.includes(cabinNameFr)) || (cabinNameEng && fName.includes(cabinNameEng));
      const isKeyword = cabinKeywords.length > 0 && cabinKeywords.some(k => fName.includes(k));
      if (isExact || isKeyword) {
        const url = getDisplayImageUrl(f.id);
        if (url && !images.includes(url)) images.push(url);
      }
    });
  }

  // 4. Cabin-specific matches within wired images for this boat
  if (boatWired.length > 0) {
    boatWired.forEach(u => {
      const uLower = u.toLowerCase();
      if (cabinKeywords.some(k => uLower.includes(k))) {
        const url = getDisplayImageUrl(u);
        if (url && !images.includes(url)) images.push(url);
      }
    });
  }

  // 5. If we still need images, supplement with other photos of THIS boat
  if (images.length < 5) {
    // Add wired photos of this boat
    boatWired.forEach(u => {
      const url = getDisplayImageUrl(u);
      if (url && !images.includes(url) && images.length < 5) {
        images.push(url);
      }
    });

    // Add other drive photos of this boat
    boatFiles.forEach(f => {
      const url = getDisplayImageUrl(f.id);
      if (url && !images.includes(url) && images.length < 5) {
        images.push(url);
      }
    });
  }

  // 6. Universal fallback: If this boat has ZERO photos in Drive and ZERO wired images
  if (images.length === 0) {
    const fallback = resolveCabinImageUrl(boatName, cabin, kicFiles, lebaliblogFiles, boatWired);
    images.push(fallback);
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
      const cleanPayload = sanitizeForFirestore({
        ...cleanConfig,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid || 'local_admin',
      });
      await setDoc(docRef, cleanPayload);
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
    const boatWired = getWiredImages(note.boatSnapshot.boatName);
    const matchedBoat = boats.find(b => b.name.toLowerCase() === note.boatSnapshot!.boatName.toLowerCase()) ||
                        boats.find(b => note.boatSnapshot!.boatName.toLowerCase().includes(b.name.toLowerCase()));

    // Re-resolve images using the strict boat isolation logic
    const updatedCabins = note.boatSnapshot.cabins.map(cab => {
      const matchedCabin = matchedBoat?.cabins.find(c => 
        c.id === cab.id || 
        c.name.toLowerCase() === cab.name.toLowerCase() ||
        (c.nameEng && cab.nameEng && c.nameEng.toLowerCase() === cab.nameEng.toLowerCase())
      );
      if (matchedCabin) {
        const freshImages = resolveCabinImages(note.boatSnapshot!.boatName, matchedCabin, kicFiles, lebaliblogFiles, boatWired);
        const freshImageUrl = freshImages[0] || resolveCabinImageUrl(note.boatSnapshot!.boatName, matchedCabin, kicFiles, lebaliblogFiles, boatWired);
        return {
          ...cab,
          images: freshImages,
          imageUrl: freshImageUrl
        };
      }
      return cab;
    });

    return sanitizeForFirestore({
      ...note.boatSnapshot,
      cabins: updatedCabins
    });
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

  return sanitizeForFirestore({
    boatName: finalBoatName,
    itinerary: itinerary || '',
    dates: dates || '',
    duration: duration || '',
    departure: departure || '',
    cabins: cabinSnapshots,
    fuelSurcharge: fuelSurcharge || '',
    limitedServiceNote: limitedServiceNote || ''
  });
}

/**
 * Re-generates and converts a stored note's template text and snapshot
 * to a target language (FR or ENG) and link preference (KIC, LBB, or AUTO),
 * allowing operators to instantly swap an existing note's links and text without re-typing.
 */
export function convertStoredNoteFormat(
  note: { title: string; content: string; boatSnapshot?: BoatSnapshot },
  targetLang: 'FR' | 'ENG',
  targetLinkPref: 'AUTO' | 'FR' | 'ENG',
  boats: Boat[]
): { content: string; boatSnapshot: BoatSnapshot } {
  const snapshot = parseNoteToBoatSnapshot(note, boats);
  const matchedBoat = boats.find(b => b.name.toLowerCase() === snapshot.boatName.toLowerCase()) ||
                      boats.find(b => b.name.toLowerCase().includes(snapshot.boatName.toLowerCase())) ||
                      boats.find(b => snapshot.boatName.toLowerCase().includes(b.name.toLowerCase()));

  const translatedDates = translateDate(snapshot.dates, targetLang);

  // Check for charter mode
  const isCharter = /(?:charter|privatisation|privatise|private)/i.test(note.content) || 
                    (snapshot.cabins && snapshot.cabins.length === 1 && snapshot.cabins[0].name.toLowerCase().includes('charter'));

  if (isCharter && matchedBoat && (matchedBoat.charterFr || matchedBoat.charterEng)) {
    const rawCharter = targetLang === 'ENG' 
      ? (matchedBoat.charterEng || matchedBoat.charterFr || '')
      : (matchedBoat.charterFr || matchedBoat.charterEng || '');
    const text = rawCharter.replace(/\[DATES\]/gi, translatedDates || '[DATES]');
    return {
      content: text.trim(),
      boatSnapshot: { ...snapshot, dates: translatedDates }
    };
  }

  // Regular cabin mode
  const isFrench = targetLang === 'FR';
  const itinLabel = isFrench ? 'Itinéraire' : 'Itinerary';
  const datesLabel = 'Dates';
  const depLabel = isFrench ? 'Départ' : 'Departure';
  const boatLabel = isFrench ? 'Bateau' : 'Boat';
  const cabinLabel = isFrench ? 'Chambre' : 'Cabin';
  const detailLabel = 'Detail';

  let itinerary = snapshot.itinerary || (isFrench ? 'Labuan Bajo (Flores) A/R' : 'Labuan Bajo (Flores) Round Trip');
  let departure = snapshot.departure || (isFrench ? '11h-12h / Arrivée : 11h-12h' : '11am-12pm / Arrival: 11am-12pm');

  if (matchedBoat && matchedBoat.cabins.length > 0) {
    const firstCabin = matchedBoat.cabins[0];
    if (isFrench) {
      if (firstCabin.itinerary) itinerary = firstCabin.itinerary;
      if (firstCabin.departure) departure = firstCabin.departure;
    } else {
      if (firstCabin.itineraryEng) itinerary = firstCabin.itineraryEng;
      if (firstCabin.departureEng) departure = firstCabin.departureEng;
    }
  }

  const updatedCabins = (snapshot.cabins || []).map(cSnap => {
    const cabinInBoat = matchedBoat?.cabins.find(c => 
      c.id === cSnap.id || 
      c.name.toLowerCase() === cSnap.name.toLowerCase() ||
      (c.nameEng && c.nameEng.toLowerCase() === (cSnap.nameEng || cSnap.name).toLowerCase())
    );

    let cleanName = isFrench ? (cabinInBoat?.name || cSnap.name) : (cabinInBoat?.nameEng || cSnap.nameEng || cSnap.name);
    cleanName = cleanName.replace(/^(\d+)x\s*/i, '');
    const countPrefix = (cSnap.count && cSnap.count > 1) ? `${cSnap.count}x ` : '';
    const fullCabinName = `${countPrefix}${cleanName}`;

    let link = '';
    if (targetLinkPref === 'ENG') {
      link = cabinInBoat?.linkEng || cabinInBoat?.link || cSnap.websiteUrl || '';
    } else if (targetLinkPref === 'FR') {
      link = cabinInBoat?.link || cabinInBoat?.linkEng || cSnap.websiteUrl || '';
    } else {
      link = isFrench 
        ? (cabinInBoat?.link || cabinInBoat?.linkEng || cSnap.websiteUrl || '')
        : (cabinInBoat?.linkEng || cabinInBoat?.link || cSnap.websiteUrl || '');
    }

    return {
      ...cSnap,
      name: isFrench ? (cabinInBoat?.name || cSnap.name) : (cabinInBoat?.nameEng || cSnap.nameEng || cSnap.name),
      nameEng: cabinInBoat?.nameEng || cSnap.nameEng,
      fullCabinName,
      websiteUrl: link
    };
  });

  let result = '';
  if (updatedCabins.length === 1) {
    const single = updatedCabins[0];
    result = `${itinLabel} : ${itinerary}  
${datesLabel} : ${translatedDates}  
${depLabel} : ${departure}  
${boatLabel} : ${snapshot.boatName}  
${cabinLabel} : ${single.fullCabinName}${single.websiteUrl ? `  
${detailLabel} : ${single.websiteUrl}` : ''}`;
  } else {
    const cabinListText = updatedCabins.map(c => {
      let line = `- ${c.fullCabinName}`;
      if (c.websiteUrl) {
        line += `\n  ${detailLabel} : ${c.websiteUrl}`;
      }
      return line;
    }).join('\n');

    result = `${itinLabel} : ${itinerary}  
${datesLabel} : ${translatedDates}  
${depLabel} : ${departure}  
${boatLabel} : ${snapshot.boatName}  
${cabinLabel} :
${cabinListText}`;
  }

  // De-duplicated Fuel Surcharge and Limited Service Note strictly at the bottom
  if (snapshot.fuelSurcharge) {
    result += `\n\n⚠️ ⛽ Surcharge Carburant : ${snapshot.fuelSurcharge}`;
  }
  if (snapshot.limitedServiceNote) {
    const serviceNote = isFrench 
      ? 'Note : Service client limité en cas de problème sur ce bateau'
      : 'Note: Limited client service in case of problems on this boat';
    result += `\n${serviceNote}`;
  }

  return {
    content: result.trim(),
    boatSnapshot: {
      ...snapshot,
      dates: translatedDates,
      itinerary,
      departure,
      cabins: updatedCabins
    }
  };
}

/**
 * Recursively strips `undefined` values from objects and arrays to ensure
 * data is 100% compliant with Firestore rules and the JS SDK.
 * Firestore throws a fatal error if any property value is undefined.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item)) as any;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean as T;
}

// Share Link Management
export async function createShareLinkSnapshot(snapshot: ShareLinkSnapshot): Promise<{ success: boolean; cloudSynced: boolean; error?: string }> {
  // 1. Clean data to remove any undefined fields
  const sanitizedSnapshot = sanitizeForFirestore(snapshot);

  // Save to local storage cache immediately
  try {
    const existing = getLocalShareLinks();
    const updated = [sanitizedSnapshot, ...existing.filter(l => l.shareId !== snapshot.shareId)];
    localStorage.setItem(STORAGE_KEY_LINKS, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to store share link in localStorage:', err);
  }

  // 2. Persist to Firestore with safety timeout and 3 attempts
  let cloudSynced = false;
  let lastError: string | undefined = undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const docRef = doc(db, 'shareLinks', snapshot.shareId);
      const cleanPayload = sanitizeForFirestore({
        ...sanitizedSnapshot,
        createdBy: auth.currentUser?.uid || 'anonymous',
        createdAt: sanitizedSnapshot.createdAt || Date.now(),
      });

      await withTimeout(
        setDoc(docRef, cleanPayload),
        6000
      );
      cloudSynced = true;
      break;
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`Firestore write attempt ${attempt} for share link failed:`, err);
      if (attempt < 3) {
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

/**
 * Automatically backfills and synchronizes any links stored only in local storage
 * to Firestore. Ensures links created before security rules were deployed become cloud-accessible.
 */
export async function syncLocalLinksToCloud(): Promise<number> {
  const local = getLocalShareLinks();
  if (local.length === 0) return 0;
  let synced = 0;
  for (const item of local) {
    try {
      const docRef = doc(db, 'shareLinks', item.shareId);
      const snap = await withTimeout(getDoc(docRef), 3000);
      if (!snap || !snap.exists()) {
        const cleanPayload = sanitizeForFirestore({
          ...item,
          createdBy: auth.currentUser?.uid || 'anonymous',
          syncedFromLocalAt: Date.now()
        });
        await setDoc(docRef, cleanPayload);
        synced++;
      }
    } catch (err) {
      console.warn(`Could not sync link ${item.shareId}:`, err);
    }
  }
  return synced;
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

  // 1. Try Firestore first with responsive 5s timeout and 2 attempts
  let lastError: any = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const docRef = doc(db, 'shareLinks', cleanId);
      const snap = await withTimeout(getDoc(docRef), 5000);
      if (snap && snap.exists()) {
        const data = snap.data() as ShareLinkSnapshot;
        // Cache locally for faster future loads
        try {
          const existing = getLocalShareLinks();
          const updated = [data, ...existing.filter(l => l.shareId !== data.shareId)];
          localStorage.setItem(STORAGE_KEY_LINKS, JSON.stringify(updated.slice(0, 50)));
        } catch (_) {}
        return { snapshot: data, status: 'success' };
      } else {
        // Document does not exist in Firestore. Check local storage before giving up
        const localList = getLocalShareLinks();
        const found = localList.find(l => l.shareId === cleanId);
        if (found) {
          // Background sync to cloud
          const cleanPayload = sanitizeForFirestore({
            ...found,
            syncedAt: Date.now()
          });
          setDoc(doc(db, 'shareLinks', cleanId), cleanPayload).catch(() => {});
          return { snapshot: found, status: 'success' };
        }
        return { snapshot: null, status: 'not_found' };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Firestore fetch attempt ${attempt} for share link failed:`, err);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 400));
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
