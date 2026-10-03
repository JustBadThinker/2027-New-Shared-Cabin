import React from 'react';
import { Calendar, Globe, Languages, Ship, Users, AlertCircle, Link2, Sparkles } from 'lucide-react';
import { useStore, Language, Mode } from '../store';
import { cn, parseAndFormatInquiryDate } from '../lib/utils';
import { motion } from 'motion/react';

export const TemplateGenerator: React.FC = () => {
  const { 
    boats,
    tabs,
    activeTabId,
    setLanguage, 
    setMode, 
    setDates, 
    setIsBoatEmpty, 
    setShowLimitedServiceNote,
    setFormattingMode
  } = useStore();

  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const { 
    selectedBoatName, 
    selectedCabinIds = [],
    dates, 
    language, 
    mode, 
    isBoatEmpty, 
    showLimitedServiceNote,
    formattingMode,
    linkPreference,
    inquiry = { clientName: '', calendar: '', pax: '', budget: '', itinerary: '', roomType: '', company: '', boatClass: '' }
  } = activeTab;

  const selectedBoat = boats.find(b => b.name === selectedBoatName);
  const selectedCabins = selectedBoat?.cabins.filter(c => (selectedCabinIds || []).includes(c.id)) || [];

  const fuelRegex = /⛽|Surcharge\s*Carburant|Fuel\s*Surcharge/i;
  const noteRegex = /Service\s*client\s*limité|Limited\s*(?:client|customer)\s*service/i;

  const checkFuel = (obj: any) => {
    const fields = ['name', 'nameEng', 'itinerary', 'itineraryEng', 'link', 'linkEng', 'charterFr', 'charterEng', 'charterFr', 'charterEng'];
    return fields.some(f => obj[f] && typeof obj[f] === 'string' && fuelRegex.test(obj[f]));
  };

  const checkNote = (obj: any) => {
    const fields = ['name', 'nameEng', 'itinerary', 'itineraryEng', 'link', 'linkEng', 'charterFr', 'charterEng', 'charterFr', 'charterEng'];
    return fields.some(f => obj[f] && typeof obj[f] === 'string' && noteRegex.test(obj[f]));
  };

  let hasDetectedFuel = false;
  let hasDetectedNote = false;

  if (selectedBoat) {
    // Always detect metadata from both boat and all its cabins for consistency
    hasDetectedFuel = checkFuel(selectedBoat);
    hasDetectedNote = checkNote(selectedBoat);
    
    selectedBoat.cabins.forEach(cabin => {
      if (checkFuel(cabin)) hasDetectedFuel = true;
      if (checkNote(cabin)) hasDetectedNote = true;
    });
  }

  const hasAnyNote = hasDetectedFuel || hasDetectedNote;

  if (!selectedBoatName) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                <Calendar className="w-3 h-3 text-primary" />
                Trip Dates
              </label>
              <button 
                onClick={() => setDates(inquiry.calendar)}
                className="text-[9px] font-bold uppercase tracking-wider text-primary hover:underline flex items-center gap-1"
                title="Pull from Active Inquiry"
              >
                Copy from Inquiry
              </button>
            </div>
            <div className="space-y-3">
              <div className="relative group">
                <input
                  type="text"
                  placeholder="e.g. 12 - 19 Octobre 2024"
                  value={dates}
                  onChange={(e) => setDates(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border border-border bg-card/50 backdrop-blur-sm focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm font-medium placeholder:text-muted-foreground/50"
                />
              </div>
              
              <div className="flex flex-wrap gap-2">
                {['2D1N', '3D2N', '4D2N'].map((dur) => (
                  <button
                    key={dur}
                    onClick={() => {
                      const hasDur = dates?.includes(dur);
                      if (hasDur) {
                        setDates(dates.replace(dur, '').trim());
                      } else {
                        // Clean other durations first so they don't stack
                        let cleanDates = dates || '';
                        ['2D1N', '3D2N', '4D2N', '3J2N', '2J1N', '4J2N', '(3J2N)', '(2J1N)', '(4D2N)', '(3D2N)', '(2D1N)'].forEach(d => {
                          cleanDates = cleanDates.replace(d, '');
                        });
                        // Use our helper to adapt the calendar dates string dynamically!
                        const adapted = parseAndFormatInquiryDate(cleanDates, dur);
                        setDates(`${adapted} ${dur}`.trim());
                      }
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all border",
                      dates?.includes(dur)
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted"
                    )}
                  >
                    {dur}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground px-1 italic">Months will be automatically translated based on language.</p>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 px-1">
              <AlertCircle className="w-3 h-3 text-primary" />
              Boat Status & Options
            </label>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsBoatEmpty(!isBoatEmpty); }}
                className={cn(
                  "flex items-center gap-3 px-5 py-4 rounded-2xl border transition-all w-full text-left group",
                  isBoatEmpty 
                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20" 
                    : "border-border bg-card/50 hover:border-primary/30 hover:bg-card"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                  isBoatEmpty ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                )}>
                  {isBoatEmpty && <div className="w-2 h-2 bg-primary-foreground rounded-sm" />}
                </div>
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  isBoatEmpty ? "text-primary" : "text-muted-foreground"
                )}>
                  {isBoatEmpty ? (language === 'FR' ? 'Bateau encore vide' : 'Boat still Empty') : 'Boat still Empty'}
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  if (hasAnyNote) {
                    setShowLimitedServiceNote(!showLimitedServiceNote);
                  }
                }}
                disabled={!hasAnyNote}
                className={cn(
                  "flex items-center gap-3 px-5 py-4 rounded-2xl border transition-all w-full text-left group",
                  showLimitedServiceNote 
                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20" 
                    : "border-border bg-card/50 hover:border-primary/30 hover:bg-card",
                  !hasAnyNote && "opacity-40 cursor-not-allowed grayscale"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                  showLimitedServiceNote ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                )}>
                  {showLimitedServiceNote && <div className="w-2 h-2 bg-primary-foreground rounded-sm" />}
                </div>
                <span className={cn(
                  "text-sm font-medium transition-colors",
                  showLimitedServiceNote ? "text-primary" : "text-muted-foreground"
                )}>
                  {language === 'FR' ? "Note : Service / Surcharge" : "Note: Service / Surcharge"}
                  {!hasAnyNote && <span className="text-[10px] ml-2 block opacity-60 italic">(Not detected in data)</span>}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 px-1">
              <Languages className="w-3 h-3 text-primary" />
              Output Language
            </label>
            <div className="flex p-1.5 bg-muted/50 rounded-2xl border border-border/50 w-fit backdrop-blur-sm">
              {(['FR', 'ENG'] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={cn(
                    "px-8 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all duration-300 uppercase",
                    language === lang 
                      ? "bg-background text-primary shadow-lg shadow-black/5 ring-1 ring-border" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {lang === 'FR' ? 'French (Lebaliblog)' : 'English (KIC)'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 px-1">
              <Globe className="w-3 h-3 text-primary" />
              Formatting Style
            </label>
            <div className="flex flex-wrap gap-2 p-1.5 bg-muted/50 rounded-2xl border border-border/50 w-fit backdrop-blur-sm">
              {([
                { id: 'DEFAULT', label: 'Default' },
                { id: 'WHATSAPP', label: 'WhatsApp' },
                { id: 'EMAIL', label: 'Email' }
              ] as { id: any, label: string }[]).map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setFormattingMode(fmt.id)}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all duration-300 uppercase",
                    formattingMode === fmt.id 
                      ? "bg-background text-primary shadow-lg shadow-black/5 ring-1 ring-border" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 px-1">
              <Ship className="w-3 h-3 text-primary" />
              Template Type
            </label>
            <div className="flex p-1.5 bg-muted/50 rounded-2xl border border-border/50 w-fit backdrop-blur-sm">
              {(['CABIN', 'CHARTER'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-8 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all duration-300 uppercase flex items-center gap-2",
                    mode === m 
                      ? "bg-background text-primary shadow-lg shadow-black/5 ring-1 ring-border" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m === 'CABIN' ? <Users className="w-3 h-3" /> : <Ship className="w-3 h-3" />}
                  {m === 'CABIN' ? 'Cabin' : 'Charter'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 px-1">
              <Globe className="w-3 h-3 text-primary" />
              Link Preferred
            </label>
            <div className="flex p-1.5 bg-muted/50 rounded-2xl border border-border/50 w-full backdrop-blur-sm overflow-x-auto">
              {([
                { id: 'AUTO', label: language === 'FR' ? 'Auto (Langue)' : 'Auto (Lang)' },
                { id: 'ENG', label: 'KIC (ENG)' },
                { id: 'FR', label: 'Lebaliblog (FR)' }
              ] as { id: 'AUTO' | 'FR' | 'ENG', label: string }[]).map((pref) => (
                <button
                  key={pref.id}
                  onClick={() => useStore.getState().setLinkPreference(pref.id)}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-[9px] font-black tracking-widest transition-all duration-300 uppercase whitespace-nowrap flex-1",
                    linkPreference === pref.id 
                      ? "bg-background text-primary shadow-lg shadow-black/5 ring-1 ring-border" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {pref.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
