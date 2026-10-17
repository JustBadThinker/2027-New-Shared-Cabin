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

  // Auto-fetch scraped boat details (inclusions, itinerary, cabins) for KIC and LBB links
  useEffect(() => {
    if (!boats || boats.length === 0) return;
    boats.forEach((b, bIdx) => {
      // 1. Check if any cabin already has a valid URL
      let webUrl = b.cabins?.find(c => 
        c.websiteUrl?.includes('lebaliblog.com') || 
        c.websiteUrl?.includes('komodoislandcruises.com')
      )?.websiteUrl;

      // 2. If not specified, deduce from boat name and indicators
      if (!webUrl && b.boatName) {
        const slug = b.boatName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const isLBBHint = /lombok/i.test(b.boatName) || 
                          /croisiere|croisière|depart|départ|chambre/i.test(b.boatName) ||
                          Boolean(snapshot?.whatsappBusinessName?.toLowerCase().includes('bali'));
        if (isLBBHint) {
          webUrl = `https://lebaliblog.com/bateau/${slug}/`;
        } else {
          webUrl = `https://komodoislandcruises.com/boat/${slug}/`;
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

  // Resolves a list of valid, high-resolution displayable photos for a cabin (resilient to Google Drive permission blocks)
  const getCabinDisplayImages = (
    cabin: CabinSnapshot | undefined, 
    boatIdx: number, 
    cabinIdx: number, 
    boat: BoatSnapshot
  ): string[] => {
    const list: string[] = [];

    // 1. Raw cabin images attached to snapshot (skip if flagged as 403 / broken)
    if (cabin) {
      if (cabin.images && cabin.images.length > 0) {
        cabin.images.forEach(img => {
          if (img && !failedImageUrls[img] && !list.includes(img)) list.push(img);
        });
      }
      if (cabin.imageUrl && !failedImageUrls[cabin.imageUrl] && !list.includes(cabin.imageUrl)) {
        list.push(cabin.imageUrl);
      }
    }

    // 2. Scraped cabin images from official komodoislandcruises.com website
    const scrapedCabin = scrapedDataByBoat[boatIdx]?.cabins?.[cabinIdx];
    if (scrapedCabin?.images && scrapedCabin.images.length > 0) {
      scrapedCabin.images.forEach(img => {
        if (img && !failedImageUrls[img] && !list.includes(img)) list.push(img);
      });
    }

    // 3. Scraped boat featured gallery images from komodoislandcruises.com
    const scrapedFeatured = scrapedDataByBoat[boatIdx]?.featuredImages;
    if (scrapedFeatured && scrapedFeatured.length > 0) {
      scrapedFeatured.forEach(img => {
        if (img && !failedImageUrls[img] && !list.includes(img)) list.push(img);
      });
    }

    // 4. Guaranteed fallback luxury yacht photos (public, high-res CDN)
    const hash = Math.abs(
      (boat.boatName + (cabin?.id || cabin?.name || `cabin-${cabinIdx}`)).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    );
    for (let i = 0; i < FALLBACK_CABIN_IMAGES.length; i++) {
      const fb = FALLBACK_CABIN_IMAGES[(hash + i) % FALLBACK_CABIN_IMAGES.length];
      if (!list.includes(fb)) list.push(fb);
    }

    return list.length > 0 ? list : [FALLBACK_CABIN_IMAGES[0]];
  };

  // Loading skeleton view
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] text-[#11212D] flex flex-col items-center justify-center p-6 select-none">
        <div className="w-12 h-12 rounded-full border-3 border-[#E8E4DC] border-t-[#B8860B] animate-spin mb-4" />
        <p className="font-serif italic text-lg tracking-wide text-[#52606D]">
          Loading cruise availability...
        </p>
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
        <div className="w-full max-w-md bg-white border border-[#E8E4DC] rounded-3xl p-8 text-center shadow-xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6">
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
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-2xl bg-[#0F2231] hover:bg-[#1A3347] text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <span>{isFrench ? "Réessayer" : "Tap to Retry"}</span>
            </button>

            {fallbackWaLink && (
              <a
                href={fallbackWaLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 w-full py-3 px-6 rounded-2xl bg-[#F5F2EB] hover:bg-[#EFECE6] border border-[#E8E4DC] text-[#11212D] font-medium text-xs transition-all"
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
        <div className="w-full max-w-md bg-white border border-[#E8E4DC] rounded-3xl p-8 text-center shadow-xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-[#F5F2EB] border border-[#EADBB6] flex items-center justify-center mx-auto mb-6">
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
              className="inline-flex items-center justify-center gap-2.5 w-full py-3.5 px-6 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm shadow-lg shadow-[#25D366]/20 transition-all active:scale-[0.98]"
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
        <div className="w-full max-w-md bg-white border border-[#E8E4DC] rounded-3xl p-8 text-center shadow-xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6">
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
              className="inline-flex items-center justify-center gap-2.5 w-full py-3.5 px-6 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm shadow-lg shadow-[#25D366]/20 transition-all active:scale-[0.98]"
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
        <div className="w-full max-w-md bg-white border border-[#E8E4DC] rounded-3xl p-8 text-center shadow-xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6">
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
              className="inline-flex items-center justify-center gap-2.5 w-full py-3.5 px-6 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm shadow-lg shadow-[#25D366]/20 transition-all active:scale-[0.98]"
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

  const pageBrandIsLBB = boats.some((b, idx) => 
    b.cabins?.some(c => c.websiteUrl?.includes('lebaliblog.com')) ||
    (b.boatName && /lombok/i.test(b.boatName)) ||
    scrapedDataByBoat[idx]?.brand === 'LBB'
  ) || Boolean(snapshot?.whatsappBusinessName?.toLowerCase().includes('bali'));

  const defaultBrandName = pageBrandIsLBB ? 'Le Bali Blog' : 'Komodo Island Cruises';

  const pageContent = (
    <div className={cn(
      "bg-[#FAF9F5] text-[#11212D] pb-32 antialiased selection:bg-[#B8860B]/20 font-sans",
      isModal ? "min-h-full" : "min-h-screen overflow-x-hidden"
    )}>
      {/* Top Header Bar (KIC = Ocean Navy/Gold, LBB = Wine Red/Carmine) */}
      <header className="border-b border-[#E8E4DC] bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className={cn("mx-auto px-4 py-3.5 flex items-center justify-between", contentMaxWidth)}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-xl border flex items-center justify-center shadow-xs shrink-0",
              pageBrandIsLBB 
                ? "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]" 
                : "bg-[#F0F5FA] border-[#D0E2F2] text-[#1E40AF]"
            )}>
              <Ship className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[12px] font-serif font-bold tracking-[0.12em] uppercase text-[#11212D] block truncate leading-tight">
                {snapshot?.whatsappBusinessName || defaultBrandName}
              </span>
              <span className="text-[10px] text-[#788896] font-medium block">
                {isFrench ? 'Disponibilités Officielles & Réservation' : 'Official Cruise Availability & Cabins'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-[10px] font-bold tracking-wider uppercase shrink-0 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{isFrench ? 'Vérifié' : 'Live Verified'}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={cn("mx-auto px-4 pt-5 space-y-4", contentMaxWidth)}>
        {/* Section Title */}
        <div className="flex items-center justify-between px-1">
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em]",
            pageBrandIsLBB ? "text-[#B91C1C]" : "text-[#B8860B]"
          )}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isFrench ? 'Bateaux Disponibles' : 'Available Vessels & Cabins'}</span>
          </div>
          <span className="text-[11px] font-medium text-[#788896]">
            {boats.length} {boats.length === 1 ? (isFrench ? 'Bateau' : 'Vessel') : (isFrench ? 'Bateaux' : 'Vessels')}
          </span>
        </div>

        {/* Boats Accordion List */}
        <div className="space-y-3">
          {boats.map((boat, boatIdx) => {
            const isExpanded = expandedBoatIndex === boatIdx;
            const cabinList = boat.cabins || [];
            const activeCabinIndex = activeCabinByBoat[boatIdx] || 0;
            const activeCabin = cabinList[activeCabinIndex] || cabinList[0];
            const hasMultipleCabins = cabinList.length > 1;

            const isLBB = 
              boat.cabins?.some(c => c.websiteUrl?.includes('lebaliblog.com')) || 
              scrapedDataByBoat[boatIdx]?.brand === 'LBB' || 
              (boat.boatName && /lombok/i.test(boat.boatName)) || 
              pageBrandIsLBB;

            // Template computation matching output preview
            const itineraryLabel = isFrench ? 'Itinéraire' : 'Itinerary';
            const datesLabel = isFrench ? 'Dates' : 'Dates';
            const departureLabel = isFrench ? 'Départ' : 'Departure';
            const boatLabel = isFrench ? 'Bateau' : 'Boat';
            const cabinLabel = isFrench ? 'Chambre' : 'Cabin';
            const detailLabel = isFrench ? 'Détail' : 'Detail';

            const itineraryVal = activeCabin?.itinerary || boat.itinerary || (isFrench ? 'Labuan Bajo (Flores) A/R' : 'Labuan Bajo (Flores) Return Trip');
            const datesVal = boat.dates 
              ? (boat.duration && !boat.dates.includes(boat.duration) ? `${boat.dates} ${boat.duration}` : boat.dates)
              : (boat.duration || '[DATES]');
            
            let departureVal = activeCabin?.departure || boat.departure || '11:00-12.00';
            if (boat.arrival && !departureVal.toLowerCase().includes('end:') && !departureVal.toLowerCase().includes('fin:') && !departureVal.toLowerCase().includes('arrivée:')) {
              departureVal = `${departureVal} / ${isFrench ? 'Fin' : 'End'}: ${boat.arrival}`;
            }

            const boatVal = boat.boatName;
            const cabinVal = activeCabin 
              ? `${activeCabin.count > 1 ? `${activeCabin.count}x ` : ''}${isFrench ? activeCabin.name : (activeCabin.nameEng || activeCabin.name)}`
              : 'All Cabins';
            
            const detailVal = activeCabin?.websiteUrl || '';
            const boatWebUrl = boat.cabins?.find(c => c.websiteUrl)?.websiteUrl || detailVal || '';
            const boatBaseUrl = boatWebUrl ? boatWebUrl.split('#')[0] : '';

            // Plain text version for copying
            let fullTemplateText = `${itineraryLabel} : ${itineraryVal}  
${datesLabel} : ${datesVal}  
${departureLabel} : ${departureVal}  
${boatLabel} : ${boatVal}  
${cabinLabel} : ${cabinVal}`;

            if (detailVal) {
              fullTemplateText += `  \n${detailLabel} : ${detailVal}`;
            }

            if (boat.fuelSurcharge) {
              fullTemplateText += `  \n⛽ ${isFrench ? 'Surcharge Carburant :' : 'Fuel Surcharge:'} ${boat.fuelSurcharge}`;
            }

            if (boat.limitedServiceNote) {
              fullTemplateText += `  \n${boat.limitedServiceNote}`;
            }

            // Cabin Gallery images with multi-tier fallback (Google Drive -> KIC/LBB Scraped -> Curated Yacht)
            const galleryKey = `${boatIdx}-${activeCabinIndex}`;
            const activeImgIdx = activeImageByCabin[galleryKey] || 0;
            const cabinImages = getCabinDisplayImages(activeCabin, boatIdx, activeCabinIndex, boat);
            const safeImgIdx = activeImgIdx < cabinImages.length ? activeImgIdx : 0;
            const rawImgUrl = cabinImages[safeImgIdx] || FALLBACK_CABIN_IMAGES[0];
            const currentImgDisplayUrl = getDisplayImageUrl(rawImgUrl);

            return (
              <div
                key={`${boat.boatName}-${boatIdx}`}
                className="bg-white border border-[#E8E2D5] rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all"
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
                        isLBB ? "text-[#B91C1C]" : "text-[#1E40AF]"
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
                          isLBB ? "text-[#B91C1C]" : "text-[#1E40AF]"
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

                  <div className="p-2 rounded-xl bg-[#F7F4ED] border border-[#E5DDCF] text-[#5C6F84] shrink-0">
                    {isExpanded ? (
                      <ChevronUp className={cn("w-4 h-4", isLBB ? "text-[#B91C1C]" : "text-[#1E40AF]")} />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
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
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden border-t border-[#E8E2D5]"
                    >
                      <div className="p-4 space-y-4 bg-[#FDFBF7]">
                        {/* 3-Way Sub-Tabs: Cabins (#1, #2...) | Itinerary (#tab-itinerary) | Inclusions (#tab-inclusions) */}
                        <div className="flex p-1 bg-[#EFEAE1] rounded-2xl border border-[#E0D8CB] gap-1">
                          <button
                            type="button"
                            onClick={() => setActiveBoatTab(prev => ({ ...prev, [boatIdx]: 'cabins' }))}
                            className={cn(
                              "flex-1 py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                              (!activeBoatTab[boatIdx] || activeBoatTab[boatIdx] === 'cabins')
                                ? (isLBB ? "bg-[#B91C1C] text-white shadow-sm font-bold" : "bg-[#0F2231] text-white shadow-sm font-bold")
                                : (isLBB ? "text-[#7F1D1D]/75 hover:text-[#B91C1C]" : "text-[#5C6F84] hover:text-[#0F2231]")
                            )}
                          >
                            <Ship className="w-3.5 h-3.5" />
                            <span>{isFrench ? 'Cabines' : 'Cabins'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveBoatTab(prev => ({ ...prev, [boatIdx]: 'itinerary' }))}
                            className={cn(
                              "flex-1 py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                              activeBoatTab[boatIdx] === 'itinerary'
                                ? (isLBB ? "bg-[#B91C1C] text-white shadow-sm font-bold" : "bg-[#0F2231] text-white shadow-sm font-bold")
                                : (isLBB ? "text-[#7F1D1D]/75 hover:text-[#B91C1C]" : "text-[#5C6F84] hover:text-[#0F2231]")
                            )}
                          >
                            <Compass className="w-3.5 h-3.5" />
                            <span>{boat.duration ? `Itinéraire ${boat.duration}` : (isFrench ? 'Itinéraire' : 'Itinerary')}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveBoatTab(prev => ({ ...prev, [boatIdx]: 'inclusions' }))}
                            className={cn(
                              "flex-1 py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                              activeBoatTab[boatIdx] === 'inclusions'
                                ? (isLBB ? "bg-[#B91C1C] text-white shadow-sm font-bold" : "bg-[#0F2231] text-white shadow-sm font-bold")
                                : (isLBB ? "text-[#7F1D1D]/75 hover:text-[#B91C1C]" : "text-[#5C6F84] hover:text-[#0F2231]")
                            )}
                          >
                            <ListChecks className="w-3.5 h-3.5" />
                            <span>{isFrench ? 'Inclusions' : 'Inclusions'}</span>
                          </button>
                        </div>

                        {/* TAB 1: CABINS CAROUSEL (#1, #2, ...) */}
                        {(!activeBoatTab[boatIdx] || activeBoatTab[boatIdx] === 'cabins') && activeCabin && (
                          <div 
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
                                <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#0F2231] font-semibold bg-[#F5F1E8] px-2.5 py-0.5 rounded-full border border-[#E5DDCF]">
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
                                    activeCabin.websiteUrl
                                  );
                                }
                              }}
                              className="relative aspect-[16/10] w-full rounded-2xl bg-[#F5F1E8] overflow-hidden border border-[#E5DDCF] shadow-sm group cursor-zoom-in select-none"
                              title={isFrench ? "Cliquer pour agrandir la photo" : "Click to preview full image"}
                            >
                              {currentImgDisplayUrl ? (
                                <img
                                  src={currentImgDisplayUrl}
                                  alt={activeCabin.name}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
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
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-[#7E91A3] p-6 text-center">
                                  <Ship className="w-10 h-10 mb-2 opacity-40 text-[#B8860B]" />
                                  <span className="text-xs font-medium">{activeCabin.name}</span>
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
                                        activeCabin.websiteUrl
                                      );
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 hover:bg-white backdrop-blur-md border border-white/50 text-[#0F2231] text-[11px] font-semibold shadow-md transition-transform active:scale-95 cursor-pointer"
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
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-[#0F2231] border border-white/60 flex items-center justify-center transition-all active:scale-90 shadow-lg cursor-pointer z-10 backdrop-blur-md"
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
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-[#0F2231] border border-white/60 flex items-center justify-center transition-all active:scale-90 shadow-lg cursor-pointer z-10 backdrop-blur-md"
                                    aria-label="Next Cabin"
                                  >
                                    <ChevronRight className="w-5 h-5" />
                                  </button>
                                </>
                              )}

                              {/* Cabin Count Badge (Bottom Left) */}
                              <div className="absolute bottom-2.5 left-3 pointer-events-none">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-white">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>
                                    {activeCabin.count > 1 
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
                                    className={`h-2 rounded-full transition-all cursor-pointer ${
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
                            <div className="rounded-2xl bg-[#FAF7F2] border border-[#E8E2D5] p-4.5 space-y-3.5 shadow-xs relative overflow-hidden">
                              {/* Top Bar with Copy All Button */}
                              <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D5]">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7E91A3]">
                                  {isFrench ? 'Détails du Séjour' : 'Cruise Specifications'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyTemplateText(fullTemplateText, `tmpl-${boatIdx}-${activeCabinIndex}`)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-[#F2ECE1] border border-[#DDD5C7] text-[10px] font-semibold text-[#5C6F84] hover:text-[#0F2231] transition-all cursor-pointer active:scale-95 shadow-2xs"
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

                                {/* Detail Link (Dynamic following the active cabin) */}
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
                                          isLBB ? "text-[#0F2231] hover:text-[#B91C1C]" : "text-[#0F2231] hover:text-[#B8860B]"
                                        )}
                                        title={isFrench ? "Ouvrir l'aperçu intégré dans le modal" : "Open embedded preview in modal"}
                                      >
                                        <span>{detailVal}</span>
                                        <Globe className={cn("w-3 h-3 shrink-0", isLBB ? "text-[#B91C1C]" : "text-[#B8860B]")} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyLink(detailVal, `link-${boatIdx}-${activeCabinIndex}`)}
                                        className="p-1 rounded bg-white hover:bg-[#F2ECE1] border border-[#DDD5C7] text-[#5C6F84] hover:text-[#0F2231] transition-all cursor-pointer"
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
                                      "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white text-xs font-bold tracking-wide shadow-sm transition-all cursor-pointer active:scale-[0.99]",
                                      isLBB ? "bg-[#B91C1C] hover:bg-[#991B1B]" : "bg-[#0F2231] hover:bg-[#1A344A]"
                                    )}
                                    title={isFrench ? "Ouvrir les détails et cabines dans un navigateur modal" : "Browse itinerary and details directly inside interactive modal"}
                                  >
                                    <Globe className="w-3.5 h-3.5 text-amber-400" />
                                    <span>{isFrench ? 'Aperçu Direct du Bateau & Cabines (Modal)' : 'Direct Preview Vessel & Cabins (Modal)'}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* TAB 2: ITINERARY (#tab-itinerary / #tab-itinraire) */}
                        {activeBoatTab[boatIdx] === 'itinerary' && (
                          <div className="space-y-3.5">
                            <div className="flex items-center justify-between px-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#7E91A3]">
                                {boat.duration 
                                  ? (isFrench ? `Programme de la croisière ${boat.duration}` : `${boat.duration} Cruise Itinerary`)
                                  : (isFrench ? 'Programme de la croisière' : 'Cruise Itinerary')}
                              </span>
                              <span className={cn(
                                "text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full border",
                                isLBB 
                                  ? "text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA]" 
                                  : "text-[#8B6E32] bg-[#F5F0E6] border-[#E5DDCF]"
                              )}>
                                {scrapedDataByBoat[boatIdx]?.itineraryDays?.length || (boat.duration?.includes('4') ? 4 : 3)} {isFrench ? 'Jours' : 'Days'}
                              </span>
                            </div>

                            {/* Route Map Image on Itinerary Tab (Unconstrained full natural size, responsive, zoomable) */}
                            {scrapedDataByBoat[boatIdx]?.itineraryMapImage && (
                              <div className="bg-white border border-[#E8E2D5] rounded-2xl p-3 sm:p-4 space-y-2.5 shadow-xs">
                                <div className="flex items-center justify-between">
                                  <div className={cn(
                                    "flex items-center gap-2 text-xs font-bold uppercase tracking-wider",
                                    isLBB ? "text-[#B91C1C]" : "text-[#1E40AF]"
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
                                    const mapImg = scrapedDataByBoat[boatIdx]?.itineraryMapImage;
                                    if (mapImg) {
                                      handleOpenImagePreview(
                                        [mapImg], 
                                        0, 
                                        boat.boatName, 
                                        isFrench ? "Carte de l'Itinéraire" : "Cruise Route Map",
                                        boatBaseUrl ? `${boatBaseUrl}${isLBB ? '#tab-itinraire' : '#tab-itinerary'}` : undefined
                                      );
                                    }
                                  }}
                                  className="w-full rounded-xl overflow-hidden border border-[#E8E2D5] bg-[#FAF9F5] shadow-2xs group cursor-zoom-in relative"
                                >
                                  <img
                                    src={getDisplayImageUrl(scrapedDataByBoat[boatIdx]!.itineraryMapImage!)}
                                    alt={isFrench ? `Carte de l'itinéraire ${boat.boatName}` : `Cruise route map ${boat.boatName}`}
                                    loading="lazy"
                                    className="w-full h-auto object-contain block group-hover:scale-[1.01] transition-transform duration-300"
                                  />
                                  <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[10px] font-semibold flex items-center gap-1 transition-all shadow-sm">
                                    <Maximize2 className="w-3 h-3" />
                                    <span>{isFrench ? "Plein écran" : "Full Screen"}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="space-y-3">
                              {(scrapedDataByBoat[boatIdx]?.itineraryDays || [
                                {
                                  dayNumber: 1,
                                  title: isFrench ? 'Labuan Bajo - Île de Kelor - Manjarite - Île de Kalong' : 'Labuan Bajo - Kelor Island - Manjarite - Kalong Island',
                                  destinations: ['Kelor Island', 'Manjarite Island', 'Kalong Island'],
                                  images: [
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Kelor-Island.webp',
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY1-Manjarite-Island.webp',
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
                                    'https://lebaliblog.com/wp-content/uploads/2024/01/DAY3-Kanawa-Island.webp'
                                  ],
                                  description: isFrench
                                    ? 'Dernière séance de snorkeling sur le récif de Kanawa Island, déjeuner à bord et navigation retour vers Labuan Bajo (arrivée 12h-13h) avec transfert à l\'hôtel ou à l\'aéroport.'
                                    : 'Morning reef snorkeling and white sand relaxation at Kanawa Island. Cruise back to Labuan Bajo with lunch onboard, arriving around 12:00-1:00 PM with hotel/airport transfer.'
                                }
                              ]).map((day) => (
                                <div key={day.dayNumber} className="bg-white border border-[#E8E2D5] rounded-2xl p-4 space-y-3 shadow-xs">
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border",
                                      isLBB 
                                        ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]" 
                                        : "bg-[#F5F0E6] text-[#8B6E32] border-[#E5DDCF]"
                                    )}>
                                      JOUR {day.dayNumber}
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
                                          className="relative aspect-video rounded-xl bg-muted overflow-hidden border border-[#E8E2D5] cursor-zoom-in group shadow-2xs"
                                        >
                                          <img src={getDisplayImageUrl(imgUrl)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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
                                    "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white text-xs font-bold tracking-wide shadow-sm transition-all cursor-pointer active:scale-[0.99]",
                                    isLBB ? "bg-[#B91C1C] hover:bg-[#991B1B]" : "bg-[#0F2231] hover:bg-[#1A344A]"
                                  )}
                                  title={isFrench ? "Ouvrir l'onglet d'itinéraire complet (#tab-itinraire)" : "Browse full official itinerary inside modal"}
                                >
                                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                                  <span>{isFrench ? 'Aperçu Direct de l\'Itinéraire (Modal)' : 'Direct Preview Itinerary (Modal)'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* TAB 3: INCLUSIONS & WHAT TO BRING (#tab-inclusions) */}
                        {activeBoatTab[boatIdx] === 'inclusions' && (
                          <div className="space-y-3.5">
                            {/* Inclusions */}
                            <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4.5 space-y-3 shadow-xs">
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
                                  <div key={i} className="flex items-start gap-2 bg-[#F0FDF4] p-2.5 rounded-xl border border-emerald-100">
                                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                    <span className="leading-snug text-[#134E4A] font-medium">{inc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* What to bring */}
                            <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4.5 space-y-3 shadow-xs">
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
                                  <div key={i} className="flex items-start gap-2 bg-[#FEFCE8] p-2.5 rounded-xl border border-amber-100">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#B8860B] shrink-0 mt-1.5" />
                                    <span className="leading-snug text-[#713F12] font-medium">{tip}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Exclusions */}
                            <div className="bg-white border border-[#E8E2D5] rounded-2xl p-4.5 space-y-3 shadow-xs">
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
                                  <div key={i} className="flex items-start gap-2 bg-[#FFF1F2] p-2.5 rounded-xl border border-rose-100">
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
                                    "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white text-xs font-bold tracking-wide shadow-sm transition-all cursor-pointer active:scale-[0.99]",
                                    isLBB ? "bg-[#B91C1C] hover:bg-[#991B1B]" : "bg-[#0F2231] hover:bg-[#1A344A]"
                                  )}
                                  title={isFrench ? "Ouvrir l'onglet d'inclusions complet (#tab-inclusions)" : "Browse full official inclusions & exclusions (#tab-inclusions) inside modal"}
                                >
                                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                                  <span>{isFrench ? 'Aperçu Direct des Inclusions (Modal)' : 'Direct Preview Inclusions (Modal)'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Bottom Alignment: Fuel Surcharge & Limited Service Note for this boat */}
                        {(boat.fuelSurcharge || boat.limitedServiceNote) && (
                          <div className="p-3.5 rounded-2xl bg-[#FEF9EE] border border-[#F0E4CE] space-y-1.5 text-xs">
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
              </div>
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
            {snapshot?.whatsappBusinessName || defaultBrandName} • {pageBrandIsLBB ? 'Lombok & Komodo' : 'Labuan Bajo, Flores'}
          </p>
        </footer>
      </main>

      {/* Sticky WhatsApp CTA */}
      <aside className={cn(
        isModal ? "sticky bottom-0" : "fixed bottom-0 left-0 right-0",
        "p-3.5 bg-white/95 backdrop-blur-md border-t border-[#E8E2D5] z-50 shadow-lg"
      )}>
        <div className={cn("mx-auto", contentMaxWidth)}>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full py-3.5 px-5 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm shadow-xl shadow-[#25D366]/25 transition-all active:scale-[0.98] cursor-pointer"
          >
            <MessageCircle className="w-5 h-5 fill-white shrink-0" />
            <span className="truncate">
              {snapshot?.whatsappCtaCaption || (isFrench ? "Demander pour ce bateau" : "Ask About This Boat")}
            </span>
          </a>
        </div>
      </aside>

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

              <div className="flex items-center gap-3 shrink-0">
                {previewModal.images.length > 1 && (
                  <span className="text-xs font-mono text-[#a69a84] bg-white/10 px-2.5 py-1 rounded-full border border-white/15">
                    {previewModal.activeIndex + 1} / {previewModal.images.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewModal(null)}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  aria-label="Close Preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Viewport */}
            <div 
              onClick={(e) => e.stopPropagation()}
              className="relative flex-1 flex items-center justify-center my-2 max-w-4xl mx-auto w-full min-h-0"
            >
              {(() => {
                const currentRaw = previewModal.images[previewModal.activeIndex] || '';
                const currentDisplay = getDisplayImageUrl(currentRaw);

                return (
                  <img
                    src={currentDisplay}
                    alt={`${previewModal.boatName} - ${previewModal.cabinName}`}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const thumb = getDriveThumbnailUrl(currentRaw);
                      if (thumb && e.currentTarget.src !== thumb) {
                        e.currentTarget.src = thumb;
                      }
                    }}
                    className="max-h-[75vh] max-w-full w-auto h-auto object-contain rounded-2xl shadow-2xl transition-all"
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
                      setPreviewModal(prev => {
                        if (!prev) return null;
                        const newIdx = prev.activeIndex === 0 ? prev.images.length - 1 : prev.activeIndex - 1;
                        return { ...prev, activeIndex: newIdx };
                      });
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/75 hover:bg-black/90 border border-white/20 text-white flex items-center justify-center transition-all shadow-xl cursor-pointer active:scale-90"
                    aria-label="Previous Image"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewModal(prev => {
                        if (!prev) return null;
                        const newIdx = prev.activeIndex === prev.images.length - 1 ? 0 : prev.activeIndex + 1;
                        return { ...prev, activeIndex: newIdx };
                      });
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/75 hover:bg-black/90 border border-white/20 text-white flex items-center justify-center transition-all shadow-xl cursor-pointer active:scale-90"
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
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-xs font-bold text-white transition-all cursor-pointer"
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
                className="px-5 py-2 rounded-xl bg-white text-[#0F2231] hover:bg-stone-100 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-md"
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
              className="relative w-full max-w-5xl h-[92vh] flex flex-col bg-white border border-[#E8E2D5] rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden"
            >
              {/* Header Bar */}
              {(() => {
                const isWebModalLBB = webModal.url.includes('lebaliblog.com') || pageBrandIsLBB;
                return (
                  <div className={cn(
                    "flex items-center justify-between px-4 py-3 border-b shrink-0 text-white",
                    isWebModalLBB ? "bg-[#881337] border-[#9F1239]" : "bg-[#0F2231] border-[#1A3347]"
                  )}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border",
                        isWebModalLBB 
                          ? "bg-rose-500/20 border-rose-400/30 text-rose-300" 
                          : "bg-amber-500/20 border-amber-500/30 text-amber-400"
                      )}>
                        <Globe className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate font-serif tracking-wide">
                            {webModal.boatName}
                          </span>
                          {webModal.cabinName && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white font-medium border border-white/15 truncate">
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
                        className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
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
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {isFrench ? 'Aperçu du Lien de Partage' : 'Share Link Customer Preview'}
            </span>
            <span className="text-[10px] font-mono text-[#a69a84] hidden sm:inline">
              (Live Simulation)
            </span>
          </div>

          {/* Viewport Simulation Switcher */}
          <div className="flex items-center bg-[#141210] p-0.5 rounded-xl border border-[#2e2a24]">
            <button
              type="button"
              onClick={() => setDeviceSimulation('mobile')}
              className={cn(
                "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
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
                "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
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
                "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
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
                className="p-1.5 sm:p-2 rounded-xl bg-[#201d1a] hover:bg-[#2e2a24] text-[#a69a84] hover:text-white transition-all cursor-pointer"
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
            deviceSimulation === 'tablet' && "w-[680px] max-h-[88vh] rounded-3xl border border-stone-700 shadow-2xl",
            deviceSimulation === 'desktop' && "w-full max-w-5xl max-h-[92vh] rounded-2xl border border-stone-800 shadow-2xl"
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
