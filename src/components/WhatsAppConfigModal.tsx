import React, { useState, useEffect } from 'react';
import { WhatsAppConfig, DEFAULT_WHATSAPP_CONFIG } from '../types/share';
import { getWhatsAppConfig, saveWhatsAppConfig, validateWhatsAppNumber, cleanPhoneNumber } from '../lib/shareService';
import { MessageCircle, Check, X, AlertCircle, Phone, Building2, Tag, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface WhatsAppConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (config: WhatsAppConfig) => void;
}

export const WhatsAppConfigModal: React.FC<WhatsAppConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [config, setConfig] = useState<WhatsAppConfig>(DEFAULT_WHATSAPP_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getWhatsAppConfig().then((cfg) => {
        setConfig(cfg);
        setError(null);
        setSavedSuccess(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validateWhatsAppNumber(config.number);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid phone number');
      return;
    }

    try {
      setLoading(true);
      await saveWhatsAppConfig(config);
      setLoading(false);
      setSavedSuccess(true);
      if (onSaved) onSaved(config);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err?.message || 'Failed to save configuration');
      setLoading(false);
    }
  };

  const previewClean = config.number ? cleanPhoneNumber(config.number) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-[#201d1a] border border-[#2e2a24] text-[#f0e9dc] rounded-3xl p-6 shadow-2xl relative overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-[#a69a84] hover:text-[#f0e9dc] hover:bg-[#2e2a24] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/30 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-[#25D366]" />
          </div>
          <div>
            <h3 className="text-lg font-serif font-bold text-[#f0e9dc]">
              WhatsApp Contact Settings
            </h3>
            <p className="text-xs text-[#a69a84]">
              Configure the WhatsApp contact used on temporary shareable cabin links.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {savedSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <Check className="w-4 h-4 shrink-0" />
              <span>Settings saved successfully!</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#a69a84] flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-amber-400" />
              WhatsApp Number (with Country Code)
            </label>
            <input
              type="text"
              placeholder="e.g. +62 812 3456 7890 or 6281234567890"
              value={config.number}
              onChange={(e) => setConfig({ ...config, number: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-[#2e2a24] bg-[#181614] text-sm text-[#f0e9dc] placeholder-[#a69a84]/50 focus:outline-none focus:border-amber-400/60 transition-all font-mono"
              required
            />
            <p className="text-[10px] text-[#a69a84]/70">
              Must include country code (e.g. +62 for Indonesia, +33 for France, etc.). Local numbers (08...) are auto-converted to +62.
            </p>
            {previewClean && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono pt-0.5">
                <Check className="w-3 h-3" />
                <span>wa.me target: +{previewClean}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#a69a84] flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              Display Business Name
            </label>
            <input
              type="text"
              placeholder="e.g. Komodo Island Cruise or Le Bali Blog"
              value={config.businessName}
              onChange={(e) => setConfig({ ...config, businessName: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-[#2e2a24] bg-[#181614] text-sm text-[#f0e9dc] placeholder-[#a69a84]/50 focus:outline-none focus:border-amber-400/60 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#a69a84] flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              Default CTA Caption
            </label>
            <input
              type="text"
              placeholder="e.g. Ask About This Boat, Book This Cabin, or Contact Us"
              value={config.defaultCaption}
              onChange={(e) => setConfig({ ...config, defaultCaption: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-[#2e2a24] bg-[#181614] text-sm text-[#f0e9dc] placeholder-[#a69a84]/50 focus:outline-none focus:border-amber-400/60 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#a69a84] flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Default Link Expiration (Days)
            </label>
            <select
              value={config.defaultDurationDays}
              onChange={(e) => setConfig({ ...config, defaultDurationDays: Number(e.target.value) })}
              className="w-full px-4 py-3 rounded-2xl border border-[#2e2a24] bg-[#181614] text-sm text-[#f0e9dc] focus:outline-none focus:border-amber-400/60 transition-all"
            >
              <option value={1}>1 Day (24 hours)</option>
              <option value={2}>2 Days (48 hours)</option>
              <option value={3}>3 Days (Recommended)</option>
              <option value={7}>7 Days (1 Week)</option>
              <option value={14}>14 Days (2 Weeks)</option>
            </select>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#2e2a24]">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-[#2e2a24] text-xs font-semibold text-[#a69a84] hover:text-[#f0e9dc] hover:bg-[#282420] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
