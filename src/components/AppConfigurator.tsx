import React, { useState, useEffect } from 'react';
import { useStore, Boat, Cabin } from '../store';
import { 
  Settings2, Eye, EyeOff, Trash2, Plus, RefreshCw, CheckCircle, 
  Wifi, Database, ShieldAlert, Sparkles, X, AlertCircle, ShieldCheck,
  Lock, Unlock, Key, Image, Search, Mail, Link, Link2, Check, Loader2, FileText,
  Download, Upload, Keyboard, MessageCircle, Phone
} from 'lucide-react';
import { cn, sanitizeWiredUrls, validatePasswordStrength, sha256 } from '../lib/utils';
import { WhatsAppConfig, DEFAULT_WHATSAPP_CONFIG } from '../types/share';
import { getWhatsAppConfig, saveWhatsAppConfig, validateWhatsAppNumber } from '../lib/shareService';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db, auth, getWhitelistedEmails, saveWhitelistedEmails } from '../lib/firebase';

interface AppConfiguratorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppConfigurator: React.FC<AppConfiguratorProps> = ({ isOpen, onClose }) => {
  const { 
    boats, 
    setBoats,
    fileName,
    tabs, 
    activeTabId, 
    toggleShowMediaGallery, 
    toggleShowBoatCabinSelector, 
    toggleShowInquiryPanel, 
    toggleShowNotepad,
    addCustomBoat,
    deleteBoat,
    kicFiles,
    lebaliblogFiles,
    savedNotes,
    customWidth,
    setCustomWidth,
    customShortcuts,
    setCustomShortcut,
    resetShortcuts
  } = useStore();

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || {};
  const { 
    showMediaGallery = true, 
    showBoatCabinSelector = true, 
    showInquiryPanel = true, 
    showNotepad = true,
    language = 'ENG'
  } = activeTab as any;

  // Security variables
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(() => {
    // If no password configured, or unlocked in this session, open directly without friction
    const savedHash = typeof localStorage !== 'undefined' ? localStorage.getItem('datacenter_admin_password') : null;
    if (!savedHash) return true;
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('datacenter_unlocked') === 'true' : false;
  });
  const [pPassError, setPPassError] = useState<string | null>(null);
  
  // Custom password management
  const [newPass, setNewPass] = useState('');
  const [passFeedback, setPassFeedback] = useState<string | null>(null);

  // Layout navigation
  const [subTab, setSubTab] = useState<'vessels' | 'wiring' | 'scanner' | 'whatsapp' | 'whitelist' | 'layout' | 'shortcuts'>('vessels');

  // WhatsApp configuration state
  const [waConfig, setWaConfig] = useState<WhatsAppConfig>(DEFAULT_WHATSAPP_CONFIG);
  const [waSuccess, setWaSuccess] = useState<string | null>(null);
  const [waError, setWaError] = useState<string | null>(null);
  const [waSaving, setWaSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getWhatsAppConfig().then(setWaConfig);
      const isAlreadyUnlocked = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('datacenter_unlocked') === 'true' : false;
      const hasPass = typeof localStorage !== 'undefined' ? !!localStorage.getItem('datacenter_admin_password') : false;
      if (isAlreadyUnlocked || !hasPass) {
        setIsUnlocked(true);
      }
    }
  }, [isOpen]);

  // Vessel management state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBoatName, setNewBoatName] = useState('');
  const [newCabinsText, setNewCabinsText] = useState('');
  const [vesselError, setVesselError] = useState<string | null>(null);
  const [selectedBoatNameForCabins, setSelectedBoatNameForCabins] = useState<string>('');

  // Cabin additions
  const [newCabinName, setNewCabinName] = useState('');
  const [newCabinNameEng, setNewCabinNameEng] = useState('');
  const [newCabinLink, setNewCabinLink] = useState('');
  const [newCabinLinkEng, setNewCabinLinkEng] = useState('');

  // Custom image wiring state
  const [wiredBoatName, setWiredBoatName] = useState<string>('');
  const [companyTab, setCompanyTab] = useState<'KIC' | 'LEBALIBLOG'>('KIC');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [batchImageUrls, setBatchImageUrls] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [wiredUrls, setWiredUrls] = useState<string[]>([]);
  const [loadingWired, setLoadingWired] = useState(false);
  const [wiringError, setWiringError] = useState<string | null>(null);
  const [wiringSuccess, setWiringSuccess] = useState<string | null>(null);

  // Missing Images Scanner
  const [missingCabinsList, setMissingCabinsList] = useState<{ boatName: string; cabin: Cabin }[]>([]);
  const [wiringInputs, setWiringInputs] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);

  // Whitelist manager
  const [whitelistedEmails, setWhitelistedEmails] = useState<string[]>([]);
  const [newOperatorEmail, setNewOperatorEmail] = useState('');
  const [whitelistSuccess, setWhitelistSuccess] = useState<string | null>(null);
  const [whitelistError, setWhitelistError] = useState<string | null>(null);

  // Compute standard dynamic admin passphrase
  const getAdminPassphrase = () => {
    return localStorage.getItem('datacenter_admin_password');
  };

  const handleSetupPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    setPPassError(null);
    const pass = password.trim();
    if (!pass) {
      // Just unlock directly if submitted empty
      sessionStorage.setItem('datacenter_unlocked', 'true');
      setIsUnlocked(true);
      return;
    }
    const hashed = sha256(pass);
    localStorage.setItem('datacenter_admin_password', hashed);
    sessionStorage.setItem('datacenter_unlocked', 'true');
    setIsUnlocked(true);
    setPassword('');
  };

  const MASTER_PASSCODES = [
    'admin123', 'admin', 'komodo2026', 'komodo', 'operator2026', 'operator', 
    'cabingen', '1234', '123456', '12345678', 'password', 'bookinghub'
  ];

  const handleResetPasscode = () => {
    localStorage.removeItem('datacenter_admin_password');
    sessionStorage.setItem('datacenter_unlocked', 'true');
    setIsUnlocked(true);
    setPassword('');
    setPPassError(null);
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setPPassError(null);
    const inputTrimmed = password.trim();
    const correctHash = getAdminPassphrase();
    const inputHash = sha256(inputTrimmed);

    // Accept stored hash, master passcodes, or fallback unlock if field is submitted
    if (
      !correctHash || 
      (correctHash && inputHash === correctHash) || 
      MASTER_PASSCODES.includes(inputTrimmed.toLowerCase()) ||
      inputTrimmed.toLowerCase() === 'admin'
    ) {
      sessionStorage.setItem('datacenter_unlocked', 'true');
      setIsUnlocked(true);
      setPassword('');
      setPPassError(null);
    } else {
      setPPassError(language === 'FR' ? "Mot de passe incorrect" : "Incorrect administrator password");
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPassFeedback(null);
    const pass = newPass.trim();
    if (!pass) return;
    const strengthErr = validatePasswordStrength(pass, language);
    if (strengthErr) {
      setPassFeedback(strengthErr);
      return;
    }
    const hashed = sha256(pass);
    localStorage.setItem('datacenter_admin_password', hashed);
    setPassFeedback(language === 'FR' ? "Le mot de passe administrateur a été modifié" : "Administrator password modified successfully");
    setNewPass('');
  };

  // Helper inside DataCenter
  const getBoatDocId = (name: string, compTab: 'KIC' | 'LEBALIBLOG') => {
    const prefix = compTab === 'KIC' ? 'kic_' : 'lbb_';
    return (prefix + name.replace(/[^a-zA-Z0-9_\-]+/g, '_')).toLowerCase().slice(0, 80);
  };

  // Setup default dynamic boat for selection on tab switch
  useEffect(() => {
    if (boats.length > 0) {
      if (!selectedBoatNameForCabins) {
        setSelectedBoatNameForCabins(boats[0].name);
      }
      if (!wiredBoatName) {
        setWiredBoatName(boats[0].name);
      }
    }
  }, [boats]);

  // Load Whitelist on tab unlock or click
  useEffect(() => {
    if (isUnlocked) {
      getWhitelistedEmails().then(setWhitelistedEmails);
    }
  }, [isUnlocked]);

  // Read wired image links for selected boat in wiring pane
  useEffect(() => {
    if (!isUnlocked || !wiredBoatName) return;
    setLoadingWired(true);
    setWiredUrls([]);
    setWiringError(null);
    setWiringSuccess(null);

    const docId = getBoatDocId(wiredBoatName, companyTab);
    const docRef = doc(db, 'wiredBoatImages', docId);

    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWiredUrls(data.urls || []);
      } else {
        setWiredUrls([]);
      }
      setLoadingWired(false);
    }, (err) => {
      console.error("Wiring real-time fetch failure", err);
      setLoadingWired(false);
    });

    return () => unsub();
  }, [wiredBoatName, companyTab, isUnlocked]);

  // Run the missing images scanner
  const runImagesScanner = () => {
    setScanning(true);
    const missing: { boatName: string; cabin: Cabin }[] = [];
    
    // We match image filenames to cabin names
    const allDriveFiles = [...kicFiles, ...lebaliblogFiles];

    boats.forEach((boat) => {
      boat.cabins.forEach((cabin) => {
        // Look up by cabin name matches
        const cName = cabin.name.toLowerCase();
        const cNameEng = cabin.nameEng ? cabin.nameEng.toLowerCase() : '';

        // Check if cabin directly has non-empty link, then it is NOT missing
        if (cabin.link && cabin.link.trim() !== '' && !['no', 'n/a', 'non'].includes(cabin.link.toLowerCase())) {
          return;
        }
        if (cabin.linkEng && cabin.linkEng.trim() !== '' && !['no', 'n/a', 'non'].includes(cabin.linkEng.toLowerCase())) {
          return;
        }

        // Look for file containing name
        const matchDrive = allDriveFiles.some((f) => {
          const fName = (f.name || '').toLowerCase();
          return (fName.includes(cName) && cName.length > 2) || (cNameEng !== '' && fName.includes(cNameEng) && cNameEng.length > 2);
        });

        if (matchDrive) return;

        // Note: Missing image found for this cabin!
        missing.push({ boatName: boat.name, cabin });
      });
    });

    setMissingCabinsList(missing);
    setScanning(false);
  };

  useEffect(() => {
    if (isUnlocked && subTab === 'scanner') {
      runImagesScanner();
    }
  }, [isUnlocked, subTab, boats, kicFiles, lebaliblogFiles]);

  const handleAddBoat = (e: React.FormEvent) => {
    e.preventDefault();
    setVesselError(null);

    const name = newBoatName.trim();
    if (!name) {
      setVesselError(language === 'FR' ? "Le nom du bateau est requis." : "Boat name is required.");
      return;
    }

    if (boats.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      setVesselError(language === 'FR' ? "Ce bateau existe déjà." : "This boat already exists.");
      return;
    }

    // Parse cabins
    const cabinNames = newCabinsText
      .split(/[\n,;]+/)
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (cabinNames.length === 0) {
      setVesselError(language === 'FR' ? "Au moins une cabine est requise." : "At least one cabin is required.");
      return;
    }

    const newBoat: Boat = {
      name,
      cabins: cabinNames.map((cName, idx) => ({
        id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_cabin_${idx}_${Date.now()}`,
        name: cName,
        link: '',
        linkEng: ''
      }))
    };

    addCustomBoat(newBoat);
    setNewBoatName('');
    setNewCabinsText('');
    setShowAddForm(false);
  };

  // Add a new cabin to the selected boat
  const handleAddCabin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCabinName.trim() || !selectedBoatNameForCabins) return;

    const boatToUpdate = boats.find(b => b.name === selectedBoatNameForCabins);
    if (!boatToUpdate) return;

    const newCab: Cabin = {
      id: `${selectedBoatNameForCabins.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_cabin_${Date.now()}`,
      name: newCabinName.trim(),
      nameEng: newCabinNameEng.trim() || newCabinName.trim(),
      link: newCabinLink.trim(),
      linkEng: newCabinLinkEng.trim() || newCabinLink.trim(),
    };

    const updatedCabins = [...boatToUpdate.cabins, newCab];
    const updatedBoats = boats.map((b) => {
      if (b.name === selectedBoatNameForCabins) {
        return { ...b, cabins: updatedCabins };
      }
      return b;
    });

    setBoats(updatedBoats, fileName || 'Active Database Workspace');
    setNewCabinName('');
    setNewCabinNameEng('');
    setNewCabinLink('');
    setNewCabinLinkEng('');
  };

  // Remove a cabin from selected boat
  const handleRemoveCabin = (cabinId: string) => {
    const boatToUpdate = boats.find(b => b.name === selectedBoatNameForCabins);
    if (!boatToUpdate) return;

    const updatedCabins = boatToUpdate.cabins.filter(c => c.id !== cabinId);
    const updatedBoats = boats.map((b) => {
      if (b.name === selectedBoatNameForCabins) {
        return { ...b, cabins: updatedCabins };
      }
      return b;
    });

    setBoats(updatedBoats, fileName || 'Active Database Workspace');
  };

  // Edit/Save cabin links directly
  const handleUpdateCabinLink = (cabinId: string, type: 'fr' | 'eng', val: string) => {
    const boatToUpdate = boats.find(b => b.name === selectedBoatNameForCabins);
    if (!boatToUpdate) return;

    const updatedCabins = boatToUpdate.cabins.map((c) => {
      if (c.id === cabinId) {
        return type === 'fr' ? { ...c, link: val } : { ...c, linkEng: val };
      }
      return c;
    });

    const updatedBoats = boats.map((b) => {
      if (b.name === selectedBoatNameForCabins) {
        return { ...b, cabins: updatedCabins };
      }
      return b;
    });

    setBoats(updatedBoats, fileName || 'Active Database Workspace');
  };

  // Helper to execute setDoc with a safety timeout to avoid infinite buffering if client is offline or firebase blocks the write
  const setDocWithTimeout = async (docRef: any, data: any, timeoutMs = 4000) => {
    let timer: any;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(language === 'FR' 
          ? "Délai de connexion dépassé. Sauvegarde effectuée uniquement sur cet appareil pour l'instant." 
          : "Cloud sync timeout. Changes saved locally on this device, but syncing with other devices may be delayed until a stronger connection is established."
        ));
      }, timeoutMs);
    });

    try {
      await Promise.race([
        setDoc(docRef, data),
        timeoutPromise
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  // Helper to commit a batch with a safety timeout to prevent hanging
  const commitBatchWithTimeout = async (batch: any, timeoutMs = 6000) => {
    let timer: any;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(language === 'FR'
          ? "La synchronisation Cloud a expiré. Les données sont enregistrées localement sur cet appareil."
          : "Cloud synchronization matching timed out. Changes saved locally on this device first."
        ));
      }, timeoutMs);
    });

    try {
      await Promise.race([
        batch.commit(),
        timeoutPromise
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  // Save wired images for choice boat & company tab
  const saveUrlsArray = async (rawUrls: string[]) => {
    if (!wiredBoatName) return;
    setLoadingWired(true);
    setWiringError(null);
    setWiringSuccess(null);

    const docId = getBoatDocId(wiredBoatName, companyTab);
    const docRef = doc(db, 'wiredBoatImages', docId);
    const urlsToSave = sanitizeWiredUrls(rawUrls);

    // Save to localStorage as redundancy (immediate local update!)
    localStorage.setItem(`wired_images_${docId}`, JSON.stringify(urlsToSave));

    if (!auth.currentUser) {
      setWiringSuccess(language === 'FR'
        ? "Enregistré sur cet appareil uniquement. Connectez-vous avec Google pour l'étape 1 afin d'activer la synchronisation."
        : "Saved locally on this device only. Please sign in with Google in Step 1 to enable cloud synchronization with other accounts."
      );
      setLoadingWired(false);
      return;
    }

    try {
      await setDocWithTimeout(docRef, {
        boatName: wiredBoatName,
        urls: urlsToSave,
        updatedBy: auth.currentUser.uid,
        updatedAt: serverTimestamp()
      });
      setWiringSuccess(language === 'FR' ? "Liaisons d'images enregistrées avec succès !" : "Custom image links saved successfully!");
    } catch (err: any) {
      console.error("Firestore cloud backup failed/timed out:", err);
      // Still show warning rather than crash, because the localStorage backup already succeeded!
      setWiringError(language === 'FR' 
        ? "Enregistré localement uniquement. (Vérifiez votre connexion internet ou connectez-vous dans l'Étape 1 pour synchroniser)" 
        : `Saved on this device only. (${err.message || 'Check connection or verify operator login inside Step 1'})`
      );
    } finally {
      setLoadingWired(false);
    }
  };

  const handleAddManualImage = () => {
    const url = manualImageUrl.trim();
    if (!url) return;
    if (!url.startsWith('http')) {
      setWiringError(language === 'FR' ? "Veuillez entrer une adresse URL valide" : "Provide a valid URL starting with http:// or https://");
      return;
    }

    if (wiredUrls.includes(url)) {
      setWiringError(language === 'FR' ? "Ce lien est déjà connecté" : "This URL link is already registered");
      return;
    }

    const updated = [...wiredUrls, url];
    saveUrlsArray(updated);
    setManualImageUrl('');
  };

  const handleAddBatchImages = () => {
    const text = batchImageUrls.trim();
    if (!text) return;

    const parsedLinks = text
      .split(/[\n,;]+/)
      .map(l => l.trim())
      .filter(l => l.startsWith('http'));

    if (parsedLinks.length === 0) {
      setWiringError(language === 'FR' ? "Aucun lien valide trouvé" : "No valid http:// or https:// links parsed");
      return;
    }

    const nextUrls = [...wiredUrls];
    parsedLinks.forEach((link) => {
      if (!nextUrls.includes(link)) {
        nextUrls.push(link);
      }
    });

    saveUrlsArray(nextUrls).then(() => {
      setBatchImageUrls('');
    });
  };

  const handleDeleteWiredLink = (linkToDelete: string) => {
    const updated = wiredUrls.filter(u => u !== linkToDelete);
    saveUrlsArray(updated);
  };

  // Wire inline scanning link resolving
  const handleScannerQuickWire = async (targetBoatName: string, cabinId: string, cabinName: string, company: 'KIC' | 'LEBALIBLOG') => {
    const inputVal = wiringInputs[`${cabinId}_${company}`]?.trim();
    if (!inputVal || !inputVal.startsWith('http')) {
      alert("Please provide a valid direct image URL beginning with http...");
      return;
    }

    // Step 1: Update the cabin's direct link property in the workspace
    const boatToUpdate = boats.find(b => b.name === targetBoatName);
    if (boatToUpdate) {
      const updatedCabins = boatToUpdate.cabins.map((c) => {
        if (c.id === cabinId) {
          return company === 'KIC' ? { ...c, linkEng: inputVal } : { ...c, link: inputVal };
        }
        return c;
      });
      const updatedBoats = boats.map((b) => {
        if (b.name === targetBoatName) {
          return { ...b, cabins: updatedCabins };
        }
        return b;
      });
      setBoats(updatedBoats, fileName || 'Active Database Workspace');
    }

    // Step 2: Also save it under the custom wired images list in Firestore for absolute safety!
    const docId = getBoatDocId(targetBoatName, company);
    const docRef = doc(db, 'wiredBoatImages', docId);
    let currentUrls: string[] = [];
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        currentUrls = snap.data().urls || [];
      }
    } catch (_) {}

    if (!currentUrls.includes(inputVal)) {
      currentUrls.push(inputVal);
    }

    try {
      await setDoc(docRef, {
        boatName: targetBoatName,
        urls: currentUrls,
        updatedBy: auth.currentUser?.uid || 'anonymous_operator',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Wired backup error: ", err);
    }

    // Clear resolved inputs
    setWiringInputs(prev => {
      const next = { ...prev };
      delete next[`${cabinId}_${company}`];
      return next;
    });

    // Re-run scan instantly to clear from missing list!
    alert(`Success! Wired link for ${cabinName} to ${company}.`);
  };

  // Helper inside AppConfigurator to parse multi-boat customized txt image mapping database
  const parseWiredTxt = (text: string) => {
    const lines = text.split('\n');
    const results: { boatName: string; company: 'KIC' | 'LEBALIBLOG'; urls: string[] }[] = [];
    
    let currentBoat: string | null = null;
    let currentCompany: 'KIC' | 'LEBALIBLOG' = 'KIC';
    let currentUrls: string[] = [];

    const commitCurrent = () => {
      if (currentBoat) {
        // Find case-insensitive canonical match in active boats
        const matchedBoat = boats.find(b => b.name.toLowerCase() === currentBoat!.toLowerCase());
        const finalBoatName = matchedBoat ? matchedBoat.name : currentBoat;
        
        const existing = results.find(
          r => r.boatName.toLowerCase() === finalBoatName.toLowerCase() && r.company === currentCompany
        );
        if (existing) {
          existing.urls = Array.from(new Set([...existing.urls, ...currentUrls]));
        } else {
          results.push({
            boatName: finalBoatName,
            company: currentCompany,
            urls: [...currentUrls]
          });
        }
      }
      currentUrls = [];
    };

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) {
        continue;
      }

      // Check if it has an explicit tag: e.g. [KIC: Boat Name] or [LBB: Boat Name]
      const tagMatch = line.match(/^\[(KIC|LBB|LEBALIBLOG)\s*:\s*(.+)\]$/i);
      if (tagMatch) {
        commitCurrent();
        const scope = tagMatch[1].toUpperCase();
        currentCompany = (scope === 'LBB' || scope === 'LEBALIBLOG') ? 'LEBALIBLOG' : 'KIC';
        currentBoat = tagMatch[2].trim();
        continue;
      }

      if (line.startsWith('http://') || line.startsWith('https://')) {
        if (currentBoat) {
          currentUrls.push(line);
        }
      } else {
        // It's a new boat name
        commitCurrent();
        currentBoat = line;
        currentCompany = 'KIC'; // default company when implicit
      }
    }
    commitCurrent();
    return results;
  };

  // Export ALL Firestore custom wired images into organized TXT structure
  const handleExportWiredTxt = async () => {
    setIsExporting(true);
    setWiringError(null);
    setWiringSuccess(null);
    try {
      const qSnap = await getDocs(collection(db, 'wiredBoatImages'));
      let outputText = `# === WIRED IMAGES DATABASE TXT BACKUP ===\n`;
      outputText += `# Exported on: ${new Date().toISOString()}\n`;
      outputText += `# You can edit this file to add or remove missing images, then upload it to refresh the database.\n`;
      outputText += `# Format:\n`;
      outputText += `#   [KIC: Boat Name] or [LBB: Boat Name]\n`;
      outputText += `#   followed by direct image link URLs (one per line). Blank lines separate boats.\n\n`;

      const wiredMap: Record<string, string[]> = {};
      qSnap.forEach((docSnap) => {
        wiredMap[docSnap.id] = docSnap.data().urls || [];
      });

      const handledKeys = new Set<string>();

      if (boats && boats.length > 0) {
        outputText += `# === ACTIVE FLEET BOAT TEMPLATES ===\n`;
        outputText += `# Simply paste your image link URLs right below the corresponding boat header block.\n\n`;

        boats.forEach((boat) => {
          const kicKey = getBoatDocId(boat.name, 'KIC');
          const lbbKey = getBoatDocId(boat.name, 'LEBALIBLOG');

          const kicUrls = wiredMap[kicKey] || [];
          const lbbUrls = wiredMap[lbbKey] || [];

          handledKeys.add(kicKey);
          handledKeys.add(lbbKey);

          // KIC entry
          outputText += `[KIC: ${boat.name}]\n`;
          if (kicUrls.length > 0) {
            kicUrls.forEach((url: string) => {
              outputText += `${url}\n`;
            });
          } else {
            outputText += `# (Paste KIC image URLs for ${boat.name} here, one per line)\n`;
          }
          outputText += `\n`;

          // LBB entry
          outputText += `[LBB: ${boat.name}]\n`;
          if (lbbUrls.length > 0) {
            lbbUrls.forEach((url: string) => {
              outputText += `${url}\n`;
            });
          } else {
            outputText += `# (Paste LEBALIBLOG image URLs for ${boat.name} here, one per line)\n`;
          }
          outputText += `\n`;
        });
      }

      // Output any legacy or other items in Firestore that were not in the active fleet workspace
      let hasLegacy = false;
      qSnap.forEach((docSnap) => {
        const id = docSnap.id;
        if (!handledKeys.has(id)) {
          const data = docSnap.data();
          const boatName = data.boatName || id.replace(/^(kic_|lbb_)/, '').replace(/_/g, ' ');
          const urls = data.urls || [];
          if (urls.length > 0) {
            if (!hasLegacy) {
              outputText += `# === OTHER STORED WIRED IMAGES ===\n\n`;
              hasLegacy = true;
            }
            const isKIC = id.startsWith('kic_');
            outputText += `[${isKIC ? 'KIC' : 'LBB'}: ${boatName}]\n`;
            urls.forEach((url: string) => {
              outputText += `${url}\n`;
            });
            outputText += `\n`;
          }
        }
      });

      const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wired_images_database_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setWiringSuccess(language === 'FR' ? "Base de données exportée avec succès sous forme de fichier TXT !" : "Wired images database successfully exported as TXT file!");
    } catch (err: any) {
      console.error(err);
      setWiringError(language === 'FR' ? "L'exportation a échoué" : `Export failed: ${err.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Upload, parse, and refresh/overwrite Firestore custom image sync collections
  const handleImportWiredTxt = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!auth.currentUser) {
      const proceed = window.confirm(
        language === 'FR'
          ? "⚠️ Vous n'êtes pas connecté à Google (Étape 1).\n\nL'importation se fera uniquement LOCALEMENT sur cet ordinateur et ne sera PAS partagée avec d'autres comptes ou appareils.\n\nSouhaitez-vous continuer tout de même ?"
          : "⚠️ You are not signed in to Google (Step 1).\n\nThe database will be uploaded LOCALLY to this browser only and will NOT synchronize with other accounts or devices.\n\nDo you want to continue anyway?"
      );
      if (!proceed) {
        event.target.value = '';
        return;
      }
    }

    setIsImporting(true);
    setWiringError(null);
    setWiringSuccess(null);

    try {
      const reader = new FileReader();
      const text = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string || '');
        reader.onerror = (e) => reject(new Error("File reading failed"));
        reader.readAsText(file);
      });

      const parsedResults = parseWiredTxt(text);
      if (parsedResults.length === 0) {
        throw new Error(language === 'FR' ? "Aucune liaison d'image valide trouvée à importer dans le fichier." : "No valid image links or boat blocks parsed from the file.");
      }

      // Save each to local localStorage immediately for absolute snappiness
      for (const item of parsedResults) {
        const docId = getBoatDocId(item.boatName, item.company);
        const cleanUrls = sanitizeWiredUrls(item.urls);
        localStorage.setItem(`wired_images_${docId}`, JSON.stringify(cleanUrls));
      }

      // If user is not logged in, we are completed locally and do not trigger slow write attempts
      if (!auth.currentUser) {
        setWiringSuccess(
          language === 'FR'
            ? `Restauration locale complétée ! ${parsedResults.length} bateaux restaurés directement sur ce navigateur.`
            : `Local recovery complete! All ${parsedResults.length} vessel mappings updated on this device. Sign in with Google in Step 1 to sync with other accounts.`
        );
        return;
      }

      // Perform a batch operation which is a single fast request for all documents!
      const batchOp = writeBatch(db);
      for (const item of parsedResults) {
        const docId = getBoatDocId(item.boatName, item.company);
        const docRef = doc(db, 'wiredBoatImages', docId);
        batchOp.set(docRef, {
          boatName: item.boatName,
          urls: sanitizeWiredUrls(item.urls),
          updatedBy: auth.currentUser.uid,
          updatedAt: serverTimestamp()
        });
      }

      try {
        await commitBatchWithTimeout(batchOp, 6000);
        setWiringSuccess(
          language === 'FR' 
            ? `Importation complétée ! ${parsedResults.length} bateaux mis à jour sur Firestore.` 
            : `Database refreshed successfully! Synced ${parsedResults.length} vessel image templates directly to Firestore.`
        );
      } catch (cloudErr: any) {
        console.error("Firestore batch commit failed/timed out:", cloudErr);
        setWiringSuccess(
          language === 'FR'
            ? `Restauration locale complétée (${parsedResults.length} bateaux enregistrés sur cet appareil). Remarque : La synchronisation Cloud a échoué (${cloudErr.message || "Veuillez vérifier votre session"}).`
            : `Local recovery complete! All ${parsedResults.length} vessel mappings updated on this device. Note: Cloud synchronization failed (${cloudErr.message || "Please verify your session"}).`
        );
      }
    } catch (err: any) {
      console.error(err);
      setWiringError(language === 'FR' ? "L'importation a échoué" : `Import failure: ${err.message || err}`);
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  // Whitelist CRUD
  const handleAddOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setWhitelistError(null);
    setWhitelistSuccess(null);

    const email = newOperatorEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setWhitelistError("Please enter a valid operator email address");
      return;
    }

    if (whitelistedEmails.includes(email)) {
      setWhitelistError("This email is already whitelisted.");
      return;
    }

    const nextWhitelist = [...whitelistedEmails, email];
    try {
      await saveWhitelistedEmails(nextWhitelist);
      setWhitelistedEmails(nextWhitelist);
      setNewOperatorEmail('');
      setWhitelistSuccess(`Successfully added operator: ${email}`);
    } catch (err: any) {
      setWhitelistError("Failed to save whitelist dynamically on Firestore. Ensure write credentials.");
    }
  };

  const handleRemoveOperator = async (emailToRemove: string) => {
    setWhitelistError(null);
    setWhitelistSuccess(null);

    if (whitelistedEmails.length <= 1) {
      setWhitelistError("You must keep at least one whitelisted email to avoid master lockout.");
      return;
    }

    if (confirm(`Remove operator role for: ${emailToRemove}?`)) {
      const nextWhitelist = whitelistedEmails.filter(e => e !== emailToRemove);
      try {
        await saveWhitelistedEmails(nextWhitelist);
        setWhitelistedEmails(nextWhitelist);
        setWhitelistSuccess("Operator removed successfully.");
      } catch (err) {
        setWhitelistError("Failed to remove email on Firestore cloud database.");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/85 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Click outside to close */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        id="app-configurator-modal"
        className="relative bg-card border border-border shadow-2xl rounded-3xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden z-10"
      >
        
        {/* HEADER */}
        <div className="px-6 py-4.5 border-b border-border/60 flex items-center justify-between bg-muted/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/15 text-primary rounded-xl shrink-0">
              <Database className="w-5.5 h-5.5" />
            </div>
            <div>
              <h4 className="text-base font-bold font-serif tracking-tight text-foreground flex items-center gap-2">
                {language === 'FR' ? 'Base de Données & Contrôle' : 'CabinGen Data Center'}
                <span className="inline-flex items-center h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </h4>
              <p className="text-[11px] text-muted-foreground leading-normal">
                {language === 'FR' ? 'Gestion complète en direct de la flotte, cabines, connecteurs d\'images et opérateurs Gmail.' : 'Direct fleet editor, cabin details, multi-tab custom image sync, and Operator Whitelists.'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-all cursor-pointer border border-transparent hover:border-border"
            title="Close Settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SECURITY GATEWAY LOCK SCREEN */}
        {!isUnlocked ? (
          <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center space-y-6 text-center max-w-md mx-auto">
            {!getAdminPassphrase() ? (
              // First-time setup view
              <>
                <div className="p-4 bg-amber-500/10 text-amber-500 rounded-full animate-pulse">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                
                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-foreground">Secure Your Data Center</h2>
                  <p className="text-xs text-muted-foreground">
                    No passcode is currently set. Create a custom administrator passcode to protect your settings.
                  </p>
                </div>

                <form onSubmit={handleSetupPasscode} className="w-full space-y-3.5">
                  <div className="space-y-1 text-left">
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                      Choose Passcode
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        autoFocus
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Choose a secure passcode"
                        className="w-full bg-background/55 border border-border text-xs rounded-xl pl-9 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      />
                      <Key className="w-4 h-4 text-muted-foreground/60 absolute left-3 top-3" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Save & Unlock
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem('datacenter_unlocked', 'true');
                      setIsUnlocked(true);
                    }}
                    className="w-full py-2 border border-border/80 hover:bg-muted text-xs font-semibold rounded-xl text-foreground transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>{language === 'FR' ? "Accéder aux paramètres sans code" : "Open Settings Directly (Skip Passcode)"}</span>
                  </button>
                </form>
              </>
            ) : (
              // Normal unlock view
              <>
                <div className="p-4 bg-primary/10 text-primary rounded-full animate-bounce">
                  <Lock className="w-8 h-8" />
                </div>
                
                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-foreground">Data Center Locked</h2>
                  <p className="text-xs text-muted-foreground">
                    Enter your administrative passcode or click below to unlock settings immediately.
                  </p>
                </div>

                <form onSubmit={handleUnlock} className="w-full space-y-3.5">
                  {pPassError && (
                    <div className="p-3 text-[11px] text-destructive bg-destructive/10 rounded-xl border border-destructive/20 flex flex-col gap-2 text-left leading-normal">
                      <div className="flex items-center gap-1.5 font-medium">
                        <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
                        <span>{pPassError}</span>
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-destructive/15">
                        <button
                          type="button"
                          onClick={() => {
                            if (password.trim()) {
                              localStorage.setItem('datacenter_admin_password', sha256(password.trim()));
                            } else {
                              localStorage.removeItem('datacenter_admin_password');
                            }
                            sessionStorage.setItem('datacenter_unlocked', 'true');
                            setIsUnlocked(true);
                            setPassword('');
                            setPPassError(null);
                          }}
                          className="px-3 py-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive text-[11px] font-bold rounded-lg transition-all cursor-pointer"
                        >
                          {language === 'FR' ? "Déverrouiller avec ce code" : "Unlock with this passcode"}
                        </button>
                        <button
                          type="button"
                          onClick={handleResetPasscode}
                          className="px-3 py-1.5 bg-primary text-primary-foreground text-[11px] font-bold rounded-lg transition-all cursor-pointer"
                        >
                          {language === 'FR' ? "Ignorer & Ouvrir" : "Skip & Open"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1 text-left">
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                      Operator Passcode
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        autoFocus
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter admin passcode"
                        className="w-full bg-background/55 border border-border text-xs rounded-xl pl-9 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      />
                      <Key className="w-4 h-4 text-muted-foreground/60 absolute left-3 top-3" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Unlock Access
                  </button>

                  <button
                    type="button"
                    onClick={handleResetPasscode}
                    className="w-full py-2 border border-primary/30 bg-primary/10 hover:bg-primary/20 text-xs font-bold text-primary rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Unlock className="w-3 h-3" />
                    <span>{language === 'FR' ? "Réinitialiser & Déverrouiller Immédiatement" : "Reset & Unlock Settings Instantly"}</span>
                  </button>

                  <div className="pt-2 flex flex-col items-center gap-1.5 border-t border-border/40 text-center">
                    <span className="text-[10px] text-muted-foreground/75 font-mono">
                      {language === 'FR' ? "Passe maître : admin123 ou cabingen" : "Master passcode: admin123 or cabingen"}
                    </span>
                  </div>
                </form>
              </>
            )}
          </div>
        ) : (
          /* UNLOCKED FULL CONTROL CONTENT */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* SIDE TAB NAV */}
            <div className="w-full md:w-56 border-r border-border/50 bg-muted/10 shrink-0 flex flex-row md:flex-col p-2 gap-1 overflow-x-auto md:overflow-x-visible custom-scrollbar">
              {[
                { id: 'vessels', label: language === 'FR' ? '🛶 Navires & Cabines' : '🛶 Vessels & Cabins', desc: 'Add/edit boats and cabin properties' },
                { id: 'wiring', label: language === 'FR' ? '🔗 Liens d\'Images' : '🔗 Image Wiring', desc: 'Sync custom image collections' },
                { id: 'scanner', label: language === 'FR' ? '🔍 Scanner d\'images' : '🔍 Missing Scan', desc: 'Auto-detect missing cabin links' },
                { id: 'whatsapp', label: language === 'FR' ? '🔗 Liens & WhatsApp' : '🔗 Share Links & WhatsApp', desc: 'Share links and WhatsApp contact settings' },
                { id: 'whitelist', label: language === 'FR' ? '👥 Opérateurs WH' : '👥 Whitelist Gmail', desc: 'Manage registered operator list' },
                { id: 'layout', label: language === 'FR' ? '⚙️ Layout & Sécurité' : '⚙️ Layout & Pass', desc: 'Adjust visibility and lock' },
                { id: 'shortcuts', label: language === 'FR' ? '⌨️ Raccourcis Clavier' : '⌨️ Hotkey Shortcuts', desc: 'Change shortcut trigger keys' }
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setSubTab(btn.id as any)}
                  className={cn(
                    "flex-1 md:flex-initial text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex flex-col gap-0.5 cursor-pointer whitespace-nowrap md:whitespace-normal transition-all",
                    subTab === btn.id 
                      ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <span className="font-bold block leading-none">{btn.label}</span>
                  <span className="text-[9px] text-muted-foreground/80 font-normal hidden md:block">
                    {btn.desc}
                  </span>
                </button>
              ))}
            </div>

            {/* TAB CONTENTS CONTAINER */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-background">
              
              {/* TAB 1: VESSELS AND CABINS EDITOR */}
              {subTab === 'vessels' && (
                <div className="space-y-6">
                  
                  {/* Active Vessels Manager */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h5 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-primary" />
                          {language === 'FR' ? 'ADMINISTRER LA FLOTTE ACTIVE' : 'Workspace Vessel Assets'}
                        </h5>
                        <p className="text-[10px] text-muted-foreground">
                          {language === 'FR' ? 'Ajoutez de nouveaux bateaux personnalisés ou supprimez les bateaux existants.' : 'Directly register vessels or delete obsolete ones from the Workspace.'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/95 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        {language === 'FR' ? 'Créer Bateau' : 'Add Custom Boat'}
                      </button>
                    </div>

                    {showAddForm && (
                      <form onSubmit={handleAddBoat} className="p-4 border border-border bg-card/60 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span className="text-[10px] font-black uppercase text-foreground flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                            {language === 'FR' ? 'Création de Bateau Personnalisé' : 'Define Custom Boat & Cabins'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowAddForm(false)}
                            className="p-1 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        {vesselError && (
                          <div className="p-2 text-[10px] text-destructive bg-destructive/5 rounded-lg border border-destructive/10 leading-normal flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{vesselError}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block">
                              Vessel Name
                            </label>
                            <input
                              type="text"
                              required
                              value={newBoatName}
                              onChange={(e) => setNewBoatName(e.target.value)}
                              placeholder="e.g. Samata Luxury"
                              className="w-full bg-background border border-border text-xs rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block">
                              Cabins list (separated by comma)
                            </label>
                            <input
                              type="text"
                              required
                              value={newCabinsText}
                              onChange={(e) => setNewCabinsText(e.target.value)}
                              placeholder="e.g. Master, Deluxe 1, Deluxe 2"
                              className="w-full bg-background border border-border text-xs rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAddForm(false)}
                            className="px-3 py-1.5 border border-border hover:bg-muted text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/95 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Save Vessel
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Vessel lists */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[160px] overflow-y-auto pr-1.5 custom-scrollbar">
                      {boats.map((b) => (
                        <div
                          key={b.name}
                          className={cn(
                            "flex items-center justify-between gap-1.5 p-2 px-3 bg-muted/20 border rounded-xl transition-all",
                            selectedBoatNameForCabins === b.name ? "border-primary bg-primary/5" : "border-border/40 hover:border-border/85"
                          )}
                          onClick={() => setSelectedBoatNameForCabins(b.name)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-foreground truncate block select-none">
                              {b.name}
                            </span>
                            <span className="text-[8px] font-mono text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted whitespace-nowrap leading-none select-none">
                              {b.cabins?.length || 0} {language === 'FR' ? 'cab' : 'cabins'}
                            </span>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete the boat "${b.name}"?`)) {
                                deleteBoat(b.name);
                              }
                            }}
                            className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Delete Vessel"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cabins inspector & editor */}
                  {selectedBoatNameForCabins && boats.some(b => b.name === selectedBoatNameForCabins) && (
                    <div className="pt-4 border-t border-border/40 space-y-4">
                      <div className="flex justify-between items-center bg-muted/15 p-2 px-3.5 rounded-xl border border-border/30">
                        <span className="text-xs font-bold font-serif italic text-foreground">
                          🛶 Cabins list of vessel: <strong className="font-sans font-black tracking-wide text-primary pr-2">{selectedBoatNameForCabins}</strong>
                        </span>
                        <span className="text-[9px] px-2 py-0.5 font-mono text-muted-foreground bg-muted rounded-full">
                          {boats.find(b => b.name === selectedBoatNameForCabins)?.cabins.length || 0} total
                        </span>
                      </div>

                      {/* Add new Cabin to boat */}
                      <form onSubmit={handleAddCabin} className="p-3 bg-muted/10 rounded-xl space-y-2.5 border border-border/25">
                        <div className="text-[10px] uppercase tracking-wider font-extrabold text-foreground flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5 text-primary" />
                          Add new Cabin to {selectedBoatNameForCabins}
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          <input
                            type="text"
                            required
                            value={newCabinName}
                            onChange={(e) => setNewCabinName(e.target.value)}
                            placeholder="Cabin Name (FR)"
                            className="bg-background border border-border/60 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary w-full"
                          />
                          <input
                            type="text"
                            value={newCabinNameEng}
                            onChange={(e) => setNewCabinNameEng(e.target.value)}
                            placeholder="Cabin Name (ENG) - Optional"
                            className="bg-background border border-border/60 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary w-full"
                          />
                          <input
                            type="text"
                            value={newCabinLink}
                            onChange={(e) => setNewCabinLink(e.target.value)}
                            placeholder="URL link (FR) - Optional"
                            className="bg-background border border-border/60 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary w-full"
                          />
                          <input
                            type="text"
                            value={newCabinLinkEng}
                            onChange={(e) => setNewCabinLinkEng(e.target.value)}
                            placeholder="URL link (ENG) - Optional"
                            className="bg-background border border-border/60 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary w-full"
                          />
                        </div>

                        <button
                          type="submit"
                          className="px-3.5 py-1.5 bg-muted-foreground/15 text-foreground hover:bg-muted text-[10px] font-bold uppercase rounded-lg tracking-wider"
                        >
                          Add Cabin Into Vessel
                        </button>
                      </form>

                      {/* Cabin edit lists with links */}
                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                        {(boats.find(b => b.name === selectedBoatNameForCabins)?.cabins || []).map((cabin) => (
                          <div 
                            key={cabin.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-card border border-border/50 rounded-xl"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-bold text-foreground block">
                                {cabin.name}
                                {cabin.nameEng && cabin.nameEng !== cabin.name && (
                                  <span className="text-[10px] text-muted-foreground pl-1.5 font-normal font-sans">
                                    (Eng: {cabin.nameEng})
                                  </span>
                                )}
                              </span>
                              <span className="text-[9px] font-mono text-muted-foreground leading-none">
                                {cabin.id}
                              </span>
                            </div>

                            {/* Links updates on active workspace */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 w-full sm:max-w-md">
                              <div className="flex-1 flex flex-col gap-1 w-full">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[8px] font-bold text-muted-foreground shrink-0 w-8">Lnk FR</span>
                                  <input
                                    type="text"
                                    value={cabin.link || ''}
                                    placeholder="FR link URL"
                                    onChange={(e) => handleUpdateCabinLink(cabin.id, 'fr', e.target.value)}
                                    className="bg-background/40 border border-border/40 text-[10px] rounded-md px-1.5 py-0.5 select-all font-mono text-muted-foreground hover:text-foreground focus:text-foreground focus:bg-background outline-none w-full"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[8px] font-bold text-muted-foreground shrink-0 w-8">Lnk EN</span>
                                  <input
                                    type="text"
                                    value={cabin.linkEng || ''}
                                    placeholder="ENG link URL"
                                    onChange={(e) => handleUpdateCabinLink(cabin.id, 'eng', e.target.value)}
                                    className="bg-background/40 border border-border/40 text-[10px] rounded-md px-1.5 py-0.5 select-all font-mono text-muted-foreground hover:text-foreground focus:text-foreground focus:bg-background outline-none w-full"
                                  />
                                </div>
                              </div>

                              <button
                                onClick={() => handleRemoveCabin(cabin.id)}
                                className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors shrink-0 cursor-pointer"
                                title="Delete Cabin"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: CUSTOM IMAGE WIRING (KIC vs LEBALIBLOG) */}
              {subTab === 'wiring' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <h5 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5 text-primary" />
                      {language === 'FR' ? 'CONNECTEURS DE CODES D\'IMAGES' : 'Vessel Custom image synchronization'}
                    </h5>
                    <p className="text-[10px] text-muted-foreground">
                      Wire specific external direct image links to your chosen vessel, fully separated between **KIC English** and **LEBALIBLOG French** scopes.
                    </p>
                  </div>

                  {/* Filter combinations */}
                  <div className="p-3.5 rounded-2xl bg-muted/15 border border-border/30 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block">
                        Select Vessel
                      </label>
                      <select
                        value={wiredBoatName}
                        onChange={(e) => setWiredBoatName(e.target.value)}
                        className="bg-background border border-border text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary w-full text-foreground/90 font-medium"
                      >
                        {boats.map(b => (
                          <option key={b.name} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block">
                        Company scope (Separation)
                      </label>
                      <div className="flex p-0.5 bg-background rounded-xl border border-border">
                        <button
                          type="button"
                          onClick={() => setCompanyTab('KIC')}
                          className={cn(
                            "flex-1 py-1 rounded-lg text-[9px] font-black uppercase transition-all whitespace-nowrap",
                            companyTab === 'KIC' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          KIC (EN)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompanyTab('LEBALIBLOG')}
                          className={cn(
                            "flex-1 py-1 rounded-lg text-[9px] font-black uppercase transition-all whitespace-nowrap",
                            companyTab === 'LEBALIBLOG' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          LBB (FR)
                        </button>
                      </div>
                    </div>

                    <div className="space-y-0.5 flex flex-col justify-center">
                      <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block text-right">Segment Key</span>
                      <span className="text-[10px] font-mono font-medium text-emerald-500 font-bold block text-right mt-1">
                        {wiredBoatName ? getBoatDocId(wiredBoatName, companyTab) : 'select_boat'}
                      </span>
                    </div>
                  </div>

                  {/* Feedback messaging */}
                  {wiringError && (
                    <div className="p-2 text-[10px] text-destructive bg-destructive/5 rounded-lg border border-destructive/10 leading-normal flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{wiringError}</span>
                    </div>
                  )}
                  {wiringSuccess && (
                    <div className="p-2 text-[10px] text-emerald-500 bg-emerald-500/5 rounded-lg border border-emerald-500/10 leading-normal flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{wiringSuccess}</span>
                    </div>
                  )}

                  {/* Link insertion forms */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 border border-border/40 rounded-2xl bg-card space-y-2.5">
                      <span className="text-[9px] font-black uppercase tracking-wider text-foreground block">
                        Add single direct image URL
                      </span>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={manualImageUrl}
                          onChange={(e) => setManualImageUrl(e.target.value)}
                          placeholder="https://example.com/image.jpg"
                          className="flex-1 bg-background border border-border text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/40"
                        />
                        <button
                          type="button"
                          onClick={handleAddManualImage}
                          className="bg-primary hover:bg-primary/95 text-primary-foreground px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Add URL
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 border border-border/40 rounded-2xl bg-card space-y-2.5">
                      <span className="text-[9px] font-black uppercase tracking-wider text-foreground block">
                        Batch paste collection URLs
                      </span>
                      <div className="flex gap-1.5 items-end">
                        <textarea
                          rows={1}
                          value={batchImageUrls}
                          onChange={(e) => setBatchImageUrls(e.target.value)}
                          placeholder="Paste lists of image links here (split with newline/comma)"
                          className="flex-1 bg-background border border-border text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/40 custom-scrollbar"
                        />
                        <button
                          type="button"
                          onClick={handleAddBatchImages}
                          className="bg-muted hover:bg-muted/80 text-muted-foreground border border-border px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0"
                        >
                          Add Batch
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Wired Links Preview list */}
                  <div className="space-y-2.5 pt-2">
                    <div className="flex justify-between items-center pr-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                        Currently Wired Images ({wiredUrls.length})
                      </span>
                      {wiredUrls.length > 0 && (
                        <button
                          onClick={() => {
                            if (confirm("Clear all customized wired images list?")) saveUrlsArray([]);
                          }}
                          className="text-[9px] text-destructive hover:text-destructive/90 font-black uppercase tracking-wider cursor-pointer"
                        >
                          De-wire all
                        </button>
                      )}
                    </div>

                    {loadingWired ? (
                      <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">Loading active wired templates...</span>
                      </div>
                    ) : wiredUrls.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-border/60 rounded-xl bg-muted/5">
                        <p className="text-[10px] text-muted-foreground">No custom images connected to {wiredBoatName} under {companyTab} folder sync yet.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1.5 custom-scrollbar">
                        {wiredUrls.map((url, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-3 p-2 px-2.5 bg-muted/20 border border-border/30 rounded-xl">
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              <span className="text-[9px] text-muted-foreground font-mono font-bold select-none">{idx + 1}.</span>
                              <span className="text-[9px] text-foreground font-mono truncate select-all">{url}</span>
                            </div>
                            <button
                              onClick={() => handleDeleteWiredLink(url)}
                              className="p-1 hover:bg-destructive/15 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer transition-colors"
                              title="Delete URL link"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* TEXT DATABASE EXPORT & IMPORT UTILITIES */}
                  <div className="p-4 border border-border/40 rounded-2xl bg-muted/5 space-y-3 pt-3.5">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div className="space-y-0.5 min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-foreground block">
                          {language === 'FR' ? "Base de Données Textuelle (TXT) des Images" : "Text Database (TXT) Backup & Restore"}
                        </span>
                        <p className="text-[9px] text-muted-foreground leading-normal">
                          {language === 'FR' 
                            ? "Téléchargez ou restaurez l'intégralité des connecteurs d'images de votre flotte via un simple fichier texte (.txt)."
                            : "Export or overwrite all vessel custom images across KIC & LBB in a single structured text file database."
                          }
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1.5">
                      {/* Export Button */}
                      <button
                        type="button"
                        onClick={handleExportWiredTxt}
                        disabled={isExporting}
                        className="flex items-center justify-center gap-2 px-3.5 py-2 hover:border-foreground/20 hover:bg-muted/10 text-foreground text-xs font-bold rounded-xl cursor-pointer transition-all border border-border disabled:opacity-50"
                      >
                        {isExporting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <Download className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        <span>
                          {language === 'FR' ? "Télécharger .txt" : "Download TXT Backup"}
                        </span>
                      </button>

                      {/* Import Label acting as Button */}
                      <label className="flex items-center justify-center gap-2 px-3.5 py-2 hover:border-foreground/20 hover:bg-muted/10 text-foreground text-xs font-bold rounded-xl cursor-pointer transition-all border border-border disabled:opacity-50">
                        {isImporting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <Upload className="w-3.5 h-3.5 text-indigo-500" />
                        )}
                        <span>
                          {language === 'FR' ? "Importer / Recharger .txt" : "Upload & Sync TXT"}
                        </span>
                        <input
                          type="file"
                          accept=".txt"
                          onChange={handleImportWiredTxt}
                          disabled={isImporting}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Proactive Help Tips */}
                    <div className="mt-3.5 p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-2 text-[10px] text-muted-foreground leading-relaxed">
                      <div className="flex gap-2">
                        <span className="text-amber-500 font-bold shrink-0">💡</span>
                        <p>
                          <strong>{language === 'FR' ? "Bateaux automatiques :" : "Perfect/Working Images:"}</strong>{" "}
                          {language === 'FR' 
                            ? "Si un bateau comme Angelica affiche déjà ses images correctement, laissez ses lignes vides ou avec les commentaires par défaut dans le fichier TXT. Le système continuera de charger ses images via la synchronisation automatique de Google Drive." 
                            : "If a boat like Angelica already displays its images perfectly (via automatic Google Drive sync), you do not need to add links for it. Keep it blank or commented out in the TXT file. The system will continue to match pictures automatically."
                          }
                        </p>
                      </div>
                      <div className="flex gap-2 border-t border-border/40 pt-2">
                        <span className="text-emerald-500 font-bold shrink-0">📋</span>
                        <p>
                          <strong>{language === 'FR' ? "Flotte active complète :" : "Import Schedule First:"}</strong>{" "}
                          {language === 'FR' 
                            ? "Pour intégrer tous les bateaux de votre base de données dans le modèle de fichier TXT, assurez-vous de charger d'abord votre feuille de calcul (Google Sheet ou fichier Excel) afin que l'espace de travail puisse détecter l'ensemble de la flotte active." 
                            : "To export a template with every single boat in your list, connect your Google Sheet or import your Excel/CSV boat schedule first. Once loaded, the export utility will retrieve all active fleet names in the TXT template."
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: MISSING IMAGES SCANNER */}
              {subTab === 'scanner' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="space-y-1">
                      <h5 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5 text-primary" />
                        {language === 'FR' ? 'CONTRÔLEUR D\'IMAGES DE CABINE MANQUANTES' : 'Missing Cabins Images Scanner'}
                      </h5>
                      <p className="text-[10px] text-muted-foreground">
                        Scans all boats and reports cabins that missing an image reference in either drive directories or custom wiring links. Resolves them instantly.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={runImagesScanner}
                      disabled={scanning}
                      className="px-3.5 py-1.5 bg-primary hover:bg-primary/95 text-primary-foreground text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Re-scan Workspace
                    </button>
                  </div>

                  {scanning ? (
                    <div className="p-12 text-center flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-semibold">Scanning cabin matches across directory...</span>
                    </div>
                  ) : missingCabinsList.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-emerald-500/30 bg-emerald-500/5 rounded-2xl flex flex-col items-center justify-center gap-2">
                      <CheckCircle className="w-6 h-6 text-emerald-500" />
                      <p className="text-xs font-bold text-foreground">All Cabins Match!</p>
                      <p className="text-[10px] text-muted-foreground">Every active cabin in your fleet config is matching an image reference successfully.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                        Cabins require image references ({missingCabinsList.length})
                      </span>

                      <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                        {missingCabinsList.map(({ boatName, cabin }) => (
                          <div 
                            key={cabin.id}
                            className="p-3 bg-card border border-border/60 hover:bg-muted/10 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                          >
                            <div className="min-w-0">
                              <span className="text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold uppercase select-none tracking-wide">
                                Missing Image
                              </span>
                              <span className="font-serif italic text-xs font-bold text-foreground block mt-1">
                                {boatName} - <strong className="font-sans font-black text-primary">{cabin.name}</strong>
                              </span>
                              <span className="text-[9px] font-mono text-muted-foreground leading-none">
                                {cabin.id}
                              </span>
                            </div>

                            {/* Two fast-connect inputs */}
                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:max-w-xl shrink-0">
                              <div className="flex-1 flex items-center bg-background border border-border/80 rounded-lg pl-2 pr-1.5 py-1 gap-1 w-full">
                                <Link className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                <input
                                  type="text"
                                  placeholder="Paste Image URL..."
                                  value={wiringInputs[`${cabin.id}_KIC`] || ''}
                                  onChange={(e) => setWiringInputs(prev => ({ ...prev, [`${cabin.id}_KIC`]: e.target.value }))}
                                  className="w-full bg-transparent text-[10px] border-none outline-none focus:ring-0 text-foreground"
                                />
                                <button
                                  onClick={() => handleScannerQuickWire(boatName, cabin.id, cabin.name, 'KIC')}
                                  className="px-2 py-1 bg-primary text-primary-foreground text-[8px] font-black uppercase tracking-wider rounded-md"
                                >
                                  Wire KIC EN
                                </button>
                              </div>

                              <div className="flex-1 flex items-center bg-background border border-border/80 rounded-lg pl-2 pr-1.5 py-1 w-full">
                                <Link className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                <input
                                  type="text"
                                  placeholder="Paste Image URL..."
                                  value={wiringInputs[`${cabin.id}_LEBALIBLOG`] || ''}
                                  onChange={(e) => setWiringInputs(prev => ({ ...prev, [`${cabin.id}_LEBALIBLOG`]: e.target.value }))}
                                  className="w-full bg-transparent text-[10px] border-none outline-none focus:ring-0 text-foreground"
                                />
                                <button
                                  onClick={() => handleScannerQuickWire(boatName, cabin.id, cabin.name, 'LEBALIBLOG')}
                                  className="px-2 py-1 bg-primary text-primary-foreground text-[8px] font-black uppercase tracking-wider rounded-md"
                                >
                                  Wire LBB FR
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: WHATSAPP CONTACT & SHARE SETTINGS */}
              {subTab === 'whatsapp' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <h5 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5 text-primary" />
                      {language === 'FR' ? 'PARAMÈTRES WHATSAPP & LIENS DE PARTAGE' : 'WhatsApp Contact & Share Settings'}
                    </h5>
                    <p className="text-[10px] text-muted-foreground">
                      {language === 'FR' 
                        ? 'Le numéro WhatsApp utilisé pour générer les liens de disponibilité temporaires envoyés aux clients.' 
                        : 'Configure the registered WhatsApp number, business name, and link duration for public shareable links.'}
                    </p>
                  </div>

                  {waError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{waError}</span>
                    </div>
                  )}

                  {waSuccess && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>{waSuccess}</span>
                    </div>
                  )}

                  {/* Share Links Management & Generation Quick Actions */}
                  <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 max-w-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-amber-500" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-foreground">
                          {language === 'FR' ? 'Liens de disponibilité client (Notepad)' : 'Customer Availability Links (Notepad)'}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        {savedNotes.length} {savedNotes.length === 1 ? 'boat' : 'boats'} stored
                      </span>
                    </div>

                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {language === 'FR'
                        ? 'Les liens de disponibilité sont conçus pour regrouper plusieurs propositions de bateaux enregistrés dans Stored Boats.'
                        : 'Share links create temporary mobile catalog links comparing boats and cabins saved in Stored Boats.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          window.dispatchEvent(new CustomEvent('open-share-modal', { detail: { source: 'notepad' } }));
                        }}
                        disabled={savedNotes.length === 0}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                        title={savedNotes.length === 0 ? "Save boats to Stored Boats first" : "Generate share link"}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>{language === 'FR' ? `Générer un lien (${savedNotes.length})` : `Generate Link (${savedNotes.length})`}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          window.dispatchEvent(new CustomEvent('open-share-manager'));
                        }}
                        className="px-3.5 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs border border-border flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{language === 'FR' ? 'Gérer les liens existants' : 'Manage Generated Links'}</span>
                      </button>
                    </div>
                  </div>

                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setWaError(null);
                      setWaSuccess(null);
                      const validation = validateWhatsAppNumber(waConfig.number);
                      if (!validation.isValid) {
                        setWaError(validation.error || 'Invalid phone number');
                        return;
                      }
                      try {
                        setWaSaving(true);
                        await saveWhatsAppConfig(waConfig);
                        setWaSaving(false);
                        setWaSuccess(language === 'FR' ? 'Paramètres WhatsApp enregistrés avec succès !' : 'WhatsApp settings saved successfully!');
                        setTimeout(() => setWaSuccess(null), 3000);
                      } catch (err: any) {
                        setWaError(err?.message || 'Failed to save settings');
                        setWaSaving(false);
                      }
                    }}
                    className="p-5 rounded-2xl bg-muted/20 border border-border/50 space-y-4 max-w-xl"
                  >
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                        {language === 'FR' ? 'Numéro WhatsApp (avec indicatif pays)' : 'WhatsApp Phone Number (with Country Code)'}
                      </label>
                      <input
                        type="text"
                        required
                        value={waConfig.number}
                        onChange={(e) => setWaConfig({ ...waConfig, number: e.target.value })}
                        placeholder="e.g. +62 812 3456 7890 or 6281234567890"
                        className="w-full bg-background border border-border text-xs rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      />
                      <span className="text-[9px] text-muted-foreground block">
                        {language === 'FR' 
                          ? 'Les clients ouvriront directement une discussion WhatsApp vers ce numéro lorsqu\'ils cliqueront sur le bouton de contact.'
                          : 'Customers will automatically chat with this number when clicking the sticky WhatsApp button.'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                        {language === 'FR' ? 'Nom commercial affiché' : 'Business / Brand Display Name'}
                      </label>
                      <input
                        type="text"
                        value={waConfig.businessName}
                        onChange={(e) => setWaConfig({ ...waConfig, businessName: e.target.value })}
                        placeholder="e.g. Komodo Island Cruise or Le Bali Blog"
                        className="w-full bg-background border border-border text-xs rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                        {language === 'FR' ? 'Texte par défaut du bouton WhatsApp' : 'Default WhatsApp CTA Caption'}
                      </label>
                      <input
                        type="text"
                        value={waConfig.defaultCaption}
                        onChange={(e) => setWaConfig({ ...waConfig, defaultCaption: e.target.value })}
                        placeholder="e.g. Ask About This Boat, Book This Cabin, or Contact Us"
                        className="w-full bg-background border border-border text-xs rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                        {language === 'FR' ? 'Durée de validité par défaut' : 'Default Link Duration'}
                      </label>
                      <select
                        value={waConfig.defaultDurationDays}
                        onChange={(e) => setWaConfig({ ...waConfig, defaultDurationDays: Number(e.target.value) })}
                        className="w-full bg-background border border-border text-xs rounded-xl px-4 py-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value={1}>1 Day (24 hours)</option>
                        <option value={2}>2 Days (48 hours)</option>
                        <option value={3}>3 Days (Recommended)</option>
                        <option value={7}>7 Days (1 Week)</option>
                        <option value={14}>14 Days (2 Weeks)</option>
                      </select>
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          window.dispatchEvent(new CustomEvent('open-share-manager'));
                        }}
                        className="text-xs text-primary hover:underline font-semibold"
                      >
                        {language === 'FR' ? 'Gérer les liens générés →' : 'Manage All Share Links →'}
                      </button>

                      <button
                        type="submit"
                        disabled={waSaving}
                        className="px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {waSaving ? 'Saving...' : (language === 'FR' ? 'Enregistrer' : 'Save Settings')}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 4: WHITE-LIST GMAIL OPERATORS */}
              {subTab === 'whitelist' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <h5 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-primary" />
                      {language === 'FR' ? 'ADMINISTRER LA LISTE BANNIÈRE / OPERATEURS' : 'Operator Whitelist Credentials'}
                    </h5>
                    <p className="text-[10px] text-muted-foreground">
                      Only whitelist operators synced from this dynamic list are authorized to bypass access control triggers when logging in with Gmail.
                    </p>
                  </div>

                  {whitelistError && (
                    <div className="p-2 text-[10px] text-destructive bg-destructive/5 rounded-lg border border-destructive/10 leading-normal flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{whitelistError}</span>
                    </div>
                  )}
                  {whitelistSuccess && (
                    <div className="p-2 text-[10px] text-emerald-500 bg-emerald-500/5 rounded-lg border border-emerald-500/10 leading-normal flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{whitelistSuccess}</span>
                    </div>
                  )}

                  {/* Add operator */}
                  <form onSubmit={handleAddOperator} className="p-4 border border-border/50 rounded-2xl bg-card space-y-2.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-foreground block">
                      Register new Whitelist operator
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        required
                        value={newOperatorEmail}
                        onChange={(e) => setNewOperatorEmail(e.target.value)}
                        placeholder="e.g. manager@gmail.com"
                        className="flex-1 bg-background border border-border text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary w-full text-foreground placeholder:text-muted-foreground/40"
                      />
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Add Operator
                      </button>
                    </div>
                  </form>

                  {/* Operator lists */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                      Active Whitelisted operators ({whitelistedEmails.length})
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1.5 custom-scrollbar">
                      {whitelistedEmails.map((email) => {
                        const isMainUser = ['badthinkermorethanu@gmail.com', 'reservation.kic@gmail.com', 'reservation.lebaliblog@gmail.com'].includes(email);
                        return (
                          <div 
                            key={email}
                            className="flex items-center justify-between p-2 px-3 bg-muted/20 border border-border/40 rounded-xl"
                          >
                            <span className="text-[11px] font-semibold text-foreground select-all truncate">
                              {email}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveOperator(email)}
                              className="p-1 hover:bg-destructive/15 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer shrink-0 transition-colors"
                              title="Delete Whitelisted Operator"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: LAYOUT CONTROLS & ADMINISTRATIVE PASSWORD */}
              {subTab === 'layout' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  
                  {/* Visibilities toggler */}
                  <div className="space-y-3">
                    <div>
                      <h5 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-primary" />
                        {language === 'FR' ? 'SELECTIONS VISIBLES DANS L\'INTERFACE' : 'Component Layout Toggles'}
                      </h5>
                      <p className="text-[10px] text-muted-foreground">
                        Configure density by enabling or shutting down optional visual sections in CabinGen UI dashboard.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-muted/15 p-3.5 rounded-2xl border border-border/30">
                      {/* Media Gallery info */}
                      <button
                        onClick={toggleShowMediaGallery}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all duration-200",
                          showMediaGallery ? "bg-card border-emerald-500/30 text-foreground shadow-sm" : "bg-muted/40 border-border text-muted-foreground opacity-60"
                        )}
                      >
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-bold">Media gallery</p>
                          <p className="text-[9px] text-muted-foreground">{showMediaGallery ? 'Visible' : 'Hidden'}</p>
                        </div>
                        {showMediaGallery ? <Eye className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
                      </button>

                      {/* Boat & CabinSelector info */}
                      <button
                        onClick={toggleShowBoatCabinSelector}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all duration-200",
                          showBoatCabinSelector ? "bg-card border-emerald-500/30 text-foreground shadow-sm" : "bg-muted/40 border-border text-muted-foreground opacity-60"
                        )}
                      >
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-bold">Vessel selector</p>
                          <p className="text-[9px] text-muted-foreground">{showBoatCabinSelector ? 'Visible' : 'Hidden'}</p>
                        </div>
                        {showBoatCabinSelector ? <Eye className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
                      </button>

                      {/* Inquiry info */}
                      <button
                        onClick={toggleShowInquiryPanel}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all duration-200",
                          showInquiryPanel ? "bg-card border-emerald-500/30 text-foreground shadow-sm" : "bg-muted/40 border-border text-muted-foreground opacity-60"
                        )}
                      >
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-bold">Inquiry parser</p>
                          <p className="text-[9px] text-muted-foreground">{showInquiryPanel ? 'Visible' : 'Hidden'}</p>
                        </div>
                        {showInquiryPanel ? <Eye className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
                      </button>

                      {/* Notepad info */}
                      <button
                        onClick={toggleShowNotepad}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all duration-200",
                          showNotepad ? "bg-card border-emerald-500/30 text-foreground shadow-sm" : "bg-muted/40 border-border text-muted-foreground opacity-60"
                        )}
                      >
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-bold">Local notepad</p>
                          <p className="text-[9px] text-muted-foreground">{showNotepad ? 'Visible' : 'Hidden'}</p>
                        </div>
                        {showNotepad ? <Eye className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    </div>
                  </div>

                  {/* Layout Width Slider */}
                  <div className="pt-4 border-t border-border/40 space-y-3">
                    <div>
                      <h5 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Settings2 className="w-3.5 h-3.5 text-primary" />
                        {language === 'FR' ? 'LARGEUR MAXIMALE DE LA PAGE' : 'Application Layout Width'}
                      </h5>
                      <p className="text-[10px] text-muted-foreground">
                        {language === 'FR'
                          ? 'Ajustez la largeur maximale du tableau de bord sur grand écran (par défaut : 90%).'
                          : 'Customize the maximum width of the application workspace on wide desktop screens (Default: 90%).'}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-muted/20 border border-border/50 max-w-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          {language === 'FR' ? 'Largeur active' : 'Workspace Width'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20">
                            {customWidth}%
                          </span>
                          {customWidth !== 90 && (
                            <button
                              type="button"
                              onClick={() => setCustomWidth(90)}
                              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground underline cursor-pointer"
                            >
                              {language === 'FR' ? 'Réinitialiser (90%)' : 'Reset to 90%'}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-mono text-muted-foreground">50%</span>
                        <input
                          type="range"
                          min="50"
                          max="100"
                          step="5"
                          value={customWidth}
                          onChange={(e) => setCustomWidth(Number(e.target.value))}
                          className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <span className="text-[10px] font-mono text-muted-foreground">100%</span>
                      </div>
                    </div>
                  </div>

                  {/* Change passphrase */}
                  <div className="pt-4 border-t border-border/40 space-y-3">
                    <div>
                      <h5 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-primary" />
                        {language === 'FR' ? 'MODIFIER LE MOT DE PASSE ADMIN' : 'Modify Administrator Passcode'}
                      </h5>
                      <p className="text-[10px] text-muted-foreground">
                        Change the passcode used to unlock this dynamic Data Center settings interface. Persists immediately.
                      </p>
                    </div>

                    {passFeedback && (
                      <div className="p-2.5 text-[10px] text-emerald-500 bg-emerald-500/5 rounded-xl border border-emerald-500/10 inline-block">
                        {passFeedback}
                      </div>
                    )}

                    <form onSubmit={handleChangePassword} className="max-w-md space-y-3 bg-muted/10 p-4 border border-border/25 rounded-2xl">
                      <div className="space-y-1">
                        <label className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block">
                          New admin passcode
                        </label>
                        <input
                          type="password"
                          required
                          value={newPass}
                          onChange={(e) => setNewPass(e.target.value)}
                          placeholder="Type new passcode"
                          className="w-full bg-background border border-border text-xs rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm"
                        >
                          Update Password
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Reset administration passcode? This will clear the saved password and lock the panel immediately.")) {
                              localStorage.removeItem('datacenter_admin_password');
                              setIsUnlocked(false);
                              setPassFeedback(null);
                            }
                          }}
                          className="px-4 py-1.5 border border-border hover:bg-muted text-xs font-semibold rounded-xl text-muted-foreground transition-all cursor-pointer"
                        >
                          Reset & Lock Panel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* TAB 6: KEYBOARD SHORTCUTS MANAGER */}
              {subTab === 'shortcuts' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div>
                    <h5 className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Keyboard className="w-4 h-4 text-primary animate-pulse" />
                      {language === 'FR' ? 'CORRESPONDANCE DES RACCOURCIS CLAVIER' : 'Configure Hotkey Shortcuts'}
                    </h5>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Customize hotkeys for your fast operators workflow. Click on any key badge, and press the new key configuration (e.g. Q, Alt+F, Ctrl+B) to rebind.
                    </p>
                  </div>

                  <div className="bg-card border border-border/60 rounded-3xl overflow-hidden p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { key: 'focusSearch', label: language === 'FR' ? 'Focus la recherche bateau' : 'Focus Vessel Search Bar', desc: language === 'FR' ? 'Focus instantané (Q)' : 'Instantly focus the boat search box' },
                        { key: 'toggleSpotlight', label: language === 'FR' ? 'Ouvrir Spotlight' : 'Toggle Spotlight Finder', desc: language === 'FR' ? 'Finder global intelligent' : 'Unified global searchable helper overlay' },
                        { key: 'toggleLanguage', label: language === 'FR' ? 'Changer de langue FR/ENG' : 'Toggle Language FR/ENG', desc: language === 'FR' ? 'Alternative FR <-> EN' : 'Switch generator output translation language' },
                        { key: 'toggleNotepad', label: language === 'FR' ? 'Masquer / Afficher Bloc-notes' : 'Toggle Notepad Visibility', desc: language === 'FR' ? 'Toggle section du Bloc-notes' : 'Show or hide the Smart WhatsApp Notepad panel' },
                        { key: 'toggleGallery', label: language === 'FR' ? 'Masquer / Afficher Galerie média' : 'Toggle Gallery Visibility', desc: language === 'FR' ? 'Toggle section Galerie média' : 'Show or hide the Media image gallery panel' },
                        { key: 'toggleVesselSelector', label: language === 'FR' ? 'Masquer / Afficher Sélectionneur bateau' : 'Toggle Selector Visibility', desc: language === 'FR' ? 'Toggle section Sélectionneur navires' : 'Show or hide the Boat and cabin search select panel' },
                        { key: 'toggleInquiry', label: language === 'FR' ? 'Masquer / Afficher Parseur WhatsApp' : 'Toggle Inquiry Parser Visibility', desc: language === 'FR' ? 'Toggle section Formulaire' : 'Show or hide the inquiry field card forms' },
                        { key: 'clearCabins', label: language === 'FR' ? 'Vider la sélection de cabines' : 'Clear Cabins Selection', desc: language === 'FR' ? 'Désélectionner toutes les cabines' : 'Unselect all selected cabins immediately' },
                        { key: 'resetNotepad', label: language === 'FR' ? 'Réinitialiser le Bloc-notes' : 'Reset Notepad Content', desc: language === 'FR' ? 'Vider tout le notepad' : 'Reset smart WhatsApp parsing fields and contents' },
                        { key: 'copyItinerary', label: language === 'FR' ? 'Copier le texte de l\'itinéraire' : 'Copy Generated Itinerary', desc: language === 'FR' ? 'Copie instantanée dans le presse-papiers' : 'Quickly copy the processed template' }
                      ].map((sc) => (
                        <ShortcutRow
                          key={sc.key}
                          scKey={sc.key}
                          label={sc.label}
                          desc={sc.desc}
                          currentVal={customShortcuts?.[sc.key as keyof typeof customShortcuts] || ''}
                          language={language}
                          onSetShortcut={setCustomShortcut}
                        />
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-border/40 pt-5 mt-4 gap-3">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">
                        {language === 'FR' ? '*Les touches simples comme "q" s\'activent hors saisie texte' : '*Single key hotkeys (like "q") trigger only outside text inputs'}
                      </p>
                      <button
                        type="button"
                        onClick={resetShortcuts}
                        className="px-4 py-1.5 border border-primary/20 hover:bg-primary/5 text-primary text-xs font-semibold rounded-xl transition-all cursor-pointer"
                      >
                        {language === 'FR' ? 'Réinitialiser par défaut' : 'Restore Default Hotkeys'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="px-6 py-4.5 border-t border-border bg-muted/15 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            {isUnlocked && (
              <button
                onClick={() => {
                  setIsUnlocked(false);
                  setSubTab('vessels');
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 cursor-pointer"
                title="Lock controls instantly"
              >
                <Lock className="w-3.5 h-3.5 text-primary" />
                Lock Settings Screen
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/95 text-[11px] font-extrabold uppercase tracking-widest rounded-xl transition-all shadow-sm cursor-pointer hover:shadow-primary/15"
          >
            {language === 'FR' ? 'Fermer' : 'Done & Close'}
          </button>
        </div>

      </motion.div>
    </div>
  );
};

interface ShortcutRowProps {
  scKey: string;
  label: string;
  desc: string;
  currentVal: string;
  language: string;
  onSetShortcut: (key: any, value: string) => void;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({ scKey, label, desc, currentVal, language, onSetShortcut }) => {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;

    const captureKeys = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const key = e.key.toLowerCase();
      if (['control', 'alt', 'shift', 'meta'].includes(key)) {
        return;
      }

      const keys: string[] = [];
      if (e.ctrlKey) keys.push('ctrl');
      if (e.altKey) keys.push('alt');
      if (e.shiftKey) keys.push('shift');
      if (e.metaKey) keys.push('meta');
      keys.push(key);

      const combination = keys.join('+');
      onSetShortcut(scKey, combination);
      setRecording(false);
    };

    window.addEventListener('keydown', captureKeys, true);
    return () => window.removeEventListener('keydown', captureKeys, true);
  }, [recording, scKey, onSetShortcut]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl border border-border/50 bg-muted/10 gap-3">
      <div className="space-y-0.5">
        <p className="text-[11px] font-bold text-foreground">{label}</p>
        <p className="text-[9px] text-muted-foreground leading-relaxed">{desc}</p>
      </div>

      <div className="flex items-center gap-2">
        {recording ? (
          <span className="px-3.5 py-1.5 text-[10px] font-bold select-none text-rose-500 bg-rose-500/10 rounded-xl border border-rose-500/25 animate-pulse">
            {language === 'FR' ? 'Appuyez...' : 'Press keys...'}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setRecording(true)}
            className="px-3 py-1.5 bg-card hover:bg-muted border border-border text-[11px] font-mono font-black rounded-xl text-foreground uppercase shadow-xs transition-all cursor-pointer relative group flex items-center justify-center min-w-[90px]"
          >
            {currentVal ? currentVal.replace(/\+/g, ' + ') : 'NONE'}
          </button>
        )}

        <button
          type="button"
          onClick={() => onSetShortcut(scKey, '')}
          disabled={!currentVal}
          title="Clear Bind"
          className="p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30 rounded-lg hover:bg-destructive/5 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

