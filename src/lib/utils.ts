import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getAccessToken } from './firebase';

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
 * Copies rich formatted content to the clipboard (both HTML and plain text fallback).
 * In email clients (like Gmail, Outlook, Apple Mail), the HTML with clickable links will be pasted.
 */
export async function copyFormattedToClipboard(plainText: string, htmlText?: string): Promise<boolean> {
  if (htmlText) {
    // 1. Try modern Async Clipboard API
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function') {
      try {
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        const htmlBlob = new Blob([htmlText], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
          })
        ]);
        return true;
      } catch (err) {
        console.warn("Modern ClipboardItem write failed, trying DOM copy event fallback:", err);
      }
    }

    // 2. Fallback via copy event listener (supported widely in all browser environments and iframes)
    try {
      let copySuccess = false;
      const handler = (e: ClipboardEvent) => {
        e.preventDefault();
        e.clipboardData?.setData('text/html', htmlText);
        e.clipboardData?.setData('text/plain', plainText);
        copySuccess = true;
      };
      document.addEventListener('copy', handler);
      document.execCommand('copy');
      document.removeEventListener('copy', handler);
      if (copySuccess) return true;
    } catch (domErr) {
      console.warn("DOM copy fallback failed:", domErr);
    }
  }

  return copyTextToClipboard(plainText);
}

/**
 * Transforms template text into rich HTML for email clients:
 * - Keeps bold headers `**Header**` as `<b>Header</b>`
 * - Renders each URL as an active, clickable `<a href="URL">URL</a>` link (where the anchor text is strictly the URL itself, NOT cabin name)
 * - Properly handles line breaks and clean email font styling
 */
export function formatTemplateToEmailHtml(text: string): string {
  if (!text) return '';
  
  const lines = text.split('\n');
  const formattedLines = lines.map((line) => {
    // Escape HTML special characters
    let escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert markdown **bold** to <b>bold</b>
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

    // Auto-link URLs as clickable hyperlinks, where the link text is strictly the URL itself
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    escaped = escaped.replace(urlRegex, (match) => {
      let cleanUrl = match;
      let trailingPunct = '';
      const trailMatch = cleanUrl.match(/[.,;!?]+$/);
      if (trailMatch) {
        trailingPunct = trailMatch[0];
        cleanUrl = cleanUrl.slice(0, -trailingPunct.length);
      }
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${cleanUrl}</a>${trailingPunct}`;
    });

    return escaped;
  });

  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f2937;">${formattedLines.join('<br>\n')}</div>`;
}

/**
 * Converts any Image/Blob to standard image/png Blob for clipboard write support.
 */
async function convertBlobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') {
    return blob;
  }
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bmp, 0, 0);
        const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (png) return png;
      }
    } catch (_) {}
  }
  return new Promise<Blob>((resolve, reject) => {
    const objUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 2D context unavailable'));
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((p) => {
        if (p) resolve(p);
        else reject(new Error('PNG conversion failed'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Image decode failed'));
    };
    img.src = objUrl;
  });
}

async function fetchRawImageBlob(directUrl: string, driveId: string | null, fallbackThumbnailUrl?: string): Promise<Blob> {
  // 1. Try Google Drive API with OAuth token if drive file
  if (driveId) {
    const token = getAccessToken();
    if (token) {
      try {
        const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (driveRes.ok) {
          const rawBlob = await driveRes.blob();
          if (rawBlob.size > 0) return rawBlob;
        }
      } catch (err) {
        console.warn("Drive API media fetch failed, trying proxy:", err);
      }
    }
  }

  // 2. Try Vite server image proxy (/api/proxy-image)
  try {
    const proxyUrl = `/api/proxy-image?id=${encodeURIComponent(driveId || '')}&url=${encodeURIComponent(directUrl)}`;
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const proxyRes = await fetch(proxyUrl, { headers });
    if (proxyRes.ok) {
      const ct = proxyRes.headers.get('content-type') || '';
      if (ct.startsWith('image/') || ct.startsWith('application/octet-stream')) {
        const rawBlob = await proxyRes.blob();
        if (rawBlob.size > 0) return rawBlob;
      }
    }
  } catch (err) {
    console.warn("Vite image proxy fetch failed, trying fallback:", err);
  }

  // 3. Try high-performance CORS image proxy (wsrv.nl)
  try {
    const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(directUrl)}`;
    const wsrvRes = await fetch(wsrvUrl);
    if (wsrvRes.ok) {
      const ct = wsrvRes.headers.get('content-type') || '';
      if (ct.startsWith('image/')) {
        const rawBlob = await wsrvRes.blob();
        if (rawBlob.size > 0) return rawBlob;
      }
    }
  } catch (err) {
    console.warn("Wsrv proxy fetch failed:", err);
  }

  // 4. Try fallback thumbnail URL if provided
  if (fallbackThumbnailUrl) {
    try {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(fallbackThumbnailUrl)}`;
      const token = getAccessToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const fbRes = await fetch(proxyUrl, { headers });
      if (fbRes.ok) {
        const rawBlob = await fbRes.blob();
        if (rawBlob.size > 0) return rawBlob;
      }
    } catch (_) {}
  }

  // 5. Try canvas drawImage with crossOrigin
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
  return blob;
}

function extractDriveFileId(val: string): string | null {
  if (!val) return null;
  const dMatch = val.match(/\/file\/d\/([a-zA-Z0-9_-]{20,60})/);
  if (dMatch && dMatch[1]) return dMatch[1];
  const idMatch = val.match(/[&?]id=([a-zA-Z0-9_-]{20,60})/);
  if (idMatch && idMatch[1]) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{20,60}$/.test(val) && !val.startsWith('http')) return val;
  return null;
}

/**
 * Copies an image from a URL or file ID directly to the user's clipboard as an actual image blob.
 * Uses Google Drive API when authenticated, internal image proxy, and fallback mechanisms.
 * Preserves browser user gesture activation by passing an asynchronous Blob Promise directly to ClipboardItem.
 * Returns a promise with 'IMAGE' | 'LINK' | 'FAILED' status.
 */
export async function copyImageToClipboard(fileIdOrUrl: string, fallbackThumbnailUrl?: string): Promise<'IMAGE' | 'LINK' | 'FAILED'> {
  let directUrl = (fileIdOrUrl.startsWith('http://') || fileIdOrUrl.startsWith('https://'))
    ? fileIdOrUrl
    : `https://lh3.googleusercontent.com/d/${fileIdOrUrl}`;

  const driveId = extractDriveFileId(fileIdOrUrl);
  if (driveId) {
    directUrl = `https://lh3.googleusercontent.com/d/${driveId}`;
  }

  // Check if modern ClipboardItem and Async Clipboard API are available
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function') {
    const pngBlobPromise = (async () => {
      const rawBlob = await fetchRawImageBlob(directUrl, driveId, fallbackThumbnailUrl);
      return convertBlobToPng(rawBlob);
    })();

    try {
      // Modern Chromium / Safari / Firefox pattern:
      // Passing Promise<Blob> to ClipboardItem preserves the synchronous user activation window!
      const item = new ClipboardItem({
        'image/png': pngBlobPromise
      });
      await navigator.clipboard.write([item]);
      return 'IMAGE';
    } catch (clipErr) {
      console.warn("Direct Promise-based ClipboardItem write failed, trying resolved blob fallback:", clipErr);
      try {
        const pngBlob = await pngBlobPromise;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob })
        ]);
        return 'IMAGE';
      } catch (awaitClipErr) {
        console.warn("Awaited ClipboardItem write failed, will fallback to URL copy:", awaitClipErr);
      }
    }
  }

  // Backup fallback: copy direct URL
  const success = await copyTextToClipboard(directUrl);
  if (success) {
    return 'LINK';
  } else {
    console.error("Link backup copy failed completely");
    return 'FAILED';
  }
}

/**
 * Safe UUID generator that never throws, even in older Android webviews,
 * non-secure HTTP contexts, or restricted iframes.
 */
export function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  return 'u_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
}

const MONTH_NORMALIZATION: Record<string, { index: number; isFrench: boolean; isShort: boolean }> = {
  jan: { index: 0, isFrench: false, isShort: true },
  january: { index: 0, isFrench: false, isShort: false },
  janvier: { index: 0, isFrench: true, isShort: false },
  januari: { index: 0, isFrench: false, isShort: false },

  feb: { index: 1, isFrench: false, isShort: true },
  fév: { index: 1, isFrench: true, isShort: true },
  fev: { index: 1, isFrench: true, isShort: true },
  february: { index: 1, isFrench: false, isShort: false },
  fevrier: { index: 1, isFrench: true, isShort: false },
  février: { index: 1, isFrench: true, isShort: false },
  februari: { index: 1, isFrench: false, isShort: false },

  mar: { index: 2, isFrench: false, isShort: true },
  mars: { index: 2, isFrench: true, isShort: false },
  march: { index: 2, isFrench: false, isShort: false },
  maret: { index: 2, isFrench: false, isShort: false },

  apr: { index: 3, isFrench: false, isShort: true },
  avr: { index: 3, isFrench: true, isShort: true },
  april: { index: 3, isFrench: false, isShort: false },
  avril: { index: 3, isFrench: true, isShort: false },

  may: { index: 4, isFrench: false, isShort: false },
  mai: { index: 4, isFrench: true, isShort: false },
  mei: { index: 4, isFrench: false, isShort: false },

  jun: { index: 5, isFrench: false, isShort: true },
  june: { index: 5, isFrench: false, isShort: false },
  juin: { index: 5, isFrench: true, isShort: false },
  juni: { index: 5, isFrench: false, isShort: false },

  jul: { index: 6, isFrench: false, isShort: true },
  juil: { index: 6, isFrench: true, isShort: true },
  july: { index: 6, isFrench: false, isShort: false },
  juillet: { index: 6, isFrench: true, isShort: false },
  juli: { index: 6, isFrench: false, isShort: false },

  aug: { index: 7, isFrench: false, isShort: true },
  aout: { index: 7, isFrench: true, isShort: false },
  août: { index: 7, isFrench: true, isShort: false },
  august: { index: 7, isFrench: false, isShort: false },
  agustus: { index: 7, isFrench: false, isShort: false },

  sep: { index: 8, isFrench: false, isShort: true },
  sept: { index: 8, isFrench: true, isShort: true },
  september: { index: 8, isFrench: false, isShort: false },
  septembre: { index: 8, isFrench: true, isShort: false },

  oct: { index: 9, isFrench: false, isShort: true },
  october: { index: 9, isFrench: false, isShort: false },
  cotober: { index: 9, isFrench: false, isShort: false },
  oktober: { index: 9, isFrench: false, isShort: false },
  octobre: { index: 9, isFrench: true, isShort: false },

  nov: { index: 10, isFrench: false, isShort: true },
  november: { index: 10, isFrench: false, isShort: false },
  novembre: { index: 10, isFrench: true, isShort: false },

  dec: { index: 11, isFrench: false, isShort: true },
  déc: { index: 11, isFrench: true, isShort: true },
  december: { index: 11, isFrench: false, isShort: false },
  decembre: { index: 11, isFrench: true, isShort: false },
  décembre: { index: 11, isFrench: true, isShort: false },
  desember: { index: 11, isFrench: false, isShort: false },
};

const MONTH_NAMES_FULL_ENG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_NAMES_SHORT_ENG = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
const MONTH_NAMES_FULL_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];
const MONTH_NAMES_SHORT_FR = [
  'Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'
];

/**
 * Intelligent date parser and formatter that translates inquiry date inputs into calendar dates,
 * which adapts dynamically based on duration if provided.
 * Uses REAL calendar arithmetic to avoid impossible dates (e.g. 30, 31, 32 Oct -> 30, 31 Oct - 1 Nov).
 */
export function parseAndFormatInquiryDate(rawDateLine: string, duration?: string): string {
  if (!rawDateLine) return '';
  
  const clean = rawDateLine.trim();

  // Try to find if there's any year in the text (like 2024, 2025, 2026, 2027, etc.)
  const hasYear = /\b20\d{2}\b/.test(clean);
  const yearStr = hasYear ? clean.match(/\b20\d{2}\b/)![0] : '2026';
  const startYear = parseInt(yearStr, 10) || 2026;

  // Find month name (including typos like cotober or foreign names)
  const monthRegex = /(janvier|january|januari|jan|fevrier|février|februari|february|fév|fev|feb|maret|mars|march|mar|avril|april|avr|apr|mei|mai|may|juni|juin|june|jun|juillet|juli|july|juil|jul|agustus|aout|août|august|aug|septembre|september|sept|sep|octobre|oktober|cotober|october|oct|novembre|november|nov|decembre|décembre|desember|december|déc|dec)/i;
  const monthMatch = clean.match(monthRegex);
  if (!monthMatch) {
    return clean + (hasYear ? "" : " 2026");
  }

  const rawMonthKey = monthMatch[0].toLowerCase();
  const monthMeta = MONTH_NORMALIZATION[rawMonthKey] || { index: 9, isFrench: false, isShort: false };
  const monthIndex = monthMeta.index;
  const isFrench = monthMeta.isFrench;
  const isShort = monthMeta.isShort;

  // Helper to format a month name according to language and short/full preference
  const formatMonthName = (mIdx: number): string => {
    if (isFrench) {
      return isShort ? MONTH_NAMES_SHORT_FR[mIdx] : MONTH_NAMES_FULL_FR[mIdx];
    }
    return isShort ? MONTH_NAMES_SHORT_ENG[mIdx] : MONTH_NAMES_FULL_ENG[mIdx];
  };

  // Strip non-day numbers from the text to isolate day numbers.
  const textForDays = clean
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
    const durUpper = duration.toUpperCase();
    if (durUpper.includes('2D') || durUpper.includes('2J')) numDays = 2;
    else if (durUpper.includes('3D') || durUpper.includes('3J')) numDays = 3;
    else if (durUpper.includes('4D') || durUpper.includes('4J')) numDays = 4;
    else if (durUpper.includes('5D') || durUpper.includes('5J')) numDays = 5;
  } else {
    // If we have multiple numbers, calculate number of days
    if (dayNumbers.length > 1) {
      const minDay = Math.min(...dayNumbers);
      const maxDay = Math.max(...dayNumbers);
      if (maxDay - minDay < 10) {
        numDays = maxDay - minDay + 1;
      } else {
        numDays = dayNumbers.length;
      }
    }
  }

  const startDay = dayNumbers[0];

  // Generate sequence using real Calendar Date arithmetic
  const dateSequence: Date[] = [];
  for (let i = 0; i < numDays; i++) {
    // Native Date handles month rollovers automatically (e.g. Oct 32 -> Nov 1)
    const d = new Date(startYear, monthIndex, startDay + i);
    dateSequence.push(d);
  }

  // Check if all days fall into the same month
  const firstDate = dateSequence[0];
  const lastDate = dateSequence[dateSequence.length - 1];

  if (firstDate.getMonth() === lastDate.getMonth()) {
    // Same month
    const dayStr = dateSequence.map(d => d.getDate()).join(' - ');
    return `${dayStr} ${formatMonthName(firstDate.getMonth())} ${firstDate.getFullYear()}`;
  }

  // Crossing months (e.g. 30, 31 Oct and 1 Nov)
  // Group days by month
  const monthGroups: { monthIdx: number; year: number; days: number[] }[] = [];
  dateSequence.forEach(d => {
    const m = d.getMonth();
    const y = d.getFullYear();
    const lastGroup = monthGroups[monthGroups.length - 1];
    if (lastGroup && lastGroup.monthIdx === m && lastGroup.year === y) {
      lastGroup.days.push(d.getDate());
    } else {
      monthGroups.push({ monthIdx: m, year: y, days: [d.getDate()] });
    }
  });

  const parts = monthGroups.map((g, idx) => {
    const isLast = idx === monthGroups.length - 1;
    const daysJoined = g.days.join(' - ');
    const mName = formatMonthName(g.monthIdx);
    if (isLast) {
      return `${daysJoined} ${mName} ${g.year}`;
    }
    // For earlier month in the same year, show days + month name
    return `${daysJoined} ${mName}`;
  });

  return parts.join(' - ');
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


