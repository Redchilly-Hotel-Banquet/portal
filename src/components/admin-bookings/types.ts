export type BookingStatus = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";

export const BOOKING_STATUSES: ReadonlyArray<{ value: BookingStatus; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "CHECKED_IN", label: "Checked in" },
  { value: "CHECKED_OUT", label: "Checked out" },
  { value: "CANCELLED", label: "Cancelled" },
];

export type AllocatedRoom = {
  id?: string;
  room_id?: string | null;
  code?: string | null;
  type?: string | null;
  room_type?: string | null;
  base_rate?: number;
  effective_rate?: number;
  effective_rate_per_night?: number;
  total?: number;
  perNight?: unknown[];
  assigned_at?: string | null;
};

export type Booking = {
  id: string;
  booking_code?: string;
  status: string;
  outlet_id?: string;
  outlets?: { name?: string; location_key?: string } | null;
  rooms_tables?: { code?: string } | null;
  guest_name?: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  /** 6-digit ID guests use to order food to their room. Staff only. */
  checkin_id?: string;
  /** How the guest paid at check-out. */
  payments?: Array<{ mode: string; amount: number; reference?: string | null }>;
  paid_at?: string;
  number_of_guests?: number;
  rooms_requested?: number;
  room_id?: string | null;
  room_ids?: string[];
  preferred_room_type?: string | null;
  preferred_categories?: Record<string, number> | null;
  special_requests?: string | null;
  check_in_date?: string;
  check_out_date?: string;
  nights?: number;
  total_amount?: number;
  room_total?: number;
  rooms_allocated?: AllocatedRoom[];
  created_at?: string;
  updated_at?: string;
  checked_in_at?: string;
  checked_out_at?: string;
  checkin_details?: CheckinDetails | null;
};

/** Per-branch Wi-Fi and welcome text, keyed by location key, for the messages sent to guests. */
export type WifiFloor = { floor: string; wifi_name: string; wifi_password: string };
export type WelcomeInfo = {
  name: string;
  wifi_name: string;
  wifi_password: string;
  /** Wi-Fi by floor; a room's Floor picks the entry. The two fields above are the fallback. */
  wifi_floors?: WifiFloor[];
  welcome_message: string;
};

export type BookingsResponse = { bookings: Booking[]; welcome?: Record<string, WelcomeInfo>; /** Floor of each room, by room id. */ room_levels?: Record<string, string> };
export type BookingResponse = { booking: Booking };

export type OutletOption = { id?: string; location_key: string; name?: string };

export type BillingOrderItem = { name: string; quantity: number; price: number; notes?: string | null };

export type BillingOrder = {
  id: string;
  status?: string;
  total?: number;
  subtotal?: number;
  created_at?: string;
  items?: BillingOrderItem[];
};

export type GstLine = {
  kind: "ROOM" | "FOOD";
  description: string;
  taxable: number;
  /** Total GST rate in percent; CGST and SGST are each half. */
  rate: number;
  cgst: number;
  sgst: number;
  tariff: number;
};

export type GstSummary = {
  lines: GstLine[];
  taxable: number;
  cgst: number;
  sgst: number;
  gst: number;
  roundOff: number;
  total: number;
};

export type BillingSummary = {
  booking: Booking;
  foodTotal: number;
  roomTotal: number;
  /** Room plus food before GST. */
  subtotal: number;
  gst: GstSummary;
  /** Total payable: GST included and rounded to the rupee. */
  grandTotal: number;
  orders: BillingOrder[];
};

export type DocumentImage = { data_url: string; file_name?: string; mime_type?: string };

export type CheckinGuest = {
  full_name: string;
  phone?: string | null;
  document_type: string;
  document_number: string;
  document_image?: DocumentImage | null;
  signature_image?: DocumentImage | null;
};

export type AssignedRoom = {
  id: string;
  code?: string | null;
  type?: string | null;
  room_type?: string | null;
  assigned_at?: string | null;
};

export type CheckinDetails = {
  status?: string;
  expected_arrival_time?: string | null;
  needs_special_assistance?: boolean;
  special_assistance_details?: string | null;
  other_requests?: string | null;
  guests?: CheckinGuest[];
  signature?: DocumentImage | null;
  assigned_room?: AssignedRoom | null;
  assigned_rooms?: AssignedRoom[];
};

export type AvailableRoom = {
  id: string;
  code: string;
  type?: string;
  room_type?: string;
  occupancy?: number;
  price_per_night?: number;
  level?: string;
  isAssignedToBooking: boolean;
  isOccupiedByAnother: boolean;
};

export type CheckinContext = {
  booking: Booking;
  checkinDetails: CheckinDetails | null;
  availableRooms: AvailableRoom[];
};

export type CreateBookingForm = {
  outlet_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in_date: string;
  check_out_date: string;
  guests: string;
  rooms_requested: string;
  preferred_room_type: string;
  special_requests: string;
  total_amount: string;
};
