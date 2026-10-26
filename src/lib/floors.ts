/** Most floors a branch can be set up with. */
export const MAX_FLOORS = 40;

/**
 * The floors a branch has, as the values stored on rooms and Wi-Fi settings: "Ground", then "1", "2" and so on up to
 * the branch's highest floor (set under Settings). `keep` adds values already in use, so a floor that was saved
 * before the branch was configured never disappears from a dropdown.
 */
export const floorOptions = (highestFloor: number | null | undefined, keep: Array<string | null | undefined> = []): string[] => {
  const top = Number.isInteger(highestFloor) ? Math.min(Math.max(Number(highestFloor), 0), MAX_FLOORS) : 0;
  const options = ["Ground", ...Array.from({ length: top }, (_, index) => String(index + 1))];
  const seen = new Set(options.map((value) => value.toLowerCase()));
  for (const value of keep) {
    const clean = String(value ?? "").trim();
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      options.push(clean);
    }
  }
  return options;
};

/** Whether a floor is one of the branch's floors (ignoring case). Always true when the branch has not set its floors. */
export const isKnownFloor = (highestFloor: number | null | undefined, floor: string): boolean => {
  if (!Number.isInteger(highestFloor)) return true;
  const clean = floor.trim().toLowerCase();
  return !clean || floorOptions(highestFloor).some((option) => option.toLowerCase() === clean);
};

export const floorLabel = (value: string): string => (/^\d+$/.test(value) ? `Floor ${value}` : value);
