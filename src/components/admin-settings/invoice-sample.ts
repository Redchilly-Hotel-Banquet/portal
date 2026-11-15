import type { BillingSummary } from "@/components/admin-bookings/types";
import type { DocumentTypeConfig } from "@/lib/document-types";

type Issuer = { legal_name: string; gstin: string; address: string; phone: string; email: string; terms: string };

const svg = (body: string, w: number, h: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;

/** A stand-in photo of an ID card side, so the preview shows how much room photos take. */
const idPhoto = (title: string, side: string) =>
  svg(`<rect width="640" height="400" rx="24" fill="#eef1f5" stroke="#9aa5b1" stroke-width="6"/><rect x="40" y="60" width="150" height="190" rx="10" fill="#cfd6df"/><rect x="230" y="70" width="330" height="26" rx="6" fill="#cfd6df"/><rect x="230" y="120" width="260" height="22" rx="6" fill="#dde2e9"/><rect x="230" y="165" width="300" height="22" rx="6" fill="#dde2e9"/><rect x="40" y="290" width="520" height="22" rx="6" fill="#dde2e9"/><text x="40" y="360" font-family="sans-serif" font-size="30" fill="#5b6673">${title} - ${side}</text>`, 640, 400);

const signature = svg(`<path d="M10 70 C 40 10, 70 110, 100 50 S 160 20, 190 60 S 250 100, 290 40" fill="none" stroke="#222" stroke-width="4" stroke-linecap="round"/>`, 300, 110);

const NAMES = ["Asha Verma", "Rohan Mehta", "Priya Nair", "Vikram Singh", "Neha Kapoor", "Arjun Rao", "Meera Iyer", "Sanjay Gupta", "Kavya Reddy", "Imran Khan", "Divya Joshi", "Rahul Bose"];

/** A believable checked-out stay for the preview, with the number of guests the administrator chooses. */
export function sampleSummary(guestCount: number, types: DocumentTypeConfig[], issuer: Issuer, documentFor: string[] = []): BillingSummary {
  const count = Math.max(1, Math.min(12, Math.round(guestCount)));
  const day = 86400000;
  const out = new Date();
  const start = new Date(out.getTime() - 2 * day);
  const guests = Array.from({ length: count }, (_, index) => {
    const type = types.find((t) => t.value === documentFor[index]) ?? types[index % Math.max(types.length, 1)] ?? { value: "Aadhar Card", label: "Aadhaar card", placeholder: "", photos: ["Front", "Back"] };
    const images = type.photos.map((side) => ({ data_url: idPhoto(type.label, side) }));
    return {
      full_name: NAMES[index % NAMES.length],
      age: 30 + index,
      nationality: "Indian",
      permanent_address: "12 MG Road, Lucknow, Uttar Pradesh 226001",
      phone: "+919876543210",
      document_type: type.value,
      document_number: type.value === "Passport" ? "N1234567" : "123412341234",
      document_image: images[0],
      document_images: images,
      signature_image: { data_url: signature },
    };
  });
  const roomLines = [{ code: "101", type: "Standard", room_type: "Standard", room_id: "r1", assigned_at: start.toISOString(), effective_rate_per_night: 2400, total: 4800 }];
  const orders = [
    { id: "6a0000000000000000000001", created_at: start.toISOString(), status: "DELIVERED", total: 640, items: [{ name: "Paneer Butter Masala", quantity: 1, price: 320, notes: null }, { name: "Butter Naan", quantity: 4, price: 80, notes: null }] },
  ];
  return {
    booking: {
      id: "sample",
      guest_name: guests[0].full_name,
      guest_phone: "+919876543210",
      guest_email: "guest@example.com",
      booking_code: "RC-SAMPLE",
      status: "CHECKED_OUT",
      outlet_id: "sample",
      outlets: { name: issuer.legal_name || "Branch" },
      check_in_date: start.toISOString(),
      check_out_date: out.toISOString(),
      nights: 2,
      number_of_guests: count,
      rooms_requested: 1,
      preferred_room_type: "Standard",
      special_requests: "Late check-out if possible.",
      total_amount: 4800,
      room_total: 4800,
      created_at: new Date(start.getTime() - 3 * day).toISOString(),
      checked_in_at: start.toISOString(),
      checked_out_at: out.toISOString(),
      rooms_allocated: roomLines,
      checkin_details: { status: "COMPLETED", needs_special_assistance: false, other_requests: "", arriving_from: "Delhi", reason_for_stay: "Leisure", guests, assigned_rooms: [{ id: "r1", code: "101", type: "Standard", room_type: "Standard" }] },
      payments: [{ mode: "UPI", amount: 5984 }],
    },
    foodTotal: 640,
    roomTotal: 4800,
    subtotal: 5440,
    gst: {
      lines: [
        { kind: "ROOM", description: "Room charges", rate: 12, taxable: 4800, cgst: 288, sgst: 288 },
        { kind: "FOOD", description: "Food and beverages", rate: 5, taxable: 640, cgst: 16, sgst: 16 },
      ],
      taxable: 5440,
      cgst: 304,
      sgst: 304,
      gst: 608,
      roundOff: -0.0,
      total: 6048,
    },
    grandTotal: 6048,
    orders,
    invoice: issuer,
  } as unknown as BillingSummary;
}
