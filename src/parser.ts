import * as XLSX from 'xlsx';
import { Boat, Cabin } from './store';
import { isValidLink } from './lib/utils';

// Guard against Prototype Pollution by sanitizing incoming data structures
function sanitizeData<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    // Basic string sanitization to strip script elements if any
    return data.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const sanitizedObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const lowerKey = key.toLowerCase();
        // Prevent Prototype Pollution keys
        if (lowerKey === '__proto__' || lowerKey === 'constructor' || lowerKey === 'prototype') {
          continue;
        }
        sanitizedObj[key] = sanitizeData((data as any)[key]);
      }
    }
    return sanitizedObj as T;
  }
  return data;
}

export function processWorkbookData(rawJsonData: any[][]): Boat[] {
  const jsonData = sanitizeData(rawJsonData);
  if (jsonData.length < 2) {
    return [];
  }

  const headers = Array.from(jsonData[0] || []).map(h => String(h || '').toLowerCase().trim());
  
  // Helper to check if a column's data looks like a template
  const isTemplateColumn = (idx: number) => {
    if (idx === -1 || idx >= headers.length) return false;
    let templateScore = 0;
    const sampleSize = Math.min(jsonData.length - 1, 10);
    if (sampleSize <= 0) return false;

    for (let i = 1; i <= sampleSize; i++) {
      const val = String(jsonData[i]?.[idx] || '').toLowerCase();
      // Check for keywords
      if (val.includes('itinéraire') || val.includes('itinerary') || 
          val.includes('départ') || val.includes('departure') ||
          val.includes('arrivée') || val.includes('arrival') ||
          val.includes('dates :')) {
        templateScore++;
      }
      // Check for length - templates are usually long
      if (val.length > 100) {
        templateScore++;
      }
    }
    return templateScore > (sampleSize / 4);
  };

  // Helper to check if a column is likely a price or numeric value
  const isNumericColumn = (idx: number) => {
    if (idx === -1 || idx >= headers.length) return false;
    let numericCount = 0;
    const sampleSize = Math.min(jsonData.length - 1, 10);
    if (sampleSize <= 0) return false;

    for (let i = 1; i <= sampleSize; i++) {
      const val = jsonData[i]?.[idx];
      if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '')) {
        numericCount++;
      }
    }
    return (numericCount / sampleSize) > 0.7;
  };

  // Find column indices with better heuristics
  let boatIdx = headers.findIndex(h => (h.includes('boat') || h.includes('bateau')) && !h.includes('link') && !h.includes('url'));
  if (boatIdx === -1) boatIdx = headers.findIndex(h => (h.includes('nom') || h.includes('name')) && !h.includes('chambre') && !h.includes('cabin') && !h.includes('price') && !h.includes('prix'));
  
  // If still not found, look for a column that has unique strings and isn't a template or numeric
  if (boatIdx === -1) {
    for (let idx = 0; idx < headers.length; idx++) {
      if (!isTemplateColumn(idx) && !isNumericColumn(idx)) {
        boatIdx = idx;
        break;
      }
    }
  }
  if (boatIdx === -1) boatIdx = 0;

  let cabinIdx = headers.findIndex((h, idx) => (h.includes('cabin') || h.includes('chambre') || h.includes('room')) && (h.includes('name') || h.includes('nom') || h.includes('french')) && !isTemplateColumn(idx) && !isNumericColumn(idx));
  if (cabinIdx === -1) {
    cabinIdx = headers.findIndex((h, idx) => (h.includes('cabin') || h.includes('chambre') || h.includes('cabine') || h.includes('room')) && !isTemplateColumn(idx) && !isNumericColumn(idx));
  }
  
  // If still not found, look for a column that contains "rooms" or "chambre" even if it's a template
  if (cabinIdx === -1) {
    cabinIdx = headers.findIndex(h => h.includes('room') || h.includes('chambre') || h.includes('cabine'));
  }

  // Look for English specific column
  let cabinEngIdx = headers.findIndex((h, idx) => (h.includes('cabin') || h.includes('room')) && h.includes('eng') && !isNumericColumn(idx));
  if (cabinEngIdx === -1) {
    // If we have "ROOMS - FRENCH" and "ROOMS - ENG", and cabinIdx is the French one, the next one might be English
    if (cabinIdx !== -1 && headers[cabinIdx].includes('french') && cabinIdx + 1 < headers.length && (headers[cabinIdx + 1].includes('eng') || headers[cabinIdx + 1] === '')) {
      cabinEngIdx = cabinIdx + 1;
    }
  }

  let charterFrIdx = headers.findIndex(h => h === 'charter - french' || (h.includes('charter') && (h.includes('french') || h.includes('français'))));
  let charterEngIdx = headers.findIndex(h => h === 'charter - eng' || (h.includes('charter') && (h.includes('eng') || h.includes('english'))));
  let departureIdx = headers.findIndex(h => (h.includes('departure') || h.includes('parture') || h.includes('départ')) && !h.includes('freq') && !h.includes('sched') && !h.includes('eng'));
  let departureEngIdx = headers.findIndex(h => (h.includes('departure') || h.includes('parture')) && h.includes('eng') && !h.includes('freq') && !h.includes('sched'));
  let scheduleIdx = headers.findIndex(h => (h.includes('schedule') || h.includes('horaire') || h.includes('freq') || h.includes('dispo') || h.includes('jours')) && !h.includes('eng'));
  let scheduleEngIdx = headers.findIndex(h => (h.includes('schedule') || h.includes('freq')) && h.includes('eng'));
  let itineraryIdx = headers.findIndex(h => (h.includes('itinerary') || h.includes('itineraire') || h.includes('itineraires') || h.includes('route')) && !h.includes('eng'));
  let itineraryEngIdx = headers.findIndex(h => (h.includes('itinerary') || h.includes('route')) && h.includes('eng'));

  // Fallback to user specified columns K (10) and L (11) if not found by header
  if (charterFrIdx === -1) charterFrIdx = 10;
  if (charterEngIdx === -1) charterEngIdx = 11;
  if (departureIdx === -1) departureIdx = 9;

  // If still not found, look for a column that isn't a template, isn't the boat name, isn't a link, and isn't numeric
  if (cabinIdx === -1) {
    for (let idx = 0; idx < headers.length; idx++) {
      if (idx === boatIdx) continue;
      const h = headers[idx];
      if (h.includes('link') || h.includes('url') || h.includes('lien') || h.includes('price') || h.includes('prix')) continue;
      if (!isTemplateColumn(idx) && !isNumericColumn(idx)) {
        cabinIdx = idx;
        break;
      }
    }
  }

  // Link detection improvement: check multiple rows for actual URLs
  const findUrlColumn = () => {
    const sampleRows = Math.min(jsonData.length, 20);
    for (let idx = 0; idx < headers.length; idx++) {
      if (idx === boatIdx || idx === cabinIdx || idx === cabinEngIdx) continue;
      for (let r = 1; r < sampleRows; r++) {
        const val = String(jsonData[r]?.[idx] || '');
        if (val.startsWith('http') || val.includes('://')) {
          return idx;
        }
      }
    }
    return -1;
  };

  let linkIdx = headers.findIndex(h => (h.includes('link') || h.includes('url') || h.includes('lien')) && !h.includes('boat') && !h.includes('bateau') && !h.includes('eng'));
  let linkEngIdx = headers.findIndex(h => (h.includes('link') || h.includes('url')) && h.includes('eng'));

  // If linkIdx found by name, verify it's not just "No" or "N/A"
  if (linkIdx !== -1) {
    const firstVal = String(jsonData[1]?.[linkIdx] || '').toLowerCase();
    if (firstVal === 'no' || firstVal === 'n/a' || firstVal === 'non') {
      const betterIdx = findUrlColumn();
      if (betterIdx !== -1) linkIdx = betterIdx;
    }
  } else {
    linkIdx = headers.findIndex(h => h.includes('detail') && !h.includes('eng'));
    if (linkIdx !== -1) {
      const firstVal = String(jsonData[1]?.[linkIdx] || '').toLowerCase();
      if (firstVal === 'no' || firstVal === 'n/a' || firstVal === 'non') {
        const betterIdx = findUrlColumn();
        if (betterIdx !== -1) linkIdx = betterIdx;
      }
    } else {
      linkIdx = findUrlColumn();
    }
  }

  // Same for English link if not found
  if (linkEngIdx === -1) {
    linkEngIdx = headers.findIndex(h => h.includes('detail') && h.includes('eng'));
  }

  const boatsMap = new Map<string, { cabins: Cabin[], charterFr?: string, charterEng?: string }>();
  let lastBoatName = '';
  let lastItinerary = '';
  let lastItineraryEng = '';
  let lastDeparture = '';
  let lastDepartureEng = '';
  let lastSchedule = '';
  let lastScheduleEng = '';
  let lastCharterFr = '';
  let lastCharterEng = '';

  // Helper to check if a string is a template text format
  const isTemplateText = (text: string): boolean => {
    const val = text.toLowerCase();
    const hasTemplateKeywords = 
      val.includes('itinéraire') || 
      val.includes('itinerary') || 
      val.includes('dates :') || 
      val.includes('dates:') ||
      val.includes('room:') ||
      val.includes('room :') ||
      val.includes('chambre:') ||
      val.includes('chambre :') ||
      val.includes('cabin:') ||
      val.includes('cabin :') ||
      val.includes('details:') ||
      val.includes('details :') ||
      val.includes('détails:') ||
      val.includes('détails :') ||
      val.includes('boat:') ||
      val.includes('boat :') ||
      val.includes('bateau:') ||
      val.includes('bateau :') ||
      val.includes('➔') ||
      val.includes('→');

    return hasTemplateKeywords && val.length > 25;
  };

  // Helper to extract cabin name and link from a template string
  const extractFromTemplate = (text: string) => {
    let cabinName = '';
    let link = '';
    let itinerary = '';
    let departure = '';
    let schedule = '';
    let boat = '';

    // Helper to find a field value that might be followed by another field label
    const findField = (labels: string[], content: string) => {
      const labelPattern = labels.join('|');
      // Look for the label, then capture everything until the next known label or end of string
      const nextLabels = '(?:Itinéraire|Itinerary|Dates|Départ|Departure|Start|Bateau|Boat|Chambre|Room|Cabine|Détails|Details|Detail|Lien|Link|Schedule|Freq)';
      // Use a more robust regex that handles the end of the string better
      const regex = new RegExp(`(?:${labelPattern})\\s*[:\\-]?\\s*(.+?)(?=\\s*${nextLabels}\\s*[:\\-]|$)`, 'i');
      const match = content.replace(/\r?\n/g, ' ').match(regex);
      return match ? match[1].trim() : '';
    };

    itinerary = findField(['Itinéraire', 'Itinerary'], text);
    if (!itinerary) {
      // If no explicit itinerary label is present, extract the leading text before any known label
      const nextLabels = '(?:Itinéraire|Itinerary|Dates|Départ|Departure|Start|Bateau|Boat|Chambre|Room|Cabine|Détails|Details|Detail|Lien|Link|Schedule|Freq)';
      const regexStart = new RegExp(`^(.+?)(?=\\s*${nextLabels}\\s*[:\\-])`, 'i');
      const startMatch = text.replace(/\r?\n/g, ' ').match(regexStart);
      if (startMatch) {
         itinerary = startMatch[1].trim();
      }
    }

    departure = findField(['Départ', 'Departure', 'Start'], text);
    schedule = findField(['Schedule', 'Freq', 'Horaire'], text);
    boat = findField(['Bateau', 'Boat'], text);
    cabinName = findField(['Chambre', 'Room', 'Cabine'], text);
    
    // Link extraction
    link = findField(['Détails', 'Details', 'Detail', 'Lien', 'Link'], text);
    if (!link) {
      const urlMatch = text.match(/https?:\/\/[^\s\n\r]+/i);
      if (urlMatch) {
        link = urlMatch[0].trim();
      }
    }

    return { cabinName, link, itinerary, departure, schedule, boat };
  };

  const isLinkValid = isValidLink;
  const daysKeywords = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu', 'week', 'semaine'];

  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    const rawBoatName = String(row[boatIdx] || '').trim();
    
    // If a new boat name is explicitly provided in this row, reset the boat-specific last seen variables
    if (rawBoatName && rawBoatName.toLowerCase() !== lastBoatName.toLowerCase()) {
      lastItinerary = '';
      lastItineraryEng = '';
      lastDeparture = '';
      lastDepartureEng = '';
      lastSchedule = '';
      lastScheduleEng = '';
      lastCharterFr = '';
      lastCharterEng = '';
    }

    let boatName = rawBoatName;
    let cabinName = String(row[cabinIdx] || '').trim();
    let link = String(row[linkIdx === -1 ? -1 : linkIdx] || '').trim();
    
    // Fallback to last boat name if current is empty
    if (!boatName && lastBoatName) {
      boatName = lastBoatName;
    }
    if (boatName) {
      lastBoatName = boatName;
    }

    let cabinNameEng = '';
    let linkEng = String(row[linkEngIdx === -1 ? -1 : linkEngIdx] || '').trim();
    let itineraryEng = itineraryEngIdx !== -1 ? String(row[itineraryEngIdx] || '').trim() : '';
    let departureEng = departureEngIdx !== -1 ? String(row[departureEngIdx] || '').trim() : '';
    let scheduleEng = scheduleEngIdx !== -1 ? String(row[scheduleEngIdx] || '').trim() : '';

    if (cabinEngIdx !== -1) {
      const engVal = String(row[cabinEngIdx] || '').trim();
      if (isTemplateText(engVal)) {
        const extracted = extractFromTemplate(engVal);
        cabinNameEng = extracted.cabinName;
        // Prefer template link if dedicated column link is invalid
        if (!isLinkValid(linkEng) && isLinkValid(extracted.link)) {
          linkEng = extracted.link;
        }
        if (extracted.itinerary) itineraryEng = extracted.itinerary;
        if (extracted.departure) departureEng = extracted.departure;
        if (extracted.schedule) scheduleEng = extracted.schedule;
        if (!boatName && extracted.boat) {
          boatName = extracted.boat;
          if (boatName.toLowerCase() !== lastBoatName.toLowerCase()) {
            lastItinerary = '';
            lastItineraryEng = '';
            lastDeparture = '';
            lastDepartureEng = '';
            lastSchedule = '';
            lastScheduleEng = '';
            lastCharterFr = '';
            lastCharterEng = '';
          }
          lastBoatName = boatName;
        }
      } else {
        cabinNameEng = engVal;
      }
    }

    let itinerary = itineraryIdx !== -1 ? String(row[itineraryIdx] || '').trim() : '';
    let departure = departureIdx !== -1 ? String(row[departureIdx] || '').trim() : '';
    let schedule = scheduleIdx !== -1 ? String(row[scheduleIdx] || '').trim() : '';
    let charterFr = charterFrIdx !== -1 ? String(row[charterFrIdx] || '').trim() : '';
    let charterEng = charterEngIdx !== -1 ? String(row[charterEngIdx] || '').trim() : '';

    // Check if departure is actually a schedule (day of week)
    if (departure && !schedule) {
      const lowerDep = departure.toLowerCase();
      const isLikelySchedule = daysKeywords.some(day => lowerDep.includes(day));
      if (isLikelySchedule) {
        schedule = departure;
        departure = '';
      }
    }
    
    // Check same for English departure
    if (departureEng && !scheduleEng) {
      const lowerDepEng = departureEng.toLowerCase();
      const isLikelyScheduleEng = daysKeywords.some(day => lowerDepEng.includes(day));
      if (isLikelyScheduleEng) {
        scheduleEng = departureEng;
        departureEng = '';
      }
    }

    // If cabinName looks like a template, extract from it
    if (isTemplateText(cabinName)) {
      const extracted = extractFromTemplate(cabinName);
      if (extracted.cabinName) {
        cabinName = extracted.cabinName;
        if (extracted.itinerary) itinerary = extracted.itinerary;
        if (extracted.departure) departure = extracted.departure;
        if (extracted.schedule) schedule = extracted.schedule;
        // Prefer template link if dedicated column link is invalid
        if (!isLinkValid(link) && isLinkValid(extracted.link)) {
          link = extracted.link;
        }
      } else {
        // Fallback: if it's a template but we can't find the cabin name, 
        // use a generic name instead of skipping
        cabinName = `Cabin ${i}`;
        if (extracted.itinerary) itinerary = extracted.itinerary;
        if (extracted.departure) departure = extracted.departure;
        if (extracted.schedule) schedule = extracted.schedule;
        if (!isLinkValid(link) && isLinkValid(extracted.link)) {
          link = extracted.link;
        }
      }
      
      // If boatName is missing, try to extract it from the template too
      if (!boatName && extracted.boat) {
        boatName = extracted.boat;
        if (boatName.toLowerCase() !== lastBoatName.toLowerCase()) {
          lastItinerary = '';
          lastItineraryEng = '';
          lastDeparture = '';
          lastDepartureEng = '';
          lastSchedule = '';
          lastScheduleEng = '';
          lastCharterFr = '';
          lastCharterEng = '';
        }
        lastBoatName = boatName;
      }
    }

    if (!boatName) continue;

    // Boat-specific metadata propagation / fallback logic
    if (!itinerary && lastItinerary) itinerary = lastItinerary;
    if (!itineraryEng && lastItineraryEng) itineraryEng = lastItineraryEng;
    if (!departure && lastDeparture) departure = lastDeparture;
    if (!departureEng && lastDepartureEng) departureEng = lastDepartureEng;
    if (!schedule && lastSchedule) schedule = lastSchedule;
    if (!scheduleEng && lastScheduleEng) scheduleEng = lastScheduleEng;
    if (!charterFr && lastCharterFr) charterFr = lastCharterFr;
    if (!charterEng && lastCharterEng) charterEng = lastCharterEng;

    // Update the last-seen variables with whatever non-empty values we have now
    if (itinerary) lastItinerary = itinerary;
    if (itineraryEng) lastItineraryEng = itineraryEng;
    if (departure) lastDeparture = departure;
    if (departureEng) lastDepartureEng = departureEng;
    if (schedule) lastSchedule = schedule;
    if (scheduleEng) lastScheduleEng = scheduleEng;
    if (charterFr) lastCharterFr = charterFr;
    if (charterEng) lastCharterEng = charterEng;
    
    if (!boatsMap.has(boatName)) {
      boatsMap.set(boatName, { cabins: [] });
    }

    const boatData = boatsMap.get(boatName)!;
    
    // Store charter info if found and not already stored
    if (charterFr && !boatData.charterFr) boatData.charterFr = charterFr;
    if (charterEng && !boatData.charterEng) boatData.charterEng = charterEng;

    // Only add cabin if we have a valid name
    if (cabinName) {
      // Avoid duplicates
      if (!boatData.cabins.find(c => c.name === cabinName)) {
        boatData.cabins.push({
          id: `${boatName}-${cabinName}-${i}`,
          name: cabinName,
          link: link,
          itinerary: itinerary || undefined,
          departure: departure || undefined,
          schedule: schedule || undefined,
          nameEng: cabinNameEng || undefined,
          linkEng: linkEng || undefined,
          itineraryEng: itineraryEng || undefined,
          departureEng: departureEng || undefined,
          scheduleEng: scheduleEng || undefined,
          charterFr: charterFr || undefined,
          charterEng: charterEng || undefined
        });
      }
    }
  }

  return Array.from(boatsMap.entries()).map(([name, data]) => ({
    name,
    cabins: data.cabins,
    charterFr: data.charterFr,
    charterEng: data.charterEng
  }));
}

export async function parseSpreadsheet(file: File): Promise<Boat[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        resolve(processWorkbookData(jsonData));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

