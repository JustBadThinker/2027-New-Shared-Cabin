import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { cn, parseAndFormatInquiryDate } from '../lib/utils';
import { 
  Calendar, 
  Users, 
  MapPin, 
  ClipboardEdit, 
  ClipboardPaste, 
  User, 
  Anchor, 
  BedDouble, 
  Banknote,
  Building2,
  Trash2,
  Expand,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const InquiryPanel: React.FC = () => {
  const { tabs, activeTabId, setInquiry, renameTab, theme } = useStore();
  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const { inquiry = { clientName: '', calendar: '', pax: '', budget: '', itinerary: '', roomType: '', company: '', boatClass: '' } } = activeTab;
  const [showPaste, setShowPaste] = useState(false);
  const [rawText, setRawText] = useState('');
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(true);

  const handleReset = () => {
    setRawText('');
    setInquiry({
      clientName: '',
      calendar: '',
      pax: '',
      budget: '',
      itinerary: '',
      roomType: '',
      company: '',
      boatClass: '',
    });
  };

  useEffect(() => {
    const handleHotkeyReset = () => {
      handleReset();
    };
    window.addEventListener('reset-inquiry-parser-hotkey', handleHotkeyReset);
    return () => window.removeEventListener('reset-inquiry-parser-hotkey', handleHotkeyReset);
  }, []);

  const handleParse = () => {
    const text = rawText.trim();
    if (!text) return;

    // Advanced Parser logic to handle unstructured WhatsApp blocks
    const newData: Partial<typeof inquiry> = { ...inquiry };

    // Split text into lines for individual line inspections
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // 1. Name Parsing (detect ~ prefixed names first, then follow key-values, then phone indicators)
    let clientNameVal = '';
    const tildeLine = lines.find(l => l.startsWith('~'));
    if (tildeLine) {
      clientNameVal = tildeLine.replace(/^~\s*/, '').trim();
    } else {
      const nameMatch = text.match(/(?:client\s*name|client\/name|client|name|nom)\s*:\s*([^\n]+)/i);
      if (nameMatch) {
         clientNameVal = nameMatch[1].trim();
      } else {
         const phoneIdx = lines.findIndex(l => /^\+?[\d\s()+-]{7,25}$/.test(l));
         if (phoneIdx !== -1 && phoneIdx + 1 < lines.length) {
           const nextLine = lines[phoneIdx + 1];
           if (!nextLine.toLowerCase().includes('pax') && !nextLine.toLowerCase().includes('cabin') && !nextLine.toLowerCase().includes('trip') && !/\d+/.test(nextLine) && nextLine.length < 35) {
             clientNameVal = nextLine.replace(/^~\s*/, '').trim();
           }
         }
      }
    }

    // 2. Company Parsing (LBB / Lebaliblog vs KIC)
    let companyVal = '';
    const lowercaseText = text.toLowerCase();
    if (lowercaseText.includes('lebaliblog') || lowercaseText.includes('lbb') || lowercaseText.includes('le bali blog')) {
      companyVal = 'Lebaliblog';
    } else if (lowercaseText.includes('kic') || lowercaseText.includes('komodo island') || lowercaseText.includes('komodo luxury')) {
      companyVal = 'KIC';
    }

    // 3. Itinerary / Route Parsing
    let itineraryVal = '';
    const itinMatch = text.match(/(?:itinéraire|itinerary|route|itineraire)\s*:\s*([^\n]+)/i);
    if (itinMatch) {
      itineraryVal = itinMatch[1].trim();
    } else {
      const standardRoutes = ['lbb', 'kic', 'bajo pp', 'bajo p.p', 'komodo', 'labuan bajo'];
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (standardRoutes.includes(lower) || lower === 'bajo') {
          itineraryVal = line;
          break;
        }
      }
      if (!itineraryVal) {
        const matchItinUnsec = text.match(/(?:itinéraire|itinerary|route|itineraire)\s+([^\n]+)/i);
        if (matchItinUnsec) {
          itineraryVal = matchItinUnsec[1].trim();
        }
      }
    }

    // 4. Pax Count Parsing
    let paxVal = '';
    const paxMatch = text.match(/(?:pax|guest|person|people|adults?|passenger)\s*:\s*([^\n]+)/i) ||
                     text.match(/(\d+)\s*(?:pax|guest|person|people|adults?|passenger)/i) ||
                     text.match(/(?:pax|guest|person|people|adults?|passenger)\s+(\d+)/i);
    if (paxMatch) {
      paxVal = paxMatch[1] ? paxMatch[1].trim() : paxMatch[0].trim();
    } else {
      const pxLine = lines.find(l => /^\d+\s*pax$/i.test(l) || /^\d+\s*p$/i.test(l));
      if (pxLine) {
        paxVal = pxLine.trim();
      }
    }

    // 5. Budget Parsing
    let budgetVal = '';
    const budgetMatch = text.match(/(?:budget|price|tarif|cost|harga)\s*:\s*([^\n]+)/i) ||
                        text.match(/(?:budget|price|tarif|cost|harga)\s+(\d+[\s\w\/]*)/i);
    if (budgetMatch) {
      budgetVal = budgetMatch[1].trim();
    } else {
      const bLine = lines.find(l => /juta|million|idr|usd|€|\$/i.test(l) && /\d+/.test(l));
      if (bLine) {
        budgetVal = bLine.replace(/^(?:budget|price|harga)\s*:\s*/i, '').trim();
      }
    }

    // 6. Boat Preferred Parsing
    let boatClassVal = '';
    const explicitBoat = text.match(/(?:boat|bateau|ship|yacht|kapal|phinisi)\s*:\s*([^\n]+)/i) ||
                         text.match(/(?:boat|bateau|ship|yacht|kapal|phinisi)\s+([^\n]+)/i);
    if (explicitBoat) {
      boatClassVal = explicitBoat[1].trim();
    } else {
      const allBoats = useStore.getState().boats;
      const boatNames = allBoats?.map(b => b.name) || [];
      const matchedBoats: string[] = [];
      for (const bName of boatNames) {
        if (new RegExp(`\\b${bName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(text)) {
          matchedBoats.push(bName);
        }
      }
      if (matchedBoats.length > 0) {
        boatClassVal = matchedBoats.join(', ');
      } else {
        const bLine = lines.find(l => /\b(?:boat|bateau|kapal|sora|rb1|signature|phoenix|phinisi)\b/i.test(l) && !l.toLowerCase().includes('open trip') && !l.toLowerCase().includes('budget') && !l.toLowerCase().includes('pax'));
        if (bLine) {
          boatClassVal = bLine.replace(/^(?:boat|bateau|kapal)\s*:\s*/i, '').trim();
        }
      }
    }

    // 7. Room Preferred Parsing
    let roomTypeVal = '';
    const roomMatch = text.match(/(?:room|cabin|chambre|bed)\s*:\s*([^\n]+)/i);
    if (roomMatch) {
      roomTypeVal = roomMatch[1].trim();
    } else {
      const rLine = lines.find(l => /\b(?:room|cabin|chambre|deck|view|chambres|cabins)\b/i.test(l) && !l.toLowerCase().includes('private cabin') && !l.toLowerCase().includes('open trip') && !l.toLowerCase().includes('budget') && !l.toLowerCase().includes('pax'));
      if (rLine) {
        roomTypeVal = rLine.replace(/^(?:room|cabin|chambre|bed)\s*:\s*/i, '').trim();
      }
    }

    // 8. Adaptive Date Parsing (utilizing month search & parseAndFormatInquiryDate)
    let rawDateVal = '';
    const dateSectionMatch = text.match(/(?:date|calendar|when|dates)\s*:\s*([\s\S]+?)(?=\n[A-Z][a-z]+ :|$)/i);
    if (dateSectionMatch) {
      const cleanMatch = dateSectionMatch[0].replace(/^(?:date|calendar|when|dates)\s*:\s*/i, '').trim();
      rawDateVal = cleanMatch.split('\n')[0].trim();
    } else {
      const monthRegex = /(janvier|january|jan|fevrier|février|february|feb|mars|march|mar|avril|april|apr|mai|may|juin|june|jun|juillet|july|jul|juli|aout|août|august|aug|septembre|september|sept|octobre|october|oct|novembre|november|nov|decembre|décembre|dec)/i;
      const dateLine = lines.find(l => monthRegex.test(l) && /\d+/.test(l) && !l.toLowerCase().includes('budget') && !l.toLowerCase().includes('bateau') && !l.toLowerCase().includes('boat'));
      if (dateLine) {
        rawDateVal = dateLine.replace(/^(?:date|calendar|when|dates)\s*:\s*/i, '').trim();
      }
    }

    // Handle missing fields: auto-write '-'
    const finalClientName = clientNameVal || '-';
    const finalCompany = companyVal || '-';
    const finalBoatClass = boatClassVal || '-';
    const finalBudget = budgetVal || '-';
    const finalCalendar = rawDateVal ? parseAndFormatInquiryDate(rawDateVal) : '-';
    const finalPax = paxVal || '-';
    const finalRoomType = roomTypeVal || '-';
    const finalItinerary = itineraryVal || '-';

    if (finalClientName && finalClientName !== '-') {
      renameTab(activeTab.id, finalClientName.length > 15 ? `${finalClientName.substring(0, 15)}...` : finalClientName);
    }

    newData.clientName = finalClientName;
    newData.company = finalCompany;
    newData.boatClass = finalBoatClass;
    newData.budget = finalBudget;
    newData.calendar = finalCalendar;
    newData.pax = finalPax;
    newData.roomType = finalRoomType;
    newData.itinerary = finalItinerary;

    setInquiry(newData);
    setShowPaste(false);
    setRawText('');
  };

  const fields = [
    { id: 'clientName', label: 'Client / Name', icon: User, placeholder: 'Must Fill: Client Name' },
    { id: 'company', label: 'Company', icon: Building2, placeholder: 'Company (Lebaliblog / KIC)' },
    { id: 'boatClass', label: 'Boat Category', icon: Anchor, placeholder: 'Must Fill: Boat Class' },
    { id: 'budget', label: 'Budget Range', icon: Banknote, placeholder: 'Must Fill: Budget Range' },
    { id: 'calendar', label: 'Dates (Schedule)', icon: Calendar, placeholder: 'Must Fill: travel dates', span: 'col-span-2' },
    { id: 'pax', label: 'Pax / Guests', icon: Users, placeholder: 'Must Fill: Pax/Guests count' },
    { id: 'roomType', label: 'Room Preferred', icon: BedDouble, placeholder: 'Must Fill: room preference' },
    { id: 'itinerary', label: 'Route / Itinerary', icon: MapPin, placeholder: 'Must Fill: travel itinerary', span: 'col-span-2' },
  ] as const;

  if (isMinimized) {
    return (
      <div 
        onClick={() => setIsMinimized(false)}
        className="bg-card hover:bg-muted/40 border border-border rounded-3xl px-6 py-4 mb-8 flex items-center justify-between cursor-pointer transition-all group shadow-xs"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted text-primary rounded-xl border border-border/80">
            <ClipboardEdit className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground">Smart Inquiry Notepad & Extracted Reference</span>
            <span className="text-[10px] text-muted-foreground font-medium w-full sm:w-auto">Click to expand raw WhatsApp parser & menu reference</span>
          </div>
        </div>
        <button 
          className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-muted-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          Expand
          <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-3xl p-6 mb-8 relative shadow-sm"
    >
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted text-primary rounded-xl border border-border/80">
            <ClipboardEdit className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h4 className="text-xs font-serif italic text-foreground uppercase tracking-widest font-bold">Smart Notepad</h4>
            <p className="text-[9px] text-muted-foreground font-semibold">PASTE RAW TEXT TO GENERATE THE BOOKING REFERENCING DETAILS</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleParse}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground text-[10px] font-bold transition-all uppercase tracking-wider shadow-xs cursor-pointer animate-fade-in"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            Sync Details
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-background text-destructive hover:bg-destructive/10 text-[10px] font-bold transition-all uppercase tracking-wider cursor-pointer"
            title="Clear and Reset All"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="px-3 py-1.5 rounded-xl border border-border bg-background text-foreground text-[10px] font-black uppercase tracking-wider transition-all hover:bg-muted cursor-pointer flex items-center gap-1"
            title="Minimize Area"
          >
            Minimize
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Top Segment: Compact Paste Box */}
        <div className="relative">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste raw WhatsApp enquiry here..."
            className="w-full h-24 p-4 bg-muted/30 dark:bg-muted/10 border border-border/80 rounded-2xl text-xs font-mono focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-border/80 transition-all text-foreground placeholder:text-muted-foreground/50 resize-none leading-relaxed custom-scrollbar"
          />
        </div>

        {/* Lower Segment: Extracted Reference Menu list (styled like a high-end coffee menu) */}
        <div className="border-t border-border/60 pt-5">
          <div className="flex items-center justify-between mb-4 pb-1 border-b border-border/40">
            <h5 className="font-serif italic text-[11px] uppercase tracking-[0.15em] text-foreground font-black">
              Inquiry Reference Menu
            </h5>
            <span className="text-[8px] font-mono uppercase text-muted-foreground/60 tracking-widest">
              * Click each menu item to manually edit
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1.5">
            {fields.map((field) => (
              <div key={field.id} className="relative">
                <div 
                  onClick={() => setActivePopover(field.id)}
                  className="flex items-end gap-2 py-1.5 px-2.5 -mx-2.5 hover:bg-muted/30 border border-transparent hover:border-border/20 rounded-xl cursor-not-allowed sm:cursor-pointer transition-all duration-200 group/item"
                >
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/90 shrink-0 flex items-center gap-2 font-bold group-hover/item:text-primary transition-colors">
                    <field.icon className="w-3.5 h-3.5 text-muted-foreground/50 group-hover/item:text-primary/70 transition-colors" />
                    {field.label}
                  </span>
                  
                  <div className="flex-1 border-b border-dashed border-border/40 min-w-4 mb-1 group-hover/item:border-border/80 transition-colors"></div>
                  
                  <span className={cn(
                    "font-sans text-[11px] font-semibold text-foreground text-right truncate max-w-[150px] sm:max-w-xs md:max-w-[150px] lg:max-w-[200px] transition-colors group-hover/item:text-primary",
                    !inquiry[field.id as keyof typeof inquiry] && "text-muted-foreground/40 italic font-mono font-normal text-[10px]"
                  )}
                  title={inquiry[field.id as keyof typeof inquiry] || field.placeholder}
                  >
                    {inquiry[field.id as keyof typeof inquiry] || '—'}
                  </span>
                </div>

                {/* Populate Popover Expand Modal */}
                <AnimatePresence>
                  {activePopover === field.id && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-lg bg-card rounded-[2rem] p-8 shadow-xl relative border border-border"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-muted text-primary rounded-xl border border-border">
                              <field.icon className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground">
                              {field.label}
                            </span>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setActivePopover(null); }}
                            className="p-2 hover:bg-muted rounded-full transition-colors cursor-pointer"
                          >
                            <X className="w-5 h-5 text-foreground" />
                          </button>
                        </div>
                        
                        <textarea
                          autoFocus
                          value={inquiry[field.id as keyof typeof inquiry] || ''}
                          onChange={(e) => setInquiry({ [field.id]: e.target.value })}
                          placeholder={field.placeholder}
                          className="w-full h-36 p-5 bg-muted/20 border border-border rounded-2xl text-xs font-medium focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-border/80 transition-all custom-scrollbar leading-relaxed text-foreground"
                        />
                        
                        <div className="mt-6 flex justify-end">
                          <button
                            onClick={() => setActivePopover(null)}
                            className="px-8 py-3.5 bg-primary text-primary-foreground rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary/95 transition-all shadow-xs cursor-pointer"
                          >
                            Done Editing
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

