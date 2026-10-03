import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from 'firebase/auth';
import { BoatSnapshot } from './types/share';
import { safeUUID } from './lib/utils';

export interface Cabin {
  id: string;
  name: string;
  link: string;
  itinerary?: string;
  departure?: string;
  schedule?: string;
  nameEng?: string;
  linkEng?: string;
  itineraryEng?: string;
  departureEng?: string;
  scheduleEng?: string;
  charterFr?: string;
  charterEng?: string;
}

export interface Boat {
  name: string;
  cabins: Cabin[];
  charterFr?: string;
  charterEng?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
}

export type Language = 'FR' | 'ENG';
export type Mode = 'CABIN' | 'CHARTER';
export type FormattingMode = 'DEFAULT' | 'WHATSAPP' | 'EMAIL';
export type NoteLabel = 'Overbudget' | 'Under-budget' | 'Marathon' | 'Custom Depart' | 'None';

export interface KeyboardShortcuts {
  focusSearch: string;
  toggleSpotlight: string;
  toggleLanguage: string;
  toggleNotepad: string;
  toggleGallery: string;
  toggleVesselSelector: string;
  toggleInquiry: string;
  clearCabins: string;
  resetNotepad: string;
  copyItinerary: string;
}

export const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  focusSearch: 'q',
  toggleSpotlight: 'alt+f',
  toggleLanguage: 'alt+l',
  toggleNotepad: 'alt+n',
  toggleGallery: 'alt+g',
  toggleVesselSelector: 'alt+v',
  toggleInquiry: 'alt+i',
  clearCabins: 'alt+c',
  resetNotepad: 'alt+r',
  copyItinerary: 'alt+y',
};

export interface SavedNote {
  id: string;
  title: string;
  content: string;
  label: NoteLabel;
  isChecked: boolean;
  createdAt: number;
  clientName?: string;
  boatSnapshot?: BoatSnapshot;
}

export interface TabData {
  id: string;
  name: string;
  selectedBoatName: string | null;
  selectedCabinIds: string[];
  unavailableBoatNames: string[];
  unavailableCabinIds: string[];
  dates: string;
  language: Language;
  mode: Mode;
  formattingMode: FormattingMode;
  isBoatEmpty: boolean;
  showLimitedServiceNote: boolean;
  linkPreference: 'AUTO' | 'FR' | 'ENG';
  cabinSelections: Record<string, { count: number; extraBeds: number }>;
  activeSectionTab?: 'BOATS' | 'CABINS';
  sheetsConfig: {
    spreadsheetId: string;
    sheetName: string;
    lastSynced: string | null;
  };
  availableSheets: string[];
  inquiry: {
    clientName: string;
    calendar: string;
    pax: string;
    budget: string;
    itinerary: string;
    roomType: string;
    company: string;
    boatClass: string;
  };
  showMediaGallery?: boolean;
  showBoatCabinSelector?: boolean;
  showInquiryPanel?: boolean;
  showNotepad?: boolean;
}

interface AppState {
  theme: 'light' | 'dark';
  boats: Boat[];
  fileName: string | null;
  activeTabId: string;
  tabs: TabData[];
  savedNotes: SavedNote[];
  sortPriority: NoteLabel[];
  customShortcuts: KeyboardShortcuts;
  setCustomShortcut: (key: keyof KeyboardShortcuts, combination: string) => void;
  resetShortcuts: () => void;
  
  // Google Drive Images State
  kicFiles: DriveFile[];
  lebaliblogFiles: DriveFile[];
  loadingImages: boolean;
  imagesError: string | null;
  livePreviewEnabled: boolean;
  setLivePreviewEnabled: (enabled: boolean) => void;
  customWidth: number;
  setCustomWidth: (width: number) => void;
  selectedLiveFile: DriveFile | null;
  setSelectedLiveFile: (file: DriveFile | null) => void;
  displayedFiles: DriveFile[];
  setDisplayedFiles: (files: DriveFile[]) => void;
  googleUser: User | null;
  googleToken: string | null;
  setGoogleUser: (user: User | null, token: string | null) => void;
  setKicFiles: (files: DriveFile[]) => void;
  setLebaliblogFiles: (files: DriveFile[]) => void;
  setLoadingImages: (loading: boolean) => void;
  setImagesError: (err: string | null) => void;
  fetchDriveImages: (token: string) => Promise<void>;
  
  setTheme: (theme: 'light' | 'dark') => void;
  setBoats: (boats: Boat[], fileName: string) => void;
  
  // Tab Management
  addTab: () => void;
  removeTab: (id: string) => void;
  setActiveTabId: (id: string) => void;
  updateActiveTab: (data: Partial<TabData>) => void;
  renameTab: (id: string, name: string) => void;

  // Shortcuts for active tab data (for easier component integration)
  setSelectedBoatName: (name: string | null) => void;
  setSelectedCabinIds: (ids: string[]) => void;
  toggleBoatAvailability: (name: string) => void;
  toggleCabinAvailability: (id: string) => void;
  setDates: (dates: string) => void;
  setLanguage: (lang: Language) => void;
  setMode: (mode: Mode) => void;
  setFormattingMode: (mode: FormattingMode) => void;
  setIsBoatEmpty: (isEmpty: boolean) => void;
  setShowLimitedServiceNote: (show: boolean) => void;
  setLinkPreference: (pref: 'AUTO' | 'FR' | 'ENG') => void;
  setCabinSelectionCount: (cabinId: string, count: number) => void;
  setCabinSelectionExtraBeds: (cabinId: string, extraBeds: number) => void;
  setActiveSectionTab: (tab: 'BOATS' | 'CABINS') => void;
  setSheetsConfig: (config: Partial<TabData['sheetsConfig']>) => void;
  setAvailableSheets: (sheets: string[]) => void;
  setInquiry: (inquiry: Partial<TabData['inquiry']>) => void;

  // Layout and Config Toggles
  toggleShowMediaGallery: () => void;
  toggleShowBoatCabinSelector: () => void;
  toggleShowInquiryPanel: () => void;
  toggleShowNotepad: () => void;
  addCustomBoat: (boat: Boat) => void;
  deleteBoat: (boatName: string) => void;

  // Notepad
  addNote: (note: Omit<SavedNote, 'id' | 'createdAt' | 'label' | 'isChecked'>) => void;
  updateNote: (id: string, content: string) => void;
  updateNoteTitle: (id: string, title: string) => void;
  updateNoteLabel: (id: string, label: NoteLabel) => void;
  toggleNoteChecked: (id: string) => void;
  setSortPriority: (priority: NoteLabel[]) => void;
  deleteNote: (id: string) => void;
  clearNotes: () => void;
  resetLabelAll: () => void;
  reset: () => void;
}

const createDefaultTab = (id: string, name: string): TabData => ({
  id,
  name,
  selectedBoatName: null,
  selectedCabinIds: [],
  unavailableBoatNames: [],
  unavailableCabinIds: [],
  dates: '',
  language: 'FR',
  cabinSelections: {},
  mode: 'CABIN',
  activeSectionTab: 'BOATS',
  formattingMode: 'DEFAULT',
  isBoatEmpty: false,
  showLimitedServiceNote: true,
  linkPreference: 'AUTO',
  sheetsConfig: {
    spreadsheetId: '',
    sheetName: '',
    lastSynced: null,
  },
  availableSheets: [],
  inquiry: {
    clientName: '',
    calendar: '',
    pax: '',
    budget: '',
    itinerary: '',
    roomType: '',
    company: '',
    boatClass: '',
  },
  showMediaGallery: true,
  showBoatCabinSelector: true,
  showInquiryPanel: true,
  showNotepad: true,
});

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'light',
      boats: [],
      fileName: null,
      activeTabId: 'default',
      tabs: [createDefaultTab('default', 'Client 1')],
      savedNotes: [],
      sortPriority: ['Overbudget', 'Marathon', 'Custom Depart', 'Under-budget', 'None'],
      customShortcuts: DEFAULT_SHORTCUTS,

      kicFiles: (() => {
        try {
          const cached = localStorage.getItem('kic_drive_files_cache');
          if (cached) return JSON.parse(cached);
        } catch (_) {}
        return [];
      })(),
      lebaliblogFiles: (() => {
        try {
          const cached = localStorage.getItem('lebaliblog_drive_files_cache');
          if (cached) return JSON.parse(cached);
        } catch (_) {}
        return [];
      })(),
      loadingImages: false,
      imagesError: null,
      livePreviewEnabled: false,
      setLivePreviewEnabled: (enabled) => set({ livePreviewEnabled: enabled }),
      customWidth: (() => {
        try {
          const saved = localStorage.getItem('cabingen_custom_width');
          if (saved) {
            const parsed = Number(saved);
            if (!isNaN(parsed) && parsed >= 50 && parsed <= 100) return parsed;
          }
        } catch (_) {}
        return 90;
      })(),
      setCustomWidth: (width) => {
        try {
          localStorage.setItem('cabingen_custom_width', String(width));
        } catch (_) {}
        set({ customWidth: width });
      },
      selectedLiveFile: null,
      setSelectedLiveFile: (file) => set({ selectedLiveFile: file }),
      displayedFiles: [],
      setDisplayedFiles: (files) => set({ displayedFiles: files }),
      googleUser: null,
      googleToken: null,
      setGoogleUser: (user, token) => set({ googleUser: user, googleToken: token }),
      setKicFiles: (files) => {
        try {
          localStorage.setItem('kic_drive_files_cache', JSON.stringify(files));
        } catch (_) {}
        set({ kicFiles: files });
      },
      setLebaliblogFiles: (files) => {
        try {
          localStorage.setItem('lebaliblog_drive_files_cache', JSON.stringify(files));
        } catch (_) {}
        set({ lebaliblogFiles: files });
      },
      setLoadingImages: (loading) => set({ loadingImages: loading }),
      setImagesError: (err) => set({ imagesError: err }),
      fetchDriveImages: async (token) => {
        set({ loadingImages: true, imagesError: null });
        try {
          const fetchFolder = async (folderId: string) => {
            const query = `'${folderId}' in parents and trashed = false`;
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink)&pageSize=1000`;
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
              throw new Error(`Failed to retrieve files from parent folder ${folderId}`);
            }
            const data = await res.json();
            return data.files || [];
          };

          const [kic, lebaliblog] = await Promise.all([
            fetchFolder('1x74ZEhw6JIZcIvfUlWqfcCVew7NPrErg'),
            fetchFolder('1-Esr3Csx09y_rl61LHkxYAXwlbb2iS1b')
          ]);

          set({
            kicFiles: kic,
            lebaliblogFiles: lebaliblog,
            loadingImages: false
          });

          try {
            localStorage.setItem('kic_drive_files_cache', JSON.stringify(kic));
            localStorage.setItem('lebaliblog_drive_files_cache', JSON.stringify(lebaliblog));
          } catch (_) {}
        } catch (err: any) {
          console.error('Error fetching drive images:', err);
          set({
            imagesError: err.message || 'Failed to fetch images from Google Drive.',
            loadingImages: false
          });
        }
      },

      setTheme: (theme) => set({ theme }),
      setBoats: (boats, fileName) => set({ boats, fileName }),

      addTab: () => set((state) => {
        const id = safeUUID();
        const name = `Client ${state.tabs.length + 1}`;
        return {
          tabs: [...state.tabs, createDefaultTab(id, name)],
          activeTabId: id,
        };
      }),
      removeTab: (id) => set((state) => {
        if (state.tabs.length <= 1) return state;
        const newTabs = state.tabs.filter((t) => t.id !== id);
        const newActiveId = state.activeTabId === id ? newTabs[0].id : state.activeTabId;
        return { tabs: newTabs, activeTabId: newActiveId };
      }),
      setActiveTabId: (activeTabId) => set({ activeTabId }),
      updateActiveTab: (data) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, ...data } : t)
      })),
      renameTab: (id, name) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, name } : t)
      })),

      // Proxies to active tab
      setSelectedBoatName: (name) => set((state) => {
        const selectedBoat = state.boats.find(b => b.name === name);
        let hasNote = false;

        if (selectedBoat) {
          const fuelRegex = /⛽|Surcharge\s*Carburant/i;
          const noteRegex = /Service\s*client\s*limité/i;
          
          const check = (obj: any) => {
            const fields = ['name', 'nameEng', 'itinerary', 'itineraryEng', 'link', 'linkEng', 'charterFr', 'charterEng'];
            return fields.some(f => obj[f] && typeof obj[f] === 'string' && (fuelRegex.test(obj[f]) || noteRegex.test(obj[f])));
          };

          // Check boat level charter info
          if (check(selectedBoat)) hasNote = true;

          // Check all cabins as well
          selectedBoat.cabins.forEach(cabin => {
            if (check(cabin)) hasNote = true;
          });
        }

        return {
          tabs: state.tabs.map((t) => t.id === state.activeTabId ? { 
            ...t, 
            selectedBoatName: name, 
            selectedCabinIds: [],
            showLimitedServiceNote: hasNote,
            activeSectionTab: name ? 'CABINS' : 'BOATS'
          } : t)
        };
      }),
      setSelectedCabinIds: (ids) => set((state) => {
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        const selectedBoat = state.boats.find(b => b.name === activeTab?.selectedBoatName);
        
        let hasNote = false;

        if (selectedBoat) {
          const fuelRegex = /⛽|Surcharge\s*Carburant/i;
          const noteRegex = /Service\s*client\s*limité/i;

          const check = (obj: any) => {
            const fields = ['name', 'nameEng', 'itinerary', 'itineraryEng', 'link', 'linkEng', 'charterFr', 'charterEng'];
            return fields.some(f => obj[f] && typeof obj[f] === 'string' && (fuelRegex.test(obj[f]) || noteRegex.test(obj[f])));
          };

          const selectedCabins = selectedBoat.cabins.filter(c => ids.includes(c.id));

          selectedCabins.forEach(cabin => {
            if (check(cabin)) hasNote = true;
          });

          // Also check boat level
          if (check(selectedBoat)) hasNote = true;
        }

        return {
          tabs: state.tabs.map((t) => t.id === state.activeTabId ? { 
            ...t, 
            selectedCabinIds: ids,
            showLimitedServiceNote: hasNote
          } : t)
        };
      }),
      toggleBoatAvailability: (name) => set((state) => ({
        tabs: state.tabs.map((t) => {
          if (t.id !== state.activeTabId) return t;
          const unavailableNames = t.unavailableBoatNames || [];
          const isUnavailable = unavailableNames.includes(name);
          return {
            ...t,
            unavailableBoatNames: isUnavailable 
              ? unavailableNames.filter(n => n !== name)
              : [...unavailableNames, name]
          };
        })
      })),
      toggleCabinAvailability: (id) => set((state) => ({
        tabs: state.tabs.map((t) => {
          if (t.id !== state.activeTabId) return t;
          const unavailableIds = t.unavailableCabinIds || [];
          const isUnavailable = unavailableIds.includes(id);
          return {
            ...t,
            unavailableCabinIds: isUnavailable 
              ? unavailableIds.filter(c => c !== id)
              : [...unavailableIds, id]
          };
        })
      })),
      setDates: (dates) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, dates } : t)
      })),
      setLanguage: (language) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, language } : t)
      })),
      setMode: (mode) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, mode } : t)
      })),
      setFormattingMode: (formattingMode) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, formattingMode } : t)
      })),
      setIsBoatEmpty: (isBoatEmpty) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, isBoatEmpty } : t)
      })),
      setShowLimitedServiceNote: (showLimitedServiceNote) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, showLimitedServiceNote } : t)
      })),
      setLinkPreference: (linkPreference) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, linkPreference } : t)
      })),
      setCabinSelectionCount: (cabinId, count) => set((state) => ({
        tabs: state.tabs.map((t) => {
          if (t.id !== state.activeTabId) return t;
          const selections = t.cabinSelections || {};
          const current = selections[cabinId] || { count: 1, extraBeds: 0 };
          return {
            ...t,
            cabinSelections: {
              ...selections,
              [cabinId]: { ...current, count: Math.max(1, count) }
            }
          };
        })
      })),
      setCabinSelectionExtraBeds: (cabinId, extraBeds) => set((state) => ({
        tabs: state.tabs.map((t) => {
          if (t.id !== state.activeTabId) return t;
          const selections = t.cabinSelections || {};
          const current = selections[cabinId] || { count: 1, extraBeds: 0 };
          return {
            ...t,
            cabinSelections: {
              ...selections,
              [cabinId]: { ...current, extraBeds: Math.max(0, extraBeds) }
            }
          };
        })
      })),
      setActiveSectionTab: (activeSectionTab) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, activeSectionTab } : t)
      })),
      setSheetsConfig: (sheetsConfig) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, sheetsConfig: { ...t.sheetsConfig, ...sheetsConfig } } : t)
      })),
      setAvailableSheets: (availableSheets) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, availableSheets } : t)
      })),
      setInquiry: (inquiry) => set((state) => ({ 
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, inquiry: { ...t.inquiry, ...inquiry } } : t)
      })),

      toggleShowMediaGallery: () => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, showMediaGallery: t.showMediaGallery === false ? true : false } : t)
      })),
      toggleShowBoatCabinSelector: () => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, showBoatCabinSelector: t.showBoatCabinSelector === false ? true : false } : t)
      })),
      toggleShowInquiryPanel: () => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, showInquiryPanel: t.showInquiryPanel === false ? true : false } : t)
      })),
      toggleShowNotepad: () => set((state) => ({
        tabs: state.tabs.map((t) => t.id === state.activeTabId ? { ...t, showNotepad: t.showNotepad === false ? true : false } : t)
      })),
      addCustomBoat: (boat) => set((state) => {
        if (state.boats.some(b => b.name.toLowerCase() === boat.name.toLowerCase())) {
          return state;
        }
        return { boats: [...state.boats, boat] };
      }),
      deleteBoat: (boatName) => set((state) => ({
        boats: state.boats.filter(b => b.name !== boatName),
        tabs: state.tabs.map(t => t.selectedBoatName === boatName ? { ...t, selectedBoatName: null, selectedCabinIds: [] } : t)
      })),

      addNote: (note) => set((state) => ({
        savedNotes: [
          ...state.savedNotes,
          { ...note, id: safeUUID(), createdAt: Date.now(), label: 'None', isChecked: false }
        ]
      })),
      updateNote: (id, content) => set((state) => ({
        savedNotes: state.savedNotes.map(n => n.id === id ? { ...n, content } : n)
      })),
      updateNoteTitle: (id, title) => set((state) => ({
        savedNotes: state.savedNotes.map(n => n.id === id ? { ...n, title } : n)
      })),
      updateNoteLabel: (id, label) => set((state) => ({
        savedNotes: state.savedNotes.map(n => n.id === id ? { ...n, label } : n)
      })),
      toggleNoteChecked: (id) => set((state) => ({
        savedNotes: state.savedNotes.map(n => n.id === id ? { ...n, isChecked: !n.isChecked } : n)
      })),
      setSortPriority: (sortPriority) => set({ sortPriority }),
      deleteNote: (id) => set((state) => ({
        savedNotes: state.savedNotes.filter(n => n.id !== id)
      })),
      clearNotes: () => set({ savedNotes: [] }),
      resetLabelAll: () => set((state) => ({
        savedNotes: state.savedNotes.map(n => ({ ...n, label: 'None' }))
      })),
      reset: () => set({ 
        boats: [], 
        fileName: null, 
        activeTabId: 'default',
        tabs: [createDefaultTab('default', 'Client 1')],
        savedNotes: [],
        sortPriority: ['Overbudget', 'Marathon', 'Custom Depart', 'Under-budget', 'None'],
        customShortcuts: DEFAULT_SHORTCUTS,
        kicFiles: [],
        lebaliblogFiles: []
      }),
      setCustomShortcut: (key, combination) => set((state) => ({
        customShortcuts: { ...state.customShortcuts, [key]: combination }
      })),
      resetShortcuts: () => set({ customShortcuts: DEFAULT_SHORTCUTS }),
    }),
    {
      name: 'boat-cabin-storage-v3',
      partialize: (state) => ({ 
        theme: state.theme, 
        activeTabId: state.activeTabId,
        tabs: state.tabs,
        savedNotes: state.savedNotes,
        sortPriority: state.sortPriority,
        customShortcuts: state.customShortcuts
      }),
    }
  )
);
