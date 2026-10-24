import type { Metadata } from "next";
import { BookingsConsole } from "@/components/admin-bookings/bookings-console";

export const metadata: Metadata = { title: "Reservations" };

export default function AdminBookingsPage() {
  return <BookingsConsole />;
}
