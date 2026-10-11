import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, Bookmark, Link2, Share2 } from 'lucide-react';
import { useStore, Cabin } from '../store';
import { cn, translateDate, isValidLink, copyTextToClipboard, copyFormattedToClipboard, formatTemplateToEmailHtml } from '../lib/utils';
import { resolveCabinImages, resolveCabinImageUrl, extractCabinFeatures, getCleanWebsiteUrl, getWiredImages } from '../lib/shareService';
import { BoatSnapshot, CabinSnapshot } from '../types/share';
import { motion, AnimatePresence } from 'motion/react';

export const OutputPreview: React.FC = () => {
  const { boats, tabs, activeTabId, addNote, kicFiles, lebaliblogFiles } = useStore();
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
    cabinSelections = {}
  } = activeTab;
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedBoat = boats.find(b => b.name === selectedBoatName);
  const selectedCabins = selectedBoat?.cabins.filter(c => (selectedCabinIds || []).includes(c.id)) || [];

  const getCabinLabel = (c: Cabin) => {
    const { count = 1, extraBeds = 0 } = cabinSelections[c.id] || {};
    const baseName = language === 'ENG' && c.nameEng ? c.nameEng : c.name;
    let label = '';
    
    if (count > 1) {
      label += `${count} x ${baseName}`;
    } else {
      label += baseName;
    }
    
    if (extraBeds > 0) {
      if (language === 'ENG') {
        label += ` (+ ${extraBeds} Extra Bed${extraBeds > 1 ? 's' : ''})`;
      } else {
        label += ` (+ ${extraBeds} Lit${extraBeds > 1 ? 's' : ''} d'appoint)`;
      }
    }
    return label;
  };

  // In Charter mode, we only need the boat. In Cabin mode, we need at least one cabin.
  const showPreview = !!selectedBoat && (mode !== 'CABIN' || selectedCabins.length > 0);

  const translatedDates = translateDate(dates, language);
  const emptyStatusText = isBoatEmpty 
    ? (language === 'FR' ? ' (Bateau encore vide)' : ' (Boat still Empty)') 
    : '';

  const formatLabel = (label: string) => {
    if (formattingMode === 'WHATSAPP') return `*${label}*`;
    if (formattingMode === 'EMAIL') return `**${label}**`;
    return label;
  };

    const fuelPattern = /(?:⚠️\s*)?⛽?\s*(?:Surcharge\s*Carburant|Fuel\s*Surcharge)\s*[:\-]?\s*[^.\n\r]+[.\s]*/gi;
    const notePattern = /(?:Note\s*[:\-]\s*)?(?:Service\s*client\s*limité\s*en\s*cas\s*de\s*problème\s*sur\s*ce\s*bateau|Limited\s*(?:client|customer)\s*service\s*in\s*case\s*of\s*problems\s*on\s*this\s*boat)[.\s]*/gi;

    const generateText = (cabin: Cabin) => {
      if (mode === 'CHARTER') {
        const charterText = language === 'ENG' ? selectedBoat.charterEng : selectedBoat.charterFr;
        if (charterText) {
          let text = charterText.replace(/\[DATES\]/gi, translatedDates || '[DATES]');
          if (isBoatEmpty) {
            text += emptyStatusText;
          }
          return text.replace(fuelPattern, '').replace(notePattern, '');
        }
        return language === 'FR' ? 'Aucune version charter trouvée.' : 'No charter version found.';
      }

      const finalName = getCabinLabel(cabin);
      
      let link = '';
      if (linkPreference === 'ENG') {
        link = cabin.linkEng || cabin.link;
      } else if (linkPreference === 'FR') {
        link = cabin.link || cabin.linkEng;
      } else {
        link = language === 'ENG' ? (cabin.linkEng || cabin.link) : (cabin.link || cabin.linkEng);
      }
      
      const hasValidLink = isValidLink(link);

      const itinerary = language === 'ENG' 
        ? (cabin.itineraryEng || cabin.itinerary || 'Labuan Bajo (Flores) Round Trip') 
        : (cabin.itinerary || cabin.itineraryEng || 'Labuan Bajo (Flores) A/R');
      
      const departure = language === 'ENG' 
        ? (cabin.departureEng || cabin.departure || '11am-12pm / Arrival: 11am-12pm') 
        : (cabin.departure || cabin.departureEng || '11h-12h / Arrivée : 11h-12h');

      let result = '';
      if (language === 'FR') {
        result = `${formatLabel('Itinéraire')} : ${itinerary}  
${formatLabel('Dates')} : ${translatedDates || '[DATES]'}  
${formatLabel('Départ')} : ${departure}  
${formatLabel('Bateau')} : ${selectedBoatName}${emptyStatusText}  
${formatLabel('Chambre')} : ${finalName}${hasValidLink ? `  
${formatLabel('Detail')} : ${link}` : ''}`;
      } else {
        result = `${formatLabel('Itinerary')} : ${itinerary}  
${formatLabel('Dates')} : ${translatedDates || '[DATES]'}  
${formatLabel('Departure')} : ${departure}  
${formatLabel('Boat')} : ${selectedBoatName}${emptyStatusText}  
${formatLabel('Cabin')} : ${finalName}${hasValidLink ? `  
${formatLabel('Detail')} : ${link}` : ''}`;
      }
      return result.replace(fuelPattern, '').replace(notePattern, '');
    };

    const generateFullOutput = () => {
      if (!showPreview || !selectedBoat) return '';
      let output = '';
      
      // Collect fuel rates from all sources before cleaning
      let foundFuelRates = new Set<string>();
      const rawFuelRegex = /(?:⚠️\s*)?⛽?\s*(?:Surcharge\s*Carburant|Fuel\s*Surcharge)\s*[:\-]?\s*([^.\n\r]+)/gi;
      
      const checkTextForFuel = (t: string) => {
        let m;
        while ((m = rawFuelRegex.exec(t)) !== null) {
          foundFuelRates.add(m[1].trim());
        }
      };

      // Check board and cabins
      if (selectedBoat.charterFr) checkTextForFuel(selectedBoat.charterFr);
      if (selectedBoat.charterEng) checkTextForFuel(selectedBoat.charterEng);
      
      // Always scan cabins for metadata even if not selected in charter mode
      selectedBoat.cabins.forEach(c => {
        checkTextForFuel(c.name);
        if (c.nameEng) checkTextForFuel(c.nameEng);
        if (c.itinerary) checkTextForFuel(c.itinerary);
        if (c.itineraryEng) checkTextForFuel(c.itineraryEng);
        if (c.link) checkTextForFuel(c.link);
        if (c.linkEng) checkTextForFuel(c.linkEng);
      });

      if (mode === 'CHARTER') {
        // Use the boat direct data (via generateText which handles charter logic)
        output = generateText(selectedBoat.cabins[0]);
      } else if (selectedCabins.length === 1) {
        output = generateText(selectedCabins[0]);
      } else {
        const firstCabin = selectedCabins[0];
        const itinerary = language === 'ENG' 
          ? (firstCabin.itineraryEng || firstCabin.itinerary || 'Labuan Bajo (Flores) Round Trip') 
          : (firstCabin.itinerary || firstCabin.itineraryEng || 'Labuan Bajo (Flores) A/R');
        
        const departure = language === 'ENG' 
          ? (firstCabin.departureEng || firstCabin.departure || '11am-12pm / Arrival: 11am-12pm') 
          : (firstCabin.departure || firstCabin.departureEng || '11h-12h / Arrivée : 11h-12h');

        const cabinList = selectedCabins
          .map((c) => {
            const finalName = getCabinLabel(c);
            
            let link = '';
            if (linkPreference === 'ENG') {
              link = c.linkEng || c.link;
            } else if (linkPreference === 'FR') {
              link = c.link || c.linkEng;
            } else {
              link = language === 'ENG' ? (c.linkEng || c.link) : (c.link || c.linkEng);
            }
            
            // Clean link if it contains notes
            if (link) {
              link = link.replace(fuelPattern, '').replace(notePattern, '').trim();
            }
            
            const hasValidLink = isValidLink(link);
            return `- ${finalName}${hasValidLink ? ` : ${link}` : ''}`;
          })
          .join('\n');

        if (language === 'FR') {
          output = `${formatLabel('Itinéraire')} : ${itinerary}  
${formatLabel('Dates')} : ${translatedDates || '[DATES]'}  
${formatLabel('Départ')} : ${departure}  
${formatLabel('Bateau')} : ${selectedBoatName}${emptyStatusText}  
${formatLabel('Chambre')} : 
${cabinList}`;
        } else {
          output = `${formatLabel('Itinerary')} : ${itinerary}  
${formatLabel('Dates')} : ${translatedDates || '[DATES]'}  
${formatLabel('Departure')} : ${departure}  
${formatLabel('Boat')} : ${selectedBoatName}${emptyStatusText}  
${formatLabel('Cabin')} : 
${cabinList}`;
        }
      }

      // Final output post-processing
      let finalOutput = output.trim();
      finalOutput = finalOutput.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

      const lines = finalOutput.split('\n');
      const noteFr = "Note : Service client limité en cas de problème sur ce bateau";
      const noteEng = "Note: Limited client service in case of problems on this boat";

      if (showLimitedServiceNote) {
        // Only show types that were detected
        if (foundFuelRates.size > 0) {
          const rate = Array.from(foundFuelRates)[0];
          const label = language === 'FR' ? 'Surcharge Carburant' : 'Fuel Surcharge';
          lines.push(`⚠️ ⛽ ${label} : ${rate}`);
        }

        // Detect if a note was present in any raw text
        const noteFoundInRaw = [
          selectedBoat.charterFr,
          selectedBoat.charterEng,
          ...selectedBoat.cabins.flatMap(c => [c.name, c.nameEng, c.itinerary, c.itineraryEng, c.link, c.linkEng])
        ].some(t => t && notePattern.test(t));

        if (noteFoundInRaw) {
          lines.push(language === 'FR' ? noteFr : noteEng);
        }
      }
      return lines.join('\n');
    };

  const fullOutput = generateFullOutput();
  const fullOutputRef = useRef(fullOutput);
  fullOutputRef.current = fullOutput;

  const handleCopy = async () => {
    if (formattingMode === 'EMAIL') {
      const emailHtml = formatTemplateToEmailHtml(fullOutputRef.current);
      await copyFormattedToClipboard(fullOutputRef.current, emailHtml);
    } else {
      await copyTextToClipboard(fullOutputRef.current);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const handleHotkeyCopy = () => {
      handleCopy();
    };
    window.addEventListener('copy-itinerary-hotkey', handleHotkeyCopy);
    return () => window.removeEventListener('copy-itinerary-hotkey', handleHotkeyCopy);
  }, []);

  const handleSave = () => {
    let boatSnapshot: BoatSnapshot | undefined = undefined;

    if (selectedBoat) {
      const boatWired = getWiredImages(selectedBoat.name);
      const cabinTargets = mode === 'CHARTER' ? [selectedBoat.cabins[0]] : selectedCabins;

      // Detect fuel
      let fuel: string | undefined = undefined;
      const boatTexts = [
        selectedBoat.charterFr,
        selectedBoat.charterEng,
        ...selectedBoat.cabins.flatMap(c => [c.name, c.nameEng, c.itinerary, c.itineraryEng, c.link, c.linkEng])
      ].filter(Boolean) as string[];

      const rawFuelRegex = /(?:⚠️\s*)?⛽?\s*(?:Surcharge\s*Carburant|Fuel\s*Surcharge)\s*[:\-]?\s*([^.\n\r]+)/gi;
      for (const t of boatTexts) {
        const m = rawFuelRegex.exec(t);
        if (m && m[1]) {
          fuel = m[1].trim();
          break;
        }
      }

      let note: string | undefined = undefined;
      if (showLimitedServiceNote) {
        const notePattern = /(?:Note\s*[:\-]\s*)?(?:Service\s*client\s*limité\s*en\s*cas\s*de\s*problème\s*sur\s*ce\s*bateau|Limited\s*(?:client|customer)\s*service\s*in\s*case\s*of\s*problems\s*on\s*this\s*boat)[.\s]*/gi;
        if (boatTexts.some(t => notePattern.test(t))) {
          note = language === 'FR'
            ? "Note : Service client limité en cas de problème sur ce bateau"
            : "Note: Limited client service in case of problems on this boat";
        }
      }

      const durMatch = (dates || '').match(/(?:2D1N|3D2N|4D3N|4D2N|5D4N|3J2N|2J1N|4J3N)/i);
      const dur = durMatch ? durMatch[0].toUpperCase() : undefined;

      const firstCab = cabinTargets[0];
      const itin = firstCab ? (
        language === 'ENG' ? (firstCab.itineraryEng || firstCab.itinerary) : (firstCab.itinerary || firstCab.itineraryEng)
      ) : undefined;
      const dep = firstCab ? (
        language === 'ENG' ? (firstCab.departureEng || firstCab.departure) : (firstCab.departure || firstCab.departureEng)
      ) : undefined;

      const cabinsSnapshots: CabinSnapshot[] = cabinTargets.map(c => {
        const { count = 1, extraBeds = 0 } = cabinSelections[c.id] || {};
        const images = resolveCabinImages(selectedBoat.name, c, kicFiles, lebaliblogFiles, boatWired);
        const imageUrl = images[0] || resolveCabinImageUrl(selectedBoat.name, c, kicFiles, lebaliblogFiles, boatWired);
        const websiteUrl = getCleanWebsiteUrl(c, language, linkPreference || 'AUTO');
        const features = extractCabinFeatures(c, language, extraBeds);

        return {
          id: c.id,
          name: c.name,
          nameEng: c.nameEng,
          count,
          extraBeds,
          imageUrl,
          images,
          features,
          websiteUrl,
          itinerary: language === 'ENG' ? (c.itineraryEng || c.itinerary) : (c.itinerary || c.itineraryEng),
          departure: language === 'ENG' ? (c.departureEng || c.departure) : (c.departure || c.departureEng),
          schedule: language === 'ENG' ? (c.scheduleEng || c.schedule) : (c.schedule || c.scheduleEng)
        };
      });

      boatSnapshot = {
        boatName: selectedBoat.name,
        itinerary: itin || '',
        dates: translateDate(dates, language) || dates || '',
        duration: dur || '',
        departure: dep || '',
        cabins: cabinsSnapshots,
        fuelSurcharge: fuel || '',
        limitedServiceNote: note || ''
      };
    }

    addNote({
      title: selectedBoatName || 'Untitled Note',
      content: fullOutput,
      clientName: activeTab.name,
      boatSnapshot
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!showPreview) return null;

  const cabinCount = mode === 'CHARTER' ? 1 : selectedCabins.length;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-serif italic">4. Output Preview</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button 
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSave(); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              saved ? "bg-amber-500 text-white" : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
            )}
            title="Store Boat"
          >
            {saved ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            {saved ? 'Stored!' : 'Store Boat'}
          </button>
          <button 
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopy(); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              copied ? "bg-green-500 text-white" : "bg-primary text-primary-foreground hover:opacity-90"
            )}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy All'}
          </button>
        </div>
      </div>

      <div className="relative group">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/50 pointer-events-none rounded-2xl" />
        <div className="w-full p-6 rounded-2xl border border-border bg-card overflow-x-auto font-mono text-sm leading-relaxed whitespace-pre-wrap min-h-[400px] max-h-[650px] custom-scrollbar">
          {formattingMode === 'EMAIL' ? (
            fullOutput.split('\n').map((line, idx) => {
              const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
              const parts = line.split(urlRegex);
              return (
                <div key={idx} className="min-h-[1.4em]">
                  {parts.map((part, pIdx) => {
                    if (urlRegex.test(part)) {
                      return (
                        <a
                          key={pIdx}
                          href={part}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline hover:opacity-80 break-all cursor-pointer font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {part}
                        </a>
                      );
                    }
                    return <span key={pIdx}>{part}</span>;
                  })}
                </div>
              );
            })
          ) : (
            <pre className="font-mono text-sm whitespace-pre-wrap">{fullOutput}</pre>
          )}
        </div>
      </div>
      
      <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">
        {mode === 'CHARTER' ? 'Charter template generated' : `${cabinCount} ${cabinCount === 1 ? 'template' : 'templates'} generated`}
      </p>
    </motion.div>
  );
};
