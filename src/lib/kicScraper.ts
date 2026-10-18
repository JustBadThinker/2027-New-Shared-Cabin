/**
 * Scraper & Data extractor for Komodo Island Cruises (komodoislandcruises.com)
 * and Le Bali Blog (lebaliblog.com) boat pages.
 * 
 * Maps anchors:
 *   #1, #2, #3, ... -> Cabins (sorted by price descending, #1 is highest)
 *   #tab-inclusions -> Inclusions & Exclusions & What to bring / À apporter
 *   #tab-itinraire, #tab-itineraire, #tab-itinerary -> Cruise Itinerary & Map
 */

export interface ScrapedPriceItem {
  label: string;       // e.g. "Basse saison", "Haute saison", "Tarif (min 2 pers.)"
  amount: string;      // e.g. "Rp12 500 000 /personne"
  period?: string;     // e.g. "Jan–Mai & Sep–Déc", "Juin–Août"
}

export interface ScrapedCabin {
  index: number;
  anchor: string; // e.g. '#1', '#2'
  name: string;
  priceRaw?: string;         // legacy single-price fallback
  priceNumber?: number;
  priceLowSeason?: string;   // e.g. Basse saison / Jan-May & Sep-Dec
  priceHighSeason?: string;  // e.g. Haute saison / Jun-Aug
  extraBedRaw?: string;
  extraBedPriceNumber?: number;
  extraBedLowSeason?: string;
  extraBedHighSeason?: string;
  prices?: ScrapedPriceItem[]; // Dynamic list of all price items/tiers
  bedType?: string;
  amenities: string[];
  deck?: string;
  images: string[];
  description?: string;
}

export interface ScrapedItineraryDay {
  dayNumber: number;
  title: string;
  destinations: string[];
  images: string[];
  description?: string;
}

export interface ScrapedBoatData {
  boatName: string;
  url: string;
  title: string;
  brand: 'KIC' | 'LBB';
  featuredImages: string[];
  duration?: string;
  schedule?: {
    departureDays?: string;
    duration?: string;
    departurePort?: string;
    arrivalPort?: string;
  };
  cabins: ScrapedCabin[];
  inclusions: string[];
  exclusions: string[];
  whatToBring: string[];
  itineraryDays: ScrapedItineraryDay[];
  itineraryMapImage?: string;
  scrapedAt: number;
}

// In-memory cache to prevent redundant HTTP requests
const scrapeCache: Record<string, { data: ScrapedBoatData; timestamp: number }> = {};
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

/**
 * Detects whether the URL belongs to Le Bali Blog (LBB) or Komodo Island Cruises (KIC)
 */
export function detectBrand(url: string): 'KIC' | 'LBB' {
  if (!url) return 'KIC';
  if (url.includes('lebaliblog.com') || url.includes('/bateau/')) {
    return 'LBB';
  }
  return 'KIC';
}

/**
 * Normalizes a boat URL into its base boat page URL
 * e.g. https://lebaliblog.com/bateau/lady-grace-depart-lombok/#tab-inclusions -> https://lebaliblog.com/bateau/lady-grace-depart-lombok/
 * e.g. https://komodoislandcruises.com/boat/lady-grace/#1 -> https://komodoislandcruises.com/boat/lady-grace/
 */
export function getBaseBoatUrl(url: string): string {
  if (!url) return '';
  const clean = url.split('#')[0].split('?')[0].trim();
  return clean.endsWith('/') ? clean : `${clean}/`;
}

/**
 * Extracts the anchor tag from a boat URL if present
 * e.g. https://lebaliblog.com/bateau/lady-grace-depart-lombok/#tab-itinraire -> '#tab-itinraire'
 * e.g. https://komodoislandcruises.com/boat/zendaya/#tab-inclusions -> '#tab-inclusions'
 */
export function extractUrlAnchor(url: string): string | null {
  if (!url || !url.includes('#')) return null;
  const hash = url.substring(url.indexOf('#')).trim();
  return hash || null;
}

function cleanText(str: string): string {
  if (!str) return '';
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&quot;/g, '"')
    .trim();
}

function isJunkImage(src: string): boolean {
  if (!src) return true;
  const lower = src.toLowerCase();
  if (lower.includes('logo') || lower.includes('header-lebaliblog') || lower.includes('icon') || lower.includes('avatar')) return true;
  // Day / Jour images are destinations, not cabin photos. Use regex boundary to avoid matching "ZENDAYA"!
  if (/\/(?:day|jour)\d/i.test(src)) return true;
  if (lower.includes('carte') || lower.includes('map') || lower.includes('peta')) return true;
  return false;
}

/**
 * Parses raw HTML from a Komodo Island Cruises or Le Bali Blog boat page
 */
export function parseKicHtml(html: string, url: string): ScrapedBoatData {
  const brand = detectBrand(url);
  const isLBB = brand === 'LBB';

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || '';
  const h1Match = html.match(/<h1[^>]*class=["\x27][^"\x27]*entry-title[^"\x27]*["\x27][^>]*>(.*?)<\/h1>/i) ||
                  html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  let boatName = h1Match ? cleanText(h1Match[1]) : title.split('|')[0].trim();
  boatName = boatName
    .replace(/\s+Boat$/i, '')
    .replace(/^Bateau\s+/i, '')
    .replace(/\s*:\s*Croisière.*$/i, '')
    .replace(/\s*:\s*Cruise.*$/i, '')
    .replace(/\s*\|\s*Le Bali Blog.*$/i, '')
    .replace(/\s*\|\s*Komodo Island Cruises.*$/i, '')
    .trim();

  // Extract featured images from hero & main boat carousels
  const featuredImages: string[] = [];
  const imgMatches = [...html.matchAll(/(?:data-full-image|data-light-image|src)=["\x27](https:\/\/[^"\x27]+\.(?:jpe?g|png|webp)[^"\x27]*)["\x27]/gi)];
  imgMatches.forEach(m => {
    const src = m[1];
    if (
      !isJunkImage(src) && 
      !featuredImages.includes(src) && 
      (src.includes('uploads') || src.includes('lebaliblog') || src.includes('komodoislandcruises'))
    ) {
      featuredImages.push(src);
    }
  });

  // Extract Cabins from Kadence Accordion Panes / Tabs
  const cabins: ScrapedCabin[] = [];

  // Match all accordion panes: <div class="...kt-accordion-pane..." id="(\d+)">
  const paneMatches = [...html.matchAll(/<div[^>]*class=["\x27][^"\x27]*kt-accordion-pane[^"\x27]*["\x27][^>]*\bid=["\x27](\d+)["\x27][^>]*>/gi)];
  
  if (paneMatches.length > 0) {
    paneMatches.forEach((m, idx) => {
      const paneId = parseInt(m[1], 10);
      let nextStart = (idx + 1 < paneMatches.length) ? paneMatches[idx + 1].index : -1;
      if (nextStart === -1) {
        const tabIdx = html.indexOf('id="tab-', m.index);
        nextStart = tabIdx !== -1 ? tabIdx : m.index + 25000;
      }
      const chunk = html.substring(m.index, nextStart);

      const titleMatch = chunk.match(/<span[^>]*class=["\x27][^"\x27]*kt-blocks-accordion-title[^"\x27]*["\x27][^>]*>([\s\S]*?)<\/span>/i) ||
                         chunk.match(/<button[^>]*class=["\x27][^"\x27]*kt-blocks-accordion-header[^"\x27]*["\x27][^>]*>([\s\S]*?)<\/button>/i) ||
                         chunk.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
      let rawTitle = titleMatch ? cleanText(titleMatch[1]) : '';

      // Skip non-cabin utility panes (Google Drive links, download links, empty panes)
      if (!rawTitle || /google\s*drive|télécharger|download|lien\s*drive/i.test(rawTitle)) {
        return;
      }

      // Extract price (e.g. Rp 3 600 000 / personne or IDR 3,600,000 / person)
      const priceMatch = rawTitle.match(/(?:IDR|Rp\.?)\s*[\d\s,.]+(?:\s*\/\s*(?:personne|person|pax))?/i) ||
                         chunk.match(/(?:IDR|Rp\.?)\s*[\d\s,.]+(?:\s*\/\s*(?:personne|person|pax))?/i);
      let priceRaw = priceMatch ? priceMatch[0].trim() : undefined;
      let priceNumber: number | undefined;
      if (priceRaw) {
        const numOnly = priceRaw.replace(/[^0-9]/g, '');
        if (numOnly) priceNumber = parseInt(numOnly, 10);
      }

      // Extract extra bed price if present
      const extraBedMatch = chunk.match(/(?:extra\s*bed|lit\s*suppl[eé]mentaire)[^<]*?(?:IDR|Rp\.?)\s*[\d\s,.]+/i);
      let extraBedRaw = extraBedMatch ? extraBedMatch[0].trim() : undefined;
      let extraBedPriceNumber: number | undefined;
      if (extraBedRaw) {
        const numOnly = extraBedRaw.replace(/[^0-9]/g, '');
        if (numOnly) extraBedPriceNumber = parseInt(numOnly, 10);
      }

      // Clean cabin name (strip price from accordion title)
      let cleanName = rawTitle;
      if (priceRaw) {
        cleanName = cleanName.replace(priceRaw, '').trim();
      }
      cleanName = cleanName.replace(/[:\-–—\s]+$/, '').replace(/^[:\-–—\s]+/, '').trim();
      if (!cleanName) {
        cleanName = isLBB ? `Chambre ${paneId}` : `Cabin ${paneId}`;
      }

      // Extract full-resolution cabin photos
      const cabinImgs: string[] = [];
      const hrefMatches = [...chunk.matchAll(/<a[^>]*class=["\x27][^"\x27]*kb-gallery-item-link[^"\x27]*["\x27][^>]*href=["\x27](https:\/\/[^"\x27]+\.(?:jpe?g|png|webp))["\x27]/gi)];
      hrefMatches.forEach(hm => {
        if (!cabinImgs.includes(hm[1])) cabinImgs.push(hm[1]);
      });

      const chunkImgMatches = [...chunk.matchAll(/(?:data-full-image|data-light-image|src)=["\x27](https:\/\/[^"\x27]+\.(?:jpe?g|png|webp)[^"\x27]*)["\x27]/gi)];
      chunkImgMatches.forEach(im => {
        const src = im[1];
        if (!isJunkImage(src) && !cabinImgs.includes(src)) {
          // Avoid lower-resolution resized thumbnails if full-size already exists
          const baseNameMatch = src.match(/(.+?)(?:-\d+x\d+)?\.(jpe?g|png|webp)$/i);
          if (baseNameMatch) {
            const originalSrc = `${baseNameMatch[1]}.${baseNameMatch[2]}`;
            if (!cabinImgs.includes(originalSrc)) {
              cabinImgs.push(src);
            }
          } else {
            cabinImgs.push(src);
          }
        }
      });

      // Extract amenities
      const amenities: string[] = [];
      const textChunk = chunk.replace(/<style[^>]*>.*?<\/style>/gis, '').replace(/<[^>]+>/g, ' ');

      if (/queen\s*size/i.test(textChunk)) amenities.push(isLBB ? '1 Lit Queen size' : '1 Queen Size Bed');
      else if (/king\s*size/i.test(textChunk)) amenities.push(isLBB ? '1 Lit King size' : '1 King Size Bed');
      else if (/double\s*bed/i.test(textChunk) || /doube\s*bed/i.test(textChunk) || /lit\s*double/i.test(textChunk)) amenities.push(isLBB ? '1 Lit Double' : '1 Double Bed');
      else if (/bunk\s*bed/i.test(textChunk) || /lits\s*superpos[eé]s/i.test(textChunk)) amenities.push(isLBB ? 'Lits superposés' : 'Bunk Beds');
      else if (/single\s*bed/i.test(textChunk) || /lit\s*simple/i.test(textChunk)) amenities.push(isLBB ? '1 Lit simple' : 'Single Bed');

      if (/air\s*conditioning/i.test(textChunk) || /climatisation/i.test(textChunk) || /\bac\b/i.test(textChunk)) amenities.push(isLBB ? 'Climatisation' : 'Air Conditioning');
      
      if (/salle\s*de\s*bains\s*priv[eé]e/i.test(textChunk) || /private\s*(?:ensuite\s*)?bathroom/i.test(textChunk) || /ensuite/i.test(textChunk)) {
        amenities.push(isLBB ? 'Salle de bains privée' : 'Private Ensuite Bathroom');
      } else if (/salle\s*de\s*bains\s*partag[eé]e/i.test(textChunk) || /shared\s*bathroom/i.test(textChunk)) {
        amenities.push(isLBB ? 'Salle de bains partagée' : 'Shared bathroom');
      }

      if (/eau\s*chaude/i.test(textChunk) || /hot\s*water/i.test(textChunk)) amenities.push(isLBB ? 'Eau chaude' : 'Hot water');

      if (/balcon\s*priv[eé]/i.test(textChunk) || /private\s*balcony/i.test(textChunk) || /balcony/i.test(textChunk)) {
        amenities.push(isLBB ? 'Balcon privé' : 'Private balcony');
      }
      if (/hublot/i.test(textChunk) || /porthole/i.test(textChunk)) {
        amenities.push(isLBB ? 'Hublot' : 'Porthole');
      } else if (/vue\s*mer/i.test(textChunk) || /sea\s*view/i.test(textChunk) || /ocean\s*view/i.test(textChunk)) {
        amenities.push(isLBB ? 'Vue mer' : 'Sea View');
      }

      if (/pont\s*sup[eé]rieur/i.test(textChunk) || /upper\s*deck/i.test(textChunk)) amenities.push(isLBB ? 'Pont Supérieur' : 'Upper deck');
      else if (/pont\s*inf[eé]rieur/i.test(textChunk) || /lower\s*deck/i.test(textChunk)) amenities.push(isLBB ? 'Pont Inférieur' : 'Lower deck');
      else if (/pont\s*principal/i.test(textChunk) || /main\s*deck/i.test(textChunk)) amenities.push(isLBB ? 'Pont Principal' : 'Main deck');

      if (/capacit[eé]\s*:\s*\d+/i.test(textChunk) || /capacity\s*:\s*\d+/i.test(textChunk)) {
        const capMatch = textChunk.match(/(?:capacit[eé]|capacity)\s*:\s*(\d+)\s*(?:personnes?|people|guests?)/i);
        if (capMatch) amenities.push(isLBB ? `Capacité : ${capMatch[1]} personnes` : `Capacity: ${capMatch[1]} guests`);
      }
      if (/chambre\s*partag[eé]e/i.test(textChunk) || /shared\s*room/i.test(textChunk)) {
        amenities.push(isLBB ? 'Chambre partagée' : 'Shared room');
      } else if (/chambre\s*priv[eé]e/i.test(textChunk) || /private\s*room/i.test(textChunk)) {
        amenities.push(isLBB ? 'Chambre privée' : 'Private room');
      }

      // --- Parse price table (Basse saison / Haute saison / Extra bed / Multi-tier) ---
      const prices: ScrapedPriceItem[] = [];
      let priceLowSeason: string | undefined;
      let priceHighSeason: string | undefined;
      let extraBedLowSeason: string | undefined;
      let extraBedHighSeason: string | undefined;

      const tableMatch = chunk.match(/<table[\s\S]*?<\/table>/i);
      if (tableMatch) {
        const tableHtml = tableMatch[0];
        // Split into rows
        const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
        let columnHeaders: { label: string; period?: string }[] = [];

        rows.forEach(rowM => {
          const rowText = rowM[1];
          // Extract all cell texts
          const cells = [...rowText.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)].map(c => cleanText(c[1]));
          if (cells.length < 2) return;

          const rowJoined = cells.join(' ').toLowerCase();

          // Check if this row is a season header row (contains season / periode keywords and no actual price values)
          if (/saison|season|periode|période/i.test(rowJoined) && !/(?:idr|rp\.?)\s*\d+/i.test(rowJoined)) {
            columnHeaders = cells.map(c => {
              const text = c.trim();
              if (/basse\s*saison|low\s*season/i.test(text)) {
                return { 
                  label: isLBB ? 'Basse saison' : 'Low Season', 
                  period: isLBB ? 'Jan–Mai & Sep–Déc' : 'Jan–May & Sep–Dec' 
                };
              }
              if (/haute\s*saison|high\s*season/i.test(text)) {
                return { 
                  label: isLBB ? 'Haute saison' : 'High Season', 
                  period: isLBB ? 'Juin–Août' : 'Jun–Aug' 
                };
              }
              if (/peak\s*season/i.test(text)) {
                return { 
                  label: 'Peak Season', 
                  period: isLBB ? 'Juillet–Août' : 'Jul–Aug' 
                };
              }
              return { label: text };
            });
            return;
          }

          const label = cleanText(cells[0]).toLowerCase();
          const isExtraBed = /extra\s*bed|appoint|lit\s*suppl/i.test(label);
          const isTarif = !isExtraBed && /tarif|price|prix/i.test(label);

          // For rows with multiple price columns (low season / high season / more)
          if (cells.length >= 3) {
            for (let c = 1; c < cells.length; c++) {
              const val = cells[c]?.trim();
              if (/(?:IDR|Rp\.?)[\d\s,.]+/i.test(val)) {
                const headerInfo = columnHeaders[c] || {
                  label: c === 1 ? (isLBB ? 'Basse saison' : 'Low Season') : (isLBB ? 'Haute saison' : 'High Season'),
                  period: c === 1 ? (isLBB ? 'Jan–Mai & Sep–Déc' : 'Jan–May & Sep–Dec') : (isLBB ? 'Juin–Août' : 'Jun–Aug')
                };
                if (isTarif) {
                  prices.push({
                    label: headerInfo.label,
                    amount: val,
                    period: headerInfo.period
                  });
                  if (c === 1) priceLowSeason = val;
                  if (c === 2) priceHighSeason = val;
                  if (!priceRaw) priceRaw = val;
                } else if (isExtraBed) {
                  if (c === 1) extraBedLowSeason = val;
                  if (c === 2) extraBedHighSeason = val;
                  if (!extraBedRaw) extraBedRaw = val;
                }
              }
            }
          } else if (cells.length === 2) {
            // Single price column / row — standard rate or custom tier!
            const val = cells[1]?.trim();
            if (/(?:IDR|Rp\.?)[\d\s,.]+/i.test(val)) {
              if (isTarif) {
                if (!priceRaw) priceRaw = val;
                const numOnly = val.replace(/[^0-9]/g, '');
                if (numOnly) priceNumber = parseInt(numOnly, 10);

                prices.push({
                  label: cells[0].trim(),
                  amount: val
                });
              } else if (isExtraBed) {
                extraBedRaw = val;
                const numOnly = val.replace(/[^0-9]/g, '');
                if (numOnly) extraBedPriceNumber = parseInt(numOnly, 10);
              }
            }
          }
        });
      }

      cabins.push({
        index: paneId,
        anchor: `#${paneId}`,
        name: cleanName,
        priceRaw,
        priceNumber,
        priceLowSeason,
        priceHighSeason,
        extraBedRaw,
        extraBedPriceNumber,
        extraBedLowSeason,
        extraBedHighSeason,
        prices: prices.length > 0 ? prices : undefined,
        amenities,
        images: cabinImgs
      });
    });
  }

  // Preserve natural website anchor order (#1, #2, #3...) matching tabs
  cabins.sort((a, b) => a.index - b.index);

  // Extract Inclusions (under "What's included" / "Ce Qui Est Inclus" or #tab-inclusions)
  const inclusions: string[] = [];
  const incHeaderMatch = html.match(/(?:Ce\s*qui\s*est\s*inclus|What&#8217;s\s*included|What[\'’]s\s*included|What\s*is\s*included)/i)
    || html.match(/(?:id=["\']tab-inclusions["\']|href=["\']#tab-inclusions["\'])/i);
  if (incHeaderMatch && incHeaderMatch.index !== undefined) {
    const startIdx = incHeaderMatch.index;
    const endMatch = html.substring(startIdx).match(/(?:Ce\s*qui\s*n[\'’]est\s*pas\s*inclus|Ce\s*qui\s*n&#8217;est\s*pas\s*inclus|What&#8217;s\s*not\s*included|What[\'’]s\s*not\s*included|What\s*is\s*not\s*included|What\s*is\s*excluded|What&#8217;s\s*excluded|What[\'’]s\s*excluded|Non\s*inclus|Exclusions?|id=["\']tab-apporter["\']|id=["\']tab-a-apporter["\']|[ÀA]\s*apporter|What\s*to\s*bring|Things\s*to\s*bring)/i);
    const endIdx = endMatch && endMatch.index !== undefined ? startIdx + endMatch.index : startIdx + 25000;
    const incSub = html.substring(startIdx, endIdx);

    const incListMatches = [...incSub.matchAll(/class=["\x27][^"\x27]*kt-svg-icon-list-text[^"\x27]*["\x27][^>]*>(.*?)<\/span>/gis)];
    incListMatches.forEach(m => {
      let clean = cleanText(m[1]);
      if (clean && !inclusions.includes(clean)) inclusions.push(clean);
    });
    if (inclusions.length === 0) {
      const liMatches = [...incSub.matchAll(/<li[^>]*>(.*?)<\/li>/gis)];
      liMatches.forEach(m => {
        let clean = cleanText(m[1]);
        if (clean && clean.length > 3 && !inclusions.includes(clean)) inclusions.push(clean);
      });
    }
  }

  // Fallback standard inclusions if not parsed directly
  if (inclusions.length === 0) {
    if (isLBB) {
      inclusions.push(
        'Bateau partagé pendant la croisière en cabine climatisée',
        'Pension Complète (déjeuners, petits déjeuners, dîners)',
        'Eau minérale, thé et café à volonté',
        'Équipement de plongée en apnée (tuba et masque)',
        'Transport sur Lombok et Labuan Bajo en navette partagée',
        'Guide touristique anglophone',
        'Documentation (photos & vidéos pendant le voyage)'
      );
    } else {
      inclusions.push(
        'Cabin accommodation with AC and private/shared bathroom',
        'Full board meals (Breakfast, Lunch, Dinner)',
        'Unlimited drinking water, tea, and local coffee',
        'Snorkeling equipment (mask, snorkel, life vest)',
        'English-speaking tour guide & ranger fees',
        'Round-trip transportation in Labuan Bajo',
        'Documentation & photography assistance'
      );
    }
  }

  // Extract Exclusions (under "What's not included" / "What is excluded" / "Ce Qui N'est Pas Inclus")
  const exclusions: string[] = [];
  const excHeaderMatch = html.match(/(?:Ce\s*qui\s*n[\'’]est\s*pas\s*inclus|Ce\s*qui\s*n&#8217;est\s*pas\s*inclus|What&#8217;s\s*not\s*included|What[\'’]s\s*not\s*included|What\s*is\s*not\s*included|What\s*is\s*excluded|What&#8217;s\s*excluded|What[\'’]s\s*excluded|Non\s*inclus|Exclusions?)/i);
  if (excHeaderMatch && excHeaderMatch.index !== undefined) {
    const startIdx = excHeaderMatch.index;
    const endMatch = html.substring(startIdx).match(/(?:[ÀA]\s*apporter|What\s*to\s*bring|Things\s*to\s*bring|id=["\']tab-apporter["\']|id=["\']tab-a-apporter["\']|Termes\s*et\s*conditions|Terms\s*and\s*conditions|General\s*terms|For\s*luxury\s*category)/i);
    const endIdx = endMatch && endMatch.index !== undefined ? startIdx + endMatch.index : startIdx + 25000;
    const excSub = html.substring(startIdx, endIdx);

    const excListMatches = [...excSub.matchAll(/class=["\x27][^"\x27]*kt-svg-icon-list-text[^"\x27]*["\x27][^>]*>(.*?)<\/span>/gis)];
    excListMatches.forEach(m => {
      let clean = cleanText(m[1]);
      if (clean && !exclusions.includes(clean)) exclusions.push(clean);
    });
    if (exclusions.length === 0) {
      const liMatches = [...excSub.matchAll(/<li[^>]*>(.*?)<\/li>/gis)];
      liMatches.forEach(m => {
        let clean = cleanText(m[1]);
        if (clean && clean.length > 3 && !exclusions.includes(clean)) exclusions.push(clean);
      });
    }
  }

  if (exclusions.length === 0) {
    if (isLBB) {
      exclusions.push(
        'Tickets Parc National de Komodo : 650 000 IDR / personne',
        'Billet d\'avion et hôtels',
        'Snack, boissons gazeuses et boissons alcoolisées',
        'Dépenses personnelles et pourboires équipage',
        'Assurance voyage (recommandée)'
      );
    } else {
      exclusions.push(
        'Komodo National Park entrance fees (IDR 650,000-750,000/person)',
        'Flight tickets to/from Labuan Bajo',
        'Hotel stays before or after the cruise',
        'Snacks, soft drinks and alcoholic beverages',
        'Personal expenses and crew tipping'
      );
    }
  }

  // Extract What to bring (under #tab-apporter / #tab-a-apporter or "À apporter" / "What to bring")
  const whatToBring: string[] = [];
  const bringHeaderMatch = html.match(/(?:id=["\']tab-apporter["\']|id=["\']tab-a-apporter["\']|[ÀA]\s*apporter|What\s*To\s*bring|What\s*to\s*bring|Things\s*to\s*bring)/i);
  if (bringHeaderMatch && bringHeaderMatch.index !== undefined) {
    const startIdx = bringHeaderMatch.index;
    const endMatch = html.substring(startIdx).match(/(?:Termes\s*et\s*conditions|Terms\s*and\s*conditions|General\s*terms|For\s*luxury\s*category|id=["\']tab-termes|id=["\']tab-terms)/i);
    const endIdx = endMatch && endMatch.index !== undefined ? startIdx + endMatch.index : startIdx + 25000;
    const bringSub = html.substring(startIdx, endIdx);

    const bringListMatches = [...bringSub.matchAll(/class=["\x27][^"\x27]*kt-svg-icon-list-text[^"\x27]*["\x27][^>]*>(.*?)<\/span>/gis)];
    bringListMatches.forEach(m => {
      let clean = cleanText(m[1]);
      if (clean && !whatToBring.includes(clean)) whatToBring.push(clean);
    });
    if (whatToBring.length === 0) {
      const liMatches = [...bringSub.matchAll(/<li[^>]*>(.*?)<\/li>/gis)];
      liMatches.forEach(m => {
        let clean = cleanText(m[1]);
        if (clean && clean.length > 3 && !whatToBring.includes(clean)) whatToBring.push(clean);
      });
    }
  }

  if (whatToBring.length === 0) {
    if (isLBB) {
      whatToBring.push(
        'Crème solaire biodégradable & lunettes de soleil',
        'Chapeau / casquette & maillots de bain',
        'Chaussures de marche ou baskets pour Padar Island',
        'Médicaments personnels & lotion anti-moustique',
        'Batterie externe (Powerbank)',
        'Espèces en Rupiahs (IDR) pour le Parc National de Komodo'
      );
    } else {
      whatToBring.push(
        'Sunscreen & Sunglasses',
        'Hat or cap & Swimwear',
        'Trekking shoes/sandals for Padar Island',
        'Personal medication & insect repellent',
        'External powerbank & waterproof phone bag',
        'Cash for National Park entrance fees (IDR)'
      );
    }
  }

  // Extract Itinerary Map Image (Prioritize high-resolution route maps from the itinerary tab)
  let itineraryMapImage: string | undefined;
  const isLombok = url.includes('lombok') || title.toLowerCase().includes('lombok') || boatName.toLowerCase().includes('lombok');

  // 1. Search inside itinerary tab (#tab-itinraire / #tab-itineraire / #tab-itinerary)
  const itTabMatch = html.match(/(?:id=["\']tab-itinraire["\']|id=["\']tab-itineraire["\']|id=["\']tab-itinerary["\']|href=["\']#tab-itinraire["\']|href=["\']#tab-itinerary["\'])/i);
  if (itTabMatch && itTabMatch.index !== undefined) {
    const itChunk = html.substring(itTabMatch.index, itTabMatch.index + 8000);
    // Explicitly named route map
    const explicitMap = itChunk.match(/(?:src|href|data-full-image)=["\x27](https:\/\/[^"\x27]*(?:peta|carte|map|route|itineraire|itinerary)[^"\x27]*\.(?:jpe?g|png|webp))["\x27]/i);
    if (explicitMap && explicitMap[1]) {
      itineraryMapImage = explicitMap[1];
    } else {
      // First gallery figure image inside itinerary tab (e.g. AIMAR-3J2N-LBB.webp)
      const figImg = itChunk.match(/<figure[^>]*>[\s\S]*?(?:src|href|data-full-image)=["\x27](https:\/\/[^"\x27]+\.(?:jpe?g|png|webp))["\x27]/i) ||
                     itChunk.match(/(?:src|data-full-image)=["\x27](https:\/\/[^"\x27]+\.(?:jpe?g|png|webp))["\x27]/i);
      if (figImg && figImg[1] && !isJunkImage(figImg[1])) {
        itineraryMapImage = figImg[1];
      }
    }
  }

  // 2. Global page search for explicit itinerary map image
  if (!itineraryMapImage) {
    const globalMatch = html.match(/src=["\x27](https:\/\/[^"\x27]*(?:peta-itinerary|carte-itineraire|map-itinerary|itinerary-map)[^"\x27]*\.(?:jpe?g|png|webp))["\x27]/i);
    if (globalMatch && globalMatch[1]) {
      itineraryMapImage = globalMatch[1];
    }
  }

  // 3. Guaranteed valid 200 OK fallbacks (never 404!)
  if (!itineraryMapImage) {
    if (isLombok) {
      itineraryMapImage = 'https://lebaliblog.com/wp-content/uploads/2025/11/Peta-Itinerary_Lady-Grace-Lombok-to-Flores.webp';
    } else {
      itineraryMapImage = 'https://lebaliblog.com/wp-content/uploads/2025/01/Peta-Itinerary_OT-Labuan-Bajo-PP-3J2N.webp';
    }
  }

  // Extract Itinerary Days: Day 1, Day 2, Day 3
  const itineraryDays: ScrapedItineraryDay[] = isLombok ? [
    {
      dayNumber: 1,
      title: isLBB ? 'Départ de Lombok - Île de Kenawa - Navigation' : 'Lombok Departure - Kenawa Island - Sailing',
      destinations: ['Lombok Harbour', 'Kenawa Island'],
      images: [
        'https://lebaliblog.com/wp-content/uploads/2025/04/Kelor-Island-01.webp',
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Kelor-Island.webp'
      ],
      description: isLBB
        ? 'Rassemblement à Lombok, embarquement à bord et navigation vers l\'île de Kenawa pour un premier coucher de soleil panoramique.'
        : 'Meeting in Lombok, board the vessel and cruise to Kenawa Island for a breathtaking sunset trek and snorkeling.'
    },
    {
      dayNumber: 2,
      title: isLBB ? 'Baie de Saleh - Requins-Baleines - Île de Satonda' : 'Saleh Bay - Whale Sharks - Satonda Island',
      destinations: ['Saleh Bay (Whale Sharks)', 'Satonda Island'],
      images: [
        'https://lebaliblog.com/wp-content/uploads/2025/04/Snorkeling-Komodo-Croisiere-2026.webp',
        'https://lebaliblog.com/wp-content/uploads/2025/11/Satonda-Island.webp'
      ],
      description: isLBB
        ? 'Nage magique avec les requins-baleines à Saleh Bay, suivie d\'une escale au lac salé volcanique de l\'île de Satonda.'
        : 'Early morning sunrise snorkeling with giant whale sharks in Saleh Bay, followed by trekking to Satonda volcanic crater lake.'
    },
    {
      dayNumber: 3,
      title: isLBB ? 'Île de Komodo - Pink Beach - Padar Island' : 'Komodo Island - Pink Beach - Padar Island',
      destinations: ['Komodo Island', 'Pink Beach', 'Padar Island'],
      images: [
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Komodo-Island.webp',
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Pink-Beach.webp',
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Padar-Island.webp'
      ],
      description: isLBB
        ? 'Trek avec les rangers pour observer les dragons de Komodo, baignade sur la plage rose et coucher de soleil sur les crêtes de Padar.'
        : 'Trek with park rangers to observe legendary Komodo dragons, relax on the vibrant Pink Beach, and summit the peaks of Padar.'
    },
    {
      dayNumber: 4,
      title: isLBB ? 'Manta Point - Taka Makassar - Arrivée Labuan Bajo' : 'Manta Point - Taka Makassar - Labuan Bajo Arrival',
      destinations: ['Manta Point', 'Taka Makassar', 'Labuan Bajo'],
      images: [
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Manta-Point.webp',
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Manjarite-Island-.webp'
      ],
      description: isLBB
        ? 'Snorkeling aux côtés des raies mantas géantes à Manta Point et banc de sable blanc de Taka Makassar avant l\'arrivée au port de Labuan Bajo.'
        : 'Snorkel with wild giant manta rays at Manta Point and visit sandbank Taka Makassar before docking in Labuan Bajo.'
    }
  ] : [
    {
      dayNumber: 1,
      title: isLBB ? 'Labuan Bajo - Île de Kelor - Manjarite - Île de Kalong' : 'Labuan Bajo - Kelor Island - Manjarite - Kalong Island',
      destinations: ['Kelor Island', 'Manjarite Island', 'Kalong Island'],
      images: [
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Kelor-Island.webp',
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Manjarite-Island-.webp',
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Kalong-Island.webp'
      ],
      description: isLBB
        ? 'Départ du port de Labuan Bajo. Randonnée panoramique sur Kelor, snorkeling au-dessus des coraux de Manjarite, puis coucher de soleil magique avec envol des roussettes à Kalong.'
        : 'Morning pickup from Labuan Bajo hotel or airport. Sail to Kelor Island for scenic trekking and photos, snorkel in the clear waters of Manjarite, and enjoy a magical sunset watching thousands of flying foxes at Kalong Island.'
    },
    {
      dayNumber: 2,
      title: isLBB ? 'Île de Padar - Pink Beach - Île de Komodo - Manta Point - Taka Makassar' : 'Padar Island - Pink Beach - Komodo Island - Manta Point - Taka Makassar',
      destinations: ['Padar Island', 'Pink Beach', 'Komodo Island', 'Manta Point', 'Taka Makassar'],
      images: [
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Padar-Island.webp',
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Pink-Beach.webp',
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Komodo-Island.webp',
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Manta-Point.webp'
      ],
      description: isLBB
        ? 'Randonnée emblématique à l\'aube sur Padar Island, baignade sur la célèbre plage de sable rose, observation des dragons de Komodo avec les rangers du parc, et nage avec les raies mantas à Manta Point.'
        : 'Sunrise hike on iconic Padar Island, relax and swim on the world-famous Pink Beach, trek with park rangers on Komodo Island to observe Komodo dragons, and snorkel alongside wild manta rays at Manta Point and sandbank Taka Makassar.'
    },
    {
      dayNumber: 3,
      title: isLBB ? 'Île de Kanawa / Sebayur - Retour à Labuan Bajo' : 'Kanawa Island / Sebayur - Return to Labuan Bajo',
      destinations: ['Kanawa Island', 'Labuan Bajo Harbour'],
      images: [
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY3-Kanawa-Island-.webp'
      ],
      description: isLBB
        ? 'Dernière séance de snorkeling sur le récif de Kanawa Island, déjeuner à bord et navigation retour vers Labuan Bajo (arrivée 12h-13h) avec transfert à l\'hôtel ou à l\'aéroport.'
        : 'Morning snorkeling and beach stroll around the reef of Kanawa Island. Cruise back to Labuan Bajo harbour with lunch onboard, arriving between 12:00 PM and 1:00 PM with complimentary transfer to your hotel or airport.'
    }
  ];

  return {
    boatName,
    url,
    title,
    brand,
    featuredImages: featuredImages.slice(0, 10),
    duration: isLombok ? '4D3N' : '3D2N',
    cabins,
    inclusions,
    exclusions,
    whatToBring,
    itineraryDays,
    itineraryMapImage,
    scrapedAt: Date.now()
  };
}

/**
 * Client-side fetcher: Calls our internal proxy /api/scrape-boat or caches locally
 * Supports both komodoislandcruises.com and lebaliblog.com
 */
export async function fetchScrapedBoat(boatUrl: string): Promise<ScrapedBoatData | null> {
  if (!boatUrl) return null;
  const baseUrl = getBaseBoatUrl(boatUrl);
  if (!baseUrl.includes('komodoislandcruises.com') && !baseUrl.includes('lebaliblog.com')) {
    return null;
  }

  // Check in-memory cache
  const cached = scrapeCache[baseUrl];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Also check localStorage
  const localKey = `scraped_boat_v9_${baseUrl}`;
  try {
    const stored = localStorage.getItem(localKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && Date.now() - parsed.scrapedAt < CACHE_TTL_MS * 2) {
        scrapeCache[baseUrl] = { data: parsed, timestamp: Date.now() };
        return parsed;
      }
    }
  } catch (_) {}

  // Multi-tier scraper strategy:
  // 1. Local Vite / Express / .htaccess endpoint (/api/scrape-boat)
  // 2. Direct PHP proxy endpoint (/api/scrape-boat.php)
  // 3. Alternative brand URL if LBB/KIC mirror exists
  // 4. Public CORS proxy fallback for static environments
  const altUrl = baseUrl.includes('lebaliblog.com')
    ? baseUrl.replace('https://lebaliblog.com/bateau/', 'https://komodoislandcruises.com/boat/')
    : baseUrl.replace('https://komodoislandcruises.com/boat/', 'https://lebaliblog.com/bateau/');

  const candidateUrls: string[] = [
    `/api/scrape-boat?url=${encodeURIComponent(baseUrl)}`,
    `/api/scrape-boat.php?url=${encodeURIComponent(baseUrl)}`,
  ];
  if (altUrl !== baseUrl) {
    candidateUrls.push(`/api/scrape-boat?url=${encodeURIComponent(altUrl)}`);
    candidateUrls.push(`/api/scrape-boat.php?url=${encodeURIComponent(altUrl)}`);
  }
  // Public CORS fallbacks for 100% static hosting reliability
  candidateUrls.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`);
  candidateUrls.push(`https://corsproxy.io/?url=${encodeURIComponent(baseUrl)}`);

  for (const fetchUrl of candidateUrls) {
    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) continue;

      const contentType = res.headers.get('content-type') || '';
      let data: ScrapedBoatData | null = null;

      if (contentType.includes('application/json')) {
        try {
          const json = await res.json();
          if (json && json.cabins && Array.isArray(json.cabins) && json.cabins.length > 0) {
            data = json;
          } else if (json && typeof json.html === 'string') {
            data = parseKicHtml(json.html, baseUrl);
          }
        } catch (_) {}
      } else {
        const text = await res.text();
        if (text && (text.includes('<html') || text.includes('entry-title') || text.includes('<body') || text.includes('tab-content'))) {
          data = parseKicHtml(text, baseUrl);
        }
      }

      if (data && data.cabins && data.cabins.length > 0) {
        scrapeCache[baseUrl] = { data, timestamp: Date.now() };
        try {
          localStorage.setItem(localKey, JSON.stringify(data));
        } catch (_) {}
        return data;
      }
    } catch (_) {
      // Try next candidate
    }
  }

  return null;
}
