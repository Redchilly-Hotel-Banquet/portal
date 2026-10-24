import type { Metadata } from "next";
import { RoomsManager } from "@/components/admin-rooms/rooms-manager";

export const metadata: Metadata = { title: "Rooms and tables" };

export default function AdminRoomsPage() {
  return <RoomsManager />;
}
