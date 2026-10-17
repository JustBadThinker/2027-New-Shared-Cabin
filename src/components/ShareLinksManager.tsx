import React, { useState, useEffect } from 'react';
import { ShareLinkSnapshot } from '../types/share';
import { listAllShareLinks, revokeShareLink, deleteShareLink, isShareLinkExpired, getPublicShareUrl, syncLocalLinksToCloud } from '../lib/shareService';
import { copyTextToClipboard } from '../lib/utils';
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
  Loader2
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
  const [links, setLinks] = useState<ShareLinkSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [previewShareId, setPreviewShareId] = useState<string | null>(null);

  const fetchLinks = async () => {
    try {
      setLoading(true);
      // Auto-sync any unsynced local links to Firestore
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

  const handleDelete = async (shareId: string) => {
    setDeletingIds(prev => new Set(prev).add(shareId));
    try {
      await deleteShareLink(shareId);
      setLinks(prev => prev.filter(l => l.shareId !== shareId));
    } catch (err) {
      console.warn('Failed to delete share link:', err);
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(shareId);
        return next;
      });
    }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-[#201d1a] border border-[#2e2a24] text-[#f0e9dc] rounded-3xl p-6 shadow-2xl relative max-h-[85vh] flex flex-col overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-[#a69a84] hover:text-[#f0e9dc] hover:bg-[#2e2a24] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center justify-between pr-10 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-xl font-serif font-bold text-[#f0e9dc]">
                Share Links Management
              </h3>
              <p className="text-xs text-[#a69a84]">
                Manage all customer-facing temporary availability links.
              </p>
            </div>
          </div>

          <button
            onClick={fetchLinks}
            disabled={loading}
            className="p-2 rounded-xl border border-[#2e2a24] text-[#a69a84] hover:text-[#f0e9dc] hover:bg-[#181614] transition-all"
            title="Refresh links"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Links List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
          {loading && links.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#a69a84]">
              Loading links...
            </div>
          ) : links.length === 0 ? (
            <div className="py-16 text-center text-[#a69a84] space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#181614] border border-[#2e2a24] flex items-center justify-center mx-auto text-[#a69a84]/60">
                <Link2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-serif">No share links generated yet.</p>
              <p className="text-xs text-[#a69a84]/60 max-w-sm mx-auto">
                Select cabins from any boat in the Template Maker and click "Generate Share Link" to create one.
              </p>
              {onGenerateNew && (
                <button
                  onClick={() => {
                    onClose();
                    onGenerateNew();
                  }}
                  className="mt-2 px-5 py-2 rounded-xl bg-amber-500 text-black font-semibold text-xs transition-all shadow-md active:scale-95"
                >
                  Generate First Link
                </button>
              )}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {links.map((link, idx) => {
                const isExpired = isShareLinkExpired(link);
                const isRevoked = link.status === 'revoked';
                const isActive = !isExpired && !isRevoked;
                const cabinCount = link.cabins?.length || 0;
                const shareUrl = getPublicShareUrl(link.shareId);
                const isDeleting = deletingIds.has(link.shareId);

                return (
                  <motion.div
                    layout
                    key={link.shareId || `share-link-${idx}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ 
                      opacity: isDeleting ? 0.4 : 1, 
                      scale: isDeleting ? 0.98 : 1,
                      y: 0 
                    }}
                    exit={{ 
                      opacity: 0, 
                      scale: 0.92, 
                      height: 0, 
                      paddingTop: 0, 
                      paddingBottom: 0, 
                      marginTop: 0, 
                      marginBottom: 0,
                      overflow: 'hidden',
                      transition: { duration: 0.25 } 
                    }}
                    className={`p-4 rounded-2xl border transition-all ${
                      isActive
                        ? 'bg-[#181614] border-[#2e2a24] hover:border-[#3e3831]'
                        : 'bg-[#181614]/50 border-[#2e2a24]/50 opacity-75'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-serif font-bold text-base text-[#f0e9dc]">
                            {link.boatName}
                          </span>
                          <span className="font-mono text-xs text-[#a69a84] bg-[#201d1a] px-2 py-0.5 rounded-lg border border-[#2e2a24]">
                            {link.shareId}
                          </span>
                          {/* Status Badge */}
                          {isActive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Active
                            </span>
                          )}
                          {isRevoked && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                              Revoked
                            </span>
                          )}
                          {isExpired && !isRevoked && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-500/10 border border-stone-500/20 text-stone-400 text-[10px] font-bold uppercase tracking-wider">
                              Expired
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#a69a84]">
                          {link.dates && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-amber-400/80" />
                              {link.dates}
                            </span>
                          )}
                          <span>•</span>
                          <span>{cabinCount} {cabinCount === 1 ? 'cabin' : 'cabins'}</span>
                          <span>•</span>
                          <span className="text-[11px] font-mono">
                            Expires: {formatDate(link.expiresAt)}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewShareId(link.shareId)}
                          className="px-3 py-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                          title="Preview guest view in-app modal (Safe for AI Studio container)"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-400" />
                          <span>Preview</span>
                        </button>

                        <button
                          onClick={() => handleCopy(link.shareId)}
                          className="px-3 py-1.5 rounded-xl border border-[#2e2a24] bg-[#201d1a] hover:bg-[#282420] text-xs font-semibold text-[#f0e9dc] flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Copy Share Link"
                        >
                          {copiedId === link.shareId ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          <span>{copiedId === link.shareId ? 'Copied' : 'Copy'}</span>
                        </button>

                        <a
                          href={shareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-xl border border-[#2e2a24] bg-[#201d1a] hover:bg-[#282420] text-[#f0e9dc] transition-all"
                          title="Open Public Page in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        {isActive && (
                          <button
                            onClick={() => handleRevoke(link.shareId)}
                            className="px-2.5 py-1.5 rounded-xl border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                            title="Revoke Link (Make Unavailable Immediately)"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Revoke</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(link.shareId)}
                          disabled={isDeleting}
                          className="p-2 rounded-xl text-[#a69a84] hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
                          title="Delete Record"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Included cabins breakdown */}
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#2e2a24]/50">
                      {link.cabins?.map((c, cIdx) => (
                        <span
                          key={`${c.id || c.name || 'cabin'}-${cIdx}`}
                          className="px-2 py-0.5 rounded-md bg-[#201d1a] border border-[#2e2a24] text-[10px] text-[#a69a84]"
                        >
                          {c.count > 1 ? `${c.count}x ` : ''}{c.name}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 mt-3 border-t border-[#2e2a24] flex items-center justify-between">
          <span className="text-xs text-[#a69a84]">
            Total {links.length} share {links.length === 1 ? 'record' : 'records'}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#282420] text-[#f0e9dc] hover:bg-[#322c27] text-xs font-semibold transition-all"
          >
            Close
          </button>
        </div>
      </motion.div>

      {/* In-App Customer Share Page Preview Modal (Safe for AI Studio container) */}
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
