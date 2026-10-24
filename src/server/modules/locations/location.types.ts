export type LocationType = "ROOM" | "TABLE" | "HOTEL_ROOM" | "room" | "table";

export type ValidateLocationRequest = {
  code?: string;
  type?: LocationType;
  outletId?: string;
};

export type OutletSummary = {
  id: string;
  name?: string | null;
  location_key?: string | null;
};

export type LocationSummary = {
  id: string;
  code?: string;
  type?: string;
  outlet_id?: string;
};

export type BookingSummary = {
  id: string;
  guest_name?: string;
  status?: string;
  check_in_date?: Date | string;
  check_out_date?: Date | string;
  booking_code?: string;
  room_total?: number;
  rooms_allocated?: unknown[];
};

export type ValidateLocationResponse =
  | { outlet: OutletSummary[] }
  | {
      valid: boolean;
      location?: LocationSummary | null;
      outlet?: OutletSummary | null;
      booking?: BookingSummary | null;
      message?: string;
    };
