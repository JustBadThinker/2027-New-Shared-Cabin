import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MONTHS_FR_TO_ENG: Record<string, string> = {
  'janvier': 'January',
  'février': 'February',
  'mars': 'March',
  'avril': 'April',
  'mai': 'May',
  'juin': 'June',
  'juillet': 'July',
  'août': 'August',
  'aout': 'August',
  'septembre': 'September',
  'octobre': 'October',
  'novembre': 'November',
  'décembre': 'December',
  'jan': 'Jan',
  'fév': 'Feb',
  'fev': 'Feb',
  'mar': 'Mar',
  'avr': 'Apr',
  'jui': 'Jun',
  'jul': 'Jul',
  'aoû': 'Aug',
  'aou': 'Aug',
  'sep': 'Sep',
  'oct': 'Oct',
  'nov': 'Nov',
  'déc': 'Dec',
};

const MONTHS_ENG_TO_FR: Record<string, string> = {
  'january': 'Janvier',
  'february': 'Février',
  'march': 'Mars',
  'april': 'Avril',
  'may': 'Mai',
  'june': 'Juin',
  'july': 'Juillet',
  'august': 'Août',
  'september': 'Septembre',
  'october': 'Octobre',
  'november': 'Novembre',
  'december': 'Décembre',
  'jan': 'Jan',
  'feb': 'Fév',
  'mar': 'Mars',
  'apr': 'Avr',
  'jun': 'Juin',
  'jul': 'Juil',
  'aug': 'Août',
  'sep': 'Sept',
  'oct': 'Oct',
  'nov': 'Nov',
  'dec': 'Déc',
};

export function translateDate(dateStr: string, targetLang: 'FR' | 'ENG'): string {
  if (!dateStr) return '';
  
  let result = dateStr;
  const mapping = targetLang === 'ENG' ? MONTHS_FR_TO_ENG : MONTHS_ENG_TO_FR;
  
  // Sort keys by length descending to avoid partial matches (e.g., 'juillet' matching 'jui')
  const sortedKeys = Object.keys(mapping).sort((a, b) => b.length - a.length);
  
  for (const key of sortedKeys) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      const replacement = mapping[key.toLowerCase()];
      // Try to preserve capitalization
      if (match[0] === match[0].toUpperCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1);
      }
      return replacement.toLowerCase();
    });
  }
  
  // Also translate common suffixes/terms
  if (targetLang === 'ENG') {
    result = result.replace(/\b(\d+)J(\d+)N\b/gi, '$1J$2N'); // Keep as is or change to 3D2N
    result = result.replace(/\b(\d+)j(\d+)n\b/gi, '$1D$2N');
  } else {
    result = result.replace(/\b(\d+)D(\d+)N\b/gi, '$1J$2N');
  }
  
  return result;
}

export function isValidLink(l: string | undefined): boolean {
  if (!l) return false;
  const val = l.toLowerCase().trim();
  // Exclude common non-URL values found in spreadsheets
  if (['no', 'n/a', 'non', 'yes', 'oui', 'ok', ''].includes(val)) return false;
  // Block javascript: schema to prevent XSS injection
  if (val.startsWith('javascript:')) return false;
  // A valid link should look like a URL
  return val.startsWith('http') || val.startsWith('www') || val.includes('://') || val.includes('.');
}

/**
 * Copies plain text to the clipboard using the modern clipboard API with a fallback to document.execCommand if needed.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("navigator.clipboard.writeText failed, using fallback:", err);
    }
  }

  // Old-school fallback using document.execCommand('copy')
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";
    document.body.appendChild(textArea);
    
    // Select text to copy
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return !!successful;
  } catch (err) {
    console.error("Fallback text copy failed", err);
    return false;
  }
}

/**
 * Copies an image from a URL or file ID directly to the user's clipboard as an actual image blob.
 * Returns a promise with 'IMAGE' | 'LINK' | 'FAILED' status.
 */
export async function copyImageToClipboard(fileIdOrUrl: string): Promise<'IMAGE' | 'LINK' | 'FAILED'> {
  let directUrl = (fileIdOrUrl.startsWith('http://') || fileIdOrUrl.startsWith('https://'))
    ? fileIdOrUrl
    : `https://lh3.googleusercontent.com/d/${fileIdOrUrl}`;

  if (fileIdOrUrl.startsWith('http://') || fileIdOrUrl.startsWith('https://')) {
    const fileDMatch = fileIdOrUrl.match(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/);
    if (fileDMatch && fileDMatch[1]) {
      directUrl = `https://lh3.googleusercontent.com/d/${fileDMatch[1]}`;
    } else {
      const idParamMatch = fileIdOrUrl.match(/[&?]id=([a-zA-Z0-9_-]{25,50})/);
      if (idParamMatch && idParamMatch[1]) {
        directUrl = `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
      }
    }
  }

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = directUrl;
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Unable to load image for canvas parsing"));
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not acquire 2D context");
    
    ctx.drawImage(img, 0, 0);
    
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error("Failed to capture image blob data");

    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob
      })
    ]);
    return 'IMAGE';
  } catch (err) {
    console.warn("Direct image copy failed, trying clipboard fallback to link", err);
    const success = await copyTextToClipboard(directUrl);
    if (success) {
      return 'LINK';
    } else {
      console.error("Link backup copy failed completely");
      return 'FAILED';
    }
  }
}

/**
 * Parses any raw date reference like "17 Jul", "6-7-8 Juli", or "20-21-22 July"
 * and formats it into a clean sequential date range like "17 - 18 - 19 Jul 2026"
 * which adapts dynamically based on duration if provided.
 */
export function parseAndFormatInquiryDate(rawDateLine: string, duration?: string): string {
  if (!rawDateLine) return '';
  
  let clean = rawDateLine.trim();

  // Try to find if there's any year in the text (like 2024, 2025, 2026, etc.)
  const hasYear = /\b20\d{2}\b/.test(clean);
  const year = hasYear ? clean.match(/\b20\d{2}\b/)![0] : '2026';

  // Find month name
  const monthRegex = /(janvier|january|jan|fevrier|février|february|feb|mars|march|mar|avril|april|apr|mai|may|juin|june|jun|juillet|july|jul|juli|aout|août|august|aug|septembre|september|sept|octobre|october|oct|novembre|november|nov|decembre|décembre|dec)/i;
  const monthMatch = clean.match(monthRegex);
  if (!monthMatch) {
    return clean + (hasYear ? "" : " 2026");
  }

  const rawMonthJoined = monthMatch[0];
  const capitalizedMonth = rawMonthJoined.charAt(0).toUpperCase() + rawMonthJoined.slice(1).toLowerCase();

  // Strip anything that is NOT a number from the text to isolate day numbers.
  // First, strip out the year (to avoid registering 2026 as a day!)
  // and strip out durations (to avoid registering 3 as in 3D2N as a day!)
  let textForDays = clean
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\(\s*\d+\s*[a-zA-Z]+\s*\)/g, '') // strip (3J2N) or (3D2N)
    .replace(/\b\d+\s*[dDjJnN]\s*\d*\s*[nN]?\b/g, '') // strip 3D2N, 3J2N, 2D1N, etc
    .replace(monthRegex, '') // strip month
    .trim();

  // Extract all continuous digits
  const dayNumbers = textForDays.match(/\b\d+\b/g)?.map(Number) || [];

  if (dayNumbers.length === 0) {
    return clean;
  }

  // Determine how many days should be represented.
  let numDays = 3; // default is 3 days
  if (duration) {
    if (duration.toUpperCase().includes('2D') || duration.toUpperCase().includes('2J')) numDays = 2;
    else if (duration.toUpperCase().includes('3D') || duration.toUpperCase().includes('3J')) numDays = 3;
    else if (duration.toUpperCase().includes('4D') || duration.toUpperCase().includes('4J')) numDays = 4;
  } else {
    // If we have multiple numbers, calculate number of days
    if (dayNumbers.length > 1) {
      const minDay = Math.min(...dayNumbers);
      const maxDay = Math.max(...dayNumbers);
      if (maxDay - minDay < 10) { // check if they are within a reasonable range
        numDays = maxDay - minDay + 1;
      } else {
        numDays = dayNumbers.length;
      }
    }
  }

  const startDay = dayNumbers[0];

  // Generate sequence of days
  const generatedDays: number[] = [];
  for (let i = 0; i < numDays; i++) {
    generatedDays.push(startDay + i);
  }

  const formattedDays = generatedDays.join(' - ');
  return `${formattedDays} ${capitalizedMonth} ${year}`;
}

/**
 * Matches a KeyboardEvent against a normalized keyboard shortcut string (e.g. "alt+f", "ctrl+shift+a", "q")
 */
export function matchShortcut(e: KeyboardEvent, shortcutStr: string): boolean {
  if (!shortcutStr) return false;
  const parts = shortcutStr.toLowerCase().split('+');
  
  const hasAlt = parts.includes('alt');
  const hasCtrl = parts.includes('ctrl') || parts.includes('control');
  const hasShift = parts.includes('shift');
  const hasMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('win');
  
  // Find primary non-modifier key
  const primaryKeys = parts.filter(p => !['alt', 'ctrl', 'control', 'shift', 'meta', 'cmd', 'win'].includes(p));
  const primaryKey = primaryKeys[0] || '';
  
  // Compare modifiers
  if (hasAlt !== e.altKey) return false;
  if (hasCtrl !== e.ctrlKey) return false;
  if (hasShift !== e.shiftKey) return false;
  if (hasMeta !== e.metaKey) return false;
  
  // Compare primary key (taking case-insensitivity into account, and checking e.key or e.code if necessary)
  return e.key.toLowerCase() === primaryKey;
}

/**
 * Sanitizes list of boat image URLs to prevent XSS, Prototype Pollution, and caching overflow
 */
export function sanitizeWiredUrls(urls: any): string[] {
  if (!Array.isArray(urls)) return [];
  return urls
    .filter((u): u is string => typeof u === 'string')
    .map(u => u.trim())
    .filter(u => {
      try {
        const lower = u.toLowerCase();
        // Allow ONLY secure http or https protocols to block javascript: and data: XSS payloads
        if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
        // Limit individual URL length to avoid ReDoS / performance issues
        if (u.length > 2000) return false;
        // Strip out dangerous tag wrappers or attributes
        if (u.includes('<') || u.includes('>') || u.includes('"') || u.includes("'")) return false;
        return true;
      } catch (_) {
        return false;
      }
    })
    .slice(0, 50); // limit to max 50 items to prevent Denial of Wallet/exhaustion
}

/**
 * Validates passcode strength: minimum 8 characters, with uppercase, lowercase, numbers, and special characters
 */
export function validatePasswordStrength(pass: string, language: string = 'EN'): string | null {
  if (pass.length < 8) {
    return language === 'FR' 
      ? "Le mot de passe doit comporter au moins 8 caractères (exigé)." 
      : "Password must be at least 8 characters long (required).";
  }
  if (!/[A-Z]/.test(pass)) {
    return language === 'FR'
      ? "Le mot de passe doit contenir au moins une lettre majuscule."
      : "Password must contain at least one uppercase letter.";
  }
  if (!/[a-z]/.test(pass)) {
    return language === 'FR'
      ? "Le mot de passe doit contenir au moins une lettre minuscule."
      : "Password must contain at least one lowercase letter.";
  }
  if (!/[0-9]/.test(pass)) {
    return language === 'FR'
      ? "Le mot de passe doit contenir au moins un chiffre."
      : "Password must contain at least one number.";
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) {
    return language === 'FR'
      ? "Le mot de passe doit contenir au moins un caractère spécial."
      : "Password must contain at least one special character (e.g. !@#$%).";
  }
  return null;
}

/**
 * Clean, portable, and secure synchronous SHA-256 implementation
 */
export function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i, j;
  let result = '';

  const words: any[] = [];
  const asciiLength = ascii[lengthProperty] * 8;
  
  let hash: any[] = [];
  let k: any[] = [];
  let primeCounter = 0;

  const isPrime = function(n: number) {
    for (let factor = 2; factor * factor <= n; factor++) {
      if (n % factor === 0) return false;
    }
    return true;
  };

  let candidate = 2;
  while (primeCounter < 64) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 1/2) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1/3) * maxWord) | 0;
      primeCounter++;
    }
    candidate++;
  }
  
  let str = ascii + '\x80';
  while (str[lengthProperty] % 64 - 56) str += '\x00';
  for (i = 0; i < str[lengthProperty]; i++) {
    j = str.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i % 4) * 8);
  }
  words[words[lengthProperty]] = ((asciiLength / maxWord) | 0);
  words[words[lengthProperty]] = (asciiLength | 0);
  
  for (j = 0; j < words[lengthProperty]; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = hash.slice(0);
    for (i = 0; i < 64; i++) {
      const wItem = w[i];
      const a = hash[0], e = hash[4];
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & hash[5]) ^ (~e & hash[6]);
      const temp1 = hash[7] + s1 + ch + k[i] + (w[i] = (i < 16 ? wItem : (
        wItem + 
        (rightRotate(wItem, 17) ^ rightRotate(wItem, 19) ^ (wItem >>> 10)) + 
        w[i - 7] + 
        (rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3))
      ) | 0));
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = s0 + maj;
      
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash[8] = 0;
      hash.pop();
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}


