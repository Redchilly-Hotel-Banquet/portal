export interface CheckinBooking {
  id: string;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  check_in_date?: string;
  check_out_date?: string;
  booking_code?: string;
  status?: string;
  number_of_guests?: number;
}

export interface StoredImage {
  data_url: string;
  file_name?: string;
  mime_type?: string;
}

export interface AssignedRoom {
  id: string;
  code?: string | null;
  type?: string | null;
}

export interface CheckinDetails {
  status?: string;
  expected_arrival_time?: string | null;
  needs_special_assistance?: boolean;
  special_assistance_details?: string | null;
  other_requests?: string | null;
  guests?: Array<{
    full_name: string;
    document_type: string;
    document_number: string;
    /** Present instead of the number and images when only a summary is shared (see CheckinResponse.locked). */
    document_number_last4?: string | null;
    has_document_image?: boolean;
    has_signature?: boolean;
    document_image?: StoredImage | null;
    signature_image?: StoredImage | null;
  }>;
  signature?: StoredImage | null;
  assigned_room?: AssignedRoom | null;
  assigned_rooms?: AssignedRoom[];
}

export interface CheckinResponse {
  booking: CheckinBooking;
  checkinDetails: CheckinDetails | null;
  /** Checked in with a room assigned: the details can no longer be changed by the guest. */
  locked?: boolean;
}

export interface GuestEntry {
  /** Stable client id for React keys and error mapping. */
  key: string;
  fullName: string;
  documentType: string;
  documentNumber: string;
  imageDataUrl: string;
  imageName: string;
  imageType: string;
  /** Signature drawn by this guest (PNG data URL), or "". */
  signature: string;
  /** Index this guest had in the saved record, so unchanged images need not be re-uploaded. */
  savedIndex: number | null;
  /** Image and signature as stored, to detect what actually changed. */
  savedImage: string;
  savedSignature: string;
}

export const DOCUMENT_TYPES = [
  { value: "Aadhar Card", label: "Aadhaar card", placeholder: "12-digit Aadhaar number" },
  { value: "Driver's Licence", label: "Driving licence", placeholder: "Licence number" },
  { value: "Passport", label: "Passport", placeholder: "Passport number" },
  { value: "Voter ID", label: "Voter ID", placeholder: "Voter ID number" },
  { value: "Other", label: "Other document", placeholder: "Document number" },
] as const;

export const BOOKING_READY_STATUSES = ["CONFIRMED", "CHECKED_IN"];
