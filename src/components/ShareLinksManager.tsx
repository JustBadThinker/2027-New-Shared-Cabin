import React, { useState, useEffect } from 'react';
import { ShareLinkSnapshot, CabinSnapshot, BoatSnapshot } from '../types/share';
import { 
  listAllShareLinks, 
  revokeShareLink, 
  reactivateShareLink, 
  deleteShareLink, 
  updateShareLinkSnapshot,
  isShareLinkExpired, 
  getPublicShareUrl, 
  syncLocalLinksToCloud 
} from '../lib/shareService';
import { copyTextToClipboard } from '../lib/utils';
import { useStore } from '../store';
import { 
  Link2, 
  Copy, 
  ExternalLink, 
  Trash2, 
  X, 
  Check, 
  Clock, 
  Ship, 
  Calendar, 
  Ban, 
  RefreshCw,
  AlertCircle,
  Eye,
  CheckCircle2,
  Loader2,
  Edit3,
  Save,
  Plus,
  Minus,
  RotateCcw,
  Search,
  Sparkles,
  ArrowUpRight,
  Layers,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CustomerSharePage } from './CustomerSharePage';

interface ShareLinksManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateNew?: () => void;
}

export const ShareLinksManager: React.FC<ShareLinksManagerProps> = ({
  isOpen,
  onClose,
  onGenerateNew
}) => {
  const { boats, tabs, activeTabId, updateActiveTab } = useStore();
  const [links, setLinks] = useState<ShareLinkSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'revoked'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewShareId, setPreviewShareId] = useState<string | null>(null);
  
  // Edit Modal State
  const [editingLink, setEditingLink] = useState<ShareLinkSnapshot | null>(null);
  const [activeEditBoatIdx, setActiveEditBoatIdx] = useState<number>(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);
  const [quickAddCabinName, setQuickAddCabinName] = useState('');
  const [showAddBoatSelect, setShowAddBoatSelect] = useState(false);

  const fetchLinks = async () => {
    try {
      setLoading(true);
      await syncLocalLinksToCloud().catch(() => {});
      const data = await listAllShareLinks();
      setLinks(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLinks();
      setConfirmDeleteId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = async (shareId: string) => {
    const url = getPublicShareUrl(shareId);
    await copyTextToClipboard(url);
    setCopiedId(shareId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (shareId: string) => {
    await revokeShareLink(shareId);
    setLinks(links.map(l => l.shareId === shareId ? { ...l, status: 'revoked' } : l));
  };

  const handleReactivate = async (shareId: string) => {
    await reactivateShareLink(shareId);
    setLinks(links.map(l => l.shareId === shareId ? { ...l, status: 'active' } : l));
  };

  const handleDelete = async (shareId: string) => {
    setDeletingId(shareId);
    try {
      await deleteShareLink(shareId);
      setLinks(prev => prev.filter(l => l.shareId !== shareId));
      setConfirmDeleteId(null);
    } catch (err) {
      console.warn('Failed to delete share link:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenEdit = (link: ShareLinkSnapshot) => {
    // Clone snapshot for safe in-memory editing
    const cloned: ShareLinkSnapshot = JSON.parse(JSON.stringify(link));
    
    // Normalize boats array so single-boat links and multi-boat batch links are unified
    if (!cloned.boats || cloned.boats.length === 0) {
      cloned.boats = [{
        boatName: cloned.boatName || 'Cruise Vessel',
        dates: cloned.dates || '',
        itinerary: cloned.itinerary,
        duration: cloned.duration,
        departure: cloned.departure,
        cabins: cloned.cabins ? [...cloned.cabins] : [],
        fuelSurcharge: cloned.fuelSurcharge,
        limitedServiceNote: cloned.limitedServiceNote,
      }];
    }

    setEditingLink(cloned);
    setActiveEditBoatIdx(0);
    setQuickAddCabinName('');
    setShowAddBoatSelect(false);
    setEditSuccessMsg(null);
  };

  // Cabin & Boat mutation helpers in Edit Mode
  const handleRemoveCabin = (boatIdx: number, cabinIdx: number) => {
    if (!editingLink || !editingLink.boats) return;
    const nextBoats = [...editingLink.boats];
    const targetBoat = { ...nextBoats[boatIdx] };
    targetBoat.cabins = (targetBoat.cabins || []).filter((_, idx) => idx !== cabinIdx);
    nextBoats[boatIdx] = targetBoat;
    setEditingLink({ ...editingLink, boats: nextBoats });
  };

  const handleAddCabinToBoat = (boatIdx: number, cabinName: string) => {
    if (!editingLink || !editingLink.boats || !cabinName.trim()) return;
    const nextBoats = [...editingLink.boats];
    const targetBoat = { ...nextBoats[boatIdx] };
    
    // Match with workspace cabin if available
    const matchedBoat = boats.find(b => b.name.toLowerCase() === targetBoat.boatName.toLowerCase());
    const matchedCabin = matchedBoat?.cabins.find(c => 
      c.name.toLowerCase() === cabinName.trim().toLowerCase() ||
      (c.nameEng && c.nameEng.toLowerCase() === cabinName.trim().toLowerCase())
    );

    const newCabin: CabinSnapshot = {
      id: matchedCabin?.id || `cabin-${Date.now()}`,
      name: cabinName.trim(),
      nameEng: matchedCabin?.nameEng || cabinName.trim(),
      count: 1,
      extraBeds: 0,
      websiteUrl: matchedCabin?.link || '',
      price: '',
      features: [],
      images: []
    };

    targetBoat.cabins = [...(targetBoat.cabins || []), newCabin];
    nextBoats[boatIdx] = targetBoat;
    setEditingLink({ ...editingLink, boats: nextBoats });
    setQuickAddCabinName('');
  };

  const handleRemoveBoatFromBatch = (boatIdx: number) => {
    if (!editingLink || !editingLink.boats || editingLink.boats.length <= 1) return;
    const nextBoats = editingLink.boats.filter((_, idx) => idx !== boatIdx);
    setEditingLink({ ...editingLink, boats: nextBoats });
    setActiveEditBoatIdx(Math.max(0, boatIdx - 1));
  };

  const handleAddBoatToBatch = (boatName: string) => {
    if (!editingLink || !editingLink.boats || !boatName.trim()) return;
    const matchedBoat = boats.find(b => b.name === boatName);
    const newBoatSnapshot: BoatSnapshot = {
      boatName: boatName.trim(),
      dates: editingLink.boats[0]?.dates || '',
      cabins: matchedBoat?.cabins?.slice(0, 1).map(c => ({
        id: c.id,
        name: c.name,
        nameEng: c.nameEng || c.name,
        count: 1,
        extraBeds: 0,
        websiteUrl: c.link || '',
        price: ''
      })) || []
    };

    const nextBoats = [...editingLink.boats, newBoatSnapshot];
    setEditingLink({ ...editingLink, boats: nextBoats });
    setActiveEditBoatIdx(nextBoats.length - 1);
    setShowAddBoatSelect(false);
  };

  const handleSaveEdit = async () => {
    if (!editingLink || !editingLink.boats) return;
    setSavingEdit(true);
    try {
      // Synchronize top-level fields for legacy components
      const firstBoat = editingLink.boats[0];
      const finalizedSnapshot: ShareLinkSnapshot = {
        ...editingLink,
        boatName: firstBoat?.boatName || editingLink.boatName || '',
        dates: firstBoat?.dates || editingLink.dates || '',
        cabins: firstBoat?.cabins || editingLink.cabins || [],
        fuelSurcharge: firstBoat?.fuelSurcharge ?? editingLink.fuelSurcharge,
        limitedServiceNote: firstBoat?.limitedServiceNote ?? editingLink.limitedServiceNote,
      };

      await updateShareLinkSnapshot(finalizedSnapshot);
      setLinks(prev => prev.map(l => l.shareId === finalizedSnapshot.shareId ? finalizedSnapshot : l));
      setEditSuccessMsg('Link successfully updated! Live guest view refreshed.');
      setTimeout(() => {
        setEditingLink(null);
        setEditSuccessMsg(null);
      }, 1000);
    } catch (err) {
      console.error('Failed to update share link:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleLoadIntoEditor = (link: ShareLinkSnapshot) => {
    if (!activeTabId) return;
    const firstBoat = link.boats?.[0] || link;
    const matchedBoat = boats.find(b => 
      b.name.toLowerCase() === (firstBoat.boatName || '').toLowerCase()
    );

    const cabinIds: string[] = [];
    const cabinSelections: Record<string, { count: number; extraBeds: number }> = {};

    firstBoat.cabins?.forEach(sc => {
      const match = matchedBoat?.cabins.find(c => 
        c.name.toLowerCase() === sc.name.toLowerCase() ||
        (sc.nameEng && c.nameEng && c.nameEng.toLowerCase() === sc.nameEng.toLowerCase())
      );
      const cId = match?.id || sc.id;
      cabinIds.push(cId);
      cabinSelections[cId] = {
        count: sc.count || 1,
        extraBeds: sc.extraBeds || 0
      };
    });

    updateActiveTab({
      selectedBoatName: matchedBoat?.name || firstBoat.boatName || null,
      selectedCabinIds: cabinIds,
      cabinSelections,
      dates: firstBoat.dates || '',
      language: link.language || 'ENG'
    });

    onClose();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Filter links by search query and status
  const filteredLinks = links.filter(link => {
    const isExpired = isShareLinkExpired(link);
    const isRevoked = link.status === 'revoked';
    const isActive = !isExpired && !isRevoked;

    if (statusFilter === 'active' && !isActive) return false;
    if (statusFilter === 'expired' && (!isExpired || isRevoked)) return false;
    if (statusFilter === 'revoked' && !isRevoked) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const boatNameMatch = link.boatName?.toLowerCase().includes(q) || 
      link.boats?.some(b => b.boatName?.toLowerCase().includes(q));
    const shareIdMatch = link.shareId.toLowerCase().includes(q);
    const datesMatch = link.dates?.toLowerCase().includes(q) || 
      link.boats?.some(b => b.dates?.toLowerCase().includes(q));
    const cabinMatch = link.cabins?.some(c => c.name.toLowerCase().includes(q) || c.nameEng?.toLowerCase().includes(q)) ||
      link.boats?.some(b => b.cabins?.some(c => c.name.toLowerCase().includes(q) || c.nameEng?.toLowerCase().includes(q)));
    return boatNameMatch || shareIdMatch || datesMatch || cabinMatch;
  });

  const currentEditBoat = editingLink?.boats?.[activeEditBoatIdx];
  const matchedWorkspaceBoat = currentEditBoat 
    ? boats.find(b => b.name.toLowerCase() === currentEditBoat.boatName.toLowerCase()) 
    : undefined;

  // Cabins available in this workspace boat that aren't yet added to this link
  const unaddedCabins = (matchedWorkspaceBoat?.cabins || []).filter(wc => 
    !currentEditBoat?.cabins?.some(sc => sc.name.toLowerCase() === wc.name.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-4xl bg-[#1c1917] border border-[#332e29] text-[#f5f0eb] rounded-3xl p-5 sm:p-7 shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2.5 rounded-full text-[#a89f91] hover:text-[#f5f0eb] hover:bg-[#2e2a25] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-10 mb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-xl font-serif font-bold text-[#f5f0eb]">
                Share Links Management
              </h3>
              <p className="text-xs text-[#a89f91]">
                View, batch-edit vessels, manage cabin availability, or delete live links.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLinks}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl border border-[#332e29] text-xs text-[#a89f91] hover:text-[#f5f0eb] hover:bg-[#24201c] flex items-center gap-1.5 transition-all cursor-pointer"
              title="Refresh links"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            {onGenerateNew && (
              <button
                onClick={() => {
                  onClose();
                  onGenerateNew();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                + New Link
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4 pb-4 border-b border-[#2e2a25]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#786f63]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter by boat, dates, or cabin..."
              className="w-full bg-[#141210] border border-[#2e2a25] rounded-xl pl-9 pr-3 py-2 text-xs text-[#f5f0eb] placeholder-[#786f63] focus:outline-hidden focus:border-amber-500/50"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#141210] p-1 rounded-xl border border-[#2e2a25] text-xs">
            {(['all', 'active', 'expired', 'revoked'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1 rounded-lg capitalize transition-all cursor-pointer text-xs ${
                  statusFilter === tab
                    ? 'bg-[#29241f] text-amber-300 font-semibold shadow-xs'
                    : 'text-[#a89f91] hover:text-[#f5f0eb]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Links List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 custom-scrollbar">
          {loading && links.length === 0 ? (
            <div className="py-20 text-center text-xs text-[#a89f91] flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
              <span>Loading links...</span>
            </div>
          ) : filteredLinks.length === 0 ? (
            <div className="py-16 text-center text-[#a89f91] space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#141210] border border-[#2e2a25] flex items-center justify-center mx-auto text-[#786f63]">
                <Link2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-serif">
                {links.length === 0 ? 'No share links generated yet.' : 'No links matching your filter.'}
              </p>
              <p className="text-xs text-[#786f63] max-w-sm mx-auto">
                Select cabins from any boat in the Template Maker and click "Generate Share Link" to create one.
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredLinks.map((link, idx) => {
                const isExpired = isShareLinkExpired(link);
                const isRevoked = link.status === 'revoked';
                const isActive = !isExpired && !isRevoked;
                
                // Multi-boat batch support
                const boatItems = link.boats && link.boats.length > 0 
                  ? link.boats 
                  : [{ boatName: link.boatName || 'Boat', dates: link.dates || '', cabins: link.cabins || [] }];
                
                const totalCabinsCount = boatItems.reduce((acc, b) => acc + (b.cabins?.length || 0), 0);
                const shareUrl = getPublicShareUrl(link.shareId);
                const isDeleting = deletingId === link.shareId;
                const isConfirmingDelete = confirmDeleteId === link.shareId;

                return (
                  <motion.div
                    layout
                    key={link.shareId || `share-link-${idx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ 
                      opacity: isDeleting ? 0.35 : 1, 
                      scale: isDeleting ? 0.98 : 1,
                      y: 0 
                    }}
                    exit={{ 
                      opacity: 0, 
                      scale: 0.94, 
                      height: 0, 
                      overflow: 'hidden',
                      transition: { duration: 0.25 } 
                    }}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                      isActive
                        ? 'bg-[#151311] border-[#302a24] hover:border-[#423a32]'
                        : 'bg-[#151311]/60 border-[#26221d] opacity-80'
                    }`}
                  >
                    {/* Top Row: Boat Title / Batch indicator, Share ID, Status Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-serif font-bold text-base sm:text-lg text-[#f5f0eb]">
                          {boatItems.map(b => b.boatName).join(' + ')}
                        </span>
                        
                        {boatItems.length > 1 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-[10px] font-bold text-amber-300">
                            <Layers className="w-3 h-3" />
                            <span>{boatItems.length} Boats Batch</span>
                          </span>
                        )}

                        <span className="font-mono text-[11px] text-[#a89f91] bg-[#221e1a] px-2 py-0.5 rounded-lg border border-[#332e29]">
                          {link.shareId}
                        </span>

                        {/* Status Badge */}
                        {isActive && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        )}
                        {isRevoked && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                            <Ban className="w-3 h-3" />
                            Revoked
                          </span>
                        )}
                        {isExpired && !isRevoked && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-stone-500/10 border border-stone-500/25 text-stone-400 text-[10px] font-bold uppercase tracking-wider">
                            <Clock className="w-3 h-3" />
                            Expired
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-[#8a8070]">
                        Expires: {formatDate(link.expiresAt)}
                      </div>
                    </div>

                    {/* Middle Details: Dates & Cabins Breakdown per boat */}
                    <div className="space-y-2 mb-3">
                      {boatItems.map((boatItem, bIdx) => (
                        <div key={bIdx} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[#a89f91]">
                          <span className="font-semibold text-amber-400/90 flex items-center gap-1">
                            <Ship className="w-3.5 h-3.5" />
                            <span>{boatItem.boatName}:</span>
                          </span>
                          {boatItem.dates && (
                            <span className="flex items-center gap-1 text-[#e0d6c8]">
                              <Calendar className="w-3 h-3 text-amber-400" />
                              <span>{boatItem.dates}</span>
                            </span>
                          )}
                          <span>•</span>
                          <span>{boatItem.cabins?.length || 0} cabins</span>
                          <div className="flex flex-wrap gap-1.5 ml-1">
                            {boatItem.cabins?.map((c, cIdx) => (
                              <span
                                key={cIdx}
                                className="px-2 py-0.5 rounded-md bg-[#201c18] border border-[#302a24] text-[10px] text-[#c9bea9]"
                              >
                                {c.count > 1 ? `${c.count}x ` : ''}{c.name}
                                {c.extraBeds ? ` (+${c.extraBeds} bed)` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Dedicated Action Toolbar */}
                    <div className="pt-3 border-t border-[#26221d] flex flex-wrap items-center justify-between gap-2.5">
                      {/* Left: View & Copy */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewShareId(link.shareId)}
                          className="px-3.5 py-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                          title="Preview guest view"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-400" />
                          <span>Preview</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopy(link.shareId)}
                          className="px-3.5 py-1.5 rounded-xl border border-[#332e29] bg-[#201c18] hover:bg-[#2a241f] text-xs font-semibold text-[#f5f0eb] flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                          title="Copy Share Link"
                        >
                          {copiedId === link.shareId ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-amber-400" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>

                        <a
                          href={shareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-xl border border-[#332e29] bg-[#201c18] hover:bg-[#2a241f] text-[#c9bea9] hover:text-[#f5f0eb] transition-all"
                          title="Open in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      {/* Right: Edit, Revoke/Reactivate, and Delete */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(link)}
                          className="px-3.5 py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-xs font-semibold text-blue-300 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-xs"
                          title="Batch-edit boats, update calendar dates, or remove booked cabins"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                          <span>Edit</span>
                        </button>

                        {/* Revoke / Reactivate Button */}
                        {isActive ? (
                          <button
                            type="button"
                            onClick={() => handleRevoke(link.shareId)}
                            className="px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                            title="Revoke link immediately"
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-400" />
                            <span>Revoke</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReactivate(link.shareId)}
                            className="px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                            title="Reactivate link"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Reactivate</span>
                          </button>
                        )}

                        {/* Delete Button with 2-step confirmation */}
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150">
                            <button
                              type="button"
                              onClick={() => handleDelete(link.shareId)}
                              disabled={isDeleting}
                              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-md"
                            >
                              {isDeleting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              <span>Yes, Delete</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 rounded-xl border border-[#332e29] text-xs text-[#a89f91] hover:text-[#f5f0eb] hover:bg-[#201c18]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(link.shareId)}
                            className="px-3 py-1.5 rounded-xl border border-[#3a2725] bg-[#241716] hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                            title="Remove link record"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 mt-3 border-t border-[#2e2a25] flex items-center justify-between">
          <span className="text-xs text-[#a89f91]">
            Total {links.length} share {links.length === 1 ? 'record' : 'records'}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#29241f] hover:bg-[#363029] text-[#f5f0eb] text-xs font-semibold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>

      {/* Multi-Boat & Batch Edit Modal */}
      <AnimatePresence>
        {editingLink && editingLink.boats && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-3xl bg-[#1f1b18] border border-[#38322b] text-[#f5f0eb] rounded-3xl p-5 sm:p-7 shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-[#302a24] mb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <Edit3 className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-serif font-bold text-lg text-[#f5f0eb]">
                        Edit Shared Itinerary
                      </h4>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#2a241f] border border-[#3b332b] text-amber-300">
                        {editingLink.shareId}
                      </span>
                    </div>
                    <p className="text-xs text-[#a89f91]">
                      Remove booked cabins, update calendar dates, or extend link expiration for guests.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setEditingLink(null)}
                  className="p-2 rounded-full text-[#a89f91] hover:text-[#f5f0eb] hover:bg-[#2a241f] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Body */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                {/* 1. Global Expiry Extensions & Link Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[#151311] rounded-2xl border border-[#2e2a25]">
                  <div>
                    <label className="block text-xs font-semibold text-[#a89f91] mb-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Expires: {formatDate(editingLink.expiresAt)}</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[
                        { label: '+1 Day', ms: 1 * 24 * 60 * 60 * 1000 },
                        { label: '+3 Days', ms: 3 * 24 * 60 * 60 * 1000 },
                        { label: '+7 Days', ms: 7 * 24 * 60 * 60 * 1000 }
                      ].map(ext => (
                        <button
                          key={ext.label}
                          type="button"
                          onClick={() => {
                            const base = Math.max(Date.now(), editingLink.expiresAt);
                            setEditingLink({ ...editingLink, expiresAt: base + ext.ms, status: 'active' });
                          }}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-[#241f1b] hover:bg-[#302a24] border border-[#3b332b] text-[11px] font-semibold text-amber-300 transition-all cursor-pointer"
                        >
                          {ext.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#a89f91] mb-1">
                      Link Status
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingLink({ ...editingLink, status: 'active' })}
                        className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          editingLink.status === 'active'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold'
                            : 'bg-[#1e1a17] border-[#332e29] text-[#786f63]'
                        }`}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingLink({ ...editingLink, status: 'revoked' })}
                        className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          editingLink.status === 'revoked'
                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 font-bold'
                            : 'bg-[#1e1a17] border-[#332e29] text-[#786f63]'
                        }`}
                      >
                        Revoked
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Vessel Selection Tabs (For Batch Links) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-[#e0d6c8] flex items-center gap-1.5 uppercase tracking-wider">
                      <Ship className="w-3.5 h-3.5 text-amber-400" />
                      <span>Vessels in this Itinerary ({editingLink.boats.length})</span>
                    </label>

                    <div className="flex items-center gap-1">
                      {!showAddBoatSelect ? (
                        <button
                          type="button"
                          onClick={() => setShowAddBoatSelect(true)}
                          className="px-2.5 py-1 rounded-lg bg-[#241f1b] hover:bg-[#302a24] border border-[#3b332b] text-[11px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Vessel</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <select
                            onChange={e => {
                              if (e.target.value) handleAddBoatToBatch(e.target.value);
                            }}
                            className="bg-[#141210] border border-amber-500/50 rounded-lg px-2 py-1 text-xs text-[#f5f0eb]"
                            defaultValue=""
                          >
                            <option value="" disabled>Select boat from workspace...</option>
                            {boats
                              .filter(b => !editingLink.boats.some(eb => eb.boatName.toLowerCase() === b.name.toLowerCase()))
                              .map(b => (
                                <option key={b.name} value={b.name}>{b.name}</option>
                              ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowAddBoatSelect(false)}
                            className="p-1 text-[#786f63] hover:text-[#f5f0eb]"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Vessel Tabs */}
                  <div className="flex items-center gap-1.5 p-1 bg-[#141210] rounded-xl border border-[#2e2a25] overflow-x-auto custom-scrollbar">
                    {editingLink.boats.map((b, bIdx) => (
                      <button
                        key={bIdx}
                        type="button"
                        onClick={() => setActiveEditBoatIdx(bIdx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                          activeEditBoatIdx === bIdx
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                            : 'text-[#a89f91] hover:text-[#f5f0eb] border border-transparent'
                        }`}
                      >
                        <Ship className="w-3.5 h-3.5" />
                        <span>{b.boatName || `Boat ${bIdx + 1}`}</span>
                        <span className="text-[10px] opacity-75 font-mono">({b.cabins?.length || 0})</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Active Vessel Configuration */}
                {currentEditBoat && (
                  <div className="p-4 rounded-2xl bg-[#171412] border border-[#2e2a25] space-y-4">
                    {/* Vessel Name & Dates / Calendar Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-[#a89f91]">
                            Vessel Name
                          </label>
                          {editingLink.boats.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveBoatFromBatch(activeEditBoatIdx)}
                              className="text-[10px] text-rose-400 hover:text-rose-300 cursor-pointer"
                            >
                              Remove this boat from link
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={currentEditBoat.boatName || ''}
                          onChange={e => {
                            const nextBoats = [...editingLink.boats];
                            nextBoats[activeEditBoatIdx] = { ...currentEditBoat, boatName: e.target.value };
                            setEditingLink({ ...editingLink, boats: nextBoats });
                          }}
                          className="w-full bg-[#100e0c] border border-[#332e29] rounded-xl px-3 py-2 text-xs text-[#f5f0eb] focus:border-amber-500/50"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#a89f91] mb-1 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-amber-400" />
                          <span>Calendar / Dates for {currentEditBoat.boatName}</span>
                        </label>
                        <input
                          type="text"
                          value={currentEditBoat.dates || ''}
                          onChange={e => {
                            const nextBoats = [...editingLink.boats];
                            nextBoats[activeEditBoatIdx] = { ...currentEditBoat, dates: e.target.value };
                            setEditingLink({ ...editingLink, boats: nextBoats });
                          }}
                          placeholder="e.g. 15-16-17 June 2026 3D2N"
                          className="w-full bg-[#100e0c] border border-[#332e29] rounded-xl px-3 py-2 text-xs text-[#f5f0eb] focus:border-amber-500/50"
                        />
                      </div>
                    </div>

                     {/* Website Source Toggle: KIC or LBB */}
                     <div className="flex flex-wrap items-center gap-3">
                       <span className="text-[11px] font-semibold text-[#a89f91] shrink-0">Website source:</span>
                       <div className="flex items-center gap-1 bg-[#100e0c] border border-[#2e2a25] rounded-xl p-0.5">
                         {(["auto", "kic", "lbb"] as const).map(opt => {
                           const active = (currentEditBoat.sourceWebsite ?? "auto") === opt;
                           const labels: Record<string, string> = {
                             auto: "⚡ Auto-detect",
                             kic: "🌊 KIC",
                             lbb: "🌴 LBB",
                           };
                           return (
                             <button
                               key={opt}
                               type="button"
                               onClick={() => {
                                 const nextBoats = [...editingLink.boats];
                                 nextBoats[activeEditBoatIdx] = {
                                   ...currentEditBoat,
                                   sourceWebsite: opt === "auto" ? undefined : opt as "kic" | "lbb",
                                 };
                                 setEditingLink({ ...editingLink, boats: nextBoats });
                               }}
                               className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                                 active
                                   ? opt === "kic"
                                     ? "bg-blue-600 text-white shadow-sm"
                                     : opt === "lbb"
                                     ? "bg-emerald-600 text-white shadow-sm"
                                     : "bg-amber-500 text-stone-950 shadow-sm"
                                   : "text-[#786f63] hover:text-[#a89f91]"
                               }`}
                             >
                               {labels[opt]}
                             </button>
                           );
                         })}
                       </div>
                       <span className="text-[10px] text-[#5a5247] italic">
                         {currentEditBoat.sourceWebsite === "kic"
                           ? "komodoislandcruises.com"
                           : currentEditBoat.sourceWebsite === "lbb"
                           ? "lebaliblog.com"
                           : "Detected from boat name & language"}
                       </span>
                     </div>

                    {/* Cabins Available on this Boat (Remove booked cabins, adjust counts) */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-[#a89f91] flex items-center gap-1.5">
                          <Ship className="w-3.5 h-3.5 text-amber-400" />
                          <span>Available Cabins on Preview ({currentEditBoat.cabins?.length || 0})</span>
                        </label>
                        <span className="text-[11px] text-[#786f63]">
                          Remove booked cabins or adjust quantities below
                        </span>
                      </div>

                      {/* Empty state if all cabins removed */}
                      {(!currentEditBoat.cabins || currentEditBoat.cabins.length === 0) ? (
                        <div className="p-4 rounded-xl bg-[#100e0c] border border-dashed border-[#332e29] text-center text-xs text-[#786f63] space-y-1">
                          <p>All cabins for this boat are currently marked unavailable/booked.</p>
                          <p className="text-[10px]">Add a cabin below if availability opens up.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {currentEditBoat.cabins.map((cabin, cIdx) => (
                            <div
                              key={`${cabin.id || cIdx}`}
                              className="p-3 rounded-xl bg-[#100e0c] border border-[#2e2a25] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-[#3d362e] transition-colors"
                            >
                              <div className="space-y-1 flex-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={cabin.name}
                                    onChange={e => {
                                      const nextBoats = [...editingLink.boats];
                                      const targetCabins = [...(currentEditBoat.cabins || [])];
                                      targetCabins[cIdx] = { ...cabin, name: e.target.value };
                                      nextBoats[activeEditBoatIdx] = { ...currentEditBoat, cabins: targetCabins };
                                      setEditingLink({ ...editingLink, boats: nextBoats });
                                    }}
                                    className="bg-transparent border-b border-transparent hover:border-[#38322b] focus:border-amber-400 text-xs font-semibold text-[#f5f0eb] px-1 py-0.5 outline-hidden flex-1"
                                  />
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-[#786f63]">Rate Override:</span>
                                  <input
                                    type="text"
                                    value={cabin.price || ''}
                                    onChange={e => {
                                      const nextBoats = [...editingLink.boats];
                                      const targetCabins = [...(currentEditBoat.cabins || [])];
                                      targetCabins[cIdx] = { ...cabin, price: e.target.value };
                                      nextBoats[activeEditBoatIdx] = { ...currentEditBoat, cabins: targetCabins };
                                      setEditingLink({ ...editingLink, boats: nextBoats });
                                    }}
                                    placeholder="Leave blank for auto-detected website price"
                                    className="bg-[#181512] border border-[#2a241f] rounded px-2 py-0.5 text-[11px] text-[#f5f0eb] placeholder-[#4f483e] flex-1 max-w-xs"
                                  />
                                </div>
                              </div>

                              {/* Controls & Remove button */}
                              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                {/* Quantity */}
                                <div className="flex items-center gap-1 bg-[#1e1a17] border border-[#332e29] rounded-lg px-2 py-0.5 text-xs">
                                  <span className="text-[10px] text-[#786f63] mr-1">Qty:</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (cabin.count <= 1) return;
                                      const nextBoats = [...editingLink.boats];
                                      const targetCabins = [...(currentEditBoat.cabins || [])];
                                      targetCabins[cIdx] = { ...cabin, count: cabin.count - 1 };
                                      nextBoats[activeEditBoatIdx] = { ...currentEditBoat, cabins: targetCabins };
                                      setEditingLink({ ...editingLink, boats: nextBoats });
                                    }}
                                    className="p-0.5 text-[#a89f91] hover:text-[#f5f0eb] disabled:opacity-30 cursor-pointer"
                                    disabled={cabin.count <= 1}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="font-bold text-amber-400 px-1">{cabin.count}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextBoats = [...editingLink.boats];
                                      const targetCabins = [...(currentEditBoat.cabins || [])];
                                      targetCabins[cIdx] = { ...cabin, count: cabin.count + 1 };
                                      nextBoats[activeEditBoatIdx] = { ...currentEditBoat, cabins: targetCabins };
                                      setEditingLink({ ...editingLink, boats: nextBoats });
                                    }}
                                    className="p-0.5 text-[#a89f91] hover:text-[#f5f0eb] cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>

                                {/* Extra Beds */}
                                <div className="flex items-center gap-1 bg-[#1e1a17] border border-[#332e29] rounded-lg px-2 py-0.5 text-xs">
                                  <span className="text-[10px] text-[#786f63] mr-1">Extra Bed:</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (cabin.extraBeds <= 0) return;
                                      const nextBoats = [...editingLink.boats];
                                      const targetCabins = [...(currentEditBoat.cabins || [])];
                                      targetCabins[cIdx] = { ...cabin, extraBeds: cabin.extraBeds - 1 };
                                      nextBoats[activeEditBoatIdx] = { ...currentEditBoat, cabins: targetCabins };
                                      setEditingLink({ ...editingLink, boats: nextBoats });
                                    }}
                                    className="p-0.5 text-[#a89f91] hover:text-[#f5f0eb] disabled:opacity-30 cursor-pointer"
                                    disabled={cabin.extraBeds <= 0}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="font-bold text-amber-400 px-1">{cabin.extraBeds}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextBoats = [...editingLink.boats];
                                      const targetCabins = [...(currentEditBoat.cabins || [])];
                                      targetCabins[cIdx] = { ...cabin, extraBeds: cabin.extraBeds + 1 };
                                      nextBoats[activeEditBoatIdx] = { ...currentEditBoat, cabins: targetCabins };
                                      setEditingLink({ ...editingLink, boats: nextBoats });
                                    }}
                                    className="p-0.5 text-[#a89f91] hover:text-[#f5f0eb] cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>

                                {/* REMOVE CABIN BUTTON (Remove booked cabin from guest preview) */}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCabin(activeEditBoatIdx, cIdx)}
                                  className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 text-xs flex items-center gap-1 transition-all cursor-pointer"
                                  title="Remove this cabin from guest preview (Cabin is booked)"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                  <span className="hidden sm:inline text-[11px]">Remove</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Cabin to Vessel Bar */}
                      <div className="mt-2.5 pt-2 border-t border-[#26211c] flex flex-wrap items-center gap-2">
                        {unaddedCabins.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-[#786f63]">Quick add from boat:</span>
                            {unaddedCabins.map(uc => (
                              <button
                                key={uc.id}
                                type="button"
                                onClick={() => handleAddCabinToBoat(activeEditBoatIdx, uc.name)}
                                className="px-2 py-0.5 rounded-md bg-[#241f1b] hover:bg-amber-500/20 border border-[#3b332b] text-[10px] text-amber-300 transition-all cursor-pointer"
                              >
                                + {uc.name}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1 flex-1 min-w-[200px]">
                          <input
                            type="text"
                            value={quickAddCabinName}
                            onChange={e => setQuickAddCabinName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCabinToBoat(activeEditBoatIdx, quickAddCabinName);
                              }
                            }}
                            placeholder="Type cabin name and press Enter..."
                            className="bg-[#100e0c] border border-[#2e2a25] rounded-lg px-2.5 py-1 text-xs text-[#f5f0eb] placeholder-[#5a5247] flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddCabinToBoat(activeEditBoatIdx, quickAddCabinName)}
                            disabled={!quickAddCabinName.trim()}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold cursor-pointer disabled:opacity-40"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Vessel Notes & Fuel Surcharge */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#26211c]">
                      <div>
                        <label className="block text-xs font-semibold text-[#a89f91] mb-1">
                          Fuel Surcharge ({currentEditBoat.boatName})
                        </label>
                        <input
                          type="text"
                          value={currentEditBoat.fuelSurcharge || ''}
                          onChange={e => {
                            const nextBoats = [...editingLink.boats];
                            nextBoats[activeEditBoatIdx] = { ...currentEditBoat, fuelSurcharge: e.target.value };
                            setEditingLink({ ...editingLink, boats: nextBoats });
                          }}
                          placeholder="e.g. 150.000 IDR / pers."
                          className="w-full bg-[#100e0c] border border-[#332e29] rounded-xl px-3 py-1.5 text-xs text-[#f5f0eb]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#a89f91] mb-1">
                          Limited Service Note ({currentEditBoat.boatName})
                        </label>
                        <input
                          type="text"
                          value={currentEditBoat.limitedServiceNote || ''}
                          onChange={e => {
                            const nextBoats = [...editingLink.boats];
                            nextBoats[activeEditBoatIdx] = { ...currentEditBoat, limitedServiceNote: e.target.value };
                            setEditingLink({ ...editingLink, boats: nextBoats });
                          }}
                          placeholder="e.g. Note: Service client limité..."
                          className="w-full bg-[#100e0c] border border-[#332e29] rounded-xl px-3 py-1.5 text-xs text-[#f5f0eb]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. WhatsApp Advisor Contact */}
                <div>
                  <label className="block text-xs font-semibold text-[#a89f91] mb-1">
                    WhatsApp Advisor Phone Number
                  </label>
                  <input
                    type="text"
                    value={editingLink.whatsappNumber || ''}
                    onChange={e => setEditingLink({ ...editingLink, whatsappNumber: e.target.value })}
                    placeholder="e.g. 628123456789"
                    className="w-full bg-[#141210] border border-[#332e29] rounded-xl px-3 py-2 text-xs text-[#f5f0eb] focus:border-amber-500/50"
                  />
                </div>
              </div>

              {/* Edit Modal Footer */}
              <div className="pt-4 mt-3 border-t border-[#302a24] flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleLoadIntoEditor(editingLink)}
                  className="px-3.5 py-2 rounded-xl border border-[#3b332b] hover:bg-[#2a241f] text-xs font-semibold text-amber-300 flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Open this link's boat and cabins in the main template builder"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Open in Builder</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingLink(null)}
                    disabled={savingEdit}
                    className="px-4 py-2 rounded-xl border border-[#332e29] text-xs font-semibold text-[#a89f91] hover:text-[#f5f0eb] hover:bg-[#24201c] cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
                  >
                    {savingEdit ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Updating Live Link...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save & Update Live Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {editSuccessMsg && (
                <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs text-center font-semibold animate-in fade-in">
                  ✓ {editSuccessMsg}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* In-App Customer Share Page Preview Modal */}
      {previewShareId && (
        <CustomerSharePage
          shareId={previewShareId}
          isModal={true}
          onClose={() => setPreviewShareId(null)}
        />
      )}
    </div>
  );
};
