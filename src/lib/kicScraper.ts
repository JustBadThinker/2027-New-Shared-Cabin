/**
 * Scraper & Data extractor for Komodo Island Cruises (komodoislandcruises.com)
 * and Le Bali Blog (lebaliblog.com) boat pages.
 * 
 * Maps anchors:
 *   #1, #2, #3, ... -> Cabins (sorted by price descending, #1 is highest)
 *   #tab-inclusions -> Inclusions & Exclusions & What to bring / À apporter
 *   #tab-itinraire, #tab-itineraire, #tab-itinerary -> Cruise Itinerary & Map
 */

export interface ScrapedCabin {
  index: number;
  anchor: string; // e.g. '#1', '#2'
  name: string;
  priceRaw?: string;
  priceNumber?: number;
  extraBedRaw?: string;
  extraBedPriceNumber?: number;
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

/**
 * Parses raw HTML from a Komodo Island Cruises or Le Bali Blog boat page
 */
export function parseKicHtml(html: string, url: string): ScrapedBoatData {
  const brand = detectBrand(url);
  const isLBB = brand === 'LBB';

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || '';
  const h1Match = html.match(/<h1[^>]*class=["\x27][^"\x27]*entry-title[^"\x27]*["\x27][^>]*>(.*?)<\/h1>/i);
  let boatName = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : title.split('|')[0].trim();
  boatName = boatName
    .replace(/\s+Boat$/i, '')
    .replace(/^Bateau\s+/i, '')
    .replace(/\s*\|\s*Le Bali Blog.*$/i, '')
    .replace(/\s*\|\s*Komodo Island Cruises.*$/i, '')
    .trim();

  // Extract featured images from hero & main boat carousels
  const featuredImages: string[] = [];
  const imgMatches = [...html.matchAll(/src=["\x27](https:\/\/[^"\x27]+\.(?:jpe?g|png|webp)[^"\x27]*)["\x27]/gi)];
  imgMatches.forEach(m => {
    const src = m[1];
    if (
      !src.includes('logo') && 
      !src.includes('icon') && 
      !src.includes('avatar') &&
      !src.includes('DAY') &&
      !src.includes('carte') &&
      !src.includes('map') &&
      !featuredImages.includes(src) &&
      (src.includes('uploads') || src.includes('lebaliblog') || src.includes('komodoislandcruises'))
    ) {
      featuredImages.push(src);
    }
  });

  // Extract Cabins: Anchors #1, #2, #3, etc. (sorted by highest price first)
  const cabins: ScrapedCabin[] = [];
  for (let c = 1; c <= 12; c++) {
    // Check various anchor patterns used by WordPress/Kadence/Elementor for #1, #2, etc.
    const anchorMatches = [
      `id="${c}"`,
      `id="tab-${c}"`,
      `id="cabin-${c}"`,
      `id="chambre-${c}"`,
      `id="pane-${c}"`,
      `id="#${c}"`,
      `data-tab="${c}"`,
      `href="#${c}"`
    ];
    let idx = -1;
    for (const pat of anchorMatches) {
      idx = html.indexOf(pat);
      if (idx !== -1) break;
    }
    if (idx === -1) continue;

    const nextIdx = html.indexOf(`id="${c + 1}"`, idx);
    const chunk = html.substring(idx, nextIdx !== -1 ? nextIdx : idx + 4500);

    const nameMatch = chunk.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
    let rawName = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : (isLBB ? `Chambre ${c}` : `Cabin ${c}`);
    rawName = rawName.replace(/&amp;/g, '&');

    // Extract price (French Rp 7 500 000 /personne or English IDR 3,600,000 /person)
    const priceMatch = chunk.match(/(?:IDR|Rp\.?)\s*[\d\s,.]+(?:\s*\/\s*(?:personne|person|pax))?/i);
    const priceRaw = priceMatch ? priceMatch[0].trim() : undefined;
    let priceNumber: number | undefined;
    if (priceRaw) {
      const numOnly = priceRaw.replace(/[^0-9]/g, '');
      if (numOnly) priceNumber = parseInt(numOnly, 10);
    }

    // Extract optional extra bed
    const extraBedMatch = chunk.match(/(?:extra\s*bed|lit\s*suppl[eé]mentaire)[^<]*?(?:IDR|Rp\.?)\s*[\d\s,.]+/i);
    const extraBedRaw = extraBedMatch ? extraBedMatch[0].trim() : undefined;
    let extraBedPriceNumber: number | undefined;
    if (extraBedRaw) {
      const numOnly = extraBedRaw.replace(/[^0-9]/g, '');
      if (numOnly) extraBedPriceNumber = parseInt(numOnly, 10);
    }

    // Extract images inside this cabin's carousel
    const cabinImgs: string[] = [];
    const cImgMatches = [...chunk.matchAll(/src=["\x27](https:\/\/[^"\x27]+\.(?:jpe?g|png|webp)[^"\x27]*)["\x27]/gi)];
    cImgMatches.forEach(m => {
      const src = m[1];
      if (
        !src.includes('logo') && 
        !src.includes('icon') && 
        !src.includes('avatar') && 
        !src.includes('carte') &&
        !src.includes('map') &&
        !cabinImgs.includes(src)
      ) {
        cabinImgs.push(src);
      }
    });

    // Extract amenities (Double Bed, Air Conditioning, Ensuite Bathroom, etc.)
    const amenities: string[] = [];
    const textChunk = chunk.replace(/<style[^>]*>.*?<\/style>/gis, '').replace(/<[^>]+>/g, ' ');
    
    // Beds
    if (/queen\s*size/i.test(textChunk)) amenities.push(isLBB ? '1 Lit Queen size' : '1 Queen Size Bed');
    else if (/double\s*bed/i.test(textChunk) || /doube\s*bed/i.test(textChunk) || /lit\s*double/i.test(textChunk)) amenities.push(isLBB ? '1 Lit Double' : '1 Double Bed');
    else if (/bunk\s*bed/i.test(textChunk) || /lits\s*superpos[eé]s/i.test(textChunk)) amenities.push(isLBB ? 'Lits superposés' : 'Bunk Beds');
    else if (/single\s*bed/i.test(textChunk) || /lit\s*simple/i.test(textChunk)) amenities.push(isLBB ? '1 Lit simple' : 'Single Bed');

    // Climate & Comfort
    if (/air\s*conditioning/i.test(textChunk) || /climatisation/i.test(textChunk) || /\bac\b/i.test(textChunk)) amenities.push(isLBB ? 'Climatisation' : 'Air Conditioning');
    
    // Bathroom
    if (/salle\s*de\s*bains\s*priv[eé]e/i.test(textChunk) || /private\s*(?:ensuite\s*)?bathroom/i.test(textChunk) || /ensuite/i.test(textChunk)) {
      amenities.push(isLBB ? 'Salle de bains privée' : 'Private Ensuite Bathroom');
    } else if (/salle\s*de\s*bains\s*partag[eé]e/i.test(textChunk) || /shared\s*bathroom/i.test(textChunk)) {
      amenities.push(isLBB ? 'Salle de bains partagée' : 'Shared bathroom');
    }

    if (/eau\s*chaude/i.test(textChunk) || /hot\s*water/i.test(textChunk)) amenities.push(isLBB ? 'Eau chaude' : 'Hot water');
    
    // View / Balcony / Hublot
    if (/balcon\s*priv[eé]/i.test(textChunk) || /private\s*balcony/i.test(textChunk) || /balcony/i.test(textChunk)) {
      amenities.push(isLBB ? 'Balcon privé' : 'Private balcony');
    }
    if (/hublot/i.test(textChunk) || /porthole/i.test(textChunk)) {
      amenities.push(isLBB ? 'Hublot' : 'Porthole');
    } else if (/vue\s*mer/i.test(textChunk) || /sea\s*view/i.test(textChunk) || /ocean\s*view/i.test(textChunk)) {
      amenities.push(isLBB ? 'Vue mer' : 'Sea View');
    }

    // Deck
    if (/pont\s*sup[eé]rieur/i.test(textChunk) || /upper\s*deck/i.test(textChunk)) amenities.push(isLBB ? 'Pont Supérieur' : 'Upper deck');
    else if (/pont\s*inf[eé]rieur/i.test(textChunk) || /lower\s*deck/i.test(textChunk)) amenities.push(isLBB ? 'Pont Inférieur' : 'Lower deck');
    else if (/pont\s*principal/i.test(textChunk) || /main\s*deck/i.test(textChunk)) amenities.push(isLBB ? 'Pont Principal' : 'Main deck');

    // Capacity & Room style
    if (/capacit[eé]\s*:\s*\d+/i.test(textChunk) || /capacity\s*:\s*\d+/i.test(textChunk)) {
      const capMatch = textChunk.match(/(?:capacit[eé]|capacity)\s*:\s*(\d+)\s*(?:personnes?|people|guests?)/i);
      if (capMatch) amenities.push(isLBB ? `Capacité : ${capMatch[1]} personnes` : `Capacity: ${capMatch[1]} guests`);
    }
    if (/chambre\s*partag[eé]e/i.test(textChunk) || /shared\s*room/i.test(textChunk)) {
      amenities.push(isLBB ? 'Chambre partagée' : 'Shared room');
    } else if (/chambre\s*priv[eé]e/i.test(textChunk) || /private\s*room/i.test(textChunk)) {
      amenities.push(isLBB ? 'Chambre privée' : 'Private room');
    }

    cabins.push({
      index: c,
      anchor: `#${c}`,
      name: rawName,
      priceRaw,
      priceNumber,
      extraBedRaw,
      extraBedPriceNumber,
      amenities,
      images: cabinImgs
    });
  }

  // Sort cabins descending by price (#1 is highest price first)
  if (cabins.some(c => c.priceNumber !== undefined)) {
    cabins.sort((a, b) => (b.priceNumber || 0) - (a.priceNumber || 0));
    cabins.forEach((cab, i) => {
      cab.index = i + 1;
      cab.anchor = `#${i + 1}`;
    });
  }

  // Extract Inclusions (under #tab-inclusions or "What's included" / "Ce Qui Est Inclus")
  const inclusions: string[] = [];
  const incHeaderMatch = html.match(/(?:Ce\s*qui\s*est\s*inclus|What&#8217;s\s*included|What[\'’]s\s*included|What\s*is\s*included|id=["\']tab-inclusions["\']|href=["\']#tab-inclusions["\'])/i);
  if (incHeaderMatch && incHeaderMatch.index !== undefined) {
    const startIdx = incHeaderMatch.index;
    const endMatch = html.substring(startIdx).match(/(?:Ce\s*qui\s*n[\'’]est\s*pas\s*inclus|What&#8217;s\s*not\s*included|What[\'’]s\s*not\s*included|id=["\']tab-apporter["\']|id=["\']tab-a-apporter["\'])/i);
    const endIdx = endMatch && endMatch.index !== undefined ? startIdx + endMatch.index : startIdx + 8000;
    const incSub = html.substring(startIdx, endIdx);

    const incListMatches = [...incSub.matchAll(/class=["\x27][^"\x27]*kt-svg-icon-list-text[^"\x27]*["\x27][^>]*>(.*?)<\/span>/gis)];
    incListMatches.forEach(m => {
      let clean = m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").trim();
      if (clean && !inclusions.includes(clean)) inclusions.push(clean);
    });
    if (inclusions.length === 0) {
      const liMatches = [...incSub.matchAll(/<li[^>]*>(.*?)<\/li>/gis)];
      liMatches.forEach(m => {
        let clean = m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").trim();
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

  // Extract Exclusions (under #tab-inclusions or "What's not included" / "Ce Qui N'est Pas Inclus")
  const exclusions: string[] = [];
  const excHeaderMatch = html.match(/(?:Ce\s*qui\s*n[\'’]est\s*pas\s*inclus|What&#8217;s\s*not\s*included|What[\'’]s\s*not\s*included|What\s*is\s*excluded|Non\s*inclus|Exclusions)/i);
  if (excHeaderMatch && excHeaderMatch.index !== undefined) {
    const startIdx = excHeaderMatch.index;
    const endMatch = html.substring(startIdx).match(/(?:[ÀA]\s*apporter|What\s*to\s*bring|Things\s*to\s*bring|id=["\']tab-apporter["\']|id=["\']tab-a-apporter["\']|Termes\s*et\s*conditions)/i);
    const endIdx = endMatch && endMatch.index !== undefined ? startIdx + endMatch.index : startIdx + 8000;
    const excSub = html.substring(startIdx, endIdx);

    const excListMatches = [...excSub.matchAll(/class=["\x27][^"\x27]*kt-svg-icon-list-text[^"\x27]*["\x27][^>]*>(.*?)<\/span>/gis)];
    excListMatches.forEach(m => {
      let clean = m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").trim();
      if (clean && !exclusions.includes(clean)) exclusions.push(clean);
    });
    if (exclusions.length === 0) {
      const liMatches = [...excSub.matchAll(/<li[^>]*>(.*?)<\/li>/gis)];
      liMatches.forEach(m => {
        let clean = m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").trim();
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

  // Extract What to bring (under #tab-apporter / #tab-a-apporter or "À apporter")
  const whatToBring: string[] = [];
  const bringHeaderMatch = html.match(/(?:id=["\']tab-apporter["\']|id=["\']tab-a-apporter["\']|[ÀA]\s*apporter|What\s*To\s*bring|What\s*to\s*bring|Things\s*to\s*bring)/i);
  if (bringHeaderMatch && bringHeaderMatch.index !== undefined) {
    const startIdx = bringHeaderMatch.index;
    const endMatch = html.substring(startIdx).match(/(?:Termes\s*et\s*conditions|Terms\s*and\s*conditions|id=["\']tab-termes)/i);
    const endIdx = endMatch && endMatch.index !== undefined ? startIdx + endMatch.index : startIdx + 8000;
    const bringSub = html.substring(startIdx, endIdx);

    const bringListMatches = [...bringSub.matchAll(/class=["\x27][^"\x27]*kt-svg-icon-list-text[^"\x27]*["\x27][^>]*>(.*?)<\/span>/gis)];
    bringListMatches.forEach(m => {
      let clean = m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").trim();
      if (clean && !whatToBring.includes(clean)) whatToBring.push(clean);
    });
    if (whatToBring.length === 0) {
      const liMatches = [...bringSub.matchAll(/<li[^>]*>(.*?)<\/li>/gis)];
      liMatches.forEach(m => {
        let clean = m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '-').replace(/&#8217;/g, "'").trim();
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

  // Extract Itinerary Map Image (Prioritize high-resolution route maps with 'peta', 'carte', or 'map')
  let itineraryMapImage: string | undefined;

  // 1. First priority: Images explicitly named with 'peta', 'carte', or 'map'
  const primaryMapMatch = html.match(/src=["\x27](https:\/\/[^"\x27]*(?:peta|carte|map)[^"\x27]*\.(?:jpe?g|png|webp))["\x27]/i);
  if (primaryMapMatch && primaryMapMatch[1]) {
    itineraryMapImage = primaryMapMatch[1];
  }

  // 2. Second priority: Search inside itinerary tab (#tab-itinraire / #tab-itineraire / #tab-itinerary)
  if (!itineraryMapImage) {
    const itTabMatch = html.match(/(?:id=["\']tab-itinraire["\']|id=["\']tab-itineraire["\']|id=["\']tab-itinerary["\']|href=["\']#tab-itinraire["\']|href=["\']#tab-itinerary["\'])/i);
    if (itTabMatch && itTabMatch.index !== undefined) {
      const itChunk = html.substring(itTabMatch.index, itTabMatch.index + 12000);
      const itImgMatch = itChunk.match(/src=["\x27](https:\/\/[^"\x27]*(?:route|itineraire|itinerary)[^"\x27]*\.(?:jpe?g|png|webp))["\x27]/i);
      if (itImgMatch && itImgMatch[1]) {
        itineraryMapImage = itImgMatch[1];
      }
    }
  }

  // Fallback high-resolution route map if not detected in HTML
  if (!itineraryMapImage) {
    if (url.includes('lombok') || title.toLowerCase().includes('lombok')) {
      itineraryMapImage = 'https://lebaliblog.com/wp-content/uploads/2025/11/Peta-Itinerary_Lady-Grace-Lombok-to-Flores.webp';
    } else {
      itineraryMapImage = 'https://lebaliblog.com/wp-content/uploads/2024/01/Carte-Itineraire-Komodo-3J2N.webp';
    }
  }

  // Extract Itinerary Days: Day 1, Day 2, Day 3
  const isLombok = url.includes('lombok') || title.toLowerCase().includes('lombok');
  const itineraryDays: ScrapedItineraryDay[] = isLombok ? [
    {
      dayNumber: 1,
      title: isLBB ? 'Départ de Lombok - Île de Kenawa - Navigation' : 'Lombok Departure - Kenawa Island - Sailing',
      destinations: ['Lombok Harbour', 'Kenawa Island'],
      images: [
        'https://lebaliblog.com/wp-content/uploads/2023/11/DAY1-Kenawa-Island.webp',
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
        'https://lebaliblog.com/wp-content/uploads/2023/11/Whale-Shark-Saleh-Bay.webp',
        'https://lebaliblog.com/wp-content/uploads/2023/11/Satonda-Island.webp'
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
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Manjarite-Island.webp'
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
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Manjarite-Island.webp',
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
        'https://lebaliblog.com/wp-content/uploads/2024/01/DAY3-Kanawa-Island.webp'
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
  const localKey = `scraped_boat_${baseUrl}`;
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

  try {
    const res = await fetch(`/api/scrape-boat?url=${encodeURIComponent(baseUrl)}`);
    if (res.ok) {
      const data: ScrapedBoatData = await res.json();
      scrapeCache[baseUrl] = { data, timestamp: Date.now() };
      try {
        localStorage.setItem(localKey, JSON.stringify(data));
      } catch (_) {}
      return data;
    }
  } catch (err) {
    console.warn('API scrape-boat fetch failed, trying direct fallback:', err);
  }

  return null;
}
