"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/apiClient";
import type { Profile, SavedDetails } from "@/hooks/useAccount";

export type MyBooking = {
  id: string;
  bookingCode: string;
  status: string;
  outlet: string;
  checkInDate: string | null;
  checkOutDate: string | null;
  nights: number;
  guests: number;
  rooms: number;
  totalAmount: number;
  canCheckin: boolean;
  checkinSubmitted: boolean;
  checkinLocked: boolean;
  roomCodes: string[];
};

export const profileKeys = {
  profile: ["me", "profile"] as const,
  details: ["me", "details"] as const,
  bookings: ["me", "bookings"] as const,
};

export const useMyProfile = (enabled: boolean) =>
  useQuery({
    queryKey: profileKeys.profile,
    queryFn: () => apiGet<{ profile: Profile }>("/me", "user").then((res) => res.profile),
    enabled,
  });

export const useSavedDetails = (enabled: boolean) =>
  useQuery({
    queryKey: profileKeys.details,
    queryFn: () => apiGet<{ details: SavedDetails }>("/me/details", "user").then((res) => res.details),
    enabled,
    staleTime: 60_000,
  });

export const useMyBookings = (enabled: boolean) =>
  useQuery({
    queryKey: profileKeys.bookings,
    queryFn: () => apiGet<{ upcoming: MyBooking[]; past: MyBooking[] }>("/me/bookings", "user"),
    enabled,
  });
