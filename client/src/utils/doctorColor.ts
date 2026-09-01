// Shared per-doctor accent color — deterministic from the doctor's user ID, so the
// same doctor gets the same accent color everywhere (listing cards, profile page).
// Previously ChooseProfessionalPage and DoctorProfilePage each hashed the ID with
// the same algorithm but different 4-color palettes, so the same doctor could show
// up purple on one page and green on another.
// Richer, more distinct jewel-tones (was 6 washed-out pastels that collided often
// and read a bit flat) — still cohesive with the brand's teal, but with enough hue
// spread that neighboring doctors in a list are visibly different colors.
const DOCTOR_ACCENT_COLORS = [
  '#0097B2', // brand teal
  '#7C5CBF', // violet
  '#2F9E8F', // emerald teal
  '#D97757', // terracotta
  '#4C7EAF', // slate blue
  '#C4941C', // amber gold
  '#B15A8C', // mauve
  '#5B8C5A', // forest green
];

export const getDoctorAccentColor = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % DOCTOR_ACCENT_COLORS.length;
  return DOCTOR_ACCENT_COLORS[index];
};
