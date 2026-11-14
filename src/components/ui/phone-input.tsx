"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COUNTRIES, DEFAULT_COUNTRY, countryForDigits, flagOf, type Country } from "@/lib/countries";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  name?: string;
  /** "+919876543210" (dial code and number). Numbers saved in the old style (10 digits) are shown as Indian. */
  value: string;
  /** Called with "+<dial code><number>", or "" when the number is empty. */
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  autoComplete?: string;
  className?: string;
};

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** The country a stored value belongs to: its dial code when it has one, otherwise India. */
const countryOf = (value: string, fallback: Country): Country => {
  if (value.startsWith("+")) return countryForDigits(digitsOf(value)) ?? fallback;
  return fallback;
};

/** The part of the value after the dial code. */
const nationalOf = (value: string, country: Country): string => {
  let digits = digitsOf(value);
  if (value.startsWith("+")) return digits.startsWith(country.dial) ? digits.slice(country.dial.length) : digits;
  if (country.dial === "91" && digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits.startsWith("0") ? digits.slice(1) : digits;
};

const group = (national: string) => (national.length > 5 ? `${national.slice(0, 5)} ${national.slice(5)}` : national);

/**
 * A phone number field with a country picker (flag, name and dial code) beside it. The value it reports always
 * carries the dial code, so numbers are stored as "+<dial code><number>".
 */
export function PhoneInput({ id, name, value, onChange, placeholder, required, disabled, invalid, autoComplete = "tel-national", className }: Props) {
  const [country, setCountry] = useState<Country>(() => countryOf(value, DEFAULT_COUNTRY));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // A value that arrives with another dial code (a saved profile loading, say) moves the picker with it.
  useEffect(() => {
    if (!value.startsWith("+")) return;
    const found = countryForDigits(digitsOf(value));
    if (found && found.dial !== country.dial) setCountry(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const national = nationalOf(value, country);
  const emit = (c: Country, digits: string) => onChange(digits ? `+${c.dial}${digits}` : "");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, "");
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.iso.toLowerCase() === q || c.dial.startsWith(q));
  }, [query]);

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Country code: ${country.name} +${country.dial}`}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-base leading-none" aria-hidden>{flagOf(country.iso)}</span>
            <span className="tabular-nums">+{country.dial}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search country or code" aria-label="Search country" className="mb-2 h-9" />
          <ul className="max-h-64 overflow-y-auto" role="listbox" aria-label="Countries">
            {list.length === 0 ? <li className="px-2 py-3 text-sm text-muted-foreground">No country found.</li> : null}
            {list.map((c) => (
              <li key={`${c.iso}-${c.dial}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.iso === country.iso}
                  onClick={() => { setCountry(c); emit(c, national); setOpen(false); setQuery(""); }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                >
                  <span className="text-base leading-none" aria-hidden>{flagOf(c.iso)}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">+{c.dial}</span>
                  {c.iso === country.iso ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        aria-invalid={invalid}
        placeholder={placeholder ?? (country.dial === "91" ? "98765 43210" : "Phone number")}
        value={group(national)}
        onChange={(e) => emit(country, digitsOf(e.target.value).slice(0, 14))}
        className="min-w-0 flex-1"
      />
    </div>
  );
}
