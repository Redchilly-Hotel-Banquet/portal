export const SITE = {
  name: "Red Chilly",
  descriptor: "Hotel, Restaurant & Banquet Hall",
  address: "Near LIC Office, Taramandal, Gorakhpur, Uttar Pradesh 273016",
  phoneDisplay: "+91 96701 00139",
  phoneTel: "+919670100139",
  email: "contact@redchilly.in",
  branches: [
    { name: "Red Chilly", mapUrl: "https://maps.app.goo.gl/2ANi6DCyhbmoGMVX6" },
    { name: "Red Chilly 2.0", mapUrl: "https://maps.app.goo.gl/jcZes6U59fq7ybmM7" },
    { name: "Red Chilly 3.0", mapUrl: "https://maps.app.goo.gl/ReesU1BgFHnC9TPLA" }
  ],
} as const;

export const NAV_LINKS = [
  { href: "/book-room", label: "Stay" },
  { href: "/menu", label: "Dine" },
  { href: "/banquet", label: "Banquet" },
  { href: "/check-in", label: "Check-in" },
  { href: "/contact-us", label: "Contact" },
] as const;
