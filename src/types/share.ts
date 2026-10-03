export interface CabinSnapshot {
  id: string;
  name: string;
  nameEng?: string;
  count: number;
  extraBeds: number;
  imageUrl?: string;
  images?: string[];
  websiteUrl: string;
  price?: string;
  itinerary?: string;
  departure?: string;
  schedule?: string;
  features?: string[];
  description?: string;
}

export interface BoatSnapshot {
  boatName: string;
  itinerary?: string;
  dates: string;
  duration?: string;
  departure?: string;
  arrival?: string;
  cabins: CabinSnapshot[];
  fuelSurcharge?: string;
  limitedServiceNote?: string;
}

export interface ShareLinkSnapshot {
  shareId: string;
  boats?: BoatSnapshot[];
  // Backwards compatibility for previously stored links
  boatName?: string;
  itinerary?: string;
  dates?: string;
  duration?: string;
  departure?: string;
  cabins?: CabinSnapshot[];
  fuelSurcharge?: string;
  limitedServiceNote?: string;

  language: 'FR' | 'ENG';
  status: 'active' | 'revoked';
  createdAt: number;
  expiresAt: number;
  whatsappNumber: string;
  whatsappBusinessName: string;
  whatsappCtaCaption: string;
  whatsappMessage?: string;
  createdBy?: string;
}

export interface WhatsAppConfig {
  number: string;
  businessName: string;
  defaultCaption: string;
  defaultDurationDays: number;
}

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfig = {
  number: '',
  businessName: 'Komodo Island Cruise',
  defaultCaption: 'Ask About This Boat',
  defaultDurationDays: 3,
};
