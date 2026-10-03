import React from 'react';
import { 
  Check, 
  Info, 
  ListChecks, 
  CalendarX, 
  CalendarCheck
} from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const CabinList: React.FC = () => {
  const { 
    boats, 
    tabs, 
    activeTabId, 
    setSelectedCabinIds, 
    toggleCabinAvailability
  } = useStore();
  
  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const { 
    selectedBoatName, 
    selectedCabinIds, 
    language, 
    unavailableCabinIds = [],
    cabinSelections = {}
  } = activeTab;

  const selectedBoat = boats.find(b => b.name === selectedBoatName);

  if (!selectedBoat) return null;

  // Listen to 1-9 keyboard hotkeys to select/toggle cabins
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );
      if (isInput) return;

      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        const index = parseInt(e.key) - 1;
        if (index < selectedBoat.cabins.length) {
          e.preventDefault();
          const targetCabin = selectedBoat.cabins[index];
          const isUnavailable = unavailableCabinIds?.includes(targetCabin.id);
          if (!isUnavailable) {
            const ids = selectedCabinIds || [];
            if (ids?.includes(targetCabin.id)) {
              setSelectedCabinIds(ids.filter(cid => cid !== targetCabin.id));
            } else {
              setSelectedCabinIds([...ids, targetCabin.id]);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBoat, selectedCabinIds, unavailableCabinIds, setSelectedCabinIds]);

  const handleDecrementCabin = (id: string) => {
    const { count = 1 } = cabinSelections[id] || {};
    useStore.getState().setCabinSelectionCount(id, count - 1);
  };

  const handleIncrementCabin = (id: string) => {
    const { count = 1 } = cabinSelections[id] || {};
    useStore.getState().setCabinSelectionCount(id, count + 1);
  };

  const handleDecrementExtraBeds = (id: string) => {
    const { extraBeds = 0 } = cabinSelections[id] || {};
    useStore.getState().setCabinSelectionExtraBeds(id, extraBeds - 1);
  };

  const handleIncrementExtraBeds = (id: string) => {
    const { extraBeds = 0 } = cabinSelections[id] || {};
    useStore.getState().setCabinSelectionExtraBeds(id, extraBeds + 1);
  };

  const toggleCabin = (id: string, isUnavailable: boolean) => {
    if (isUnavailable) return;
    const ids = selectedCabinIds || [];
    if (ids?.includes(id)) {
      setSelectedCabinIds(ids.filter(cid => cid !== id));
    } else {
      setSelectedCabinIds([...ids, id]);
    }
  };

  const selectAll = () => {
    const availableCabinIds = selectedBoat.cabins
      .filter(c => !unavailableCabinIds?.includes(c.id))
      .map(c => c.id);
    setSelectedCabinIds(availableCabinIds);
  };

  const clearAll = () => {
    setSelectedCabinIds([]);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Select Cabins</h4>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={selectAll} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors font-bold cursor-pointer">Select All Available</button>
          <div className="w-px h-3 bg-border" />
          <button 
            onClick={(e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              clearAll(); 
            }} 
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors font-bold cursor-pointer"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 max-h-[420px] overflow-y-auto pr-2 custom-scrollbar">
        {selectedBoat.cabins.map((cabin, index) => {
          const isSelected = (selectedCabinIds || [])?.includes(cabin.id);
          const isUnavailable = unavailableCabinIds?.includes(cabin.id);
          const { count = 1, extraBeds = 0 } = cabinSelections[cabin.id] || {};
          const itemIndex = index + 1;

          const cabinName = language === 'ENG' && cabin.nameEng ? cabin.nameEng : cabin.name;

          return (
            <div
              key={cabin.id}
              className={cn(
                "rounded-2xl border transition-all text-left relative focus-within:ring-2 focus-within:ring-primary/20 flex flex-col overflow-hidden bg-card/45",
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                  : "border-border bg-card/30 hover:border-primary/30 hover:bg-card/90",
                isUnavailable && !isSelected && "opacity-60"
              )}
            >
              {/* Header Selection Block */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleCabin(cabin.id, isUnavailable)}
                onKeyDown={(e) => e.key === 'Enter' && toggleCabin(cabin.id, isUnavailable)}
                className="flex items-center justify-between p-4 cursor-pointer outline-none w-full"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0 pr-6">
                  <span className={cn(
                    "text-sm font-semibold transition-colors flex items-center gap-2",
                    isSelected ? "text-primary" : "text-foreground",
                    isUnavailable && "line-through opacity-70"
                  )}>
                    {itemIndex <= 9 && (
                      <kbd className={cn(
                        "px-2 py-0.5 rounded-md border text-[10px] font-extrabold font-mono tracking-wide select-none pointer-events-none transition-colors shadow-2xs shrink-0",
                        isSelected
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-muted text-muted-foreground/80"
                      )}>
                        {itemIndex}
                      </kbd>
                    )}
                    {cabinName}
                    {isUnavailable && (
                      <span className="inline-flex px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[8px] font-black uppercase tracking-tighter line-normal">
                        Full
                      </span>
                    )}
                  </span>
                  {(() => {
                    const link = language === 'ENG' ? cabin.linkEng : cabin.link;
                    const hasValidLink = link && !['no', 'n/a', 'non', ''].includes(link.toLowerCase().trim());
                    
                    return hasValidLink && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[280px] font-mono opacity-60">{link}</span>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCabinAvailability(cabin.id);
                    }}
                    title={isUnavailable ? "Mark as Available" : "Mark as Booked/Full"}
                    className={cn(
                      "p-1.5 rounded-lg transition-all cursor-pointer",
                      isUnavailable ? "text-destructive bg-destructive/5" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {isUnavailable ? <CalendarCheck className="w-3.5 h-3.5" /> : <CalendarX className="w-3.5 h-3.5" />}
                  </button>

                  <div className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                    isSelected 
                      ? "bg-primary border-primary scale-110 shadow-lg shadow-primary/20" 
                      : "border-border"
                  )}>
                    <AnimatePresence mode="wait">
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0, rotate: -45 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0, rotate: 45 }}
                        >
                          <Check className="w-3.5 h-3.5 text-primary-foreground stroke-[3px]" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isSelected && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-border/40 bg-muted/25 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {/* Cabins Count */}
                      <div className="flex items-center gap-3">
                        <span>{language === 'FR' ? 'Cabines' : 'Cabins'} :</span>
                        <div className="flex items-center gap-1.5 bg-background border border-border p-1 rounded-xl">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDecrementCabin(cabin.id);
                            }}
                            className="w-5 h-5 flex items-center justify-center hover:bg-muted text-foreground rounded-lg cursor-pointer transition-colors"
                          >
                            -
                          </button>
                          <span className="min-w-[16px] text-center text-foreground font-mono font-black">{count}</span>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleIncrementCabin(cabin.id);
                            }}
                            className="w-5 h-5 flex items-center justify-center hover:bg-muted text-foreground rounded-lg cursor-pointer transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Extra Beds */}
                      <div className="flex items-center gap-3">
                        <span>{language === 'FR' ? "Lits d'appoint" : 'Extra Beds'} :</span>
                        <div className="flex items-center gap-1.5 bg-background border border-border p-1 rounded-xl">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDecrementExtraBeds(cabin.id);
                            }}
                            className="w-5 h-5 flex items-center justify-center hover:bg-muted text-foreground rounded-lg cursor-pointer transition-colors"
                          >
                            -
                          </button>
                          <span className="min-w-[16px] text-center text-foreground font-mono font-black">{extraBeds}</span>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleIncrementExtraBeds(cabin.id);
                            }}
                            className="w-5 h-5 flex items-center justify-center hover:bg-muted text-foreground rounded-lg cursor-pointer transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          );
        })}
      </div>
      
      {selectedBoat.cabins.some(c => !c.link) && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-3 p-4 bg-muted/30 rounded-2xl border border-border/50"
        >
          <div className="p-1.5 bg-background rounded-lg border border-border">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Note: Some cabins are missing links in the spreadsheet. They will still be generated but the link field will be empty.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
};
