import { Section } from "@/components/site/section";

const STEPS = [
  { title: "Reserve", text: "Choose your dates and a room. You receive a booking code." },
  { title: "Check in", text: "Complete guest details online before arrival, or at the front desk." },
  { title: "Order", text: "Scan the QR code at your table or in your room and place an order." },
  { title: "Track", text: "Follow preparation and delivery status from your phone." },
] as const;

export function HowItWorks() {
  return (
    <Section eyebrow="Your visit" title="From booking to table" className="border-t border-border">
      <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="border-t border-border pt-4">
            <span className="font-display text-sm tabular-nums text-brass">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-2 text-lg">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
