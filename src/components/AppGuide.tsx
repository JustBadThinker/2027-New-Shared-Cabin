import React, { useState } from 'react';
import { 
  X, 
  HelpCircle, 
  ClipboardEdit, 
  FileSpreadsheet, 
  Ship, 
  Sparkles, 
  Image as ImageIcon, 
  BookOpen,
  ArrowRight,
  Info,
  Keyboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface AppGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppGuide: React.FC<AppGuideProps> = ({ isOpen, onClose }) => {
  const [activeStep, setActiveStep] = useState(0);

  const features = [
    {
      title: "Overview & Purpose",
      subtitle: "Unified Booking & Itinerary Planner",
      description: "CabinGen turns manual WhatsApp enquiries and heavy spreadsheets into instantly formatted luxury Cruise Itineraries. It automates vessel selection, calculates prices, and outputs perfect client copy.",
      icon: BookOpen,
      color: "text-amber-500 bg-amber-500/10",
      tips: [
        "Sync with Google Drive sheets or drag-and-drop local CSV files",
        "Generate itinerary text in English or French",
        "Supports dynamic multi-cabin selections and total pricing"
      ]
    },
    {
      title: "Smart Notepad & WhatsApp Parser",
      subtitle: "Instant Data Extraction",
      description: "Paste unstructured WhatsApp copy into the Smart Notepad. The engine instantly auto-detects names, sequential travel dates (automatically calculating day ranges like 2D, 3D, or 4D), budget, passenger counts, companies (LBB or KIC), custom boat names, and room types.",
      icon: ClipboardEdit,
      color: "text-emerald-500 bg-emerald-500/10",
      tips: [
        "Empty/unparsed values are auto-written as '-' fallback",
        "Click any menu row item to manually override and type custom edits",
        "Use the 'Reset' button to wipe everything clean instantly"
      ]
    },
    {
      title: "Vessel & Cabin Sorter",
      subtitle: "Live Occupancy & Deck Specs",
      description: "Browse boats, search specific dates, or locate ideal cabins. Detailed cabin overlays tell you deck status, view specs, bed arrangements, base prices, extra-bed surcharges, and current availability status.",
      icon: Ship,
      color: "text-blue-500 bg-blue-500/10",
      tips: [
        "Filter vessels by typing initials or categories",
        "Set additional extra-beds count individually on each cabin to compute surcharges",
        "Quickly select/deselect cabins in one-click"
      ]
    },
    {
      title: "Dynamic Template Builder",
      subtitle: "Bottom-Aligned Disclaimers",
      description: "Produce client-ready quotes inside the Generator. In strict compliance with your system workflows, 'Fuel Surcharge' and 'Limited Service Notes' are dynamically detected and always bottom-aligned at the very end.",
      icon: Sparkles,
      color: "text-indigo-500 bg-indigo-500/10",
      tips: [
        "No duplicate surcharge text blocks when selecting multiple cabins",
        "Clean links automatically strip internal notes for perfect presentation",
        "Toggle formatting variables on-the-fly"
      ]
    },
    {
      title: "Interactive Media Gallery",
      subtitle: "Vessel Visuals & Uploads",
      description: "Present gorgeous visual layout mockups for every boat. View, customize, or upload custom image URLs directly. The gallery handles offline caching and live syncing perfectly.",
      icon: ImageIcon,
      color: "text-rose-500 bg-rose-500/10",
      tips: [
        "Sync Google Drive folders directly for auto-fetching boat deck images",
        "Use 'Add Missing Image' to type/paste your own raw web image URLs",
        "Centered, sleek actions let you refresh data with ease"
      ]
    },
    {
      title: "Keyboard & Hotkeys",
      subtitle: "Custom Keybinds & Quick Macros",
      description: "CabinGen supports fully custom hotkey mappings! Toggle language, hide or show any section, empty your cabins list, clear notes, or instantly copy the final formatted itinerary copy with lightning speed.",
      icon: Keyboard,
      color: "text-violet-500 bg-violet-500/10",
      tips: [
        "Go to Settings -> 'Raccourcis Clavier' to assign any custom hotkeys",
        "Modifier mappings support simple keydowns or multi-modifier combinations",
        "Single-key shortcuts (like 'q' to focus the search bar) trigger safely only outside input fields"
      ]
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-3xl bg-card border border-border rounded-[2.5rem] p-6 md:p-10 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Background Accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/2 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/5 text-primary rounded-xl border border-border/80">
              <HelpCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-serif italic uppercase tracking-wider font-bold">CabinGen Feature Guide</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold font-sans">Learn how to maximize your workflow</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors cursor-pointer"
            title="Close Guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Outer content container */}
        <div className="flex flex-col md:flex-row gap-8 py-6 overflow-y-auto custom-scrollbar flex-1">
          {/* Left sidebar: Steps Selector */}
          <div className="w-full md:w-56 shrink-0 flex flex-col gap-2">
            {features.map((feat, idx) => {
              const IconComp = feat.icon;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={cn(
                    "w-full text-left p-3 rounded-2xl border transition-all flex items-center gap-3 cursor-pointer group/btn",
                    activeStep === idx 
                      ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                      : "bg-muted/20 hover:bg-muted/55 border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className={cn(
                    "p-1.5 rounded-lg shrink-0 transition-colors",
                    activeStep === idx ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground group-hover/btn:text-foreground"
                  )}>
                    <IconComp className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold tracking-tight leading-tight block">
                    {feat.title}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Area: Dynamic Step Display */}
          <div className="flex-1 flex flex-col justify-between bg-muted/20 dark:bg-muted/10 border border-border/50 rounded-3xl p-6 md:p-8 min-h-[340px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
                className="space-y-5"
              >
                <div className="flex items-center gap-3">
                  <div className={cn("p-3 rounded-2xl border border-border/60 shrink-0", features[activeStep].color)}>
                    {React.createElement(features[activeStep].icon, { className: "w-5 h-5" })}
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/80 block">
                      FEATURE {String(activeStep + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-base font-bold text-foreground">
                      {features[activeStep].title}
                    </h3>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-serif font-black italic text-primary/80 mb-1">
                    {features[activeStep].subtitle}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {features[activeStep].description}
                  </p>
                </div>

                <div className="space-y-2 border-t border-border/40 pt-4">
                  <h5 className="text-[9px] font-black uppercase tracking-widest text-foreground flex items-center gap-1.5">
                    <Info className="w-3 h-3 text-primary/60" />
                    Pro Tips & Workflows:
                  </h5>
                  <ul className="space-y-1.5 list-disc list-inside text-[11px] text-muted-foreground">
                    {features[activeStep].tips.map((tip, tIdx) => (
                      <li key={tIdx} className="leading-relaxed">
                        <span className="font-semibold text-foreground/90">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Step navigation buttons inside the box */}
            <div className="flex items-center justify-between border-t border-border/35 pt-4 mt-6 shrink-0">
              <button
                onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
                disabled={activeStep === 0}
                className={cn(
                  "px-4 py-1.5 rounded-xl border border-border text-[10px] font-bold uppercase tracking-wider transition-all",
                  activeStep === 0 ? "opacity-30 cursor-not-allowed text-muted-foreground" : "bg-background hover:bg-muted text-foreground cursor-pointer"
                )}
              >
                Back
              </button>

              <div className="flex items-center gap-1">
                {features.map((_, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      activeStep === i ? "w-5 bg-primary" : "w-1.5 bg-border/80"
                    )}
                  />
                ))}
              </div>

              {activeStep < features.length - 1 ? (
                <button
                  onClick={() => setActiveStep(prev => prev + 1)}
                  className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  Next
                  <ArrowRight className="w-3 h-3" />
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="px-5 py-1.5 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                >
                  Got It!
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
