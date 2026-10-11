import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore, DriveFile, Cabin } from '../store';
import { cn, copyImageToClipboard, copyTextToClipboard, sanitizeWiredUrls } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileImage, 
  Copy, 
  Check, 
  HardDrive, 
  ExternalLink,
  Loader2,
  Lock,
  AlertCircle,
  Eye,
  List as ListIcon,
  Grid3X3,
  LayoutGrid,
  Maximize2,
  ChevronDown,
  X,
  ArrowUpRight,
  Plus,
  Trash2,
  RefreshCcw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth, googleSignIn, getAccessToken } from '../lib/firebase';

const EMPTY_STRING_ARRAY: string[] = [];

export const MediaGallery: React.FC = () => {
  const { 
    boats,
    tabs, 
    activeTabId,
    kicFiles, 
    lebaliblogFiles, 
    loadingImages, 
    imagesError,
    livePreviewEnabled,
    setLivePreviewEnabled,
    selectedLiveFile,
    setSelectedLiveFile,
    setDisplayedFiles
  } = useStore();

  const activeTab = (tabs.find(t => t.id === activeTabId) || tabs[0] || {}) as any;
  const selectedBoatName = activeTab.selectedBoatName || '';
  const language = activeTab.language || 'ENG';

  const [activeFolderTab, setActiveFolderTab] = useState<'KIC' | 'LEBALIBLOG'>('KIC');
  const [copyFeedback, setCopyFeedback] = useState<Record<string, 'IMAGE' | 'LINK' | 'FAILED' | null>>({});

  // Auto-synchronize folder tab and output language based on inquiry company name
  useEffect(() => {
    if (!activeTab || !activeTab.inquiry) return;
    const companyStr = (activeTab.inquiry.company || '').toLowerCase().trim();
    if (companyStr.includes('lebaliblog') || companyStr.includes('lbb') || companyStr.includes('le bali blog')) {
      if (activeFolderTab !== 'LEBALIBLOG') {
        setActiveFolderTab('LEBALIBLOG');
      }
      if (activeTab.language !== 'FR') {
        useStore.getState().setLanguage('FR');
      }
    } else if (companyStr.includes('kic') || companyStr.includes('komodo island') || companyStr.includes('komodo luxury') || companyStr.includes('komodo island cruise')) {
      if (activeFolderTab !== 'KIC') {
        setActiveFolderTab('KIC');
      }
      if (activeTab.language !== 'ENG') {
        useStore.getState().setLanguage('ENG');
      }
    }
  }, [activeTab?.inquiry?.company, activeTabId]);
  
  // Cabin filtering toggle options
  const [enableCabinFilter, setEnableCabinFilter] = useState<boolean>(false);
  const [cabinFilterWordByWord, setCabinFilterWordByWord] = useState<boolean>(true);
  
  // Layout views state
  const [viewMode, setViewMode] = useState<'list' | 'small' | 'medium' | 'big'>('medium');
  const [expandedListIds, setExpandedListIds] = useState<Record<string, boolean>>({});
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<DriveFile | null>(null);
  const [modalCopyFeedback, setModalCopyFeedback] = useState<'IMAGE' | 'LINK' | 'FAILED' | null>(null);

  const handleImageSelect = (file: DriveFile) => {
    if (livePreviewEnabled) {
      setSelectedLiveFile(file);
    } else {
      setSelectedPreviewFile(file);
    }
  };

  // Firestore persistent wired states
  const [wiredUrls, setWiredUrls] = useState<string[]>([]);
  const [isLoadingWired, setIsLoadingWired] = useState<boolean>(false);
  const [isSavingWired, setIsSavingWired] = useState<boolean>(false);
  const [wiredError, setWiredError] = useState<string | null>(null);

  // Custom wired form inputs
  const [singleUrlInput, setSingleUrlInput] = useState<string>('');
  const [batchTextareaInput, setBatchTextareaInput] = useState<string>('');
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);
  const [showWiredForm, setShowWiredForm] = useState<boolean>(false);

  // Google Drive Refresh / Scan states
  const [isRefreshingBoat, setIsRefreshingBoat] = useState<boolean>(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState<boolean>(false);
  const [showDriveControls, setShowDriveControls] = useState<boolean>(false);

  // Helper inside MediaGallery
  const getBoatDocId = (name: string, companyTab: 'KIC' | 'LEBALIBLOG') => {
    const prefix = companyTab === 'KIC' ? 'kic_' : 'lbb_';
    return (prefix + name.replace(/[^a-zA-Z0-9_\-]+/g, '_')).toLowerCase().slice(0, 80);
  };

  useEffect(() => {
    if (!selectedBoatName) {
      setWiredUrls(prev => prev.length === 0 ? prev : []);
      return;
    }

    const boatId = getBoatDocId(selectedBoatName, activeFolderTab);
    const localKey = `wired_images_${boatId}`;

    // 1. Immediately load whatever is cached in LocalStorage matching this specific segmented key
    let initialUrls: string[] = [];
    const cachedNew = localStorage.getItem(localKey);

    if (cachedNew) {
      try {
        const parsed = JSON.parse(cachedNew);
        if (Array.isArray(parsed)) initialUrls = sanitizeWiredUrls(parsed);
      } catch (_) {}
    }

    setWiredUrls(initialUrls);

    let unsubAuth: (() => void) | null = null;
    let unsubSnapshot: (() => void) | null = null;

    const setupRealtimeSync = (user: any) => {
      if (!user) {
        // Keep the local storage visual urls loaded even when offline/signed-out!
        if (unsubSnapshot) {
          unsubSnapshot();
          unsubSnapshot = null;
        }
        return;
      }
      setIsLoadingWired(true);
      setWiredError(null);

      const docRef = doc(db, 'wiredBoatImages', boatId);

      // Subscribe to real-time updates!
      unsubSnapshot = onSnapshot(docRef, async (docSnap) => {
        setIsLoadingWired(false);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const urls = sanitizeWiredUrls(data.urls || []);
          setWiredUrls(urls);
          localStorage.setItem(localKey, JSON.stringify(urls));
        } else {
          // If the segmented document is not found, start clean or backup local images if they exist
          if (initialUrls.length > 0) {
            try {
              // Note: We MUST write exactly 4 fields (boatName, urls, updatedBy, updatedAt) to satisfy Security Rules!
              await setDoc(docRef, {
                boatName: selectedBoatName,
                urls: initialUrls,
                updatedBy: user.uid,
                updatedAt: serverTimestamp()
              });
              console.log("Auto-backed up local custom images to brand new Firestore doc with 4 keys:", boatId);
            } catch (backupErr) {
              console.warn("Silent cloud backup warning: unable to auto-upload local custom image backup to Firestore:", backupErr);
            }
          } else {
            setWiredUrls([]);
            localStorage.removeItem(localKey);
          }
        }
      }, (err: any) => {
        setIsLoadingWired(false);
        const errMsg = err?.message || String(err);
        if (errMsg.includes('offline') || errMsg.includes('network') || errMsg.includes('permission-denied')) {
          console.warn("Real-time snapshot loading status warning:", errMsg);
        } else {
          console.error("Real-time snapshot listening error:", errMsg);
          setWiredError(errMsg);
        }
      });
    };

    unsubAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous snapshot listener if user logs out or switches
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = null;
      }
      setupRealtimeSync(user);
    });

    return () => {
      if (unsubAuth) unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, [selectedBoatName, activeFolderTab]);

  const handleSaveWiredImages = async (rawUrls: string[]) => {
    if (!selectedBoatName) return;
    setIsSavingWired(true);
    setWiredError(null);
    const boatId = getBoatDocId(selectedBoatName, activeFolderTab);
    const localKey = `wired_images_${boatId}`;
    const urlsToSave = sanitizeWiredUrls(rawUrls);

    // 1. Instantly save to local cache for maximum snappy responsiveness in the immediate browser session
    try {
      localStorage.setItem(localKey, JSON.stringify(urlsToSave));
      setWiredUrls(urlsToSave);
    } catch (_) {}

    // 2. If signed in, perform the cloud save and AWAIT feedback.
    // We enforce an 8-second timeout so the user never gets stuck buffering forever if Firestore is offline.
    if (auth.currentUser) {
      const currentUserId = auth.currentUser.uid;
      try {
        const docRef = doc(db, 'wiredBoatImages', boatId);

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Cloud Sync Timed Out (8s). Check your internet connection or try again.")), 8000)
        );

        await Promise.race([
          setDoc(docRef, {
            boatName: selectedBoatName,
            urls: urlsToSave,
            updatedBy: currentUserId,
            updatedAt: serverTimestamp()
          }),
          timeoutPromise
        ]);

        console.log("Cloud save succeeded for boatId:", boatId);
        
        // Success: Clear any error, close the panel smoothly
        setWiredError(null);
        setShowWiredForm(false);
      } catch (err: any) {
        console.error("Cloud save failed:", err);
        const errMsg = err?.message || String(err);
        setWiredError(`Cloud Sync Interrupted: ${errMsg}. We saved your changes locally on this browser, but others won't see them until you save successfully. Check your login/network.`);
      } finally {
        setIsSavingWired(false);
      }
    } else {
      // If signed out, save to local cache only and close the panel naturally
      setShowWiredForm(false);
      setIsSavingWired(false);
    }
  };

  const getDisplayImageUrl = (urlOrId: string): string => {
    if (!urlOrId) return '';
    if (!urlOrId.startsWith('http')) {
      return `https://lh3.googleusercontent.com/d/${urlOrId}`;
    }

    const fileDMatch = urlOrId.match(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/);
    if (fileDMatch && fileDMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${fileDMatch[1]}`;
    }

    const idParamMatch = urlOrId.match(/[&?]id=([a-zA-Z0-9_-]{25,50})/);
    if (idParamMatch && idParamMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
    }

    return urlOrId;
  };

  const getDriveFileId = (url: string): string | null => {
    if (!url) return null;
    const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/);
    if (fileDMatch && fileDMatch[1]) {
      return fileDMatch[1];
    }
    const idParamMatch = url.match(/[&?]id=([a-zA-Z0-9_-]{25,50})/);
    if (idParamMatch && idParamMatch[1]) {
      return idParamMatch[1];
    }
    return null;
  };

  const removeAccents = (str: string): string => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  const isMatchWithFlexibility = (fileName: string, targetName: string): boolean => {
    const fNormal = removeAccents(fileName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const tNormal = removeAccents(targetName).toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (!tNormal || !fNormal) return false;
    
    // 1. Direct normalized match (catches spacing difference like NKJAYA vs NK JAYA, Dunia Baru vs DuniaBaru)
    if (fNormal.includes(tNormal) || tNormal.includes(fNormal)) {
      return true;
    }
    
    // 2. Word token match: If target name consists of multiple words, see if all key words are in the filename
    const targetWords = removeAccents(targetName).toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    if (targetWords.length > 0 && targetWords.every(word => removeAccents(fileName).toLowerCase().includes(word))) {
      return true;
    }

    return false;
  };

  const getExtendedAliases = (boatName: string | null): string[] => {
    if (!boatName) return [];
    const clean = removeAccents(boatName).toLowerCase().trim();
    const list = [clean];
    
    // Add common variants
    if (clean.includes('alf 3') || clean === 'alf 3' || clean === 'alf3') {
      list.push('al fathran 3', 'al fathran iii', 'alfathran 3', 'alfathran3', 'al fathran', 'alfathran', 'alf 3');
    }
    if (clean.includes('al fathran') || clean.includes('alfathran')) {
      list.push('alf 3', 'alf3', 'alfathran 3', 'alfathran3', 'al fathran 3');
    }
    if (clean.includes('nk jaya') || clean === 'nkjaya' || clean === 'nk jaya') {
      list.push('nkjaya', 'nk jaya', 'n k jaya', 'nk_jaya');
    }
    if (clean.includes('dunia baru') || clean === 'duniabaru') {
      list.push('dunia baru', 'duniabaru', 'dunia_baru');
    }
    if (clean.includes('senada')) {
      list.push('senada');
    }
    
    // Also extract the prefix before any parentheses or dashes
    const basic = clean.split('(')[0].split('-')[0].trim();
    if (basic && basic !== clean) {
      list.push(basic);
    }
    
    return Array.from(new Set(list));
  };

  const getScheduleType = (str: string | undefined): string | null => {
    if (!str) return null;
    const s = removeAccents(str).toLowerCase().replace(/[^a-z0-9]/g, ' ');
    
    // Match 2D1N (e.g. 2d1n, 2d 1n, 2d/1n, 2j1n, 2j 1n, 2j/1n, 2 days 1 night, 2 jours 1 nuit)
    if (
      /\b2\s*[dj]\s*1\s*n\b/.test(s) || 
      /2\s*d\s*1\s*n/.test(s) ||
      /2\s*j\s*1\s*n/.test(s) ||
      /2\s*day[s]?\s*1\s*night[s]?/.test(s) || 
      /2\s*jour[s]?\s*1\s*nuit[s]?/.test(s) ||
      /2d1n/.test(s) ||
      /2j1n/.test(s)
    ) {
      return '2D1N';
    }

    // Match 3D2N (e.g. 3d2n, 3d 2n, 3d/2n, 3j2n, 3j 2n, 3j/2n, 3 days 2 nights, 3 jours 2 nuits)
    if (
      /\b3\s*[dj]\s*2\s*n\b/.test(s) || 
      /3\s*d\s*2\s*n/.test(s) ||
      /3\s*j\s*2\s*n/.test(s) ||
      /3\s*day[s]?\s*2\s*night[s]?/.test(s) || 
      /3\s*jour[s]?\s*2\s*nuit[s]?/.test(s) ||
      /3d2n/.test(s) ||
      /3j2n/.test(s)
    ) {
      return '3D2N';
    }

    // Match 4D3N
    if (
      /\b4\s*[dj]\s*3\s*n\b/.test(s) || 
      /4\s*d\s*3\s*n/.test(s) ||
      /4\s*j\s*3\s*n/.test(s) ||
      /4\s*day[s]?\s*3\s*night[s]?/.test(s) || 
      /4\s*jour[s]?\s*3\s*nuit[s]?/.test(s) ||
      /4d3n/.test(s) ||
      /4j3n/.test(s)
    ) {
      return '4D3N';
    }

    // Match 5D4N
    if (
      /\b5\s*[dj]\s*4\s*n\b/.test(s) || 
      /5\s*d\s*4\s*n/.test(s) ||
      /5\s*j\s*4\s*n/.test(s) ||
      /5\s*day[s]?\s*4\s*night[s]?/.test(s) || 
      /5\s*jour[s]?\s*4\s*nuit[s]?/.test(s) ||
      /5d4n/.test(s) ||
      /5j4n/.test(s)
    ) {
      return '5D4N';
    }

    return null;
  };

  const getCabinSchedule = (cabin: Cabin): string | null => {
    return (
      getScheduleType(cabin.schedule) ||
      getScheduleType(cabin.scheduleEng) ||
      getScheduleType(cabin.name) ||
      getScheduleType(cabin.nameEng) ||
      getScheduleType(cabin.itinerary) ||
      getScheduleType(cabin.itineraryEng)
    );
  };

  const cleanBoat = selectedBoatName ? selectedBoatName.split('(')[0].split('-')[0].trim() : '';
  const cleanBoatKeyword = cleanBoat.toLowerCase();

  const currentFiles = activeFolderTab === 'KIC' ? kicFiles : lebaliblogFiles;
  
  const getSignificantWords = (nameStr: string): string[] => {
    if (!nameStr) return [];
    // Convert to lowercase, remove accents, and replace non-alphanumeric with spaces
    const cleanWordStr = removeAccents(nameStr).toLowerCase().replace(/[^a-zA-Z0-9\s]/g, ' ');
    const list = cleanWordStr.split(/\s+/).filter(Boolean);
    // Exclude only purely generic structural words, while KEEPING critical identity keywords (like deluxe, master, double, etc.)
    const excludeWords = [
      'cabin', 'cabins', 'room', 'rooms', 'with', 'and', 'the', 'for', 'of', 'in', 'on', 'at'
    ];
    return list.filter(w => w.length >= 2 && !excludeWords.includes(w));
  };

  // Filter current files: must match the selected boat keyword or aliases
  const filteredFiles = useMemo(() => {
    return currentFiles.filter((file) => {
      const fileName = (file.name || '').toLowerCase();
      
      const possibleBoatNames = getExtendedAliases(selectedBoatName);
      if (possibleBoatNames.some(boatAlias => isMatchWithFlexibility(fileName, boatAlias))) {
        return true;
      }
      
      return false;
    });
  }, [currentFiles, selectedBoatName]);

  // Create synthetic DriveFile objects for wired URLs
  const syntheticWiredFiles = useMemo(() => {
    return (wiredUrls || []).map((url, index) => {
      let name = `Wired Image ${index + 1}`;
      
      // Attempt lookup in existing drive files using file ID
      const driveId = getDriveFileId(url);
      if (driveId) {
        const allLoadedFiles = [...kicFiles, ...lebaliblogFiles];
        const foundFile = allLoadedFiles.find(f => f.id === driveId);
        if (foundFile && foundFile.name) {
          name = foundFile.name;
        }
      }

      if (name === `Wired Image ${index + 1}`) {
        try {
          const parsed = new URL(url);
          const filename = parsed.pathname.substring(parsed.pathname.lastIndexOf('/') + 1);
          if (filename && filename.includes('.')) {
            name = decodeURIComponent(filename);
          }
        } catch {
          // disregard
        }
      }

      return {
        id: url, // Use URL itself as the ID so download/copy handlers handle it directly
        name: name,
        mimeType: 'image/jpeg',
        thumbnailLink: url,
        webViewLink: url,
        webContentLink: url
      };
    });
  }, [wiredUrls, kicFiles, lebaliblogFiles]);

  // Combine drive filtered files with custom wired files
  const combinedFiles = useMemo(() => {
    return [...filteredFiles, ...syntheticWiredFiles];
  }, [filteredFiles, syntheticWiredFiles]);

  // Filter combinedFiles by selected cabins if the user is in CABIN mode and some cabins are selected
  const selectedBoat = useMemo(() => {
    return boats.find(b => b.name === selectedBoatName);
  }, [boats, selectedBoatName]);

  const selectedCabinIds = activeTab.selectedCabinIds || EMPTY_STRING_ARRAY;
  const selectedCabinIdsKey = selectedCabinIds.join(',');

  const displayedFiles = useMemo(() => {
    return combinedFiles.filter((file) => {
      // Custom wired images (starting with http) always bypass the filename-based cabin filter
      // because they are manually linked to this boat by the operator.
      if (file.id.startsWith('http://') || file.id.startsWith('https://')) {
        return true;
      }

      if (activeTab.mode !== 'CABIN' || !selectedCabinIds || selectedCabinIds.length === 0 || !enableCabinFilter) {
        return true;
      }

      const selectedCabins = selectedBoat?.cabins.filter(c => selectedCabinIds.includes(c.id)) || [];
      if (selectedCabins.length === 0) return true;

      return selectedCabins.some(cabin => {
        const fileNameLower = removeAccents(file.name || '').toLowerCase();
        const cabinNameLower = removeAccents(language === 'ENG' && cabin.nameEng ? cabin.nameEng : cabin.name).toLowerCase();
        const cabinNameOrigLower = removeAccents(cabin.name || '').toLowerCase();
        const cabinNameEngLower = removeAccents(cabin.nameEng || '').toLowerCase();

        // Check if both the file and the cabin specify a schedule. If so, they MUST match!
        // This prevents cross-matching between 2D1N and 3D2N schedules
        const cabinSchedule = getCabinSchedule(cabin);
        const fileSchedule = getScheduleType(file.name);
        if (cabinSchedule && fileSchedule && cabinSchedule !== fileSchedule) {
          return false;
        }

        // 1. First, check if exact names match perfectly
        if (fileNameLower.includes(cabinNameLower) || 
            fileNameLower.includes(cabinNameOrigLower) || 
            (cabinNameEngLower && fileNameLower.includes(cabinNameEngLower))) {
          return true;
        }

        // 2. Fallback to word token/word-by-word match if enabled
        if (cabinFilterWordByWord) {
          // Extract words from all versions of the cabin name
          const sigWords1 = getSignificantWords(cabinNameLower);
          const sigWords2 = getSignificantWords(cabinNameOrigLower);
          const sigWords3 = cabinNameEngLower ? getSignificantWords(cabinNameEngLower) : [];
          const allSigWords = Array.from(new Set([...sigWords1, ...sigWords2, ...sigWords3]));

          if (allSigWords.length > 0) {
            // If any of our key words is matched in the filename as a full token, return true!
            if (allSigWords.every(word => fileNameLower.includes(word))) {
              return true;
            }
            // Also check if any key word matches if name is a single word
            if (allSigWords.length === 1 && allSigWords.some(word => fileNameLower.includes(word))) {
              return true;
            }
          }
        }

        // 3. Match based on cabin link references matching the file ID/URL
        const driveId = getDriveFileId(file.id) || file.id;

        const matchesLink = (linkStr: string | undefined): boolean => {
          if (!linkStr) return false;
          const cleanLink = linkStr.trim();
          if (['no', 'n/a', 'non', ''].includes(cleanLink.toLowerCase())) return false;

          if (cleanLink.includes(driveId) || driveId.includes(cleanLink)) return true;

          const cabinDriveId = getDriveFileId(cleanLink);
          if (cabinDriveId && cabinDriveId === driveId) return true;

          return false;
        };

        if (matchesLink(cabin.link) || matchesLink(cabin.linkEng)) {
          return true;
        }

        return false;
      });
    });
  }, [combinedFiles, activeTab.mode, selectedCabinIdsKey, enableCabinFilter, selectedBoat, language, cabinFilterWordByWord]);

  useEffect(() => {
    const storeDisplayedFiles = useStore.getState().displayedFiles;
    const isSame = storeDisplayedFiles.length === displayedFiles.length && 
                   storeDisplayedFiles.every((val, idx) => val.id === displayedFiles[idx]?.id);
    if (!isSame) {
      useStore.getState().setDisplayedFiles(displayedFiles);
    }
  }, [displayedFiles]);

  const handleCopyImage = async (file: DriveFile, event: React.MouseEvent) => {
    event.stopPropagation();
    const result = await copyImageToClipboard(file.id, file.thumbnailLink);
    setCopyFeedback(prev => ({ ...prev, [file.id]: result }));
    setTimeout(() => {
      setCopyFeedback(prev => ({ ...prev, [file.id]: null }));
    }, 2000);
  };

  const handleCopyImageFromModal = async (file: DriveFile) => {
    const result = await copyImageToClipboard(file.id, file.thumbnailLink);
    setModalCopyFeedback(result);
    setTimeout(() => {
      setModalCopyFeedback(null);
    }, 2000);
  };

  const handlePrevImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!selectedPreviewFile || displayedFiles.length === 0) return;
    const currentIndex = displayedFiles.findIndex(f => f.id === selectedPreviewFile.id);
    if (currentIndex > 0) {
      setSelectedPreviewFile(displayedFiles[currentIndex - 1]);
      setModalCopyFeedback(null);
    } else {
      setSelectedPreviewFile(displayedFiles[displayedFiles.length - 1]);
      setModalCopyFeedback(null);
    }
  };

  const handleNextImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!selectedPreviewFile || displayedFiles.length === 0) return;
    const currentIndex = displayedFiles.findIndex(f => f.id === selectedPreviewFile.id);
    if (currentIndex !== -1 && currentIndex < displayedFiles.length - 1) {
      setSelectedPreviewFile(displayedFiles[currentIndex + 1]);
      setModalCopyFeedback(null);
    } else {
      setSelectedPreviewFile(displayedFiles[0]);
      setModalCopyFeedback(null);
    }
  };

  useEffect(() => {
    if (!selectedPreviewFile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevImage();
      } else if (e.key === 'ArrowRight') {
        handleNextImage();
      } else if (e.key === 'Escape') {
        setSelectedPreviewFile(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPreviewFile, displayedFiles]);

  useEffect(() => {
    const currentLive = useStore.getState().selectedLiveFile;
    if (displayedFiles.length > 0) {
      if (!currentLive || !displayedFiles.some(f => f.id === currentLive.id)) {
        useStore.getState().setSelectedLiveFile(displayedFiles[0]);
      }
    } else {
      if (currentLive !== null) {
        useStore.getState().setSelectedLiveFile(null);
      }
    }
  }, [displayedFiles, livePreviewEnabled]);

  const toggleListExpand = (id: string) => {
    setExpandedListIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const scanBoatDriveImages = async () => {
    if (!selectedBoatName) return;
    
    let token = getAccessToken();
    if (!token) {
      try {
        const result = await googleSignIn();
        if (result) {
          token = result.accessToken;
        } else {
          return;
        }
      } catch (err: any) {
        useStore.getState().setImagesError(err.message || 'Login required to fetch images from Google Drive.');
        return;
      }
    }

    if (!token) return;

    setIsRefreshingBoat(true);
    useStore.getState().setLoadingImages(true);
    useStore.getState().setImagesError(null);

    try {
      const aliases = getExtendedAliases(selectedBoatName);
      // Clean and get clean words of length >= 3
      const allWords = Array.from(
        new Set(
          aliases
            .flatMap(a => removeAccents(a).toLowerCase().split(/\s+/))
            .filter(w => w.length >= 3 && w !== 'boat' && w !== 'kapal' && w !== 'phinisi')
        )
      );

      // Construct a query using Google Drive contains
      // Limit to max 4 words to avoid huge API query errors, prioritize first ones
      const queryWords = allWords.slice(0, 4);
      let queryPart = '';
      if (queryWords.length > 0) {
        queryPart = ' and (' + queryWords.map(w => `name contains '${w.replace(/'/g, "\\'")}'`).join(' or ') + ')';
      }

      const fetchFolderForBoat = async (folderId: string) => {
        const query = `'${folderId}' in parents and trashed = false${queryPart}`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink)&pageSize=1000`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          throw new Error(`Failed to retrieve files for this boat from Drive`);
        }
        const data = await res.json();
        return data.files || [];
      };

      const [newKicFiles, newLebaliblogFiles] = await Promise.all([
        fetchFolderForBoat('1x74ZEhw6JIZcIvfUlWqfcCVew7NPrErg'),
        fetchFolderForBoat('1-Esr3Csx09y_rl61LHkxYAXwlbb2iS1b')
      ]);

      const currentStoreKic = useStore.getState().kicFiles;
      const currentStoreLebaliblog = useStore.getState().lebaliblogFiles;

      const nonBoatKic = currentStoreKic.filter(file => {
        const fileName = (file.name || '').toLowerCase();
        return !aliases.some(boatAlias => isMatchWithFlexibility(fileName, boatAlias));
      });

      const nonBoatLebaliblog = currentStoreLebaliblog.filter(file => {
        const fileName = (file.name || '').toLowerCase();
        return !aliases.some(boatAlias => isMatchWithFlexibility(fileName, boatAlias));
      });

      // Combine remaining non-boat files with the newly fetched database files
      const finalKicMap = new Map<string, DriveFile>();
      nonBoatKic.forEach(f => finalKicMap.set(f.id, f));
      newKicFiles.forEach(f => finalKicMap.set(f.id, f));

      const finalLebaliblogMap = new Map<string, DriveFile>();
      nonBoatLebaliblog.forEach(f => finalLebaliblogMap.set(f.id, f));
      newLebaliblogFiles.forEach(f => finalLebaliblogMap.set(f.id, f));

      useStore.getState().setKicFiles(Array.from(finalKicMap.values()));
      useStore.getState().setLebaliblogFiles(Array.from(finalLebaliblogMap.values()));

    } catch (err: any) {
      console.error('Error scanning boat images:', err);
      useStore.getState().setImagesError(err.message || 'Failed to scan images for the selected boat.');
    } finally {
      setIsRefreshingBoat(false);
      useStore.getState().setLoadingImages(false);
    }
  };

  const refreshAllDriveImages = async () => {
    let token = getAccessToken();
    if (!token) {
      try {
        const result = await googleSignIn();
        if (result) {
          token = result.accessToken;
        } else {
          return;
        }
      } catch (err: any) {
        useStore.getState().setImagesError(err.message || 'Login required to fetch images.');
        return;
      }
    }

    if (!token) return;

    setIsRefreshingAll(true);
    try {
      await useStore.getState().fetchDriveImages(token);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsRefreshingAll(false);
    }
  };

  if (!selectedBoatName) return null;

  return (
    <div id="media-gallery" className="border border-border/80 rounded-3xl bg-card/40 backdrop-blur-md p-6 space-y-6 mt-8">
      {/* Header Info with Layout Options */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-black">Media Gallery</span>
          <h3 className="text-2xl font-serif italic font-bold tracking-tight text-foreground">
            {selectedBoatName} Images
          </h3>
        </div>

        {/* View Mode Preferences & Live Preview Toggle */}
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
          <button
            onClick={() => setLivePreviewEnabled(!livePreviewEnabled)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border flex items-center gap-1.5",
              livePreviewEnabled 
                ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/10" 
                : "bg-muted hover:bg-muted/85 border-border/40 text-muted-foreground hover:text-foreground"
            )}
            title="Toggle Large Image Preview on the side"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{language === 'FR' ? "Aperçu Direct" : "Live Preview"}</span>
          </button>

          <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/40">
            {[
              { id: 'list', label: 'List', icon: ListIcon },
              { id: 'small', label: 'Small', icon: Grid3X3 },
              { id: 'medium', label: 'Medium', icon: LayoutGrid },
              { id: 'big', label: 'Large', icon: Maximize2 }
            ].map((mode) => {
              const IconComponent = mode.icon;
              const isActive = viewMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id as any)}
                  title={`${mode.label} View`}
                  className={cn(
                    "p-2 rounded-lg transition-all cursor-pointer flex items-center justify-center",
                    isActive 
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <IconComponent className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cabin Image Filtering Controls (only visible in CABIN mode when cabin is selected) */}
      {activeTab.mode === 'CABIN' && selectedCabinIds.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-muted/30 border border-border/40 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>
              Selected Cabin(s): <strong className="text-foreground font-semibold">{selectedBoat?.cabins.filter(c => selectedCabinIds.includes(c.id)).map(c => c.name).join(', ')}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEnableCabinFilter(!enableCabinFilter)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border flex items-center gap-1.5",
                enableCabinFilter 
                  ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/10" 
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              )}
            >
              <div className={cn(
                "w-2.5 h-2.5 rounded-full border border-current flex items-center justify-center transition-all",
                enableCabinFilter ? "bg-emerald-400 border-emerald-400" : "bg-transparent"
              )}>
                {enableCabinFilter && <Check className="w-2 h-2 text-primary-foreground stroke-[4]" />}
              </div>
              Filter by Cabin
            </button>

            {enableCabinFilter && (
              <button
                onClick={() => setCabinFilterWordByWord(!cabinFilterWordByWord)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border flex items-center gap-1.5",
                  cabinFilterWordByWord 
                    ? "bg-secondary text-secondary-foreground border-border/80 shadow-xs" 
                    : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                )}
              >
                <div className={cn(
                  "w-2.5 h-2.5 rounded-full border border-current flex items-center justify-center transition-all",
                  cabinFilterWordByWord ? "bg-primary border-primary" : "bg-transparent"
                )}>
                  {cabinFilterWordByWord && <Check className="w-2 h-2 text-primary-foreground stroke-[4]" />}
                </div>
                Word-by-word Match <span className="text-[9px] lowercase text-muted-foreground/80 font-normal">(e.g. &ldquo;Bulukumba&rdquo;)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Google Drive Scan & Refresh Panel */}
      {showDriveControls && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-3.5 rounded-2xl bg-muted/20 border border-border/40 text-xs text-muted-foreground animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-4 h-4 text-primary shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-foreground text-[10px] uppercase tracking-wider">Google Drive Controls</span>
              <span className="text-[9px] text-muted-foreground/80">Scan for newly uploaded files or refresh the entire storage.</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedBoatName && (
              <button
                onClick={scanBoatDriveImages}
                disabled={isRefreshingBoat || loadingImages}
                title={`Scan Google Drive specifically for newly added or updated images containing "${selectedBoatName}" keywords.`}
                className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border bg-background hover:bg-muted text-foreground border-border hover:border-border/80 flex items-center gap-1.5 shadow-xs disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isRefreshingBoat ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                ) : (
                  <RefreshCcw className="w-3.5 h-3.5 text-emerald-500" />
                )}
                Scan {selectedBoatName}
              </button>
            )}

            <button
              onClick={refreshAllDriveImages}
              disabled={isRefreshingAll || loadingImages}
              title="Reload all files in the KIC and Lebaliblog folders from Google Drive."
              className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border bg-background hover:bg-muted text-foreground border-border hover:border-border/80 flex items-center gap-1.5 shadow-xs disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {isRefreshingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              ) : (
                <HardDrive className="w-3.5 h-3.5 text-primary" />
              )}
              Refresh All Storage
            </button>
          </div>
        </div>
      )}

      {/* Tabs and Custom Wiring Trigger */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex p-0.5 bg-muted/60 rounded-xl border border-border/40 w-full md:w-fit">
          {[
            { id: 'KIC', label: 'KIC (ENGLISH)' },
            { id: 'LEBALIBLOG', label: 'LEBALIBLOG (FRENCH)' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFolderTab(tab.id as any)}
              className={cn(
                "flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-[9px] font-bold tracking-widest transition-all uppercase whitespace-nowrap cursor-pointer",
                activeFolderTab === tab.id 
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto ml-auto md:ml-0">
          {/* Drive Tools Toggle Button */}
          <button
            onClick={() => {
              setShowDriveControls(!showDriveControls);
            }}
            className={cn(
              "h-9 w-9 hover:w-auto hover:px-3.5 rounded-full flex items-center justify-center transition-all duration-305 ease-in-out cursor-pointer border overflow-hidden group/btn relative",
              showDriveControls 
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            )}
            title="Sync Google Drive"
          >
            <RefreshCcw className={cn("w-4 h-4 text-emerald-500 shrink-0", (isRefreshingBoat || isRefreshingAll) ? "animate-spin" : "")} />
            <div className="flex items-center max-w-0 group-hover/btn:max-w-[150px] opacity-0 group-hover/btn:opacity-100 transition-all duration-305 ease-in-out overflow-hidden group-hover/btn:ml-1.5 whitespace-nowrap shrink-0">
              <span className="text-[10px] font-black uppercase tracking-wider">
                {showDriveControls ? 'Hide Sync Tools' : 'Sync Google Drive'}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Content Area */}
      {loadingImages ? (
        <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground font-medium">Fetching sync images from drive folders...</p>
        </div>
      ) : imagesError ? (
        <div className="p-4 rounded-xl border border-destructive/10 bg-destructive/5 text-destructive text-xs">
          {imagesError}
        </div>
      ) : kicFiles.length === 0 && lebaliblogFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-border/60 rounded-2xl bg-muted/5 gap-3">
          <Lock className="w-5 h-5 text-muted-foreground/60" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-foreground">Google Drive Offline or Restricted</p>
            <p className="text-[10px] text-muted-foreground max-w-[240px]">
              Disconnect and Sign-In again inside Step 1 using a Google Account with appropriate permissions to automatically fetch remote templates images.
            </p>
          </div>
        </div>
      ) : combinedFiles.length === 0 ? (
        <div className="space-y-6">
          <div className="p-8 text-center border border-dashed border-border/40 rounded-2xl bg-muted/5">
            <FileImage className="w-5 h-5 text-muted-foreground/45 mx-auto mb-2" />
            <p className="text-xs font-medium text-muted-foreground">
              No matching images found for &ldquo;{selectedBoatName}&rdquo; inside this directory.
            </p>
            <p className="text-[9px] text-muted-foreground/75 mt-1">
              Files should contain the keyword &ldquo;{cleanBoatKeyword}&rdquo; to display in this list.
            </p>
          </div>
        </div>
      ) : displayedFiles.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border/40 rounded-2xl bg-muted/5">
          <FileImage className="w-5 h-5 text-muted-foreground/45 mx-auto mb-2" />
          <p className="text-xs font-medium text-foreground">
            No images match your selected cabin(s)
          </p>
          <p className="text-[10px] text-muted-foreground/75 mt-2 max-w-[280px] mx-auto">
            Images must contain the name of the selected cabin(s) (e.g. &ldquo;{(selectedBoat?.cabins.filter(c => selectedCabinIds.includes(c.id)).map(c => c.name).join(', ')) || ''}&rdquo;) or be a wired link associated with them.
          </p>
        </div>
      ) : (
        <div>
          {/* Thumbnail grid container */}
          <div className="max-h-[550px] overflow-y-auto pr-2 custom-scrollbar transition-all duration-500 ease-in-out">
            {/* 1. LIST VIEW (Accordions with collapsibility) */}
            {viewMode === 'list' && (
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {displayedFiles.map((file) => {
                    const imageUrl = getDisplayImageUrl(file.id);
                    const isExpanded = !!expandedListIds[file.id];
                    
                    return (
                      <motion.div
                        key={file.id}
                        layout
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="border border-border bg-card/50 rounded-xl overflow-hidden transition-all hover:border-border/100"
                      >
                        {/* Header row */}
                        <div 
                          onClick={() => toggleListExpand(file.id)}
                          className="px-4 py-3 flex items-center justify-between gap-4 cursor-pointer select-none hover:bg-muted/30"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileImage className="w-4 h-4 text-primary shrink-0" />
                            <span className="text-xs font-medium truncate text-foreground font-sans">
                              {file.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Quick copy image icon button */}
                            <button
                              onClick={(e) => handleCopyImage(file, e)}
                              title="Copy Image"
                              className={cn(
                                "p-1.5 rounded-lg border border-border/60 cursor-pointer transition-colors",
                                copyFeedback[file.id] === 'IMAGE' 
                                  ? "bg-green-600 border-green-600 text-white" 
                                  : "bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {copyFeedback[file.id] === 'IMAGE' ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Preview trigger button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleImageSelect(file);
                              }}
                              title="Preview Image"
                              className="p-1.5 rounded-lg border border-border/60 bg-background hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Accordion indicator */}
                            <ChevronDown 
                              className={cn(
                                "w-4 h-4 text-muted-foreground transition-transform duration-200", 
                                isExpanded && "rotate-180 text-foreground"
                              )} 
                            />
                          </div>
                        </div>

                        {/* Dropdown content */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              className="bg-muted/20 border-t border-border/40"
                            >
                              <div className="p-4 flex flex-col md:flex-row gap-4 items-start">
                                {/* Left side preview */}
                                <div 
                                  onClick={() => handleImageSelect(file)}
                                  className="relative aspect-video w-full md:w-48 rounded-xl overflow-hidden bg-muted border border-border cursor-zoom-in group"
                                >
                                  <img
                                    src={imageUrl}
                                    alt={file.name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                  <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Eye className="w-5 h-5 text-white" />
                                  </div>
                                </div>

                                {/* Right side information & actions */}
                                <div className="flex-1 space-y-3 w-full">
                                  <div className="space-y-0.5">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Original File Name</span>
                                    <p className="text-xs font-mono font-medium text-foreground break-all">{file.name}</p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      onClick={(e) => handleCopyImage(file, e)}
                                      className={cn(
                                        "py-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border",
                                        copyFeedback[file.id] === 'IMAGE' 
                                          ? "bg-green-600 border-green-600 text-white" 
                                          : "bg-background border-border text-foreground hover:bg-muted"
                                      )}
                                    >
                                      {copyFeedback[file.id] === 'IMAGE' ? (
                                        <>
                                          <Check className="w-3 h-3" />
                                          Copied Image
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" />
                                          Copy Direct Image
                                        </>
                                      )}
                                    </button>

                                    <button
                                      onClick={() => setSelectedPreviewFile(file)}
                                      className="py-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all cursor-pointer"
                                    >
                                      <Eye className="w-3 h-3" />
                                      Stream Preview
                                    </button>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const url = file.webViewLink || `https://drive.google.com/open?id=${file.id}`;
                                        window.open(url, '_blank', 'noreferrer,noopener');
                                      }}
                                      className="py-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 bg-muted text-foreground hover:bg-muted/80 transition-all cursor-pointer"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Google Drive
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* 2. SMALL GRID VIEW (Ultra density grid, multi columns, compact) */}
            {viewMode === 'small' && (
              <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2.5">
                <AnimatePresence mode="popLayout">
                  {displayedFiles.map((file) => {
                    const imageUrl = getDisplayImageUrl(file.id);
                    const isImageFeedback = copyFeedback[file.id] === 'IMAGE';

                    return (
                      <motion.div
                        key={file.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => handleImageSelect(file)}
                        className="group relative aspect-square bg-muted border border-border/80 hover:border-primary/50 rounded-xl overflow-hidden cursor-zoom-in transition-all flex flex-col justify-end"
                      >
                        <img
                          src={imageUrl}
                          alt={file.name}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            if (file.thumbnailLink) {
                              e.currentTarget.src = file.thumbnailLink.replace(/=s\d+/, '=s250');
                            }
                          }}
                        />

                        {/* Small floating copy action overlay, or always-on label */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 p-1.5 text-white">
                          <p className="text-[8px] font-medium leading-none line-clamp-1 opacity-90 drop-shadow flex items-center justify-between gap-1">
                            <span className="truncate max-w-[80%]">{file.name}</span>
                            <span className="scale-75 shrink-0">
                              {isImageFeedback ? (
                                <Check className="w-2.5 h-2.5 text-green-400" />
                              ) : (
                                <Eye className="w-2.5 h-2.5 opacity-60" />
                              )}
                            </span>
                          </p>
                        </div>

                        {/* Compact hover/active triggers */}
                        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button
                            onClick={(e) => handleCopyImage(file, e)}
                            title="Copy Image Directly"
                            className={cn(
                              "p-1 rounded-md cursor-pointer transition-transform duration-100 shadow-sm backdrop-blur-sm",
                              isImageFeedback ? "bg-green-600 text-white" : "bg-black/60 text-white hover:bg-black/85"
                            )}
                          >
                            {isImageFeedback ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* 3. MEDIUM GRID VIEW (The optimal balanced standard, 2-column) */}
            {viewMode === 'medium' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                  {displayedFiles.map((file) => {
                    const imageUrl = getDisplayImageUrl(file.id);

                    return (
                      <motion.div
                        key={file.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="group relative border border-border bg-card/65 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between"
                      >
                        {/* Image Frame */}
                        <div 
                          onClick={() => handleImageSelect(file)}
                          className="relative aspect-video bg-muted overflow-hidden cursor-zoom-in"
                        >
                          <img
                            src={imageUrl}
                            alt={file.name}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              if (file.thumbnailLink) {
                                e.currentTarget.src = file.thumbnailLink.replace(/=s\d+/, '=s400');
                              }
                            }}
                          />
                          
                          {/* Floating Info Overlay */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 text-white">
                            <p className="text-[10px] font-medium leading-tight line-clamp-1 opacity-90 drop-shadow-sm font-sans">
                              {file.name}
                            </p>
                          </div>

                          {/* Floating Preview Eye icon */}
                          <div className="absolute top-2.5 left-2.5 p-1.5 rounded-lg bg-black/60 text-white/90 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye className="w-3.5 h-3.5" />
                          </div>

                          {/* Floating Original redirect inside Google Drive */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = file.webViewLink || `https://drive.google.com/open?id=${file.id}`;
                              window.open(url, '_blank', 'noopener,noreferrer');
                            }}
                            title="Open Original in Google Drive"
                            className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white/90 hover:text-white transition-all cursor-pointer backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Copy Image Container */}
                        <div className="p-3 bg-card flex flex-col gap-2">
                          <div className="space-y-0.5">
                            <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block">File Name</span>
                            <p className="text-[10px] font-mono font-medium truncate text-foreground leading-tight">
                              {file.name}
                            </p>
                          </div>

                          <button
                            onClick={(e) => handleCopyImage(file, e)}
                            className={cn(
                              "w-full py-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                              copyFeedback[file.id] === 'IMAGE' && "bg-green-600 text-white",
                              copyFeedback[file.id] === 'LINK' && "bg-amber-600 text-white",
                              copyFeedback[file.id] === 'FAILED' && "bg-destructive text-white",
                              !copyFeedback[file.id] && "bg-muted text-foreground hover:bg-foreground hover:text-background"
                            )}
                          >
                            {copyFeedback[file.id] === 'IMAGE' ? (
                              <>
                                <Check className="w-3" />
                                Copied Image
                              </>
                            ) : copyFeedback[file.id] === 'LINK' ? (
                              <>
                                <Check className="w-3" />
                                Copied URL
                              </>
                            ) : copyFeedback[file.id] === 'FAILED' ? (
                              <>
                                <AlertCircle className="w-3" />
                                Copy Failed
                              </>
                            ) : (
                              <>
                                <Copy className="w-3" />
                                Copy Image
                              </>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* 4. BIG GRID VIEW (Single-column layout, detailed views) */}
            {viewMode === 'big' && (
              <div className="grid grid-cols-1 gap-6">
                <AnimatePresence mode="popLayout">
                  {displayedFiles.map((file) => {
                    const imageUrl = getDisplayImageUrl(file.id);
                    const isImageFeedback = copyFeedback[file.id] === 'IMAGE';

                    return (
                      <motion.div
                        key={file.id}
                        layout
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group border border-border bg-card rounded-2xl overflow-hidden shadow-md flex flex-col justify-between"
                      >
                        <div 
                          onClick={() => handleImageSelect(file)}
                          className="relative aspect-[16/9] w-full bg-muted overflow-hidden cursor-zoom-in"
                        >
                          <img
                            src={imageUrl}
                            alt={file.name}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent p-5 flex items-end">
                            <div className="space-y-1">
                              <span className="text-[8px] font-black tracking-widest text-white/60 uppercase">High Definition Preview</span>
                              <h4 className="text-sm font-bold text-white drop-shadow">{file.name}</h4>
                            </div>
                          </div>

                          {/* Stream trigger */}
                          <div className="absolute top-4 left-4 p-2 rounded-xl bg-black/60 text-white/95 text-[9px] font-black uppercase tracking-wider backdrop-blur-sm flex items-center gap-1.5 opacity-90">
                            <Eye className="w-3.5 h-3.5" />
                            Stream Click to Expand
                          </div>

                          {/* Open in drive */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = file.webViewLink || `https://drive.google.com/open?id=${file.id}`;
                              window.open(url, '_blank', 'noreferrer,noopener');
                            }}
                            className="absolute top-4 right-4 p-2 rounded-xl bg-black/60 hover:bg-black/85 text-white backdrop-blur-sm cursor-pointer transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Control panel of big card */}
                        <div className="p-4 bg-muted/15 border-t border-border/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div className="min-w-0">
                            <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground block">Google Drive Document Identifier</span>
                            <p className="text-[11px] font-mono text-muted-foreground truncate font-medium">{file.id}</p>
                          </div>

                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={(e) => handleCopyImage(file, e)}
                              className={cn(
                                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer border",
                                isImageFeedback 
                                  ? "bg-green-600 border-green-600 text-white" 
                                  : "bg-background border-border text-foreground hover:bg-muted"
                              )}
                            >
                              {isImageFeedback ? (
                                <>
                                  <Check className="w-3.5" />
                                  Copied Image!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5" />
                                  Copy Cabin Image
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => setSelectedPreviewFile(file)}
                              className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                            >
                              <Eye className="w-3.5" />
                              Expand Preview
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. INTERACTIVE IMAGE STEAMING PREVIEW MODAL */}
      {selectedPreviewFile && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 md:p-10 bg-black/95 backdrop-blur-sm select-none"
            onClick={() => setSelectedPreviewFile(null)}
          >
            {/* Close button on high top right */}
            <button
              onClick={() => setSelectedPreviewFile(null)}
              className="absolute top-6 right-6 p-3 rounded-full bg-black/50 hover:bg-black/80 border border-white/20 text-white transition-all cursor-pointer shadow-lg z-50 flex items-center justify-center"
              title="Close Preview (Esc)"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Modal Content Card */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-5xl max-h-[90vh] bg-card rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Media preview element streaming area */}
              <div className="relative flex-1 bg-black/40 overflow-hidden flex items-center justify-center min-h-[350px] max-h-[75vh] p-4">
                {displayedFiles.length > 1 && (
                  <>
                    <button
                      onClick={handlePrevImage}
                      className="absolute left-4 p-2.5 rounded-full bg-black/65 hover:bg-black/95 border border-white/20 text-white hover:scale-105 active:scale-95 transition-all cursor-pointer z-20 flex items-center justify-center shadow-xl group"
                      title="Previous Image (Left Arrow)"
                    >
                      <ChevronLeft className="w-5 h-5 group-hover:text-amber-100 transition-colors" />
                    </button>
                    <button
                      onClick={handleNextImage}
                      className="absolute right-4 p-2.5 rounded-full bg-black/65 hover:bg-black/95 border border-white/20 text-white hover:scale-105 active:scale-95 transition-all cursor-pointer z-20 flex items-center justify-center shadow-xl group"
                      title="Next Image (Right Arrow)"
                    >
                      <ChevronRight className="w-5 h-5 group-hover:text-amber-100 transition-colors" />
                    </button>
                  </>
                )}

                <img
                  src={getDisplayImageUrl(selectedPreviewFile.id)}
                  alt={selectedPreviewFile.name}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[70vh] object-contain rounded-2xl select-none select-img shadow-md border border-white/5"
                  onError={(e) => {
                    if (selectedPreviewFile.thumbnailLink) {
                      e.currentTarget.src = selectedPreviewFile.thumbnailLink.replace(/=s\d+/, '=s800');
                    }
                  }}
                />

                {/* Left indicators */}
                <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-black/70 text-white text-[10px] font-mono tracking-wider backdrop-blur-md pointer-events-none select-none border border-white/10">
                  {selectedPreviewFile.id.startsWith('http') ? 'Custom Wired Link' : 'Google Drive Stream'}
                </div>
              </div>

              {/* Informative Details & Quick Clipboard triggers under bottom */}
              <div className="p-5 bg-card border-t border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <span className="text-[9px] font-black tracking-widest text-muted-foreground uppercase">Currently Streaming</span>
                  <p className="text-base font-bold text-foreground truncate">{selectedPreviewFile.name}</p>
                  <p className="text-xs text-muted-foreground truncate font-mono opacity-80">ID: {selectedPreviewFile.id}</p>
                </div>

                {/* Instant actions inside popup */}
                <div className="flex flex-wrap gap-2 md:shrink-0">
                  {/* Copy DIRECT BLOB Image button */}
                  <button
                    onClick={() => handleCopyImageFromModal(selectedPreviewFile)}
                    className={cn(
                      "px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer border shadow-sm",
                      modalCopyFeedback === 'IMAGE'
                        ? "bg-green-600 border-green-600 text-white"
                        : modalCopyFeedback === 'LINK'
                        ? "bg-amber-600 border-amber-600 text-white"
                        : modalCopyFeedback === 'FAILED'
                        ? "bg-destructive border-destructive text-white"
                        : "bg-primary text-primary-foreground border-primary hover:bg-primary/95"
                    )}
                  >
                    {modalCopyFeedback === 'IMAGE' ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied Image Blob!
                      </>
                    ) : modalCopyFeedback === 'LINK' ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied URL Fallback
                      </>
                    ) : modalCopyFeedback === 'FAILED' ? (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        Copy Failed
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Image
                      </>
                    )}
                  </button>

                  {/* Open in google drive or custom location */}
                  <button
                    onClick={() => {
                      const url = selectedPreviewFile.id.startsWith('http') ? selectedPreviewFile.id : (selectedPreviewFile.webViewLink || `https://drive.google.com/open?id=${selectedPreviewFile.id}`);
                      window.open(url, '_blank', 'noreferrer,noopener');
                    }}
                    className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all cursor-pointer border border-border"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Google Drive original
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

