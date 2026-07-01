export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualifying'
  | 'captured'
  | 'pending_confirmation'
  | 'confirmed'
  | 'closed';

export type AppointmentType = 'inspection' | 'repair';

export interface Lead {
  id: number;
  account_id: string;
  caller_phone: string;
  status: LeadStatus;
  name: string | null;
  email: string | null;
  need_summary: string | null;
  preferred_time: string | null;
  location: string | null;
  appointment_type: AppointmentType | null;
  confirmed_time: string | null;
  call_sid: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  lead_id: number;
  direction: 'inbound' | 'outbound';
  body: string;
  created_at: string;
}

export interface Photo {
  id: number;
  lead_id: number;
  file_path: string;
  mime_type: string | null;
  created_at: string;
  url: string;
}

export interface LeadStats {
  total: number;
  pending: number;
  confirmed: number;
  active: number;
}

export interface LeadsResponse {
  accountId: string;
  leads: Lead[];
  stats: LeadStats;
}

export interface LeadDetailResponse {
  accountId: string;
  lead: Lead;
  messages: Message[];
  photos: Photo[];
  appointmentTypes: Record<string, AppointmentType>;
}

export interface ConfirmPayload {
  account_id: string;
  appointment_type: AppointmentType;
  preferred_time: string;
}
