import React, { useMemo, useState } from 'react';
import { useStore, DriveFile, Cabin } from '../store';
import { cn, copyImageToClipboard } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Copy, 
  Check, 
  ExternalLink, 
  Maximize2, 
  FileImage, 
  Anchor, 
  Calendar, 
  Compass, 
  Link2 
} from 'lucide-react';
import { createPortal } from 'react-dom';

const removeAccents = (str: string): string => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const getDisplayImageUrl = (urlOrId: string): string => {
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
};

const getDriveFileId = (url: string): string | null => {
  if (!url) return null;
  const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/);
  if (fileDMatch && fileDMatch[1]) {
    return fileDMatch[1];
  }
  const idParamMatch = url.match(/[&?]id=([a-zA-Z0-9_-]{25,50})/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }
  return null;
};

export const LivePreviewPanel: React.FC = () => {
  const { 
    boats, 
    tabs, 
    activeTabId, 
    livePreviewEnabled, 
    setLivePreviewEnabled, 
    selectedLiveFile, 
    setSelectedLiveFile, 
    displayedFiles 
  } = useStore();

  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const selectedBoatName = activeTab.selectedBoatName || '';
  const language = activeTab.language || 'ENG';

  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState<boolean>(false);
  const [fullscreenCopyFeedback, setFullscreenCopyFeedback] = useState<boolean>(false);

  const selectedBoat = useMemo(() => {
    return boats.find(b => b.name === selectedBoatName);
  }, [boats, selectedBoatName]);

  // Match current live file to a cabin on the selected boat
  const activeCabin = useMemo(() => {
    if (!selectedLiveFile || !selectedBoat) return null;
    const fileNameLower = removeAccents(selectedLiveFile.name || '').toLowerCase();
    
    return selectedBoat.cabins.find(cabin => {
      const cabinNameLower = removeAccents(language === 'ENG' && cabin.nameEng ? cabin.nameEng : cabin.name).toLowerCase();
      const cabinNameOrigLower = removeAccents(cabin.name || '').toLowerCase();
      const cabinNameEngLower = removeAccents(cabin.nameEng || '').toLowerCase();

      // Check if fileName contains cabin name
      if (fileNameLower.includes(cabinNameLower) || 
          fileNameLower.includes(cabinNameOrigLower) || 
          (cabinNameEngLower && fileNameLower.includes(cabinNameEngLower))) {
        return true;
      }
      
      // Match based on cabin link references matching the file ID/URL
      const driveId = getDriveFileId(selectedLiveFile.id) || selectedLiveFile.id;
      const matchesLink = (linkStr: string | undefined): boolean => {
        if (!linkStr) return false;
        const cleanLink = linkStr.trim();
        if (['no', 'n/a', 'non', ''].includes(cleanLink.toLowerCase())) return false;
        if (cleanLink.includes(driveId) || driveId.includes(cleanLink)) return true;
        const cabinDriveId = getDriveFileId(cleanLink);
        if (cabinDriveId && cabinDriveId === driveId) return true;
        return false;
      };

      if (matchesLink(cabin.link) || matchesLink(cabin.linkEng)) {
        return true;
      }

      return false;
    });
  }, [selectedLiveFile, selectedBoat, language]);

  const handleCopyImage = async (file: DriveFile) => {
    const result = await copyImageToClipboard(file.id);
    if (result === 'IMAGE') {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  const handleCopyImageFullscreen = async (file: DriveFile) => {
    const result = await copyImageToClipboard(file.id);
    if (result === 'IMAGE') {
      setFullscreenCopyFeedback(true);
      setTimeout(() => setFullscreenCopyFeedback(false), 2000);
    }
  };

  const handlePrev = () => {
    if (displayedFiles.length <= 1 || !selectedLiveFile) return;
    const idx = displayedFiles.findIndex(f => f.id === selectedLiveFile.id);
    if (idx > 0) {
      setSelectedLiveFile(displayedFiles[idx - 1]);
    } else {
      setSelectedLiveFile(displayedFiles[displayedFiles.length - 1]);
    }
  };

  const handleNext = () => {
    if (displayedFiles.length <= 1 || !selectedLiveFile) return;
    const idx = displayedFiles.findIndex(f => f.id === selectedLiveFile.id);
    if (idx !== -1 && idx < displayedFiles.length - 1) {
      setSelectedLiveFile(displayedFiles[idx + 1]);
    } else {
      setSelectedLiveFile(displayedFiles[0]);
    }
  };

  if (!livePreviewEnabled) return null;

  const currentIndex = selectedLiveFile 
    ? displayedFiles.findIndex(f => f.id === selectedLiveFile.id) 
    : -1;

  return (
    <div className="h-full flex flex-col border border-border bg-card rounded-3xl overflow-hidden shadow-lg transition-all duration-300 text-left bg-gradient-to-b from-card to-card/95">
      {/* Header */}
      <div className="px-5 py-4 bg-muted/40 border-b border-border flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate font-sans">
            {language === 'FR' ? "Grand Aperçu Actif" : "Active Live Preview"}
          </span>
        </div>
        <button
          onClick={() => setLivePreviewEnabled(false)}
          className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
          title="Close Live Preview"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body container */}
      {selectedLiveFile ? (
        <div className="flex-1 flex flex-col min-h-0 p-5 gap-5 overflow-y-auto custom-scrollbar">
          
          {/* Main Visual Frame with Chevrons */}
          <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden border border-border bg-stone-900/80 dark:bg-black/40 flex items-center justify-center group shadow-sm shrink-0">
            <AnimatePresence mode="wait">
              <motion.img
                key={selectedLiveFile.id}
                src={getDisplayImageUrl(selectedLiveFile.id)}
                alt={selectedLiveFile.name}
                referrerPolicy="no-referrer"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="max-w-full max-h-full object-contain"
              />
            </AnimatePresence>

            {/* Navigation Chevron Left */}
            {displayedFiles.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrev();
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/85 text-white flex items-center justify-center transition-all shadow-md border border-white/10 opacity-70 hover:opacity-100 cursor-pointer active:scale-95"
                  title="Previous Image"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Navigation Chevron Right */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNext();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/85 text-white flex items-center justify-center transition-all shadow-md border border-white/10 opacity-70 hover:opacity-100 cursor-pointer active:scale-95"
                  title="Next Image"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Pagination Carousel Dots */}
          {displayedFiles.length > 1 && (
            <div className="flex flex-wrap justify-center gap-1.5 shrink-0 px-2">
              {displayedFiles.map((file, idx) => (
                <button
                  key={file.id}
                  onClick={() => setSelectedLiveFile(file)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-200 cursor-pointer",
                    idx === currentIndex 
                      ? "bg-primary scale-125 w-4" 
                      : "bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  )}
                  title={`Go to image ${idx + 1}`}
                />
              ))}
            </div>
          )}

          {/* Cabin Information Details */}
          <div className="flex-1 flex flex-col justify-between space-y-6">
            
            {/* Header Identity & Metadata */}
            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-primary block">
                  {activeCabin ? (language === 'FR' ? "CABINE ASSOCIÉE" : "ASSOCIATED CABIN") : (language === 'FR' ? "FICHIER SÉLECTIONNÉ" : "SELECTED FILE")}
                </span>
                <h2 className="text-xl font-serif font-bold tracking-tight text-foreground">
                  {activeCabin 
                    ? (language === 'ENG' && activeCabin.nameEng ? activeCabin.nameEng : activeCabin.name) 
                    : selectedLiveFile.name
                  }
                </h2>
                {activeCabin && (
                  <p className="text-[10px] text-muted-foreground font-mono leading-none">
                    {selectedLiveFile.name}
                  </p>
                )}
              </div>

              {/* Dynamic Cabin Meta info like Itinerary, Departure, Schedule */}
              {activeCabin && (
                <div className="space-y-3 pt-2">
                  
                  {/* Schedule */}
                  {(activeCabin.schedule || activeCabin.scheduleEng) && (
                    <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                      <Calendar className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider font-extrabold text-foreground/75 block">
                          {language === 'FR' ? "Calendrier / Durée" : "Schedule / Duration"}
                        </span>
                        <p className="text-foreground leading-snug">
                          {language === 'ENG' && activeCabin.scheduleEng ? activeCabin.scheduleEng : activeCabin.schedule}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Departure */}
                  {(activeCabin.departure || activeCabin.departureEng) && (
                    <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                      <Anchor className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider font-extrabold text-foreground/75 block">
                          {language === 'FR' ? "Départ / Destination" : "Departure / Route"}
                        </span>
                        <p className="text-foreground leading-snug">
                          {language === 'ENG' && activeCabin.departureEng ? activeCabin.departureEng : activeCabin.departure}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Itinerary Details */}
                  {(activeCabin.itinerary || activeCabin.itineraryEng) && (
                    <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                      <Compass className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider font-extrabold text-foreground/75 block">
                          {language === 'FR' ? "Itinéraire & Détails" : "Itinerary & Details"}
                        </span>
                        <p className="text-foreground leading-relaxed whitespace-pre-line text-[11px] bg-muted/30 p-2.5 rounded-xl border border-border/30">
                          {language === 'ENG' && activeCabin.itineraryEng ? activeCabin.itineraryEng : activeCabin.itinerary}
                        </p>
                      </div>
                    </div>
                  )}
                  
                </div>
              )}
            </div>

            {/* Actions Buttons at the very bottom */}
            <div className="pt-4 border-t border-border flex gap-2 shrink-0">
              <button
                onClick={() => handleCopyImage(selectedLiveFile)}
                className={cn(
                  "flex-1 h-10 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                  copyFeedback 
                    ? "bg-green-600 border-green-600 text-white" 
                    : "bg-background border-border text-foreground hover:bg-muted"
                )}
              >
                {copyFeedback ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {language === 'FR' ? "COPIÉ !" : "COPIED!"}
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    {language === 'FR' ? "COPIER L'IMAGE" : "COPY IMAGE"}
                  </>
                )}
              </button>

              <button
                onClick={() => setIsFullscreenOpen(true)}
                className="h-10 w-10 shrink-0 rounded-xl bg-secondary hover:bg-secondary/85 text-secondary-foreground transition-all cursor-pointer flex items-center justify-center border border-transparent active:scale-95"
                title={language === 'FR' ? "Agrandir l'image" : "Fullscreen image"}
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  const url = selectedLiveFile.webViewLink || `https://drive.google.com/open?id=${selectedLiveFile.id}`;
                  window.open(url, '_blank', 'noreferrer,noopener');
                }}
                className="h-10 w-10 shrink-0 rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-all cursor-pointer flex items-center justify-center border border-border/40 active:scale-95"
                title={language === 'FR' ? "Ouvrir sur Google Drive" : "Open on Google Drive"}
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <FileImage className="w-12 h-12 opacity-35 mb-4" />
          <p className="text-sm font-semibold">
            {language === 'FR' ? "Aucune image sélectionnée" : "No image selected"}
          </p>
          <p className="text-xs opacity-75 mt-1 max-w-[200px]">
            {language === 'FR' ? "Veuillez sélectionner une image dans la galerie." : "Please click on an image in the gallery to preview."}
          </p>
        </div>
      )}

      {/* Fullscreen Modal View */}
      {isFullscreenOpen && selectedLiveFile && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 md:p-10 bg-black/95 backdrop-blur-sm select-none"
            onClick={() => setIsFullscreenOpen(false)}
          >
            {/* Close button */}
            <button
              onClick={() => setIsFullscreenOpen(false)}
              className="absolute top-6 right-6 p-3 rounded-full bg-black/50 hover:bg-black/85 border border-white/20 text-white transition-all cursor-pointer shadow-lg z-50 flex items-center justify-center"
              title="Close Preview (Esc)"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Modal Image Wrapper */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-5xl max-h-[85vh] bg-card rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative flex-1 bg-black/40 overflow-hidden flex items-center justify-center min-h-[300px] max-h-[70vh] p-4">
                <img
                  src={getDisplayImageUrl(selectedLiveFile.id)}
                  alt={selectedLiveFile.name}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[65vh] object-contain rounded-2xl select-none shadow-md border border-white/5"
                />
              </div>

              {/* Details & Actions Footer */}
              <div className="p-5 bg-card border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0 space-y-1 text-left">
                  <span className="text-[9px] font-black tracking-widest text-muted-foreground uppercase">
                    {language === 'FR' ? "Aperçu Plein Écran" : "Fullscreen Preview"}
                  </span>
                  <p className="text-base font-bold text-foreground truncate">{selectedLiveFile.name}</p>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyImageFullscreen(selectedLiveFile)}
                    className={cn(
                      "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer border shadow-xs",
                      fullscreenCopyFeedback 
                        ? "bg-green-600 border-green-600 text-white" 
                        : "bg-primary text-primary-foreground border-primary hover:bg-primary/95"
                    )}
                  >
                    {fullscreenCopyFeedback ? (
                      <>
                        <Check className="w-4 h-4" />
                        {language === 'FR' ? "COPIÉ !" : "COPIED!"}
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        {language === 'FR' ? "COPIER L'IMAGE" : "COPY IMAGE"}
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      const url = selectedLiveFile.webViewLink || `https://drive.google.com/open?id=${selectedLiveFile.id}`;
                      window.open(url, '_blank', 'noreferrer,noopener');
                    }}
                    className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all cursor-pointer border border-border"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Google Drive
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
