import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Anchor, X, CalendarX, CalendarCheck, Ship, Check, Sparkles } from 'lucide-react';
import { useStore, Cabin, Boat } from '../store';
import { cn, matchShortcut } from '../lib/utils';
import Fuse from 'fuse.js';
import { motion, AnimatePresence } from 'motion/react';
import { CabinList } from './CabinList';

export const BoatSelector: React.FC = () => {
  const { 
    boats, 
    tabs, 
    activeTabId, 
    setSelectedBoatName, 
    toggleBoatAvailability, 
    setActiveSectionTab,
    customShortcuts
  } = useStore();
  
  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const { 
    selectedBoatName, 
    unavailableBoatNames = [], 
    activeSectionTab = 'BOATS', 
    language = 'FR', 
    mode = 'CABIN' 
  } = activeTab;

  const [search, setSearch] = useState('');
  const [selectorTab, setSelectorTab] = useState<'BOATS' | 'CABINS'>('BOATS');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on shortcut key press (defaults to Q)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );
      if (isInput) return;

      const triggerKey = customShortcuts?.focusSearch || 'q';
      const isMatch = triggerKey.includes('+')
        ? matchShortcut(e, triggerKey)
        : (e.key.toLowerCase() === triggerKey.toLowerCase() && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey);

      if (isMatch) {
        e.preventDefault();
        setSelectorTab('BOATS');
        setActiveSectionTab('BOATS');
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 30);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customShortcuts, setActiveSectionTab]);

  // Sync with store's activeSectionTab and blur search input when switching to cabins view
  useEffect(() => {
    if (activeSectionTab === 'CABINS' && selectedBoatName) {
      setSelectorTab('CABINS');
      searchInputRef.current?.blur();
    } else if (activeSectionTab === 'BOATS') {
      setSelectorTab('BOATS');
    }
  }, [activeSectionTab, selectedBoatName]);

  // Ensure search input is blurred whenever selectorTab changes to CABINS
  useEffect(() => {
    if (selectorTab === 'CABINS') {
      searchInputRef.current?.blur();
    }
  }, [selectorTab]);

  // Fuse search for boats
  const fuse = useMemo(() => new Fuse(boats, {
    keys: ['name'],
    threshold: 0.3,
  }), [boats]);

  const filteredBoats = useMemo(() => {
    if (!search) return boats;
    return fuse.search(search).map(result => result.item);
  }, [search, boats, fuse]);

  // Autocomplete based on Google Sheets loaded boat names
  const autocompleteMatch = useMemo(() => {
    if (!search.trim() || selectorTab !== 'BOATS') return null;
    const query = search.toLowerCase();
    const match = boats.find(b => b.name.toLowerCase().startsWith(query) && b.name.toLowerCase() !== query);
    return match ? match.name : null;
  }, [search, boats, selectorTab]);

  // Keyboard number shortcuts 1-9 for choosing boats in the search results
  useEffect(() => {
    if (selectorTab !== 'BOATS') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputOtherThanSearch = activeEl && (
        activeEl !== searchInputRef.current && (
          activeEl.tagName === 'INPUT' || 
          activeEl.tagName === 'TEXTAREA' || 
          (activeEl as HTMLElement).isContentEditable
        )
      );
      if (isInputOtherThanSearch) return;

      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        const index = parseInt(e.key) - 1;
        if (index < filteredBoats.length) {
          e.preventDefault();
          const targetBoat = filteredBoats[index];
          setSelectedBoatName(targetBoat.name);
          setSelectorTab('CABINS');
          setActiveSectionTab('CABINS');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectorTab, filteredBoats, setSelectedBoatName, setActiveSectionTab]);

  if (boats.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Search Input always visible at the top */}
      <div className="space-y-2.5">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
          
          {autocompleteMatch && (
            <div className="absolute right-12 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary dark:text-primary-foreground px-2.5 py-1 rounded-xl text-xs font-bold font-sans pointer-events-none select-none shadow-xs animate-fade-in z-10">
              <span className="opacity-70 font-sans">{language === 'FR' ? "Bateau suggéré :" : "Suggest:"}</span>
              <span className="text-foreground font-black font-sans">{autocompleteMatch}</span>
              <kbd className="ml-1 px-1.5 py-0.5 rounded border border-primary/30 bg-background text-[10px] font-sans font-black shadow-2xs uppercase leading-none h-4 flex items-center text-primary dark:text-primary-foreground">
                Tab
              </kbd>
            </div>
          )}

          <input
            ref={searchInputRef}
            type="text"
            placeholder={
              selectorTab === 'CABINS'
                ? (language === 'FR' ? "Rechercher une cabine..." : "Search cabin type...")
                : (language === 'FR' ? "Rechercher un bateau..." : "Search boat name...")
            }
            value={search}
            onFocus={(e) => {
              if (selectorTab === 'CABINS') {
                setSelectorTab('BOATS');
                setActiveSectionTab('BOATS');
              }
              if (search) {
                e.currentTarget.select();
              }
            }}
            onClick={(e) => {
              if (search) {
                e.currentTarget.select();
              }
            }}
            onChange={(e) => {
              setSearch(e.target.value);
              if (selectorTab === 'CABINS') {
                setSelectorTab('BOATS');
                setActiveSectionTab('BOATS');
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && autocompleteMatch) {
                e.preventDefault();
                setSearch(autocompleteMatch);
              }
            }}
            className="w-full h-14 pl-12 pr-12 rounded-2xl border border-border bg-card/50 backdrop-blur-sm focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm animate-fade-in"
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => {
                  setSearch('');
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full transition-colors cursor-pointer"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Keyboard shortcut notice */}
        <div className="flex flex-wrap items-center gap-y-1 gap-x-1.5 px-1 text-[11px] text-muted-foreground/90 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-amber-500/80 shrink-0 mr-0.5 animate-pulse" />
          <span>
            {language === 'FR' ? "Instant : presser" : "Instant: press"}
          </span>
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/65 text-[10px] font-bold font-mono text-foreground shadow-sm uppercase">
            {customShortcuts?.focusSearch || 'q'}
          </kbd>
          <span>
            {language === 'FR' ? "pour focus la recherche, ou" : "to focus search, or"}
          </span>
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted/65 text-[10px] font-bold font-mono text-foreground shadow-sm uppercase">
            {(customShortcuts?.toggleSpotlight || 'alt+f').replace(/\+/g, ' + ')}
          </kbd>
          <span>
            {language === 'FR' ? "pour Spotlight" : "for Spotlight"}
          </span>
        </div>
      </div>

      {/* Tabs list (Only show if CABIN mode and boat can be chosen) */}
      {mode === 'CABIN' && (
        <div className="flex border-b border-border/60">
          <button
            onClick={() => {
              setSelectorTab('BOATS');
              setActiveSectionTab('BOATS');
            }}
            className={cn(
              "flex-1 pb-3 text-center text-xs font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer relative",
              selectorTab === 'BOATS'
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {language === 'FR' ? 'Bateaux' : 'Boats'}
            {selectedBoatName && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-mono lowercase">
                {selectedBoatName}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              if (selectedBoatName) {
                setSelectorTab('CABINS');
                setActiveSectionTab('CABINS');
              }
            }}
            disabled={!selectedBoatName}
            className={cn(
              "flex-1 pb-3 text-center text-xs font-bold uppercase tracking-widest border-b-2 transition-all relative flex items-center justify-center gap-1.5",
              selectorTab === 'CABINS'
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
              !selectedBoatName ? "opacity-35 cursor-not-allowed" : "cursor-pointer"
            )}
          >
            {language === 'FR' ? 'Cabines Actives' : 'Active Cabins'}
            {!selectedBoatName && (
              <span className="text-[8px] font-black uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full scale-90">
                {language === 'FR' ? 'Inactif' : 'Locked'}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Tab Panels content */}
      <AnimatePresence mode="wait">
        {mode === 'CHARTER' || selectorTab === 'BOATS' ? (
          <motion.div
            key="boats-panel"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar"
          >
            {filteredBoats.map((boat, index) => {
              const isUnavailable = unavailableBoatNames?.includes(boat.name);
              const itemIndex = index + 1;
              return (
                <div
                  key={boat.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedBoatName(boat.name);
                    setSelectorTab('CABINS');
                    setActiveSectionTab('CABINS');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSelectedBoatName(boat.name);
                      setSelectorTab('CABINS');
                      setActiveSectionTab('CABINS');
                    }
                  }}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group relative overflow-hidden cursor-pointer outline-none focus:ring-2 focus:ring-primary/20",
                    selectedBoatName === boat.name 
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/10" 
                      : "border-border bg-card/50 hover:border-primary/50 hover:bg-card",
                    isUnavailable && selectedBoatName !== boat.name && "opacity-40"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-xl transition-colors flex items-center gap-1.5",
                    selectedBoatName === boat.name ? "bg-white/20" : "bg-muted group-hover:bg-primary/5"
                  )}>
                    <Anchor className={cn("w-4 h-4", selectedBoatName === boat.name ? "text-white" : "text-muted-foreground group-hover:text-primary")} />
                  </div>
                  
                  <div className="flex-1 min-w-0 pr-6 flex items-center gap-2">
                    {itemIndex <= 9 && (
                      <kbd className={cn(
                        "px-2 py-0.5 rounded-md border text-[10px] font-extrabold font-mono tracking-wide select-none pointer-events-none transition-colors shrink-0 shadow-2xs",
                        selectedBoatName === boat.name
                          ? "border-white/40 bg-white/10 text-white"
                          : "border-border bg-muted text-muted-foreground/80 group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/30"
                      )}>
                        {itemIndex}
                      </kbd>
                    )}
                    <span className={cn(
                      "text-sm font-medium truncate block",
                      isUnavailable && "line-through opacity-70"
                    )}>
                      {boat.name}
                    </span>
                    {isUnavailable && <span className="text-[9px] uppercase tracking-wider font-bold opacity-70">Booked / N.A.</span>}
                  </div>

                  <div className="absolute right-2 flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBoatAvailability(boat.name);
                      }}
                      title={isUnavailable ? "Mark as Available" : "Mark as Booked/Full"}
                      className={cn(
                        "p-1.5 rounded-lg transition-all",
                        selectedBoatName === boat.name 
                          ? "hover:bg-white/20" 
                          : (isUnavailable ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted")
                      )}
                    >
                      {isUnavailable ? <CalendarCheck className="w-3.5 h-3.5" /> : <CalendarX className="w-3.5 h-3.5" />}
                    </button>
                    
                    {selectedBoatName === boat.name && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white ml-1" />
                    )}
                  </div>
                </div>
              );
            })}
            {filteredBoats.length === 0 && (
              <div className="col-span-full py-12 text-center space-y-2">
                <p className="text-muted-foreground text-sm italic">No boats matching your search.</p>
                <button onClick={() => setSearch('')} className="text-xs text-primary font-medium hover:underline">Clear search</button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="cabins-panel"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            <CabinList />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
