import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Anchor, Ship, CornerDownLeft, Sparkles, X, Info } from 'lucide-react';
import { useStore, Boat, Cabin } from '../store';
import { cn, matchShortcut } from '../lib/utils';

export const SpotlightSearch: React.FC = () => {
  const { 
    boats, 
    tabs, 
    activeTabId, 
    setSelectedBoatName, 
    setSelectedCabinIds,
    setActiveSectionTab,
    customShortcuts
  } = useStore();

  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const language = activeTab.language || 'ENG';
  const selectedCabinIds = activeTab.selectedCabinIds || [];

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Toggle Spotlight with Alt + F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTrigger = matchShortcut(e, customShortcuts?.toggleSpotlight || 'alt+f');
      if (isTrigger) {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setQuery('');
        setSelectedIndex(0);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      // Give UI minor time to render/mount
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Extract query prefix and clean text from deferredQuery for buttery smooth non-blocking typing
  const { filterType, cleanQuery } = useMemo(() => {
    const trimmed = deferredQuery.trim().toLowerCase();
    if (trimmed.startsWith('@b')) {
      return { filterType: 'BOAT' as const, cleanQuery: deferredQuery.slice(deferredQuery.indexOf('@b') + 2).trim() };
    }
    if (trimmed.startsWith('@c')) {
      return { filterType: 'CABIN' as const, cleanQuery: deferredQuery.slice(deferredQuery.indexOf('@c') + 2).trim() };
    }
    return { filterType: 'ALL' as const, cleanQuery: deferredQuery.trim() };
  }, [deferredQuery]);

  // Pre-process search assets for zero-allocation, instant comparisons on keystrokes
  const normalizedIndex = useMemo(() => {
    return boats.map(boat => {
      const boatNameLower = boat.name.toLowerCase();
      const cabins = (boat.cabins || []).map(cabin => ({
        ...cabin,
        nameLower: cabin.name.toLowerCase(),
        nameEngLower: (cabin.nameEng || '').toLowerCase()
      }));
      return {
        ...boat,
        nameLower: boatNameLower,
        cabins,
      };
    });
  }, [boats]);

  // Identify all searchable boats and cabins using grouped nested hierarchy
  const searchResults = useMemo(() => {
    const list: Array<{
      type: 'BOAT' | 'CABIN';
      id: string;
      name: string;
      subName: string;
      boatName: string;
      cabinObj?: Cabin;
      boatObj?: Boat;
    }> = [];

    const queryLower = cleanQuery.toLowerCase();

    normalizedIndex.forEach(boat => {
      const boatMatches = !queryLower || boat.nameLower.includes(queryLower);

      // Show cabins only if there is a search query or if specifically requested via filter `@c`
      const matchingCabins = boat.cabins.filter(cabin => {
        if (!queryLower) {
          return filterType === 'CABIN';
        }
        const cabinMatches = cabin.nameLower.includes(queryLower) || cabin.nameEngLower.includes(queryLower);
        return cabinMatches || boat.nameLower.includes(queryLower);
      });

      // 1. Grouped Boat Header
      const shouldIncludeBoat = (filterType === 'ALL' || filterType === 'BOAT') && 
        (boatMatches || (matchingCabins.length > 0 && filterType === 'ALL'));

      if (shouldIncludeBoat) {
        list.push({
          type: 'BOAT',
          id: `boat-${boat.name}`,
          name: boat.name,
          subName: language === 'FR' ? "Bateau de croisière" : "Cruise boat",
          boatName: boat.name,
          boatObj: boat as any
        });
      }

      // 2. Matching Cabins grouped directly under their boat
      if (filterType === 'ALL' || filterType === 'CABIN') {
        matchingCabins.forEach(cabin => {
          list.push({
            type: 'CABIN',
            id: `cabin-${boat.name}-${cabin.id}`,
            name: language === 'ENG' && cabin.nameEng ? cabin.nameEng : cabin.name,
            subName: `${language === 'FR' ? "Cabine sur" : "Cabin on"} ${boat.name}`,
            boatName: boat.name,
            cabinObj: cabin as any,
            boatObj: boat as any
          });
        });
      }
    });

    return list;
  }, [normalizedIndex, filterType, cleanQuery, language]);

  // Sliced results for peak typing & rendering performance (max 50 visible elements)
  const displayedResults = useMemo(() => {
    return searchResults.slice(0, 50);
  }, [searchResults]);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Auto-scroll active item into viewport on key press
  useEffect(() => {
    if (listContainerRef.current) {
      const activeEl = listContainerRef.current.querySelector('[data-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }
  }, [selectedIndex]);

  const handleSelectResult = (item: typeof searchResults[0]) => {
    if (item.type === 'BOAT') {
      setSelectedBoatName(item.name);
      setActiveSectionTab('BOATS');
    } else if (item.type === 'CABIN' && item.cabinObj && item.boatName) {
      setSelectedBoatName(item.boatName);
      
      // If toggled from another boat, clear others. If not, toggle standard selection check
      if (activeTab.selectedBoatName !== item.boatName) {
        setSelectedCabinIds([item.cabinObj.id]);
      } else {
        if (selectedCabinIds.includes(item.cabinObj.id)) {
          setSelectedCabinIds(selectedCabinIds.filter((cid: string) => cid !== item.cabinObj!.id));
        } else {
          setSelectedCabinIds([...selectedCabinIds, item.cabinObj.id]);
        }
      }
      setActiveSectionTab('CABINS');
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (displayedResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % displayedResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + displayedResults.length) % displayedResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelectResult(displayedResults[selectedIndex]);
    }
  };

  // Click outside close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-[12vh] px-4 overflow-hidden">
          {/* Blurred backdrop background */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* SpotLight Container card */}
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.96 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative w-full max-w-2xl bg-card border border-border/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[70vh]"
            onKeyDown={handleKeyDown}
          >
            {/* Spotlight Input Box wrapper */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-muted/20 relative">
              <Search className="w-5 h-5 text-muted-foreground shrink-0" />
              
              <input
                ref={inputRef}
                type="text"
                placeholder={
                  language === 'FR' 
                    ? "Rechercher... (utilisez @b pour bateaux, @c pour cabines)" 
                    : "Search... (use @b for boats, @c for cabins)"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-base text-foreground placeholder-muted-foreground pr-8"
              />

              {/* Quick Helper Badges */}
              <div className="flex items-center gap-1.5 shrink-0 select-none">
                <button 
                  onClick={() => {
                    setQuery('@b ');
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded text-[9px] font-bold border select-none transition-all",
                    filterType === 'BOAT' 
                      ? "bg-primary/10 border-primary/30 text-primary" 
                      : "bg-muted border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  @b Boats
                </button>
                <button 
                  onClick={() => {
                    setQuery('@c ');
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded text-[9px] font-bold border select-none transition-all",
                    filterType === 'CABIN' 
                      ? "bg-primary/10 border-primary/30 text-primary" 
                      : "bg-muted border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  @c Cabins
                </button>
                
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors ml-1.5"
                  title="Close Spotlight (Esc)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Results scrolling list */}
            <div 
              ref={listContainerRef}
              className="flex-1 overflow-y-auto p-2 min-h-[100px] max-h-[40vh] custom-scrollbar"
            >
              {displayedResults.length > 0 ? (
                <div className="space-y-0.5">
                  {displayedResults.map((item, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectResult(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        data-selected={isSelected ? "true" : "false"}
                        className={cn(
                          "flex items-center justify-between py-3 rounded-xl cursor-pointer transition-all select-none text-left",
                          item.type === 'CABIN' ? "ml-8 pl-4 pr-4" : "px-4",
                          isSelected 
                            ? "bg-primary text-primary-foreground shadow-md" 
                            : "hover:bg-muted/40 text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={cn(
                            "p-2 rounded-lg shrink-0",
                            isSelected ? "bg-primary-foreground/10 text-primary-foreground" : "bg-muted text-muted-foreground"
                          )}>
                            {item.type === 'BOAT' ? (
                              <Anchor className="w-4 h-4" />
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className={cn(
                                  "text-[11px] font-bold font-mono opacity-60 leading-none",
                                  isSelected ? "text-primary-foreground/75" : "text-muted-foreground"
                                )}>↳</span>
                                <Ship className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate leading-normal">
                              {item.name}
                            </p>
                            <p className={cn(
                              "text-[10px] font-medium block truncate mt-0.5 opacity-80",
                              isSelected ? "text-primary-foreground/85" : "text-muted-foreground"
                            )}>
                              {item.subName}
                            </p>
                          </div>
                        </div>

                        {/* Right feedback: Arrow or Enter helper */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isSelected && (
                            <span className={cn(
                              "inline-flex items-center gap-0.5 py-0.5 px-1.5 rounded bg-primary-foreground/10 text-[9px] font-black uppercase tracking-wider text-primary-foreground"
                            )}>
                              <span>Select</span>
                              <CornerDownLeft className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded border select-none uppercase tracking-wide",
                            isSelected 
                              ? "bg-primary-foreground/15 border-primary-foreground/10 text-primary-foreground" 
                              : "bg-muted/60 border-border/40 text-muted-foreground"
                          )}>
                            {item.type}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 px-6 text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto">
                    <X className="w-5 h-5 text-muted-foreground/60" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {language === 'FR' ? "Aucun résultat trouvé" : "No results found"}
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-normal">
                      {language === 'FR' 
                        ? "Aucun bateau ni cabin correspondaient à cette recherche. Modifiez vos mots-clés ou utilisez @b / @c pour filtrer." 
                        : "We couldn't find any boats or cabins matching your search. Try adjusting your query or filters."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom command palette help bar */}
            <div className="px-5 py-3 bg-muted/30 border-t border-border/60 flex items-center justify-between gap-4 text-[10px] text-muted-foreground select-none font-medium">
              <div className="flex items-center gap-3.5 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1 border border-border/70 rounded bg-background text-[9px] font-mono shadow-sm">↑↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1 border border-border/70 rounded bg-background text-[9px] font-mono shadow-sm">Enter</kbd>
                  <span>Select</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1 border border-border/70 rounded bg-background text-[9px] font-mono shadow-sm">Esc</kbd>
                  <span>Close</span>
                </span>
              </div>
              
              <div className="flex items-center gap-1 text-primary">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span className="font-bold uppercase tracking-wider">Spotlight Active</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
