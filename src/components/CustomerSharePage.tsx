import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ShareLinkSnapshot, BoatSnapshot, CabinSnapshot } from '../types/share';
import { 
  getShareLink, 
  buildWhatsAppLink, 
  buildDynamicWhatsAppMessage, 
  getDisplayImageUrl, 
  getDriveThumbnailUrl,
  isShareLinkExpired,
  FALLBACK_CABIN_IMAGES
} from '../lib/shareService';
import { copyFormattedToClipboard, formatTemplateToEmailHtml, cn } from '../lib/utils';
import { fetchScrapedBoat, ScrapedBoatData } from '../lib/kicScraper';
import { 
  ExternalLink, 
  MessageCircle, 
  Ship, 
  AlertCircle, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Maximize2,
  X,
  Copy,
  Check,
  Clock,
  RefreshCw,
  Globe,
  Loader2,
  Smartphone,
  Tablet,
  Monitor,
  Compass,
  ListChecks,
  Luggage,
  Calendar,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface CustomerSharePageProps {
  shareId: string;
  isModal?: boolean;
  onClose?: () => void;
}

interface ImagePreviewState {
  isOpen: boolean;
  images: string[];
  activeIndex: number;
  boatName: string;
  cabinName: string;
  websiteUrl?: string;
}

interface WebPreviewModalState {
  isOpen: boolean;
  url: string;
  boatName: string;
  cabinName?: string;
}

export const CustomerSharePage: React.FC<CustomerSharePageProps> = ({ shareId, isModal = false, onClose }) => {
  const [snapshot, setSnapshot] = useState<ShareLinkSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_found' | 'network_error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Accordion State: index of expanded boat (default: 0 = first boat expanded)
  const [expandedBoatIndex, setExpandedBoatIndex] = useState<number>(0);

  // Sub-tab per boat: 'cabins' | 'itinerary' | 'inclusions'
  const [activeBoatTab, setActiveBoatTab] = useState<Record<number, 'cabins' | 'itinerary' | 'inclusions'>>({});

  // Device viewport simulation mode when viewed inside in-app modal
  const [deviceSimulation, setDeviceSimulation] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');

  // Scraped boat data per boat index
  const [scrapedDataByBoat, setScrapedDataByBoat] = useState<Record<number, ScrapedBoatData>>({});
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);

  // Cabin Carousel state per boat: map of boatIndex -> activeCabinIndex
  const [activeCabinByBoat, setActiveCabinByBoat] = useState<Record<number, number>>({});

  // Active image within cabin gallery: map of "boatIndex-cabinIndex" -> activeImageIndex
  const [activeImageByCabin, setActiveImageByCabin] = useState<Record<string, number>>({});

  // Image Preview Modal (Lightbox) state
  const [previewModal, setPreviewModal] = useState<ImagePreviewState | null>(null);
  const [isLightboxZoomed, setIsLightboxZoomed] = useState(false);

  // Direct Interactive Web Modal (iframe browser for itinerary & cabin details)
  const [webModal, setWebModal] = useState<WebPreviewModalState | null>(null);
  const [webIframeLoading, setWebIframeLoading] = useState(true);

  // Copied feedback states
  const [copiedTemplateKey, setCopiedTemplateKey] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [failedImageUrls, setFailedImageUrls] = useState<Record<string, boolean>>({});

  // Touch tracking for swipe gestures on mobile
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  // Live expiration countdown calculation (must be at top level before early returns)
  const [countdownText, setCountdownText] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!snapshot?.expiresAt) return;
    const isFr = snapshot?.language === 'FR';
    const calculateCountdown = () => {
      const now = Date.now();
      const diff = Number(snapshot.expiresAt) - now;
      if (diff <= 0) {
        setCountdownText(isFr ? 'Lien expiré' : 'Link expired');
        setIsUrgent(true);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setIsUrgent(diff < 12 * 60 * 60 * 1000);

      if (days >= 1) {
        setCountdownText(isFr ? `Expire dans ${days}j ${hours}h` : `Expires in ${days}d ${hours}h`);
      } else if (hours >= 1) {
        setCountdownText(isFr ? `Expire dans ${hours}h ${minutes}m` : `Expires in ${hours}h ${minutes}m`);
      } else {
        setCountdownText(isFr ? `Expire dans ${minutes}m ${seconds}s` : `Expires in ${minutes}m ${seconds}s`);
      }
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, [snapshot?.expiresAt, snapshot?.language]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      setErrorMessage(null);
      const res = await getShareLink(shareId);
      if (res.status === 'success' && res.snapshot) {
        setSnapshot(res.snapshot);
      } else if (res.status === 'not_found') {
        setError('not_found');
      } else {
        setError('network_error');
        setErrorMessage(res.errorMessage || 'Unable to connect to live availability.');
      }
    } catch (err: any) {
      setError('network_error');
      setErrorMessage(err?.message || 'Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [shareId]);

  // Handle keyboard events for image preview lightbox and web preview modal
  useEffect(() => {
    if (!previewModal?.isOpen && !webModal?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (webModal?.isOpen) setWebModal(null);
        if (previewModal?.isOpen) setPreviewModal(null);
      } else if (previewModal?.isOpen && e.key === 'ArrowLeft' && previewModal.images.length > 1) {
        setPreviewModal(prev => {
          if (!prev) return null;
          const newIdx = prev.activeIndex === 0 ? prev.images.length - 1 : prev.activeIndex - 1;
          return { ...prev, activeIndex: newIdx };
        });
      } else if (previewModal?.isOpen && e.key === 'ArrowRight' && previewModal.images.length > 1) {
        setPreviewModal(prev => {
          if (!prev) return null;
          const newIdx = prev.activeIndex === prev.images.length - 1 ? 0 : prev.activeIndex + 1;
          return { ...prev, activeIndex: newIdx };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewModal, webModal]);

  // Normalize boats list (supports both new multi-boat snapshots and legacy single-boat snapshots)
  const boats: BoatSnapshot[] = useMemo(() => {
    if (!snapshot) return [];
    if (snapshot.boats && snapshot.boats.length > 0) {
      return snapshot.boats;
    }
    return [{
      boatName: snapshot.boatName || 'Cruise Vessel',
      itinerary: snapshot.itinerary,
      dates: snapshot.dates || '',
      duration: snapshot.duration,
      departure: snapshot.departure,
      cabins: snapshot.cabins || [],
      fuelSurcharge: snapshot.fuelSurcharge,
      limitedServiceNote: snapshot.limitedServiceNote,
    }];
  }, [snapshot]);

  // Helper to match a snapshot cabin to its exact scraped cabin tab from the website
  const getMatchingScrapedCabin = (
    scrapedData: ScrapedBoatData | undefined,
    cabin: CabinSnapshot | undefined,
    cabinIdx: number
  ) => {
    if (!scrapedData || !scrapedData.cabins || scrapedData.cabins.length === 0) {
      return undefined;
    }

    // 1. First priority: URL anchor with #N → match by ORDINAL POSITION in sorted cabin list
    // Note: scraped cabin.index is the raw DOM pane id (e.g. 1234), NOT 1-based position.
    // So #1 = the 1st cabin in the sorted list (index 0), #2 = 2nd, etc.
    if (cabin?.websiteUrl) {
      const anchorMatch = cabin.websiteUrl.match(/#(\d+)$/) || cabin.websiteUrl.match(/#(?:tab|cabin|chambre|pane)-?(\d+)$/i);
      if (anchorMatch) {
        const ordinal = parseInt(anchorMatch[1], 10) - 1; // #1 → index 0, #2 → index 1
        // Try exact anchor/index match first (may work if DOM id = ordinal)
        const exactByAnchor = scrapedData.cabins.find(c => c.anchor === `#${ordinal + 1}`);
        if (exactByAnchor) return exactByAnchor;
        // Then try ordinal position in sorted cabin list
        if (ordinal >= 0 && ordinal < scrapedData.cabins.length) {
          return scrapedData.cabins[ordinal];
        }
      }
    }

    // 2. Second priority: Cabin name matching — use longest word match to avoid false positives
    if (cabin?.name || cabin?.nameEng) {
      const searchNames = [cabin.name, cabin.nameEng].filter(Boolean).map(n => n!.toLowerCase());
      for (const name of searchNames) {
        // Only match if a distinctive word (>= 5 chars) is shared, to avoid common words like "cabin"
        const words = name.split(/[\s()\-/,]+/).filter(w => w.length >= 5);
        if (words.length > 0) {
          const found = scrapedData.cabins.find(c => {
            const cName = c.name.toLowerCase();
            return words.some(w => cName.includes(w));
          });
          if (found) return found;
        }
        // Broad match (exact name inclusion)
        const broadFound = scrapedData.cabins.find(c => {
          const cName = c.name.toLowerCase();
          return cName === name || (name.length >= 5 && (cName.includes(name) || name.includes(cName)));
        });
        if (broadFound) return broadFound;
      }
    }

    // 3. Fallback by cabin list position (cabinIdx = position in rawCabins)
    if (cabinIdx < scrapedData.cabins.length) {
      return scrapedData.cabins[cabinIdx];
    }

    return scrapedData.cabins[0];
  };

  // Auto-fetch scraped boat details (inclusions, itinerary, cabins) for KIC and LBB links
  useEffect(() => {
    if (!boats || boats.length === 0) return;
    boats.forEach((b, bIdx) => {
      // Compute the slug from boat name (used by both pin and auto-detect paths)
      let webUrl: string | undefined;
      const cleanName = (b.boatName || '')
        .replace(/\s*\((?:lbb|kic|croisière|cruise|depart|départ)\)/gi, '')
        .replace(/\s+boat$/i, '')
        .replace(/^bateau\s+/i, '')
        .trim();
      let slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (/lady-grace/i.test(slug) && /lombok/i.test(b.boatName || '')) {
        slug = 'lady-grace-depart-lombok';
      }

      if (b.sourceWebsite === 'kic') {
        // Explicit KIC pin — always use KIC regardless of stored cabin URLs
        webUrl = `https://komodoislandcruises.com/boat/${slug}/`;
      } else if (b.sourceWebsite === 'lbb') {
        // Explicit LBB pin — always use LBB regardless of stored cabin URLs
        webUrl = `https://lebaliblog.com/bateau/${slug}/`;
      } else {
        // No pin: 1. try cabin-stored URL first
        webUrl = b.cabins?.find(c =>
          c.websiteUrl?.includes('lebaliblog.com') ||
          c.websiteUrl?.includes('komodoislandcruises.com')
        )?.websiteUrl;

        // 2. If no cabin URL, auto-detect from boat name / language
        if (!webUrl && b.boatName) {
          const isKICHint = snapshot?.language === 'ENG' || /\bkic\b/i.test(b.boatName);
          const isLBBHint = !isKICHint && (
            /lombok/i.test(b.boatName) ||
            /croisiere|croisière|depart|départ|chambre/i.test(b.boatName) ||
            Boolean(snapshot?.whatsappBusinessName?.toLowerCase().includes('bali')) ||
            snapshot?.language === 'FR'
          );
          if (isLBBHint) {
            webUrl = `https://lebaliblog.com/bateau/${slug}/`;
          } else {
            webUrl = `https://komodoislandcruises.com/boat/${slug}/`;
          }
        }
      }

      if (webUrl) {
        fetchScrapedBoat(webUrl).then(data => {
          if (data) {
            setScrapedDataByBoat(prev => ({ ...prev, [bIdx]: data }));
          }
        }).catch((err) => {
          console.warn('Silent boat scrape failure:', err);
        });
      }
    });
  }, [boats, snapshot?.whatsappBusinessName]);

  // Resolves a list of valid, high-resolution displayable photos for a cabin.
  // Since cabinList already enriches cabin.images with the correctly-matched scraped cabin photos,
  // we prioritize cabin.images directly instead of re-running getMatchingScrapedCabin which can
  // produce wrong matches when multiple cabins have similar names.
  const getCabinDisplayImages = (
    cabin: CabinSnapshot | undefined, 
    boatIdx: number, 
    cabinIdx: number, 
    _boat: BoatSnapshot
  ): string[] => {
    const list: string[] = [];

    // 1. cabin.images is already the matched scraped cabin images (set during cabinList build)
    if (cabin?.images && cabin.images.length > 0) {
      cabin.images.forEach(img => {
        if (img && !img.includes('unsplash.com') && !failedImageUrls[img] && !list.includes(img)) list.push(img);
      });
    }

    // 2. Snapshot imageUrl as additional fallback
    if (cabin?.imageUrl && !cabin.imageUrl.includes('unsplash.com') && !failedImageUrls[cabin.imageUrl] && !list.includes(cabin.imageUrl)) {
      list.push(cabin.imageUrl);
    }

    // 3. If still no images, fall back to scraper re-match (last resort)
    if (list.length === 0) {
      const scrapedCabin = getMatchingScrapedCabin(scrapedDataByBoat[boatIdx], cabin, cabinIdx);
      if (scrapedCabin?.images) {
        scrapedCabin.images.forEach(img => {
          if (img && !img.includes('unsplash.com') && !failedImageUrls[img] && !list.includes(img)) list.push(img);
        });
      }
    }

    // 4. Boat featured gallery as final fallback (real boat photos)
    if (list.length === 0) {
      const scrapedFeatured = scrapedDataByBoat[boatIdx]?.featuredImages;
      if (scrapedFeatured) {
        scrapedFeatured.forEach(img => {
          if (img && !img.includes('unsplash.com') && !failedImageUrls[img] && !list.includes(img)) list.push(img);
        });
      }
    }

    return list;
  };

  // Loading spinner view
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] text-[#11212D] flex flex-col items-center justify-center p-6 select-none">
        {/* Circular buffering spinner */}
        <div className="relative w-14 h-14 mb-5">
          <div className="absolute inset-0 rounded-full border-4 border-[#E8E4DC]" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#B8860B] animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-[#B8860B]/40 animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
        </div>
        <p className="font-serif italic text-lg tracking-wide text-[#52606D]">
          Loading cruise availability...
        </p>
        <span className="text-xs text-[#9AABB8] mt-1 tracking-wider">Please wait</span>
      </div>
    );
  }

  const isFrench = snapshot?.language === 'FR';
  const isRevoked = snapshot?.status === 'revoked';
  const isExpired = isShareLinkExpired(snapshot);

  const waNumber = snapshot?.whatsappNumber || '';
  const fallbackWaLink = waNumber ? `https://wa.me/${waNumber.replace(/[^0-9]/g, '')}` : null;

  const formatExpiryDate = (ts?: number) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  };

  // 1. Network / Connection Error State
  if (error === 'network_error') {
    return (
      <div className="min-h-screen bg-[#FAF9F5] text-[#11212D] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-[#E8E4DC] rounded-none p-8 text-center shadow-xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-none bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6">
            <RefreshCw className="w-8 h-8 text-[#B8860B]" />
          </div>

          <h1 className="text-2xl font-serif font-bold text-[#11212D] mb-3">
            {isFrench ? "Problème de connexion" : "Connection Issue"}
          </h1>

          <p className="text-sm text-[#52606D] leading-relaxed mb-6">
            {isFrench 
              ? "Impossible de charger les disponibilités en direct pour le moment. Veuillez vérifier votre connexion internet et appuyer sur Réessayer."
              : "We couldn't retrieve live cabin availability right now. Please check your mobile internet connection and tap retry."}
          </p>

          <div className="space-y-3">
            <button
              onClick={() => loadData()}
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-none bg-[#0F2231] hover:bg-[#1A3347] text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <span>{isFrench ? "Réessayer" : "Tap to Retry"}</span>
            </button>

            {fallbackWaLink && (
              <a
                href={fallbackWaLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 w-full py-3 px-6 rounded-none bg-[#F5F2EB] hover:bg-[#EFECE6] border border-[#E8E4DC] text-[#11212D] font-medium text-xs transition-all"
              >
                <MessageCircle className="w-4 h-4 text-[#25D366]" />
                <span>{isFrench ? "Contacter notre équipe sur WhatsApp" : "Contact Our Team on WhatsApp"}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. Link Not Found State
  if (error === 'not_found' || !snapshot) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] text-[#11212D] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-[#E8E4DC] rounded-none p-8 text-center shadow-xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-none bg-[#F5F2EB] border border-[#EADBB6] flex items-center justify-center mx-auto mb-6">
            <Ship className="w-8 h-8 text-[#B8860B]" />
          </div>

          <h1 className="text-2xl font-serif font-bold text-[#11212D] mb-3">
            {isFrench ? "Lien de disponibilité introuvable" : "Availability Link Not Found"}
          </h1>

          <p className="text-sm text-[#52606D] leading-relaxed mb-6">
            {isFrench 
              ? "Ce lien de disponibilité n'a pas été trouvé ou a été saisi de manière incomplète. Veuillez contacter votre conseiller pour obtenir un lien valide."
              : "This cabin availability link could not be found or was entered incompletely. Please verify the link or contact your cruise advisor."}
          </p>

          {fallbackWaLink && (
            <a
              href={fallbackWaLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 w-full py-3.5 px-6 rounded-none bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm shadow-lg shadow-[#25D366]/20 transition-all active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>{isFrench ? "Contacter notre équipe sur WhatsApp" : "Contact Our Team on WhatsApp"}</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  // 3. Link Revoked State
  if (isRevoked) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] text-[#11212D] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-[#E8E4DC] rounded-none p-8 text-center shadow-xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-none bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-8 h-8 text-[#B8860B]" />
          </div>

          <h1 className="text-2xl font-serif font-bold text-[#11212D] mb-3">
            {isFrench ? "Lien de disponibilité clos" : "Availability Link Inactive"}
          </h1>

          <p className="text-sm text-[#52606D] leading-relaxed mb-6">
            {isFrench 
              ? "Cette proposition de croisière a été mise à jour ou clôturée par le voyagiste. Veuillez nous contacter sur WhatsApp pour obtenir les dernières options disponibles."
              : "This cruise availability proposal has been updated or closed. Please reach out to our team on WhatsApp for the latest options."}
          </p>

          {fallbackWaLink && (
            <a
              href={fallbackWaLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 w-full py-3.5 px-6 rounded-none bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm shadow-lg shadow-[#25D366]/20 transition-all active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>{isFrench ? "Contacter notre équipe sur WhatsApp" : "Contact Our Team on WhatsApp"}</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  // 4. Truly Expired State
  if (isExpired) {
    const expiryStr = formatExpiryDate(snapshot?.expiresAt);

    return (
      <div className="min-h-screen bg-[#FAF9F5] text-[#11212D] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-[#E8E4DC] rounded-none p-8 text-center shadow-xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-none bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-[#B8860B]" />
          </div>

          <h1 className="text-2xl font-serif font-bold text-[#11212D] mb-3">
            {isFrench ? "Lien de disponibilité expiré" : "Availability Link Expired"}
          </h1>

          <p className="text-sm text-[#52606D] leading-relaxed mb-6">
            {isFrench 
              ? `Ce lien de disponibilité a expiré${expiryStr ? ` le ${expiryStr}` : ''}. Les cabines pour ces dates ont peut-être évolué. Veuillez contacter votre conseiller pour obtenir les disponibilités à jour.`
              : `This cabin availability link expired${expiryStr ? ` on ${expiryStr}` : ''}. Options and rates for these dates may have changed. Please contact your cruise advisor to check the latest availability.`}
          </p>

          {fallbackWaLink && (
            <a
              href={fallbackWaLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 w-full py-3.5 px-6 rounded-none bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm shadow-lg shadow-[#25D366]/20 transition-all active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>{isFrench ? "Demander une mise à jour sur WhatsApp" : "Request Live Update on WhatsApp"}</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  // Active expanded boat and active cabin inside that boat
  const currentBoat = boats[expandedBoatIndex] || boats[0];
  const activeCabinIdx = activeCabinByBoat[expandedBoatIndex] || 0;
  const currentCabin = currentBoat?.cabins?.[activeCabinIdx] || currentBoat?.cabins?.[0];

  // Dynamic Contextual WhatsApp link
  const currentCabinName = currentCabin ? (isFrench ? currentCabin.name : (currentCabin.nameEng || currentCabin.name)) : undefined;
  const dynamicMessage = currentBoat 
    ? buildDynamicWhatsAppMessage(currentBoat.boatName, currentCabinName, currentBoat.dates, snapshot?.language)
    : (snapshot?.whatsappMessage || 'Hello, I would like to inquire about cabin availability.');

  const whatsappHref = buildWhatsAppLink(snapshot?.whatsappNumber, dynamicMessage);

  // Accordion Toggle: only one expanded at a time
  const handleToggleBoat = (idx: number) => {
    setExpandedBoatIndex(prev => (prev === idx ? -1 : idx));
  };

  // Carousel navigation handlers
  const handlePrevCabin = (boatIdx: number, totalCabins: number) => {
    setActiveCabinByBoat(prev => {
      const cur = prev[boatIdx] || 0;
      const nextIdx = cur === 0 ? totalCabins - 1 : cur - 1;
      return { ...prev, [boatIdx]: nextIdx };
    });
  };

  const handleNextCabin = (boatIdx: number, totalCabins: number) => {
    setActiveCabinByBoat(prev => {
      const cur = prev[boatIdx] || 0;
      const nextIdx = cur === totalCabins - 1 ? 0 : cur + 1;
      return { ...prev, [boatIdx]: nextIdx };
    });
  };

  const handleSelectCabinIndex = (boatIdx: number, targetIdx: number) => {
    setActiveCabinByBoat(prev => ({ ...prev, [boatIdx]: targetIdx }));
  };

  // Touch swipe gesture handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent, boatIdx: number, totalCabins: number) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Only swipe if predominantly horizontal swipe (> 45px distance and not vertical scroll)
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        handleNextCabin(boatIdx, totalCabins);
      } else {
        handlePrevCabin(boatIdx, totalCabins);
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // Open Direct Web Modal (Interactive iframe browser)
  const handleOpenWebModal = (url: string, boatName: string, cabinName?: string) => {
    if (!url) return;
    setWebIframeLoading(true);
    setWebModal({
      isOpen: true,
      url,
      boatName,
      cabinName
    });
  };

  // Open Image Lightbox
  const handleOpenImagePreview = (
    images: string[], 
    activeIndex: number, 
    boatName: string, 
    cabinName: string, 
    websiteUrl?: string
  ) => {
    const validImages = images.filter(Boolean);
    if (validImages.length === 0) return;

    setPreviewModal({
      isOpen: true,
      images: validImages,
      activeIndex,
      boatName,
      cabinName,
      websiteUrl
    });
  };

  // Copy template text
  const handleCopyTemplateText = async (text: string, key: string) => {
    try {
      const emailHtml = formatTemplateToEmailHtml(text);
      await copyFormattedToClipboard(text, emailHtml);
      setCopiedTemplateKey(key);
      setTimeout(() => setCopiedTemplateKey(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Copy specific URL
  const handleCopyLink = async (url: string, key: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedLinkKey(key);
      setTimeout(() => setCopiedLinkKey(null), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const contentMaxWidth = isModal && deviceSimulation === 'desktop'
    ? 'max-w-4xl' 
    : isModal && deviceSimulation === 'tablet'
    ? 'max-w-2xl'
    : 'max-w-md';

  const hasKICBoat = boats.some((b, idx) => 
    b.cabins?.some(c => c.websiteUrl?.includes('komodoislandcruises.com')) ||
    scrapedDataByBoat[idx]?.brand === 'KIC'
  );
  const hasLBBBoat = boats.some((b, idx) => 
    b.cabins?.some(c => c.websiteUrl?.includes('lebaliblog.com')) ||
    (b.boatName && /lombok/i.test(b.boatName)) ||
    scrapedDataByBoat[idx]?.brand === 'LBB'
  );

  const pageBrandIsLBB = hasLBBBoat && !hasKICBoat
    ? true
    : (hasKICBoat && !hasLBBBoat
        ? false
        : (snapshot?.language === 'ENG'
            ? false
            : (snapshot?.language === 'FR'
                ? true
                : Boolean(snapshot?.whatsappBusinessName?.toLowerCase().includes('bali')))));

  const defaultBrandName = pageBrandIsLBB ? 'Le Bali Blog' : 'Komodo Island Cruises';

  const displayBrandName = (() => {
    const rawWaName = snapshot?.whatsappBusinessName?.trim();
    if (!pageBrandIsLBB) {
      if (!rawWaName || rawWaName.toLowerCase().includes('bali')) {
        return 'Komodo Island Cruises';
      }
      return rawWaName;
    } else {
      if (!rawWaName || rawWaName.toLowerCase().includes('komodo')) {
        return 'Le Bali Blog';
      }
      return rawWaName;
    }
  })();

  const pageContent = (
    <div className={cn(
      "bg-[#FAF9F5] text-[#11212D] pb-32 antialiased selection:bg-[#B8860B]/20 font-sans",
      isModal ? "min-h-full" : "min-h-screen overflow-x-hidden"
    )}>
      {/* Top Header Bar (KIC = Ocean Blue, LBB = Carmine Red) */}
      <motion.header 
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 26 }}
        className="border-b border-[#E8E4DC] bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs"
      >
        <div className={cn("mx-auto px-4 py-3.5 flex items-center justify-between", contentMaxWidth)}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-none border flex items-center justify-center shadow-xs shrink-0",
              pageBrandIsLBB 
                ? "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]" 
                : "bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]"
            )}>
              <Ship className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[12px] font-serif font-bold tracking-[0.12em] uppercase text-[#11212D] block truncate leading-tight">
                {displayBrandName}
              </span>
              <span className="text-[10px] text-[#788896] font-medium block">
                {isFrench ? 'Disponibilités Officielles & Réservation' : 'Official Cruise Availability & Cabins'}
              </span>
            </div>
          </div>

          {/* Live Expiration Countdown Badge */}
          <div 
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-none border text-[10px] font-bold tracking-wider uppercase shrink-0 shadow-xs transition-colors",
              isExpired
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : isUrgent
                ? "bg-amber-50 border-amber-300 text-amber-800 animate-pulse"
                : "bg-emerald-50 border-emerald-200/80 text-emerald-700"
            )}
            title={isFrench 
              ? "Ce lien et ces disponibilités expirent bientôt. Contactez votre conseiller pour une mise à jour." 
              : "This link and these cabin availabilities expire soon. Contact your cruise advisor for updates."
            }
          >
            <Clock className={cn(
              "w-3 h-3 shrink-0",
              isExpired ? "text-rose-600" : isUrgent ? "text-amber-600" : "text-emerald-600"
            )} />
            <span className="font-mono">
              {countdownText || (isFrench ? 'Vérifié' : 'Live Verified')}
            </span>
          </div>
        </div>
      </motion.header>

      {/* Main Content Area */}
      <main className={cn("mx-auto px-4 pt-5 space-y-4", contentMaxWidth)}>
        {/* Section Title */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 26, delay: 0.05 }}
          className="flex items-center justify-between px-1"
        >
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em]",
            pageBrandIsLBB ? "text-[#B91C1C]" : "text-[#1D4ED8]"
          )}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isFrench ? 'Bateaux Disponibles' : 'Available Vessels & Cabins'}</span>
          </div>
          <span className="text-[11px] font-medium text-[#788896]">
            {boats.length} {boats.length === 1 ? (isFrench ? 'Bateau' : 'Vessel') : (isFrench ? 'Bateaux' : 'Vessels')}
          </span>
        </motion.div>

        {/* Boats Accordion List */}
        <div className="space-y-3">
          {boats.map((boat, boatIdx) => {
            const isExpanded = expandedBoatIndex === boatIdx;
            const rawCabins = boat.cabins || [];
            const scrapedBoatData = scrapedDataByBoat[boatIdx];
            const scrapedCabins = scrapedBoatData?.cabins || [];

            // Compute boat website base URL (e.g. https://lebaliblog.com/bateau/zendaya/)
            const boatWebUrl = boat.cabins?.find(c => c.websiteUrl)?.websiteUrl || scrapedBoatData?.url || '';
            const boatBaseUrl = boatWebUrl ? boatWebUrl.split('#')[0].replace(/\/+$/, '') : '';

            // Build cabin list: ONLY from stored rawCabins (template), enriched with scraped data.
            // GREEDY UNIQUE MATCHING: each rawCabin claims a different scraped cabin (by position i)
            // even when all rawCabins share the same websiteUrl anchor (e.g. all pointing to #1).
            const claimedScrapedIdx = new Set<number>();

            const cabinList: CabinSnapshot[] = rawCabins.length > 0
              ? rawCabins.map((rc, i) => {
                  let matchedSc = scrapedCabins[i] || undefined; // default: positional match

                  // Try URL anchor match (#N → sorted position N-1)
                  if (rc.websiteUrl) {
                    const anchorM = rc.websiteUrl.match(/#(\d+)$/);
                    if (anchorM) {
                      const ordinal = parseInt(anchorM[1], 10) - 1;
                      // Only use anchor match if this ordinal hasn't been claimed yet
                      if (ordinal >= 0 && ordinal < scrapedCabins.length && !claimedScrapedIdx.has(ordinal)) {
                        matchedSc = scrapedCabins[ordinal];
                      } else if (i < scrapedCabins.length && !claimedScrapedIdx.has(i)) {
                        // Anchor already taken → use next available by position
                        matchedSc = scrapedCabins[i];
                      } else {
                        // Find next unclaimed scraped cabin
                        for (let j = 0; j < scrapedCabins.length; j++) {
                          if (!claimedScrapedIdx.has(j)) { matchedSc = scrapedCabins[j]; break; }
                        }
                      }
                    }
                  }

                  // Try name match if still on default positional match and name is distinctive
                  if (matchedSc === scrapedCabins[i] && (rc.name || rc.nameEng)) {
                    const searchNames = [rc.name, rc.nameEng].filter(Boolean).map(n => n!.toLowerCase());
                    for (const nm of searchNames) {
                      const words = nm.split(/[\s()\-/,]+/).filter(w => w.length >= 5);
                      const found = words.length > 0
                        ? scrapedCabins.find((sc, sIdx) => !claimedScrapedIdx.has(sIdx) && words.some(w => sc.name.toLowerCase().includes(w)))
                        : undefined;
                      if (found) { matchedSc = found; break; }
                    }
                  }

                  // Register claim
                  const matchedIdx = scrapedCabins.indexOf(matchedSc!);
                  if (matchedSc && matchedIdx >= 0) claimedScrapedIdx.add(matchedIdx);

                  // Compute correct detail URL from matched scraped cabin
                  const scrapedDetailUrl = matchedSc && boatBaseUrl
                    ? `${boatBaseUrl}#${matchedSc.index}`
                    : matchedSc?.anchor || rc.websiteUrl || '';

                  return {
                    ...rc,
                    name: matchedSc ? matchedSc.name : rc.name,
                    nameEng: matchedSc ? matchedSc.name : (rc.nameEng || rc.name),
                    images: matchedSc?.images?.length
                      ? matchedSc.images.filter(img => !img.includes('unsplash.com'))
                      : (rc.images || []).filter(img => !img.includes('unsplash.com')),
                    imageUrl: matchedSc?.images?.[0] || (rc.imageUrl?.includes('unsplash.com') ? undefined : rc.imageUrl),
                    features: matchedSc?.amenities?.length ? matchedSc.amenities : rc.features,
                    websiteUrl: scrapedDetailUrl,
                    // Store scraped index on the cabin so matchedScrapedCabin lookup can be exact
                    _scrapedIndex: matchedSc?.index,
                  } as CabinSnapshot & { _scrapedIndex?: number };
                })
              : scrapedCabins.length > 0
                ? scrapedCabins.map((sc, i) => ({
                    id: `scraped-${sc.index || i + 1}`,
                    name: sc.name,
                    nameEng: sc.name,
                    count: 1,
                    extraBeds: 0,
                    imageUrl: sc.images[0] || '',
                    images: sc.images || [],
                    features: sc.amenities || [],
                    websiteUrl: boatBaseUrl ? `${boatBaseUrl}#${sc.index}` : sc.anchor,
                    itinerary: boat.itinerary,
                    departure: boat.departure,
                    schedule: boat.duration
                  }))
                : [];

            // Initial active cabin selection: match initial anchor or name if not yet interacted with
            let activeCabinIndex = activeCabinByBoat[boatIdx];
            if (activeCabinIndex === undefined) {
              const initialRaw = rawCabins[0];
              if (initialRaw && cabinList.length > 0) {
                const matchIdx = cabinList.findIndex(c => {
                  if (initialRaw.websiteUrl && initialRaw.websiteUrl.includes('#')) {
                    const hash = initialRaw.websiteUrl.substring(initialRaw.websiteUrl.indexOf('#'));
                    if (c.websiteUrl && (c.websiteUrl.endsWith(hash) || c.websiteUrl.includes(hash))) return true;
                  }
                  return c.name.toLowerCase().includes(initialRaw.name.toLowerCase()) || 
                         initialRaw.name.toLowerCase().includes(c.name.toLowerCase());
                });
                activeCabinIndex = matchIdx !== -1 ? matchIdx : 0;
              } else {
                activeCabinIndex = 0;
              }
            }
            if (activeCabinIndex >= cabinList.length) {
              activeCabinIndex = 0;
            }

            const activeCabin = cabinList[activeCabinIndex] || cabinList[0];
            const hasMultipleCabins = cabinList.length > 1;

            const isBoatExplicitKIC = 
              scrapedBoatData?.brand === 'KIC' ||
              boat.cabins?.some(c => c.websiteUrl?.includes('komodoislandcruises.com')) ||
              Boolean(boatBaseUrl && boatBaseUrl.includes('komodoislandcruises.com'));

            const isBoatExplicitLBB = 
              scrapedBoatData?.brand === 'LBB' ||
              boat.cabins?.some(c => c.websiteUrl?.includes('lebaliblog.com')) ||
              Boolean(boatBaseUrl && boatBaseUrl.includes('lebaliblog.com')) ||
              Boolean(boat.boatName && /lombok/i.test(boat.boatName));

            const isLBB = isBoatExplicitKIC 
              ? false 
              : (isBoatExplicitLBB 
                  ? true 
                  : (snapshot?.language === 'ENG' ? false : (snapshot?.language === 'FR' ? true : pageBrandIsLBB)));

            const matchedScrapedCabin = activeCabin
              ? scrapedCabins.find(sc => sc.index === (activeCabin as any)._scrapedIndex) ||
                getMatchingScrapedCabin(scrapedBoatData, activeCabin, activeCabinIndex)
              : undefined;

            // Template computation matching output preview
            const itineraryLabel = isFrench ? 'Itinéraire' : 'Itinerary';
            const datesLabel = isFrench ? 'Dates' : 'Dates';
            const departureLabel = isFrench ? 'Départ' : 'Departure';
            const boatLabel = isFrench ? 'Bateau' : 'Boat';
            const cabinLabel = isFrench ? 'Chambre' : 'Cabin';
            const detailLabel = isFrench ? 'Détail' : 'Detail';

            let itineraryVal = activeCabin?.itinerary || boat.itinerary || (isFrench ? 'Labuan Bajo (Flores) A/R' : 'Labuan Bajo (Flores) Return Trip');
            if (!isFrench) {
              itineraryVal = itineraryVal.replace(/\bA\/R\b/g, 'Return Trip');
            }
            const datesVal = boat.dates 
              ? (boat.duration && !boat.dates.includes(boat.duration) ? `${boat.dates} ${boat.duration}` : boat.dates)
              : (boat.duration || '[DATES]');
            
            let departureVal = activeCabin?.departure || boat.departure || '11:00-12.00';
            if (boat.arrival && !departureVal.toLowerCase().includes('end:') && !departureVal.toLowerCase().includes('fin:') && !departureVal.toLowerCase().includes('arrivée:')) {
              departureVal = `${departureVal} / ${isFrench ? 'Fin' : 'End'}: ${boat.arrival}`;
            }
            if (!isFrench) {
              departureVal = departureVal.replace(/Arrivée\s*:/i, 'End:').replace(/Fin\s*:/i, 'End:');
            }

            const boatVal = boat.boatName;
            const cabinVal = activeCabin 
              ? `${activeCabin.count > 1 ? `${activeCabin.count}x ` : ''}${isFrench ? activeCabin.name : (activeCabin.nameEng || activeCabin.name)}`
              : (matchedScrapedCabin ? matchedScrapedCabin.name : 'All Cabins');

            // Compute exact detail URL anchor (e.g. #1 for cabin 1)
            let detailVal = activeCabin?.websiteUrl || '';
            if (boatBaseUrl && matchedScrapedCabin) {
              detailVal = `${boatBaseUrl}/${matchedScrapedCabin.anchor.replace(/^\/?#?/, '#')}`;
            }

            // Plain text version for copying
            let fullTemplateText = `${itineraryLabel} : ${itineraryVal}  
${datesLabel} : ${datesVal}  
${departureLabel} : ${departureVal}  
${boatLabel} : ${boatVal}  
${cabinLabel} : ${cabinVal}`;

            // Compute effective prices list (detects 1, 2, or more prices)
            const effectivePrices: { label: string; amount: string; period?: string }[] = (() => {
              if (matchedScrapedCabin?.prices && matchedScrapedCabin.prices.length > 0) {
                return matchedScrapedCabin.prices;
              }
              if (
                matchedScrapedCabin?.priceLowSeason &&
                matchedScrapedCabin?.priceHighSeason &&
                matchedScrapedCabin.priceLowSeason.trim() !== '' &&
                matchedScrapedCabin.priceHighSeason.trim() !== '' &&
                matchedScrapedCabin.priceLowSeason !== '—' &&
                matchedScrapedCabin.priceHighSeason !== '—' &&
                matchedScrapedCabin.priceLowSeason !== '-' &&
                matchedScrapedCabin.priceHighSeason !== '-'
              ) {
                return [
                  {
                    label: isFrench ? 'Basse saison' : 'Low Season',
                    amount: matchedScrapedCabin.priceLowSeason,
                    period: isFrench ? 'Jan–Mai & Sep–Déc' : 'Jan–May & Sep–Dec'
                  },
                  {
                    label: isFrench ? 'Haute saison' : 'High Season',
                    amount: matchedScrapedCabin.priceHighSeason,
                    period: isFrench ? 'Juin–Août' : 'Jun–Aug'
                  }
                ];
              }
              const fallbackSingle = matchedScrapedCabin?.priceRaw || matchedScrapedCabin?.priceLowSeason || matchedScrapedCabin?.priceHighSeason || activeCabin?.price;
              if (fallbackSingle) {
                return [{ label: '', amount: fallbackSingle }];
              }
              return [];
            })();

            const hasMultiplePrices = effectivePrices.length > 1;
            const singlePrice = effectivePrices.length === 1 
              ? effectivePrices[0].amount 
              : (matchedScrapedCabin?.priceRaw || matchedScrapedCabin?.priceLowSeason || matchedScrapedCabin?.priceHighSeason || activeCabin?.price);

            if (hasMultiplePrices) {
              const priceRows = effectivePrices
                .map(p => `${p.label ? `${p.label} : ` : ''}${p.amount}${p.period ? ` (${p.period})` : ''}`)
                .join(' / ');
              fullTemplateText += `  \n${isFrench ? 'Tarifs' : 'Rates'} : ${priceRows}`;
            } else if (singlePrice) {
              fullTemplateText += `  \n${isFrench ? 'Tarif' : 'Rate'} : ${singlePrice}`;
            }

            const extraBedDisplay = matchedScrapedCabin?.extraBedRaw || 
              (matchedScrapedCabin?.extraBedLowSeason && matchedScrapedCabin?.extraBedHighSeason 
                ? `${matchedScrapedCabin.extraBedLowSeason} (${isFrench ? 'Basse s.' : 'Low s.'}) / ${matchedScrapedCabin.extraBedHighSeason} (${isFrench ? 'Haute s.' : 'High s.'})`
                : matchedScrapedCabin?.extraBedLowSeason);
            if (extraBedDisplay) {
              fullTemplateText += ` • ${isFrench ? "Lit d'appoint :" : "Extra bed:"} ${extraBedDisplay}`;
            }

            if (detailVal) {
              fullTemplateText += `  \n${detailLabel} : ${detailVal}`;
            }

            if (boat.fuelSurcharge) {
              fullTemplateText += `  \n⛽ ${isFrench ? 'Surcharge Carburant :' : 'Fuel Surcharge:'} ${boat.fuelSurcharge}`;
            }

            if (boat.limitedServiceNote) {
              fullTemplateText += `  \n${boat.limitedServiceNote}`;
            }

            // Cabin Gallery images with multi-tier fallback (Exact Scraped Cabin Photos -> Real Boat Photos)
            const galleryKey = `${boatIdx}-${activeCabinIndex}`;
            const activeImgIdx = activeImageByCabin[galleryKey] || 0;
            const cabinImages = getCabinDisplayImages(activeCabin, boatIdx, activeCabinIndex, boat);
            const safeImgIdx = activeImgIdx < cabinImages.length ? activeImgIdx : 0;
            const rawImgUrl = cabinImages[safeImgIdx] || '';
            const currentImgDisplayUrl = rawImgUrl ? getDisplayImageUrl(rawImgUrl) : '';

            return (
              <motion.div
                key={`${boat.boatName}-${boatIdx}`}
                initial={{ opacity: 0, y: 22, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ 
                  type: "spring", 
                  stiffness: 320, 
                  damping: 24, 
                  mass: 0.8,
                  delay: Math.min(boatIdx * 0.08, 0.35) 
                }}
                whileHover={{ y: -2, transition: { duration: 0.2 } }}
                className="bg-white border border-[#E8E2D5] rounded-none overflow-hidden shadow-xs hover:shadow-md transition-shadow"
              >
                {/* 1. Boat Accordion Header */}
                <button
                  type="button"
                  onClick={() => handleToggleBoat(boatIdx)}
                  className="w-full text-left p-4.5 flex items-center justify-between gap-3 hover:bg-[#FAF8F5] transition-colors cursor-pointer select-none"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-mono",
                        isLBB ? "text-[#B91C1C]" : "text-[#1D4ED8]"
                      )}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      <h2 className="text-lg sm:text-xl font-serif font-bold text-[#0F2231] tracking-tight truncate">
                        {boat.boatName}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[#5C6F84] font-medium pl-4">
                      {boat.duration && (
                        <span className={cn(
                          "font-semibold",
                          isLBB ? "text-[#B91C1C]" : "text-[#1D4ED8]"
                        )}>{boat.duration}</span>
                      )}
                      {boat.duration && boat.dates && <span>·</span>}
                      {boat.dates && <span>{boat.dates}</span>}
                    </div>

                    <div className="text-[10px] text-[#7E91A3] pl-4 font-mono">
                      {cabinList.length} {cabinList.length === 1 
                        ? (isFrench ? 'cabine disponible' : 'available cabin') 
                        : (isFrench ? 'cabines disponibles' : 'available cabins')}
                    </div>
                  </div>

                  <div className="p-2 rounded-none bg-[#F7F4ED] border border-[#E5DDCF] text-[#5C6F84] shrink-0">
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ type: "spring", stiffness: 380, damping: 25 }}
                    >
                      <ChevronDown className={cn("w-4 h-4", isLBB ? "text-[#B91C1C]" : "text-[#1D4ED8]")} />
                    </motion.div>
                  </div>
                </button>

                {/* 2. Expanded Boat Content */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key={`content-${boatIdx}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: { type: "spring", stiffness: 350, damping: 30 },
                        opacity: { duration: 0.22, ease: "easeInOut" }
                      }}
                      className="overflow-hidden border-t border-[#E8E2D5]"
                    >
                      <div className="p-4 space-y-4 bg-[#FDFBF7]">
                        {/* 3-Way Sub-Tabs: Cabins (#1, #2...) | Itinerary (#tab-itinerary) | Inclusions (#tab-inclusions) */}
                        <div className="flex p-1 bg-[#EFEAE1] rounded-none border border-[#E0D8CB] gap-1">
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            type="button"
                            onClick={() => setActiveBoatTab(prev => ({ ...prev, [boatIdx]: 'cabins' }))}
                            className={cn(
                              "flex-1 py-2 px-2.5 rounded-none text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                              (!activeBoatTab[boatIdx] || activeBoatTab[boatIdx] === 'cabins')
                                ? (isLBB ? "bg-[#B91C1C] text-white shadow-sm font-bold" : "bg-[#1D4ED8] text-white shadow-sm font-bold")
                                : (isLBB ? "text-[#7F1D1D]/75 hover:text-[#B91C1C]" : "text-[#5C6F84] hover:text-[#1D4ED8]")
                            )}
                          >
                            <Ship className="w-3.5 h-3.5" />
                            <span>{isFrench ? 'Cabines' : 'Cabins'}</span>
                          </motion.button>

                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            type="button"
                            onClick={() => setActiveBoatTab(prev => ({ ...prev, [boatIdx]: 'itinerary' }))}
                            className={cn(
                              "flex-1 py-2 px-2.5 rounded-none text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                              activeBoatTab[boatIdx] === 'itinerary'
                                ? (isLBB ? "bg-[#B91C1C] text-white shadow-sm font-bold" : "bg-[#1D4ED8] text-white shadow-sm font-bold")
                                : (isLBB ? "text-[#7F1D1D]/75 hover:text-[#B91C1C]" : "text-[#5C6F84] hover:text-[#1D4ED8]")
                            )}
                          >
                            <Compass className="w-3.5 h-3.5" />
                            <span>{isFrench ? (boat.duration ? `Itinéraire ${boat.duration}` : 'Itinéraire') : (boat.duration ? `Itinerary ${boat.duration}` : 'Itinerary')}</span>
                          </motion.button>

                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            type="button"
                            onClick={() => setActiveBoatTab(prev => ({ ...prev, [boatIdx]: 'inclusions' }))}
                            className={cn(
                              "flex-1 py-2 px-2.5 rounded-none text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                              activeBoatTab[boatIdx] === 'inclusions'
                                ? (isLBB ? "bg-[#B91C1C] text-white shadow-sm font-bold" : "bg-[#1D4ED8] text-white shadow-sm font-bold")
                                : (isLBB ? "text-[#7F1D1D]/75 hover:text-[#B91C1C]" : "text-[#5C6F84] hover:text-[#1D4ED8]")
                            )}
                          >
                            <ListChecks className="w-3.5 h-3.5" />
                            <span>{isFrench ? 'Inclusions' : 'Inclusions'}</span>
                          </motion.button>
                        </div>

                        {/* TAB 1: CABINS CAROUSEL (#1, #2, ...) */}
                        <AnimatePresence mode="wait">
                        {(!activeBoatTab[boatIdx] || activeBoatTab[boatIdx] === 'cabins') && activeCabin && (
                          <motion.div 
                            key={`tab-cabins-${boatIdx}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ type: "spring", stiffness: 380, damping: 28 }}
                            className="space-y-3.5"
                            onTouchStart={handleTouchStart}
                            onTouchEnd={(e) => handleTouchEnd(e, boatIdx, cabinList.length)}
                          >
                            {/* Carousel Top Navigation Bar */}
                            {hasMultipleCabins && (
                              <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#7E91A3]">
                                  {isFrench ? 'Glisser pour changer de cabine' : 'Swipe to browse cabins'}
                                </span>
                                <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#0F2231] font-semibold bg-[#F5F1E8] px-2.5 py-0.5 rounded-none border border-[#E5DDCF]">
                                  <span>{activeCabinIndex + 1}</span>
                                  <span className="text-[#99A6B5]">/</span>
                                  <span>{cabinList.length}</span>
                                </div>
                              </div>
                            )}

                            {/* Cabin Image Container with Preview Triggers */}
                            <div 
                              onClick={() => {
                                if (currentImgDisplayUrl) {
                                  handleOpenImagePreview(
                                    cabinImages.length > 0 ? cabinImages : [currentImgDisplayUrl],
                                    safeImgIdx,
                                    boat.boatName,
                                    cabinVal,
                                    detailVal || activeCabin.websiteUrl
                                  );
                                }
                              }}
                              className="relative aspect-[16/10] w-full rounded-none bg-[#F5F1E8] overflow-hidden border border-[#E5DDCF] shadow-sm group cursor-zoom-in select-none"
                              title={isFrench ? "Cliquer pour agrandir la photo" : "Click to preview full image"}
                            >
                              {currentImgDisplayUrl ? (
                                (() => {
                                  const imgKey = `img-loaded-${boatIdx}-${activeCabinIndex}-${safeImgIdx}`;
                                  return (
                                    <>
                                      {/* Skeleton pulse shown while image loads */}
                                      <div
                                        id={imgKey + '-skel'}
                                        className="absolute inset-0 bg-gradient-to-br from-[#EDE8DC] via-[#E5E0D3] to-[#DDD8CC] animate-pulse z-[1]"
                                        style={{ display: 'block' }}
                                      />
                                      <img
                                        src={currentImgDisplayUrl}
                                        alt={activeCabin?.name || cabinVal}
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                        onLoad={(e) => {
                                          const skel = document.getElementById(imgKey + '-skel');
                                          if (skel) skel.style.display = 'none';
                                          (e.currentTarget as HTMLImageElement).style.opacity = '1';
                                        }}
                                        onError={(e) => {
                                          const skel = document.getElementById(imgKey + '-skel');
                                          if (skel) skel.style.display = 'none';
                                          const fallbackThumb = getDriveThumbnailUrl(rawImgUrl);
                                          if (fallbackThumb && e.currentTarget.src !== fallbackThumb && !failedImageUrls[fallbackThumb]) {
                                            e.currentTarget.src = fallbackThumb;
                                          } else {
                                            setFailedImageUrls(prev => ({
                                              ...prev,
                                              [rawImgUrl]: true,
                                              [currentImgDisplayUrl]: true,
                                              ...(fallbackThumb ? { [fallbackThumb]: true } : {})
                                            }));
                                          }
                                        }}
                                        className="w-full h-full object-cover transition-all duration-500 group-hover:scale-105 relative z-[2]"
                                        style={{ opacity: 0, transition: 'opacity 0.4s ease' }}
                                      />
                                    </>
                                  );
                                })()
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-[#7E91A3] p-6 text-center">
                                  <Ship className="w-10 h-10 mb-2 opacity-40 text-[#B8860B]" />
                                  <span className="text-xs font-medium">{activeCabin?.name || cabinVal}</span>
                                </div>
                              )}

                              {/* Subtle vignette overlay */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                              {/* Preview Badge Pill Top Right */}
                              {currentImgDisplayUrl && (
                                <div className="absolute top-2.5 right-2.5 z-10">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenImagePreview(
                                        cabinImages.length > 0 ? cabinImages : [currentImgDisplayUrl],
                                        safeImgIdx,
                                        boat.boatName,
                                        cabinVal,
                                        detailVal || activeCabin.websiteUrl
                                      );
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-white/90 hover:bg-white backdrop-blur-md border border-white/50 text-[#0F2231] text-[11px] font-semibold shadow-md transition-transform active:scale-95 cursor-pointer"
                                  >
                                    <Maximize2 className="w-3.5 h-3.5 text-[#B8860B]" />
                                    <span>{isFrench ? 'Agrandir' : 'Preview'}</span>
                                  </button>
                                </div>
                              )}

                              {/* Carousel Prev/Next Buttons */}
                              {hasMultipleCabins && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePrevCabin(boatIdx, cabinList.length);
                                    }}
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-none bg-white/90 hover:bg-white text-[#0F2231] border border-white/60 flex items-center justify-center transition-all active:scale-90 shadow-lg cursor-pointer z-10 backdrop-blur-md"
                                    aria-label="Previous Cabin"
                                  >
                                    <ChevronLeft className="w-5 h-5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleNextCabin(boatIdx, cabinList.length);
                                    }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-none bg-white/90 hover:bg-white text-[#0F2231] border border-white/60 flex items-center justify-center transition-all active:scale-90 shadow-lg cursor-pointer z-10 backdrop-blur-md"
                                    aria-label="Next Cabin"
                                  >
                                    <ChevronRight className="w-5 h-5" />
                                  </button>
                                </>
                              )}

                              {/* Cabin Count Badge (Bottom Left) */}
                              <div className="absolute bottom-2.5 left-3 pointer-events-none">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-white">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>
                                    {activeCabin && activeCabin.count > 1 
                                      ? `${activeCabin.count} ${isFrench ? 'cabines' : 'cabins'}` 
                                      : (isFrench ? '1 cabine' : '1 cabin')}
                                  </span>
                                </span>
                              </div>
                            </div>

                            {/* Pagination Dots indicator */}
                            {hasMultipleCabins && (
                              <div className="flex items-center justify-center gap-2 py-0.5">
                                {cabinList.map((c, dotIdx) => (
                                  <button
                                    key={c.id || dotIdx}
                                    type="button"
                                    onClick={() => handleSelectCabinIndex(boatIdx, dotIdx)}
                                    className={`h-2 rounded-none transition-all cursor-pointer ${
                                      activeCabinIndex === dotIdx 
                                        ? 'w-6 bg-[#B8860B] shadow-sm' 
                                        : 'w-2 bg-[#DCD5C9] hover:bg-[#C9C0B2]'
                                    }`}
                                    aria-label={`Go to slide ${dotIdx + 1}`}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Dynamic Output Template Below Image (Luxury Specification Sheet) */}
                            <div className="rounded-none bg-[#FAF7F2] border border-[#E8E2D5] p-4.5 space-y-3.5 shadow-xs relative overflow-hidden">
                              {/* Top Bar with Copy All Button */}
                              <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D5]">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7E91A3]">
                                  {isFrench ? 'Détails du Séjour' : 'Cruise Specifications'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyTemplateText(fullTemplateText, `tmpl-${boatIdx}-${activeCabinIndex}`)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-none bg-white hover:bg-[#F2ECE1] border border-[#DDD5C7] text-[10px] font-semibold text-[#5C6F84] hover:text-[#0F2231] transition-all cursor-pointer active:scale-95 shadow-2xs"
                                  title={isFrench ? "Copier le texte complet" : "Copy full itinerary text"}
                                >
                                  {copiedTemplateKey === `tmpl-${boatIdx}-${activeCabinIndex}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-600" />
                                      <span className="text-emerald-700">{isFrench ? 'Copié' : 'Copied'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>{isFrench ? 'Copier' : 'Copy'}</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              {/* Structured Dynamic Template Rows */}
                              <div className="space-y-2 text-xs font-mono leading-relaxed">
                                {/* Itinerary */}
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[#6B7E91] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans">
                                    {itineraryLabel} :
                                  </span>
                                  <span className="text-[#0F2231] font-medium break-words flex-1">
                                    {itineraryVal}
                                  </span>
                                </div>

                                {/* Dates */}
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[#6B7E91] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans">
                                    {datesLabel} :
                                  </span>
                                  <span className="text-[#9B7008] font-bold break-words flex-1">
                                    {datesVal}
                                  </span>
                                </div>

                                {/* Departure */}
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[#6B7E91] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans">
                                    {departureLabel} :
                                  </span>
                                  <span className="text-[#0F2231] font-medium break-words flex-1">
                                    {departureVal}
                                  </span>
                                </div>

                                {/* Boat */}
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[#6B7E91] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans">
                                    {boatLabel} :
                                  </span>
                                  <span className="text-[#0F2231] font-bold break-words flex-1 tracking-wide">
                                    {boatVal}
                                  </span>
                                </div>

                                {/* Cabin (Dynamic following the active image) */}
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[#6B7E91] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans">
                                    {cabinLabel} :
                                  </span>
                                  <span className="text-[#0F2231] font-bold break-words flex-1">
                                    {cabinVal}
                                  </span>
                                </div>

                                {/* Price / Rate Row — supports auto-detection: 1 single rate OR 2+ price list (mobile-friendly clean layout) */}
                                {(hasMultiplePrices || singlePrice) && (
                                  <div className={hasMultiplePrices ? "flex items-start gap-2" : "flex items-baseline gap-2"}>
                                    <span className="text-[#6B7E91] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans mt-0.5">
                                      {hasMultiplePrices ? (isFrench ? 'Tarifs' : 'Rates') : (isFrench ? 'Tarif' : 'Rate')} :
                                    </span>
                                    <div className="flex-1 min-w-0 font-sans">
                                      {hasMultiplePrices ? (
                                        /* Multiple prices list (2 or more prices) — clean vertical list avoiding small screen table cramped wrapping */
                                        <div className="space-y-1">
                                          {effectivePrices.map((p, pIdx) => (
                                            <div key={pIdx} className="flex items-baseline gap-1.5 flex-wrap text-xs leading-snug">
                                              {p.label ? (
                                                <span className="text-[#3D4D5C] font-semibold text-[11px]">
                                                  {p.label} :
                                                </span>
                                              ) : null}
                                              <span className="text-[#9B7008] font-bold break-words whitespace-nowrap">
                                                {p.amount}
                                              </span>
                                              {p.period && (
                                                <span className="text-[#8C9BA8] text-[10px] font-normal">
                                                  ({p.period})
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                          {/* Extra bed row if available */}
                                          {(matchedScrapedCabin?.extraBedLowSeason || matchedScrapedCabin?.extraBedRaw) && (
                                            <div className="flex items-baseline gap-1.5 flex-wrap text-[11px] text-[#5C6F84] pt-0.5">
                                              <span className="italic">{isFrench ? "Lit d'appoint :" : "Extra bed:"}</span>
                                              {matchedScrapedCabin.extraBedLowSeason && matchedScrapedCabin.extraBedHighSeason ? (
                                                <span>
                                                  <strong className="text-[#5C6F84] font-semibold">{matchedScrapedCabin.extraBedLowSeason}</strong> <span className="text-[#8C9BA8]">({isFrench ? 'Basse s.' : 'Low s.'})</span> / <strong className="text-[#5C6F84] font-semibold">{matchedScrapedCabin.extraBedHighSeason}</strong> <span className="text-[#8C9BA8]">({isFrench ? 'Haute s.' : 'High s.'})</span>
                                                </span>
                                              ) : (
                                                <span className="font-semibold">{matchedScrapedCabin.extraBedRaw || matchedScrapedCabin.extraBedLowSeason}</span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        /* Single price rate — clean inline display matching Image 2 */
                                        <div className="flex items-baseline gap-2 flex-wrap text-xs">
                                          <span className="text-[#9B7008] font-bold break-words whitespace-nowrap">
                                            {singlePrice}
                                          </span>
                                          {(matchedScrapedCabin?.extraBedRaw || matchedScrapedCabin?.extraBedLowSeason) && (
                                            <span className="text-[#5C6F84] text-[11px] font-sans font-normal">
                                              • {isFrench ? "Lit d'appoint :" : "Extra bed:"} {matchedScrapedCabin.extraBedRaw || matchedScrapedCabin.extraBedLowSeason}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Cabin Features / Amenities */}
                                {((matchedScrapedCabin?.amenities && matchedScrapedCabin.amenities.length > 0) || (activeCabin?.features && activeCabin.features.length > 0)) && (
                                  <div className="flex items-start gap-2 pt-1">
                                    <span className="text-[#6B7E91] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans mt-0.5">
                                      {isFrench ? 'Équipements' : 'Features'} :
                                    </span>
                                    <div className="flex-1 min-w-0 flex flex-wrap gap-1 font-sans">
                                      {(matchedScrapedCabin?.amenities || activeCabin?.features || []).map((amenity, aIdx) => (
                                        <span
                                          key={aIdx}
                                          className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-none bg-[#EFEAE1] text-[#3D4D5C] font-medium border border-[#E0D8CB]"
                                        >
                                          {amenity}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Detail Link (Dynamic following the active cabin tab) */}
                                {detailVal ? (
                                  <div className="flex items-start gap-2 pt-1">
                                    <span className="text-[#6B7E91] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans mt-0.5">
                                      {detailLabel} :
                                    </span>
                                    <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenWebModal(detailVal, boat.boatName, cabinVal)}
                                        className={cn(
                                          "underline underline-offset-2 break-all text-xs font-mono inline-flex items-center gap-1 group/link text-left cursor-pointer",
                                          isLBB ? "text-[#0F2231] hover:text-[#B91C1C]" : "text-[#0F2231] hover:text-[#1D4ED8]"
                                        )}
                                        title={isFrench ? "Ouvrir l'aperçu intégré dans le modal" : "Open embedded preview in modal"}
                                      >
                                        <span>{detailVal}</span>
                                        <Globe className={cn("w-3 h-3 shrink-0", isLBB ? "text-[#B91C1C]" : "text-[#1D4ED8]")} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyLink(detailVal, `link-${boatIdx}-${activeCabinIndex}`)}
                                        className="p-1 rounded-none bg-white hover:bg-[#F2ECE1] border border-[#DDD5C7] text-[#5C6F84] hover:text-[#0F2231] transition-all cursor-pointer"
                                        title={isFrench ? "Copier le lien de la cabine" : "Copy cabin link"}
                                      >
                                        {copiedLinkKey === `link-${boatIdx}-${activeCabinIndex}` ? (
                                          <Check className="w-3 h-3 text-emerald-600" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-baseline gap-2 pt-1 text-[11px] text-[#7E91A3] italic font-sans">
                                    <span className="text-[#6B7E91] font-semibold w-24 shrink-0 uppercase tracking-wider font-sans">
                                      {detailLabel} :
                                    </span>
                                    <span>{isFrench ? 'Réservation directe via WhatsApp' : 'Direct booking via WhatsApp'}</span>
                                  </div>
                                )}
                              </div>

                              {/* Action: Direct In-Modal Interactive Browse (No external tab redirection) */}
                              {detailVal && (
                                <div className="pt-2 border-t border-[#E8E2D5]">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenWebModal(detailVal, boat.boatName, cabinVal)}
                                    className={cn(
                                      "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-none text-white text-xs font-bold tracking-wide shadow-sm transition-all cursor-pointer active:scale-[0.99]",
                                      isLBB ? "bg-[#B91C1C] hover:bg-[#991B1B]" : "bg-[#1D4ED8] hover:bg-[#1a44c4]"
                                    )}
                                    title={isFrench ? "Ouvrir les détails et cabines dans un navigateur modal" : "Browse itinerary and details directly inside interactive modal"}
                                  >
                                    <Globe className="w-3.5 h-3.5 text-amber-400" />
                                    <span>{isFrench ? 'Aperçu Direct du Bateau & Cabines (Modal)' : 'Direct Preview Vessel & Cabins (Modal)'}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}

                        {/* TAB 2: ITINERARY (#tab-itinerary / #tab-itinraire) */}
                        {activeBoatTab[boatIdx] === 'itinerary' && (
                          <motion.div 
                            key={`tab-itinerary-${boatIdx}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ type: "spring", stiffness: 380, damping: 28 }}
                            className="space-y-3.5"
                          >
                            <div className="flex items-center justify-between px-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#7E91A3]">
                                {boat.duration 
                                  ? (isFrench ? `Programme de la croisière ${boat.duration}` : `${boat.duration} Cruise Itinerary`)
                                  : (isFrench ? 'Programme de la croisière' : 'Cruise Itinerary')}
                              </span>
                              <span className={cn(
                                "text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-none border",
                                isLBB 
                                  ? "text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA]" 
                                  : "text-[#1D4ED8] bg-[#EFF6FF] border-[#BFDBFE]"
                              )}>
                                {scrapedBoatData?.itineraryDays?.length || (boat.duration?.includes('4') ? 4 : 3)} {isFrench ? 'Jours' : 'Days'}
                              </span>
                            </div>

                            {/* Route Map Image on Itinerary Tab (Unconstrained full natural size, responsive, zoomable) */}
                            {(() => {
                              const isLombokRoute = (boat.boatName && /lombok/i.test(boat.boatName)) || boat.duration?.includes('4');
                              const routeMapUrl = scrapedBoatData?.itineraryMapImage || (
                                isLombokRoute
                                  ? 'https://lebaliblog.com/wp-content/uploads/2025/11/Peta-Itinerary_Lady-Grace-Lombok-to-Flores.webp'
                                  : 'https://lebaliblog.com/wp-content/uploads/2025/01/Peta-Itinerary_OT-Labuan-Bajo-PP-3J2N.webp'
                              );

                              return (
                                <div className="bg-white border border-[#E8E2D5] rounded-none p-3 sm:p-4 space-y-2.5 shadow-xs">
                                  <div className="flex items-center justify-between">
                                    <div className={cn(
                                      "flex items-center gap-2 text-xs font-bold uppercase tracking-wider",
                                      isLBB ? "text-[#B91C1C]" : "text-[#1D4ED8]"
                                    )}>
                                      <Compass className="w-4 h-4" />
                                      <span>{isFrench ? "Carte de l'Itinéraire" : "Cruise Route Map"}</span>
                                    </div>
                                    <span className="text-[10px] text-[#7E91A3] font-medium">
                                      {isFrench ? "Cliquer pour agrandir" : "Click to view full size"}
                                    </span>
                                  </div>

                                  <div 
                                    onClick={() => {
                                      if (routeMapUrl) {
                                        handleOpenImagePreview(
                                          [routeMapUrl], 
                                          0, 
                                          boat.boatName, 
                                          isFrench ? "Carte de l'Itinéraire" : "Cruise Route Map",
                                          boatBaseUrl ? `${boatBaseUrl}${isLBB ? '#tab-itinraire' : '#tab-itinerary'}` : undefined
                                        );
                                      }
                                    }}
                                    className="w-full rounded-none overflow-hidden border border-[#E8E2D5] bg-[#FAF9F5] shadow-2xs group cursor-zoom-in relative"
                                  >
                                    <img
                                      src={getDisplayImageUrl(routeMapUrl)}
                                      alt={isFrench ? `Carte de l'itinéraire ${boat.boatName}` : `Cruise route map ${boat.boatName}`}
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        const fallbackMap = isLombokRoute
                                          ? 'https://lebaliblog.com/wp-content/uploads/2025/11/Peta-Itinerary_Lady-Grace-Lombok-to-Flores.webp'
                                          : 'https://lebaliblog.com/wp-content/uploads/2025/01/Peta-Itinerary_OT-Labuan-Bajo-PP-3J2N.webp';
                                        if (e.currentTarget.src !== fallbackMap) {
                                          e.currentTarget.src = fallbackMap;
                                        }
                                      }}
                                      className="w-full h-auto object-contain block group-hover:scale-[1.01] transition-transform duration-300"
                                    />
                                    <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-none bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[10px] font-semibold flex items-center gap-1 transition-all shadow-sm">
                                      <Maximize2 className="w-3 h-3" />
                                      <span>{isFrench ? "Plein écran" : "Full Screen"}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="space-y-3">
                              {(scrapedDataByBoat[boatIdx]?.itineraryDays || [
                                {
                                  dayNumber: 1,
                                  title: isFrench ? 'Labuan Bajo - Île de Kelor - Manjarite - Île de Kalong' : 'Labuan Bajo - Kelor Island - Manjarite - Kalong Island',
                                  destinations: ['Kelor Island', 'Manjarite Island', 'Kalong Island'],
                                  images: [
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Kelor-Island.webp',
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Manjarite-Island-.webp',
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Kalong-Island.webp'
                                  ],
                                  description: isFrench 
                                    ? 'Départ du port de Labuan Bajo. Randonnée panoramique sur Kelor, snorkeling au-dessus des coraux de Manjarite, puis coucher de soleil magique avec envol des roussettes à Kalong.'
                                    : 'Morning pickup & departure from Labuan Bajo harbour. Scenic summit trek on Kelor Island, crystal clear coral snorkeling at Manjarite, and sunset watching thousands of flying foxes at Kalong Island.'
                                },
                                {
                                  dayNumber: 2,
                                  title: isFrench ? 'Île de Padar - Pink Beach - Île de Komodo - Manta Point - Taka Makassar' : 'Padar Island - Pink Beach - Komodo Island - Manta Point - Taka Makassar',
                                  destinations: ['Padar Island', 'Pink Beach', 'Komodo Island', 'Manta Point', 'Taka Makassar'],
                                  images: [
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Padar-Island.webp',
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Pink-Beach.webp',
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Komodo-Island.webp',
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY2-Manta-Point.webp'
                                  ],
                                  description: isFrench
                                    ? 'Randonnée emblématique à l\'aube sur Padar Island, baignade sur la célèbre plage de sable rose, observation des dragons de Komodo avec les rangers du parc, et nage avec les raies mantas à Manta Point.'
                                    : 'Iconic sunrise hike on Padar Island, relax on the world-famous Pink Beach, observe wild Komodo dragons with national park rangers, and snorkel with wild giant manta rays at Manta Point and Taka Makassar.'
                                },
                                {
                                  dayNumber: 3,
                                  title: isFrench ? 'Île de Kanawa - Retour à Labuan Bajo' : 'Kanawa Island - Return to Labuan Bajo',
                                  destinations: ['Kanawa Island', 'Labuan Bajo Harbour'],
                                  images: [
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY3-Kanawa-Island-.webp'
                                  ],
                                  description: isFrench
                                    ? 'Dernière séance de snorkeling sur le récif de Kanawa Island, déjeuner à bord et navigation retour vers Labuan Bajo (arrivée 12h-13h) avec transfert à l\'hôtel ou à l\'aéroport.'
                                    : 'Morning reef snorkeling and white sand relaxation at Kanawa Island. Cruise back to Labuan Bajo with lunch onboard, arriving around 12:00-1:00 PM with hotel/airport transfer.'
                                }
                              ]).map((day) => (
                                <div key={day.dayNumber} className="bg-white border border-[#E8E2D5] rounded-none p-4 space-y-3 shadow-xs">
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-none font-mono text-[10px] font-bold border",
                                      isLBB 
                                        ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]" 
                                        : "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]"
                                    )}>
                                      {isFrench ? `JOUR ${day.dayNumber}` : `DAY ${day.dayNumber}`}
                                    </span>
                                    <h4 className="text-xs sm:text-sm font-serif font-bold text-[#0F2231]">{day.title}</h4>
                                  </div>
                                  {day.description && (
                                    <p className="text-xs text-[#5C6F84] leading-relaxed">{day.description}</p>
                                  )}
                                  {day.images && day.images.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                                      {day.images.map((imgUrl, iIdx) => (
                                        <div 
                                          key={iIdx}
                                          onClick={() => handleOpenImagePreview(day.images, iIdx, boat.boatName, `Day ${day.dayNumber}: ${day.destinations[iIdx] || 'Highlight'}`)}
                                          className="relative aspect-video rounded-none bg-muted overflow-hidden border border-[#E8E2D5] cursor-zoom-in group shadow-2xs"
                                        >
                                          <img 
                                            src={getDisplayImageUrl(imgUrl)} 
                                            alt="" 
                                            onError={(e) => {
                                              const target = e.currentTarget;
                                              const src = target.src;
                                              if (src.includes('Island.webp')) {
                                                target.src = src.replace('Island.webp', 'Island-.webp');
                                              } else if (src.includes('Island-.webp')) {
                                                target.src = src.replace('Island-.webp', 'Island.webp');
                                              }
                                            }}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                          />
                                          {day.destinations[iIdx] && (
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-1.5 text-[9px] font-medium text-white truncate">
                                              {day.destinations[iIdx]}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Action: Open Itinerary in Web Modal (No external tab redirection) */}
                            {boatBaseUrl && (
                              <div className="pt-2 border-t border-[#E8E2D5]">
                                <button
                                  type="button"
                                  onClick={() => handleOpenWebModal(`${boatBaseUrl}${isLBB ? '#tab-itinraire' : '#tab-itinerary'}`, boat.boatName, isFrench ? 'Itinéraire' : 'Itinerary')}
                                  className={cn(
                                    "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-none text-white text-xs font-bold tracking-wide shadow-sm transition-all cursor-pointer active:scale-[0.99]",
                                    isLBB ? "bg-[#B91C1C] hover:bg-[#991B1B]" : "bg-[#1D4ED8] hover:bg-[#1a44c4]"
                                  )}
                                  title={isFrench ? "Ouvrir l'onglet d'itinéraire complet (#tab-itinraire)" : "Browse full official itinerary inside modal"}
                                >
                                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                                  <span>{isFrench ? 'Aperçu Direct de l\'Itinéraire (Modal)' : 'Direct Preview Itinerary (Modal)'}</span>
                                </button>
                              </div>
                            )}
                          </motion.div>
                        )}

                        {/* TAB 3: INCLUSIONS & WHAT TO BRING (#tab-inclusions) */}
                        {activeBoatTab[boatIdx] === 'inclusions' && (
                          <motion.div 
                            key={`tab-inclusions-${boatIdx}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ type: "spring", stiffness: 380, damping: 28 }}
                            className="space-y-3.5"
                          >
                            {/* Inclusions */}
                            <div className="bg-white border border-[#E8E2D5] rounded-none p-4.5 space-y-3 shadow-xs">
                              <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>{isFrench ? "Inclus dans la croisière" : "What is Included"}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#0F2231]">
                                {(scrapedDataByBoat[boatIdx]?.inclusions || [
                                  'Cabine climatisée avec salle de bain',
                                  'Pension complète (3 déjeuners, 2 petits-déjeuners, 2 dîners)',
                                  'Eau minérale, thé et café à volonté',
                                  'Équipement de snorkeling (masque, tuba, gilet)',
                                  'Guide accompagnateur anglophone',
                                  'Photos & vidéos souvenirs (documentation)',
                                  'Transferts aller-retour à Labuan Bajo'
                                ]).map((inc, i) => (
                                  <div key={i} className="flex items-start gap-2 bg-[#F0FDF4] p-2.5 rounded-none border border-emerald-100">
                                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                    <span className="leading-snug text-[#134E4A] font-medium">{inc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* What to bring */}
                            <div className="bg-white border border-[#E8E2D5] rounded-none p-4.5 space-y-3 shadow-xs">
                              <div className="flex items-center gap-2 text-[#9B7008] font-bold text-xs uppercase tracking-wider">
                                <Luggage className="w-4 h-4 text-[#B8860B]" />
                                <span>{isFrench ? "À prévoir pour votre voyage" : "What to Bring"}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#0F2231]">
                                {(scrapedDataByBoat[boatIdx]?.whatToBring || [
                                  'Crème solaire & lunettes de soleil',
                                  'Chapeau / casquette & maillots de bain',
                                  'Chaussures de marche ou baskets (Padar)',
                                  'Médicaments personnels & anti-moustique',
                                  'Batterie externe (Powerbank)',
                                  'Espèces en Rupiahs (IDR) pour le Parc National'
                                ]).map((tip, i) => (
                                  <div key={i} className="flex items-start gap-2 bg-[#FEFCE8] p-2.5 rounded-none border border-amber-100">
                                    <div className="w-1.5 h-1.5 rounded-none bg-[#B8860B] shrink-0 mt-1.5" />
                                    <span className="leading-snug text-[#713F12] font-medium">{tip}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Exclusions */}
                            <div className="bg-white border border-[#E8E2D5] rounded-none p-4.5 space-y-3 shadow-xs">
                              <div className="flex items-center gap-2 text-[#7E91A3] font-bold text-xs uppercase tracking-wider">
                                <AlertCircle className="w-4 h-4 text-slate-400" />
                                <span>{isFrench ? "Non inclus" : "Not Included"}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#5C6F84]">
                                {(scrapedDataByBoat[boatIdx]?.exclusions || [
                                  'Droits d\'entrée du Parc National de Komodo & rangers',
                                  'Vols intérieurs vers / depuis Labuan Bajo',
                                  'Hôtels avant ou après la croisière',
                                  'Dépenses personnelles et pourboires équipage'
                                ]).map((exc, i) => (
                                  <div key={i} className="flex items-start gap-2 bg-[#FFF1F2] p-2.5 rounded-none border border-rose-100">
                                    <span className="text-rose-500 font-bold shrink-0">✕</span>
                                    <span className="leading-snug text-[#881337]">{exc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Action: Open Inclusions on Official Site in Web Modal (No external tab redirection) */}
                            {boatBaseUrl && (
                              <div className="pt-2 border-t border-[#E8E2D5]">
                                <button
                                  type="button"
                                  onClick={() => handleOpenWebModal(`${boatBaseUrl}#tab-inclusions`, boat.boatName, isFrench ? 'Inclusions & Exclusions' : 'Inclusions & Exclusions')}
                                  className={cn(
                                    "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-none text-white text-xs font-bold tracking-wide shadow-sm transition-all cursor-pointer active:scale-[0.99]",
                                    isLBB ? "bg-[#B91C1C] hover:bg-[#991B1B]" : "bg-[#1D4ED8] hover:bg-[#1a44c4]"
                                  )}
                                  title={isFrench ? "Ouvrir l'onglet d'inclusions complet (#tab-inclusions)" : "Browse full official inclusions & exclusions (#tab-inclusions) inside modal"}
                                >
                                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                                  <span>{isFrench ? 'Aperçu Direct des Inclusions (Modal)' : 'Direct Preview Inclusions (Modal)'}</span>
                                </button>
                              </div>
                            )}
                          </motion.div>
                        )}
                        </AnimatePresence>

                        {/* Bottom Alignment: Fuel Surcharge & Limited Service Note for this boat */}
                        {(boat.fuelSurcharge || boat.limitedServiceNote) && (
                          <div className="p-3.5 rounded-none bg-[#FEF9EE] border border-[#F0E4CE] space-y-1.5 text-xs">
                            <div className="flex items-center gap-1.5 text-[#9B7008] font-bold uppercase tracking-wider text-[10px]">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{isFrench ? 'Notes & Carburant' : 'Notes & Surcharges'}</span>
                            </div>
                            {boat.fuelSurcharge && (
                              <p className="text-xs text-[#0F2231]">
                                <span className="font-semibold text-[#8B6E32]">⛽ {isFrench ? 'Surcharge Carburant :' : 'Fuel Surcharge:'}</span> {boat.fuelSurcharge}
                              </p>
                            )}
                            {boat.limitedServiceNote && (
                              <p className="text-[11px] text-[#5C6F84] italic leading-relaxed">
                                {boat.limitedServiceNote}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Global Footer Reassurance */}
        <footer className="text-center pt-2 pb-4 space-y-1.5">
          <div className="flex items-center justify-center gap-1.5 text-xs text-[#5C6F84]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {isFrench 
                ? 'Options préparées spécialement pour votre demande' 
                : 'Curated availability tailored for your inquiry'}
            </span>
          </div>
          <p className="text-[10px] text-[#7E91A3]">
            {displayBrandName} • {pageBrandIsLBB ? 'Lombok & Komodo' : 'Labuan Bajo, Flores'}
          </p>
          {/* Development Testing Notice */}
          <div className="mt-3 mx-auto max-w-xs border border-amber-200/60 bg-amber-50/70 px-3 py-2 text-center">
            <p className="text-[9px] font-semibold text-amber-700 uppercase tracking-widest mb-0.5">🛠 Development Preview</p>
            <p className="text-[9px] text-amber-600 leading-relaxed">
              This page is under active development. If you notice any issue or unexpected behavior, please report it to help us improve the experience.
            </p>
          </div>
        </footer>
      </main>

      {/* Sticky WhatsApp CTA */}
      <motion.aside 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.15 }}
        className={cn(
          isModal ? "sticky bottom-0" : "fixed bottom-0 left-0 right-0",
          "p-3.5 bg-white/95 backdrop-blur-md border-t border-[#E8E2D5] z-50 shadow-lg"
        )}
      >
        <div className={cn("mx-auto", contentMaxWidth)}>
          <motion.a
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 25 }}
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full py-3.5 px-5 rounded-none bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm shadow-xl shadow-[#25D366]/25 cursor-pointer select-none"
          >
            <MessageCircle className="w-5 h-5 fill-white shrink-0" />
            <span className="truncate">
              {snapshot?.whatsappCtaCaption || (isFrench ? "Demander pour ce bateau" : "Ask About This Boat")}
            </span>
          </motion.a>
        </div>
      </motion.aside>

      {/* Full-Screen Image Preview Modal (Lightbox) */}
      <AnimatePresence>
        {previewModal?.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setPreviewModal(null)}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 select-none"
          >
            {/* Modal Top Bar */}
            <div 
              onClick={(e) => e.stopPropagation()} 
              className="flex items-center justify-between gap-3 text-white max-w-4xl mx-auto w-full pt-1"
            >
              <div className="min-w-0">
                <h3 className="font-serif font-bold text-base sm:text-lg text-[#f0e9dc] truncate">
                  {previewModal.boatName}
                </h3>
                <p className="text-xs text-amber-400 font-medium truncate">
                  {previewModal.cabinName}
                </p>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {previewModal.images.length > 1 && (
                  <span className="text-xs font-mono text-[#a69a84] bg-white/10 px-2.5 py-1 rounded-none border border-white/15">
                    {previewModal.activeIndex + 1} / {previewModal.images.length}
                  </span>
                )}
                {/* Zoom Toggle Button */}
                <button
                  type="button"
                  onClick={() => setIsLightboxZoomed(prev => !prev)}
                  className="px-3 py-1.5 rounded-none bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 text-xs font-semibold"
                  title={isLightboxZoomed ? (isFrench ? "Dézoomer" : "Zoom out") : (isFrench ? "Agrandir / Zoomer" : "Zoom in")}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>{isLightboxZoomed ? (isFrench ? "100%" : "Reset") : (isFrench ? "Zoom" : "Zoom")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPreviewModal(null);
                    setIsLightboxZoomed(false);
                  }}
                  className="w-9 h-9 rounded-none bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  aria-label="Close Preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Viewport */}
            <div 
              onClick={(e) => e.stopPropagation()}
              className="relative flex-1 flex items-center justify-center my-2 max-w-4xl mx-auto w-full min-h-0 overflow-auto custom-scrollbar"
            >
              {(() => {
                const currentRaw = previewModal.images[previewModal.activeIndex] || '';
                const currentDisplay = getDisplayImageUrl(currentRaw);
                const isLombok = previewModal.boatName?.toLowerCase().includes('lombok') || currentRaw.toLowerCase().includes('lombok');
                const verifiedMap = isLombok
                  ? 'https://lebaliblog.com/wp-content/uploads/2025/11/Peta-Itinerary_Lady-Grace-Lombok-to-Flores.webp'
                  : 'https://lebaliblog.com/wp-content/uploads/2025/01/Peta-Itinerary_OT-Labuan-Bajo-PP-3J2N.webp';

                return (
                  <img
                    src={currentDisplay}
                    alt={`${previewModal.boatName} - ${previewModal.cabinName}`}
                    referrerPolicy="no-referrer"
                    onClick={() => setIsLightboxZoomed(prev => !prev)}
                    onError={(e) => {
                      const isMap = /carte|peta|map|itinerary|itineraire/i.test(previewModal.cabinName || '') ||
                                    /carte|peta|map|itinerary|itineraire/i.test(currentRaw);
                      if (isMap && e.currentTarget.src !== verifiedMap) {
                        e.currentTarget.src = verifiedMap;
                        return;
                      }
                      const thumb = getDriveThumbnailUrl(currentRaw);
                      if (thumb && e.currentTarget.src !== thumb) {
                        e.currentTarget.src = thumb;
                      }
                    }}
                    className={cn(
                      "w-auto h-auto object-contain rounded-none shadow-2xl transition-all duration-300 select-none",
                      isLightboxZoomed 
                        ? "max-h-none max-w-none scale-125 my-8 cursor-zoom-out" 
                        : "max-h-[75vh] max-w-full scale-100 cursor-zoom-in"
                    )}
                  />
                );
              })()}

              {/* Prev / Next buttons inside lightbox */}
              {previewModal.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsLightboxZoomed(false);
                      setPreviewModal(prev => {
                        if (!prev) return null;
                        const newIdx = prev.activeIndex === 0 ? prev.images.length - 1 : prev.activeIndex - 1;
                        return { ...prev, activeIndex: newIdx };
                      });
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-none bg-black/75 hover:bg-black/90 border border-white/20 text-white flex items-center justify-center transition-all shadow-xl cursor-pointer active:scale-90"
                    aria-label="Previous Image"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsLightboxZoomed(false);
                      setPreviewModal(prev => {
                        if (!prev) return null;
                        const newIdx = prev.activeIndex === prev.images.length - 1 ? 0 : prev.activeIndex + 1;
                        return { ...prev, activeIndex: newIdx };
                      });
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-none bg-black/75 hover:bg-black/90 border border-white/20 text-white flex items-center justify-center transition-all shadow-xl cursor-pointer active:scale-90"
                    aria-label="Next Image"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div 
              onClick={(e) => e.stopPropagation()} 
              className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3 pt-2 border-t border-white/10"
            >
              {previewModal.websiteUrl ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (previewModal.websiteUrl) {
                        handleOpenWebModal(previewModal.websiteUrl, previewModal.boatName, previewModal.cabinName);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-none bg-white/15 hover:bg-white/25 border border-white/25 text-xs font-bold text-white transition-all cursor-pointer"
                  >
                    <Globe className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isFrench ? 'Aperçu Direct (Modal)' : 'Direct Web (Modal)'}</span>
                  </button>
                </div>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="px-5 py-2 rounded-none bg-white text-[#0F2231] hover:bg-stone-100 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-md"
              >
                {isFrench ? 'Fermer' : 'Close'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. DIRECT INTERACTIVE WEB MODAL (IFRAME BROWSER) */}
      <AnimatePresence>
        {webModal?.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md"
            onClick={() => setWebModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-5xl h-[92vh] flex flex-col bg-white border border-[#E8E2D5] rounded-none md:rounded-none shadow-2xl overflow-hidden"
            >
              {/* Header Bar */}
              {(() => {
                const isWebModalLBB = webModal.url.includes('komodoislandcruises.com')
                  ? false
                  : (webModal.url.includes('lebaliblog.com') ? true : pageBrandIsLBB);
                return (
                  <div className={cn(
                    "flex items-center justify-between px-4 py-3 border-b shrink-0 text-white",
                    isWebModalLBB ? "bg-[#881337] border-[#9F1239]" : "bg-[#1E3A8A] border-[#1D4ED8]"
                  )}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-none flex items-center justify-center shrink-0 border",
                        isWebModalLBB 
                          ? "bg-rose-500/20 border-rose-400/30 text-rose-300" 
                          : "bg-blue-500/20 border-blue-400/30 text-blue-200"
                      )}>
                        <Globe className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate font-serif tracking-wide">
                            {webModal.boatName}
                          </span>
                          {webModal.cabinName && (
                            <span className="text-[10px] px-2 py-0.5 rounded-none bg-white/10 text-white font-medium border border-white/15 truncate">
                              {webModal.cabinName}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-white/70 font-mono truncate block max-w-md">
                          {webModal.url}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setWebModal(null)}
                        className="p-1.5 rounded-none bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                        aria-label="Close"
                        title={isFrench ? "Fermer l'aperçu" : "Close preview"}
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Iframe Viewport Container */}
              <div className="relative flex-1 w-full bg-white overflow-hidden">
                {webIframeLoading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#FAF8F5] text-[#0F2231] space-y-3">
                    <Loader2 className="w-8 h-8 text-[#B8860B] animate-spin" />
                    <span className="text-xs font-medium text-[#5C6F84]">
                      {isFrench ? 'Chargement des détails et de l\'itinéraire...' : 'Loading itinerary & boat details...'}
                    </span>
                  </div>
                )}

                <iframe
                  src={webModal.url}
                  title={`${webModal.boatName} Web Details`}
                  className="w-full h-full border-0"
                  onLoad={() => setWebIframeLoading(false)}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              </div>

              {/* Bottom Info Bar */}
              <div className="px-4 py-2.5 bg-[#FAF7F2] border-t border-[#E8E2D5] flex items-center justify-between text-[11px] text-[#5C6F84] shrink-0">
                <span className="truncate">
                  {isFrench 
                    ? "Aperçu officiel direct — Komodo Island Cruises" 
                    : "Direct official preview — Komodo Island Cruises"}
                </span>
                <button
                  type="button"
                  onClick={() => setWebModal(null)}
                  className="text-[#0F2231] hover:text-[#B8860B] font-bold shrink-0 ml-2 cursor-pointer"
                >
                  {isFrench ? "Fermer ✕" : "Close ✕"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex flex-col items-center justify-start overflow-hidden">
        {/* Modal Top Control Bar */}
        <div className="w-full bg-[#1c1916] border-b border-[#2e2a24] px-4 py-2.5 flex items-center justify-between shrink-0 z-50 text-[#f0e9dc]">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-none bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {isFrench ? 'Aperçu du Lien de Partage' : 'Share Link Customer Preview'}
            </span>
            <span className="text-[10px] font-mono text-[#a69a84] hidden sm:inline">
              (Live Simulation)
            </span>
          </div>

          {/* Viewport Simulation Switcher */}
          <div className="flex items-center bg-[#141210] p-0.5 rounded-none border border-[#2e2a24]">
            <button
              type="button"
              onClick={() => setDeviceSimulation('mobile')}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-none text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                deviceSimulation === 'mobile' ? "bg-amber-500 text-black font-bold shadow-sm" : "text-[#a69a84] hover:text-[#f0e9dc]"
              )}
              title="Mobile Smartphone View (WhatsApp Link Preview)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mobile (375px)</span>
            </button>
            <button
              type="button"
              onClick={() => setDeviceSimulation('tablet')}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-none text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                deviceSimulation === 'tablet' ? "bg-amber-500 text-black font-bold shadow-sm" : "text-[#a69a84] hover:text-[#f0e9dc]"
              )}
              title="Tablet View (640px)"
            >
              <Tablet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tablet</span>
            </button>
            <button
              type="button"
              onClick={() => setDeviceSimulation('desktop')}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-none text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                deviceSimulation === 'desktop' ? "bg-amber-500 text-black font-bold shadow-sm" : "text-[#a69a84] hover:text-[#f0e9dc]"
              )}
              title="Desktop Wide View"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Desktop</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 sm:p-2 rounded-none bg-[#201d1a] hover:bg-[#2e2a24] text-[#a69a84] hover:text-white transition-all cursor-pointer"
                title="Close Preview (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Viewport Simulation Frame */}
        <div className="flex-1 w-full flex items-center justify-center p-2 sm:p-5 overflow-hidden">
          <div className={cn(
            "bg-[#FAF9F5] h-full overflow-y-auto custom-scrollbar transition-all duration-300 shadow-2xl relative",
            deviceSimulation === 'mobile' && "w-[390px] max-h-[85vh] rounded-[48px] border-[10px] border-stone-800 shadow-[0_0_50px_rgba(0,0,0,0.8)]",
            deviceSimulation === 'tablet' && "w-[680px] max-h-[88vh] rounded-none border border-stone-700 shadow-2xl",
            deviceSimulation === 'desktop' && "w-full max-w-5xl max-h-[92vh] rounded-none border border-stone-800 shadow-2xl"
          )}>
            {/* Phone notch simulation when in mobile mode */}
            {deviceSimulation === 'mobile' && (
              <div className="sticky top-0 inset-x-0 h-6 bg-black z-40 flex items-center justify-between px-6 text-[10px] text-white/70 select-none">
                <span>9:41</span>
                <div className="w-20 h-3.5 bg-stone-900 rounded-full mx-auto" />
                <span>5G 100%</span>
              </div>
            )}
            {pageContent}
          </div>
        </div>
      </div>
    );
  }

  return pageContent;
};
