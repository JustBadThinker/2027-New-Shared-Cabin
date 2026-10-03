import React, { useState, useEffect, useMemo } from 'react';
import { useStore, Cabin, Boat, SavedNote } from '../store';
import { 
  WhatsAppConfig, 
  ShareLinkSnapshot, 
  CabinSnapshot, 
  BoatSnapshot,
  DEFAULT_WHATSAPP_CONFIG 
} from '../types/share';
import { 
  generateShareId, 
  getWhatsAppConfig, 
  validateWhatsAppNumber,
  resolveCabinImageUrl, 
  resolveCabinImages,
  extractCabinFeatures,
  getCleanWebsiteUrl, 
  buildWhatsAppMessage, 
  createShareLinkSnapshot,
  buildWhatsAppLink,
  parseNoteToBoatSnapshot,
  getWiredImages,
  getPublicShareUrl,
  sanitizeForFirestore
} from '../lib/shareService';
import { copyTextToClipboard, translateDate } from '../lib/utils';
import { 
  Link2, 
  Check, 
  Copy, 
  ExternalLink, 
  MessageCircle, 
  Calendar, 
  Ship, 
  Users, 
  Clock, 
  X, 
  AlertCircle, 
  Sparkles,
  ArrowRight,
  Settings,
  Bookmark,
  CheckSquare,
  Square,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWhatsAppConfig: () => void;
  onOpenManager: () => void;
  initialSource?: 'notepad' | 'editor';
}

export interface AvailableBoatItem {
  id: string;
  source: 'notepad' | 'editor';
  sourceTitle: string;
  snapshot: BoatSnapshot;
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  isOpen,
  onClose,
  onOpenWhatsAppConfig,
  onOpenManager,
  initialSource
}) => {
  const { 
    boats, 
    tabs, 
    activeTabId, 
    kicFiles, 
    lebaliblogFiles,
    savedNotes 
  } = useStore();

  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const { 
    selectedBoatName, 
    selectedCabinIds = [], 
    dates = '', 
    language = 'ENG',
    mode = 'CABIN',
    linkPreference = 'AUTO',
    cabinSelections = {},
    showLimitedServiceNote = true
  } = activeTab;

  const selectedBoat = boats.find(b => b.name === selectedBoatName);
  const selectedCabins = selectedBoat?.cabins.filter(c => (selectedCabinIds || []).includes(c.id)) || [];

  // Build selectable boat items ONLY from Stored Boats
  const availableBoatItems = useMemo<AvailableBoatItem[]>(() => {
    const items: AvailableBoatItem[] = [];

    // Boats exclusively from Stored Boats
    savedNotes.forEach((note) => {
      const parsed = parseNoteToBoatSnapshot(note, boats, kicFiles, lebaliblogFiles);
      if (parsed && parsed.cabins && parsed.cabins.length > 0) {
        items.push({
          id: `note-${note.id}`,
          source: 'notepad',
          sourceTitle: note.clientName ? `Stored Boat (${note.clientName})` : 'Stored Boat',
          snapshot: parsed
        });
      }
    });

    return items;
  }, [savedNotes, boats, kicFiles, lebaliblogFiles]);

  const [selectedBoatIds, setSelectedBoatIds] = useState<string[]>([]);
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig>(DEFAULT_WHATSAPP_CONFIG);
  const [durationDays, setDurationDays] = useState<number>(3);
  const [ctaCaption, setCtaCaption] = useState<string>('Ask About This Boat');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for WhatsApp configuration broadcasts
  useEffect(() => {
    const handleConfigUpdated = (e: any) => {
      if (e.detail) {
        setWhatsappConfig(e.detail);
        if (e.detail.defaultCaption) setCtaCaption(e.detail.defaultCaption);
      }
    };
    window.addEventListener('whatsapp-config-updated', handleConfigUpdated);
    return () => window.removeEventListener('whatsapp-config-updated', handleConfigUpdated);
  }, []);

  // Initialize selection when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setGeneratedLink(null);
    setCopied(false);

    // Pre-select boats:
    // If there are notepad boats, select ALL notepad boats!
    // Otherwise select all available items.
    const notepadIds = availableBoatItems.filter(it => it.source === 'notepad').map(it => it.id);
    if (notepadIds.length > 0 && initialSource !== 'editor') {
      setSelectedBoatIds(notepadIds);
    } else if (availableBoatItems.length > 0) {
      setSelectedBoatIds(availableBoatItems.map(it => it.id));
    } else {
      setSelectedBoatIds([]);
    }

    getWhatsAppConfig().then((cfg) => {
      setWhatsappConfig(cfg);
      setDurationDays(cfg.defaultDurationDays || 3);
      const defaultCaption = cfg.defaultCaption || (language === 'FR' ? 'Demander pour ce bateau' : 'Ask About This Boat');
      setCtaCaption(defaultCaption);

      // Precompute initial WhatsApp message from first selected boat
      const firstItem = availableBoatItems[0];
      if (firstItem) {
        const msg = buildWhatsAppMessage(
          firstItem.snapshot.boatName,
          firstItem.snapshot.cabins,
          firstItem.snapshot.dates,
          language
        );
        setCustomMessage(msg);
      }
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const isWhatsAppConfigured = Boolean(whatsappConfig.number && validateWhatsAppNumber(whatsappConfig.number).isValid);

  const selectedItems = availableBoatItems.filter(it => selectedBoatIds.includes(it.id));
  const totalCabinsCount = selectedItems.reduce((acc, it) => acc + (it.snapshot.cabins?.length || 0), 0);

  const handleToggleBoat = (id: string) => {
    setSelectedBoatIds(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id) 
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedBoatIds(availableBoatItems.map(it => it.id));
  };

  const handleDeselectAll = () => {
    setSelectedBoatIds([]);
  };

  const handleSelectNotepadOnly = () => {
    setSelectedBoatIds(availableBoatItems.filter(it => it.source === 'notepad').map(it => it.id));
  };

  const handleGenerate = async () => {
    setError(null);

    const validation = validateWhatsAppNumber(whatsappConfig.number);
    if (!validation.isValid) {
      setError('A registered WhatsApp number is required before generating a share link. Please configure your WhatsApp number below.');
      return;
    }

    if (selectedItems.length === 0) {
      setError('Please select at least one boat to include in the share link.');
      return;
    }

    try {
      setIsGenerating(true);
      const shareId = generateShareId();
      const now = Date.now();
      const days = Math.max(1, Number(durationDays) || 3);
      const expiresAt = now + days * 24 * 60 * 60 * 1000;

      // Hierarchical BoatSnapshot[] array matching user specification
      const boatSnapshots: BoatSnapshot[] = selectedItems.map(it => it.snapshot);

      const primaryBoat = boatSnapshots[0];
      const primaryCabins = primaryBoat.cabins;

      const finalMessage = customMessage.trim() || buildWhatsAppMessage(
        primaryBoat.boatName,
        primaryCabins,
        primaryBoat.dates,
        language
      );

      const snapshot: ShareLinkSnapshot = sanitizeForFirestore({
        shareId,
        boats: boatSnapshots,
        // Flat backwards compatibility fields
        boatName: primaryBoat.boatName,
        itinerary: primaryBoat.itinerary || '',
        dates: primaryBoat.dates,
        duration: primaryBoat.duration || '',
        departure: primaryBoat.departure || '',
        cabins: primaryCabins,
        limitedServiceNote: primaryBoat.limitedServiceNote || '',
        fuelSurcharge: primaryBoat.fuelSurcharge || '',

        language,
        status: 'active',
        createdAt: now,
        expiresAt,
        whatsappNumber: whatsappConfig.number,
        whatsappBusinessName: whatsappConfig.businessName,
        whatsappCtaCaption: ctaCaption.trim() || 'Ask About This Boat',
        whatsappMessage: finalMessage
      });

      const saveRes = await createShareLinkSnapshot(snapshot);
      if (!saveRes.cloudSynced) {
        console.warn('Cloud sync took longer or deferred, saved to local cache:', saveRes.error);
        setError(`Warning: Cloud database synchronization is pending (${saveRes.error || 'Network latency'}). Link is active on this browser.`);
      }

      const shareUrl = getPublicShareUrl(shareId);
      setGeneratedLink({ id: shareId, url: shareUrl });
    } catch (err: any) {
      setError(err?.message || 'Failed to create share link.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    await copyTextToClipboard(generatedLink.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-xl bg-[#201d1a] border border-[#2e2a24] text-[#f0e9dc] rounded-3xl p-6 sm:p-7 shadow-2xl relative my-8 overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-[#a69a84] hover:text-[#f0e9dc] hover:bg-[#2e2a24] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-xl font-serif font-bold text-[#f0e9dc]">
              Generate Notepad Availability Link
            </h3>
            <p className="text-xs text-[#a69a84]">
              Creates a mobile catalog link with swipeable carousels for the boats compiled in your Stored Boats.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-3.5 mb-5 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="block font-semibold">{error}</span>
              {!isWhatsAppConfigured && (
                <button
                  type="button"
                  onClick={onOpenWhatsAppConfig}
                  className="mt-1.5 underline font-bold hover:opacity-80 block"
                >
                  Configure WhatsApp Number Now →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Success / Generated State */}
        {generatedLink ? (
          <div className="space-y-6 py-2">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block">
                  {selectedItems.length > 1 
                    ? `Multi-Boat Share Link Created (${selectedItems.length} Boats)!` 
                    : 'Temporary Share Link Created!'}
                </span>
                <span className="text-[11px] text-emerald-300/80 block font-mono truncate">
                  ID: {generatedLink.id} • Expires in {durationDays} days • {totalCabinsCount} cabins
                </span>
              </div>
            </div>

            {/* Generated URL Box */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#a69a84]">
                Customer Share URL
              </label>
              <div className="flex items-center gap-2 p-2 rounded-2xl border border-[#2e2a24] bg-[#181614]">
                <input
                  type="text"
                  readOnly
                  value={generatedLink.url}
                  className="flex-1 bg-transparent px-3 py-1.5 text-xs text-[#f0e9dc] font-mono focus:none truncate select-all"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 active:scale-95 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <a
                href={generatedLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#181614] hover:bg-[#282420] border border-[#2e2a24] text-xs font-semibold text-[#f0e9dc] transition-all cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span>Open Public Page</span>
              </a>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Hello! Here is the availability link for ${selectedItems.map(s => s.snapshot.boatName).join(', ')}: ${generatedLink.url}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-semibold transition-all shadow-md shadow-[#25D366]/20 cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5 fill-white" />
                <span>Send via WhatsApp</span>
              </a>
            </div>

            <div className="pt-4 border-t border-[#2e2a24] flex items-center justify-between text-xs">
              <button
                onClick={() => setGeneratedLink(null)}
                className="text-[#a69a84] hover:text-[#f0e9dc] transition-colors cursor-pointer"
              >
                ← Edit Selection & Regenerate
              </button>
              <button
                onClick={() => {
                  onClose();
                  onOpenManager();
                }}
                className="text-amber-400 hover:underline font-medium cursor-pointer"
              >
                View All Generated Links →
              </button>
            </div>
          </div>
        ) : (
          /* Link Configuration Form */
          <div className="space-y-5">
            {/* Multi-Boat Selection Section */}
            <div className="p-4 rounded-2xl bg-[#181614] border border-[#2e2a24] space-y-3">
              <div className="flex items-center justify-between border-b border-[#2e2a24]/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#f0e9dc]">
                    Boats to Include in Share Link ({selectedBoatIds.length}/{availableBoatItems.length})
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-amber-400 hover:underline font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-[#a69a84]">·</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-[#a69a84] hover:text-[#f0e9dc] cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* List of Available Boats */}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                {availableBoatItems.map((item) => {
                  const isChecked = selectedBoatIds.includes(item.id);
                  const boat = item.snapshot;
                  const cabins = boat.cabins || [];

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggleBoat(item.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-3 ${
                        isChecked 
                          ? 'bg-[#25211e] border-amber-500/50 shadow-sm' 
                          : 'bg-[#1e1b18] border-[#2e2a24] opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0 text-amber-400">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Square className="w-4 h-4 text-[#a69a84]" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-serif font-bold text-[#f0e9dc] truncate">
                            {boat.boatName}
                          </span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            item.source === 'notepad'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                              : 'bg-stone-800 text-stone-300 border-stone-700'
                          }`}>
                            {item.sourceTitle}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#a69a84]">
                          {boat.duration && (
                            <span className="font-semibold text-amber-400/90">{boat.duration}</span>
                          )}
                          {boat.dates && <span>{boat.dates}</span>}
                          <span>·</span>
                          <span className="font-mono text-[#f0e9dc]/80">
                            {cabins.length} {cabins.length === 1 ? 'cabin' : 'cabins'}
                          </span>
                        </div>

                        {/* Cabins Tag Preview */}
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {cabins.map((c) => (
                            <span
                              key={c.id}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-[#181614] border border-[#2e2a24] text-[#a69a84] truncate max-w-[130px]"
                            >
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {availableBoatItems.length === 0 && (
                  <div className="p-4 text-center text-xs text-[#a69a84] italic">
                    No boats found in your Stored Boats. Save boat proposals to Stored Boats first to generate an availability link.
                  </div>
                )}
              </div>

              {/* Layout Behavior Reminder */}
              <div className="p-2.5 rounded-xl bg-[#201d1a] border border-[#2e2a24] text-[11px] text-[#a69a84] flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {selectedBoatIds.length > 1
                    ? `Each of the ${selectedBoatIds.length} boats will appear as a compact accordion with an internal swipeable cabin carousel.`
                    : 'The public page will present this boat with a swipeable carousel for all available cabins.'}
                </span>
              </div>
            </div>

            {/* WhatsApp Contact Validation Status */}
            <div className="p-3.5 rounded-2xl bg-[#181614] border border-[#2e2a24] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-3 h-3 rounded-full ${isWhatsAppConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#a69a84] block">
                    Target WhatsApp Number
                  </span>
                  <span className="text-xs font-mono text-[#f0e9dc]">
                    {whatsappConfig.number || 'Not registered yet'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenWhatsAppConfig}
                className="text-[11px] font-semibold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Settings className="w-3 h-3" />
                <span>{isWhatsAppConfigured ? 'Change' : 'Register Number'}</span>
              </button>
            </div>

            {/* Expiration Duration Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#a69a84] flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Link Expiration
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { days: 1, label: '24h' },
                  { days: 2, label: '48h' },
                  { days: 3, label: '3 Days' },
                  { days: 7, label: '7 Days' },
                ].map((item) => (
                  <button
                    key={item.days}
                    type="button"
                    onClick={() => setDurationDays(item.days)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      durationDays === item.days
                        ? 'bg-amber-500 text-black border-amber-500 shadow-md'
                        : 'bg-[#181614] text-[#a69a84] border-[#2e2a24] hover:border-[#3e3831]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* WhatsApp CTA Button Caption */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#a69a84]">
                Sticky WhatsApp CTA Caption
              </label>
              <input
                type="text"
                value={ctaCaption}
                onChange={(e) => setCtaCaption(e.target.value)}
                placeholder="e.g. Ask About This Boat, Contact Us on WhatsApp"
                className="w-full px-4 py-2.5 rounded-2xl border border-[#2e2a24] bg-[#181614] text-xs text-[#f0e9dc] placeholder-[#a69a84]/50 focus:outline-none focus:border-amber-400/60"
              />
            </div>

            {/* Dynamic WhatsApp Message Preview */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#a69a84]">
                Prefilled WhatsApp Customer Message
              </label>
              <textarea
                rows={2}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Message that will automatically appear in WhatsApp..."
                className="w-full px-4 py-2.5 rounded-2xl border border-[#2e2a24] bg-[#181614] text-xs text-[#f0e9dc] placeholder-[#a69a84]/50 focus:outline-none focus:border-amber-400/60 resize-none font-sans"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 flex items-center justify-between border-t border-[#2e2a24]">
              <button
                type="button"
                onClick={onOpenManager}
                className="text-xs text-[#a69a84] hover:text-[#f0e9dc] underline cursor-pointer"
              >
                Manage Existing Links
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl border border-[#2e2a24] text-xs font-semibold text-[#a69a84] hover:text-[#f0e9dc] hover:bg-[#282420] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || selectedBoatIds.length === 0}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-all shadow-md active:scale-95 disabled:opacity-40 flex items-center gap-2 cursor-pointer"
                >
                  {isGenerating ? (
                    <span>Generating...</span>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {selectedBoatIds.length > 1
                          ? `Generate Link (${selectedBoatIds.length} Boats)`
                          : 'Generate Share Link'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
