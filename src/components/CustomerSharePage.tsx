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
import { copyFormattedToClipboard, formatTemplateToEmailHtml } from '../lib/utils';
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
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CustomerSharePageProps {
  shareId: string;
}

interface ImagePreviewState {
  isOpen: boolean;
  images: string[];
  activeIndex: number;
  boatName: string;
  cabinName: string;
  websiteUrl?: string;
}

export const CustomerSharePage: React.FC<CustomerSharePageProps> = ({ shareId }) => {
  const [snapshot, setSnapshot] = useState<ShareLinkSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_found' | 'network_error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Accordion State: index of expanded boat (default: 0 = first boat expanded)
  const [expandedBoatIndex, setExpandedBoatIndex] = useState<number>(0);

  // Cabin Carousel state per boat: map of boatIndex -> activeCabinIndex
  const [activeCabinByBoat, setActiveCabinByBoat] = useState<Record<number, number>>({});

  // Active image within cabin gallery: map of "boatIndex-cabinIndex" -> activeImageIndex
  const [activeImageByCabin, setActiveImageByCabin] = useState<Record<string, number>>({});

  // Image Preview Modal (Lightbox) state
  const [previewModal, setPreviewModal] = useState<ImagePreviewState | null>(null);

  // Copied feedback states
  const [copiedTemplateKey, setCopiedTemplateKey] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);

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

  // Handle keyboard events for image preview lightbox
  useEffect(() => {
    if (!previewModal?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewModal(null);
      } else if (e.key === 'ArrowLeft' && previewModal.images.length > 1) {
        setPreviewModal(prev => {
          if (!prev) return null;
          const newIdx = prev.activeIndex === 0 ? prev.images.length - 1 : prev.activeIndex - 1;
          return { ...prev, activeIndex: newIdx };
        });
      } else if (e.key === 'ArrowRight' && previewModal.images.length > 1) {
        setPreviewModal(prev => {
          if (!prev) return null;
          const newIdx = prev.activeIndex === prev.images.length - 1 ? 0 : prev.activeIndex + 1;
          return { ...prev, activeIndex: newIdx };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewModal]);

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

  // Loading skeleton view
  if (loading) {
    return (
      <div className="min-h-screen bg-[#181614] text-[#f0e9dc] flex flex-col items-center justify-center p-6 select-none">
        <div className="w-12 h-12 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
        <p className="font-serif italic text-lg tracking-wide text-[#a69a84]">
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
      <div className="min-h-screen bg-[#181614] text-[#f0e9dc] flex flex-col items-center justify-center p-6 selection:bg-[#2d261e]">
        <div className="w-full max-w-md bg-[#201d1a] border border-[#2e2a24] rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
            <RefreshCw className="w-8 h-8 text-amber-400" />
          </div>

          <h1 className="text-2xl font-serif font-bold text-[#f0e9dc] mb-3">
            {isFrench ? "Problème de connexion" : "Connection Issue"}
          </h1>

          <p className="text-sm text-[#a69a84] leading-relaxed mb-6">
            {isFrench 
              ? "Impossible de charger les disponibilités en direct pour le moment. Veuillez vérifier votre connexion internet et appuyer sur Réessayer."
              : "We couldn't retrieve live cabin availability right now. Please check your mobile internet connection and tap retry."}
          </p>

          <div className="space-y-3">
            <button
              onClick={() => loadData()}
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{isFrench ? "Réessayer" : "Tap to Retry"}</span>
            </button>

            {fallbackWaLink && (
              <a
                href={fallbackWaLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 w-full py-3 px-6 rounded-2xl bg-[#201d1a] hover:bg-[#282420] border border-[#2e2a24] text-[#f0e9dc] font-medium text-xs transition-all"
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
      <div className="min-h-screen bg-[#181614] text-[#f0e9dc] flex flex-col items-center justify-center p-6 selection:bg-[#2d261e]">
        <div className="w-full max-w-md bg-[#201d1a] border border-[#2e2a24] rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-stone-500/10 border border-stone-500/20 flex items-center justify-center mx-auto mb-6">
            <Ship className="w-8 h-8 text-amber-400/80" />
          </div>

          <h1 className="text-2xl font-serif font-bold text-[#f0e9dc] mb-3">
            {isFrench ? "Lien de disponibilité introuvable" : "Availability Link Not Found"}
          </h1>

          <p className="text-sm text-[#a69a84] leading-relaxed mb-6">
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
      <div className="min-h-screen bg-[#181614] text-[#f0e9dc] flex flex-col items-center justify-center p-6 selection:bg-[#2d261e]">
        <div className="w-full max-w-md bg-[#201d1a] border border-[#2e2a24] rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-8 h-8 text-amber-400" />
          </div>

          <h1 className="text-2xl font-serif font-bold text-[#f0e9dc] mb-3">
            {isFrench ? "Lien de disponibilité clos" : "Availability Link Inactive"}
          </h1>

          <p className="text-sm text-[#a69a84] leading-relaxed mb-6">
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
    const expiryStr = formatExpiryDate(snapshot.expiresAt);

    return (
      <div className="min-h-screen bg-[#181614] text-[#f0e9dc] flex flex-col items-center justify-center p-6 selection:bg-[#2d261e]">
        <div className="w-full max-w-md bg-[#201d1a] border border-[#2e2a24] rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>

          <h1 className="text-2xl font-serif font-bold text-[#f0e9dc] mb-3">
            {isFrench ? "Lien de disponibilité expiré" : "Availability Link Expired"}
          </h1>

          <p className="text-sm text-[#a69a84] leading-relaxed mb-6">
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
              <span>{isFrench ? "Contacter notre équipe sur WhatsApp" : "Contact Our Team on WhatsApp"}</span>
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
    ? buildDynamicWhatsAppMessage(currentBoat.boatName, currentCabinName, currentBoat.dates, snapshot.language)
    : (snapshot.whatsappMessage || 'Hello, I would like to inquire about cabin availability.');

  const whatsappHref = buildWhatsAppLink(snapshot.whatsappNumber, dynamicMessage);

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

  return (
    <div className="min-h-screen bg-[#181614] text-[#f0e9dc] pb-32 antialiased selection:bg-amber-500/20 overflow-x-hidden">
      {/* Top Header Bar */}
      <header className="border-b border-[#2e2a24] bg-[#201d1a]/85 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Ship className="w-4 h-4 text-amber-300" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#a69a84] block truncate leading-tight">
                {snapshot.whatsappBusinessName || (isFrench ? 'Croisière Indonésie' : 'Komodo Cruise')}
              </span>
              <span className="text-[9px] text-[#a69a84]/70 font-mono block">
                {isFrench ? 'Disponibilité en direct' : 'Live Availability'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-wider uppercase shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{isFrench ? 'Vérifié' : 'Active'}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-md mx-auto px-4 pt-5 space-y-4">
        {/* Section Title */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-amber-400/90 text-xs font-bold uppercase tracking-[0.2em]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isFrench ? 'Bateaux Disponibles' : 'Available Cabins'}</span>
          </div>
          <span className="text-[10px] font-mono text-[#a69a84]/80">
            {boats.length} {boats.length === 1 ? (isFrench ? 'Bateau' : 'Boat') : (isFrench ? 'Bateaux' : 'Boats')}
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

            // Cabin Gallery images
            const galleryKey = `${boatIdx}-${activeCabinIndex}`;
            const activeImgIdx = activeImageByCabin[galleryKey] || 0;
            const cabinImages = activeCabin 
              ? ((activeCabin.images && activeCabin.images.length > 0) 
                  ? activeCabin.images 
                  : (activeCabin.imageUrl ? [activeCabin.imageUrl] : []))
              : [];
            
            const hash = Math.abs(
              (boat.boatName + (activeCabin?.id || activeCabin?.name || 'cabin')).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
            );
            const fallbackYacht = FALLBACK_CABIN_IMAGES[hash % FALLBACK_CABIN_IMAGES.length];
            const rawImgUrl = cabinImages[activeImgIdx] || activeCabin?.imageUrl || fallbackYacht;
            const currentImgDisplayUrl = getDisplayImageUrl(rawImgUrl);

            return (
              <div
                key={`${boat.boatName}-${boatIdx}`}
                className="bg-[#201d1a] border border-[#2e2a24] rounded-3xl overflow-hidden shadow-lg transition-all"
              >
                {/* 1. Boat Accordion Header */}
                <button
                  type="button"
                  onClick={() => handleToggleBoat(boatIdx)}
                  className="w-full text-left p-4.5 flex items-center justify-between gap-3 hover:bg-[#25211e] transition-colors cursor-pointer select-none"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 text-xs font-mono">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      <h2 className="text-lg font-serif font-bold text-[#f0e9dc] tracking-tight truncate">
                        {boat.boatName}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[#a69a84] font-medium pl-4">
                      {boat.duration && (
                        <span className="font-semibold text-amber-400/90">{boat.duration}</span>
                      )}
                      {boat.duration && boat.dates && <span>·</span>}
                      {boat.dates && <span>{boat.dates}</span>}
                    </div>

                    <div className="text-[10px] text-[#a69a84]/70 pl-4 font-mono">
                      {cabinList.length} {cabinList.length === 1 
                        ? (isFrench ? 'cabine disponible' : 'available cabin') 
                        : (isFrench ? 'cabines disponibles' : 'available cabins')}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-[#181614] border border-[#2e2a24] text-[#a69a84] shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-amber-400" />
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
                      className="overflow-hidden border-t border-[#2e2a24]"
                    >
                      <div className="p-4 space-y-4 bg-[#1a1715]">
                        {/* Swipeable Cabin Carousel with Image Preview */}
                        {activeCabin && (
                          <div 
                            className="space-y-3.5"
                            onTouchStart={handleTouchStart}
                            onTouchEnd={(e) => handleTouchEnd(e, boatIdx, cabinList.length)}
                          >
                            {/* Carousel Top Navigation Bar */}
                            {hasMultipleCabins && (
                              <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#a69a84]">
                                  {isFrench ? 'Glisser pour changer de cabine' : 'Swipe to browse cabins'}
                                </span>
                                <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-400 font-semibold bg-[#201d1a] px-2.5 py-0.5 rounded-full border border-[#2e2a24]">
                                  <span>{activeCabinIndex + 1}</span>
                                  <span className="text-[#a69a84]">/</span>
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
                                    activeImgIdx,
                                    boat.boatName,
                                    cabinVal,
                                    activeCabin.websiteUrl
                                  );
                                }
                              }}
                              className="relative aspect-[16/10] w-full rounded-2xl bg-[#181614] overflow-hidden border border-[#2e2a24] shadow-md group cursor-zoom-in select-none"
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
                                    if (fallbackThumb && e.currentTarget.src !== fallbackThumb) {
                                      e.currentTarget.src = fallbackThumb;
                                    }
                                  }}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-[#a69a84]/40 p-6 text-center">
                                  <Ship className="w-10 h-10 mb-2 opacity-30" />
                                  <span className="text-xs">{activeCabin.name}</span>
                                </div>
                              )}

                              {/* Subtle vignette overlay */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />

                              {/* Preview Badge Pill Top Right */}
                              {currentImgDisplayUrl && (
                                <div className="absolute top-2.5 right-2.5 z-10">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenImagePreview(
                                        cabinImages.length > 0 ? cabinImages : [currentImgDisplayUrl],
                                        activeImgIdx,
                                        boat.boatName,
                                        cabinVal,
                                        activeCabin.websiteUrl
                                      );
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium shadow-lg transition-transform active:scale-95 cursor-pointer"
                                  >
                                    <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
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
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 border border-white/15 text-white flex items-center justify-center transition-all active:scale-90 shadow-lg cursor-pointer z-10"
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
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 border border-white/15 text-white flex items-center justify-center transition-all active:scale-90 shadow-lg cursor-pointer z-10"
                                    aria-label="Next Cabin"
                                  >
                                    <ChevronRight className="w-5 h-5" />
                                  </button>
                                </>
                              )}

                              {/* Cabin Count Badge (Bottom Left) - NO PRICE BADGE */}
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
                                        ? 'w-6 bg-amber-400 shadow-sm shadow-amber-400/30' 
                                        : 'w-2 bg-[#2e2a24] hover:bg-[#3e3831]'
                                    }`}
                                    aria-label={`Go to slide ${dotIdx + 1}`}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Dynamic Output Template Below Image */}
                            <div className="rounded-2xl bg-[#201d1a] border border-[#2e2a24] p-4 space-y-3.5 shadow-sm relative overflow-hidden">
                              {/* Top Bar with Copy All Button */}
                              <div className="flex items-center justify-between pb-2 border-b border-[#2e2a24]">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a69a84]">
                                  {isFrench ? 'Détails du Séjour' : 'Cruise Specifications'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyTemplateText(fullTemplateText, `tmpl-${boatIdx}-${activeCabinIndex}`)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#181614] hover:bg-[#282420] border border-[#2e2a24] text-[10px] font-semibold text-[#a69a84] hover:text-[#f0e9dc] transition-all cursor-pointer active:scale-95"
                                  title={isFrench ? "Copier le texte complet" : "Copy full itinerary text"}
                                >
                                  {copiedTemplateKey === `tmpl-${boatIdx}-${activeCabinIndex}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">{isFrench ? 'Copié' : 'Copied'}</span>
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
                                  <span className="text-[#a69a84] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans">
                                    {itineraryLabel} :
                                  </span>
                                  <span className="text-[#f0e9dc] font-medium break-words flex-1">
                                    {itineraryVal}
                                  </span>
                                </div>

                                {/* Dates */}
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[#a69a84] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans">
                                    {datesLabel} :
                                  </span>
                                  <span className="text-amber-300 font-semibold break-words flex-1">
                                    {datesVal}
                                  </span>
                                </div>

                                {/* Departure */}
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[#a69a84] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans">
                                    {departureLabel} :
                                  </span>
                                  <span className="text-[#f0e9dc] font-medium break-words flex-1">
                                    {departureVal}
                                  </span>
                                </div>

                                {/* Boat */}
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[#a69a84] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans">
                                    {boatLabel} :
                                  </span>
                                  <span className="text-[#f0e9dc] font-bold break-words flex-1 tracking-wide">
                                    {boatVal}
                                  </span>
                                </div>

                                {/* Cabin (Dynamic following the active image) */}
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[#a69a84] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans">
                                    {cabinLabel} :
                                  </span>
                                  <span className="text-amber-400 font-bold break-words flex-1">
                                    {cabinVal}
                                  </span>
                                </div>

                                {/* Detail Link (Dynamic following the active cabin) */}
                                {detailVal ? (
                                  <div className="flex items-start gap-2 pt-1">
                                    <span className="text-[#a69a84] font-semibold w-24 shrink-0 text-[11px] uppercase tracking-wider font-sans mt-0.5">
                                      {detailLabel} :
                                    </span>
                                    <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                                      <a
                                        href={detailVal}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-amber-400/90 hover:text-amber-300 underline underline-offset-2 break-all text-xs font-mono inline-flex items-center gap-1 group/link"
                                      >
                                        <span>{detailVal}</span>
                                        <ExternalLink className="w-3 h-3 shrink-0 opacity-70 group-hover/link:opacity-100 transition-opacity" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyLink(detailVal, `link-${boatIdx}-${activeCabinIndex}`)}
                                        className="p-1 rounded bg-[#181614] hover:bg-[#282420] border border-[#2e2a24] text-[#a69a84] hover:text-[#f0e9dc] transition-all cursor-pointer"
                                        title={isFrench ? "Copier le lien de la cabine" : "Copy cabin link"}
                                      >
                                        {copiedLinkKey === `link-${boatIdx}-${activeCabinIndex}` ? (
                                          <Check className="w-3 h-3 text-emerald-400" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-baseline gap-2 pt-1 text-[11px] text-[#a69a84]/60 italic font-sans">
                                    <span className="text-[#a69a84] font-semibold w-24 shrink-0 uppercase tracking-wider font-sans">
                                      {detailLabel} :
                                    </span>
                                    <span>{isFrench ? 'Réservation directe via WhatsApp' : 'Direct booking via WhatsApp'}</span>
                                  </div>
                                )}
                              </div>

                              {/* Action: Open Cabin Webpage Button */}
                              {detailVal && (
                                <div className="pt-2 border-t border-[#2e2a24]/80">
                                  <a
                                    href={detailVal}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-[#181614] hover:bg-[#282420] border border-[#2e2a24] hover:border-amber-400/40 text-xs font-semibold text-[#f0e9dc] transition-all group/btn cursor-pointer shadow-sm active:scale-[0.99]"
                                  >
                                    <ExternalLink className="w-4 h-4 text-amber-400 group-hover/btn:translate-x-0.5 transition-transform" />
                                    <span>
                                      {isFrench ? 'Voir la cabine sur le site officiel' : 'View Cabin Details on Website'}
                                    </span>
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Bottom Alignment: Fuel Surcharge & Limited Service Note for this boat */}
                        {(boat.fuelSurcharge || boat.limitedServiceNote) && (
                          <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1.5 text-xs">
                            <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase tracking-wider text-[10px]">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{isFrench ? 'Notes & Carburant' : 'Notes & Surcharges'}</span>
                            </div>
                            {boat.fuelSurcharge && (
                              <p className="text-xs text-[#f0e9dc]">
                                <span className="font-semibold text-amber-300">⛽ {isFrench ? 'Surcharge Carburant :' : 'Fuel Surcharge:'}</span> {boat.fuelSurcharge}
                              </p>
                            )}
                            {boat.limitedServiceNote && (
                              <p className="text-[11px] text-[#a69a84] italic leading-relaxed">
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
          <div className="flex items-center justify-center gap-1.5 text-xs text-[#a69a84]/80">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {isFrench 
                ? 'Options préparées spécialement pour votre demande' 
                : 'Curated availability tailored for your inquiry'}
            </span>
          </div>
          <p className="text-[10px] text-[#a69a84]/50">
            {snapshot.whatsappBusinessName || 'Cruise Reservation Services'} • Komodo National Park
          </p>
        </footer>
      </main>

      {/* Sticky WhatsApp CTA */}
      <aside className="fixed bottom-0 left-0 right-0 p-3.5 bg-[#181614]/95 backdrop-blur-md border-t border-[#2e2a24] z-50">
        <div className="max-w-md mx-auto">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full py-3.5 px-5 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm shadow-xl shadow-[#25D366]/25 transition-all active:scale-[0.98] cursor-pointer"
          >
            <MessageCircle className="w-5 h-5 fill-white shrink-0" />
            <span className="truncate">
              {snapshot.whatsappCtaCaption || (isFrench ? "Demander pour ce bateau" : "Ask About This Boat")}
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
                <a
                  href={previewModal.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white transition-all cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-amber-400" />
                  <span>{isFrench ? 'Site officiel' : 'Official Page'}</span>
                </a>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all cursor-pointer active:scale-95"
              >
                {isFrench ? 'Fermer' : 'Close'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
