export interface Outlet {
  id: string;
  location_key: string;
}

export interface AvailableRoom {
  id?: string;
  room_type?: string | null;
  type?: string;
  occupancy?: number;
  price_per_night?: number;
  effective_rate_per_night?: number;
  effective_total?: number;
  amenities?: string[];
}

export interface CategoryEntry {
  category: string;
  available_count: number;
  min_rate: number;
  max_rate: number;
  max_occupancy: number;
  amenities?: string[];
}

export interface AvailabilityResponse {
  rooms: AvailableRoom[];
  categories?: CategoryEntry[];
  summary?: { nights: number; available_count: number };
}

export interface BookingRecord {
  booking_code: string;
  check_in_date: string;
  check_out_date: string;
  guest_name?: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  number_of_guests?: number;
  total_amount?: number;
  special_requests?: string | null;
  status?: string;
}

export interface BookingResponse {
  booking?: BookingRecord;
}

export type Selections = Record<string, number>;
