/** All 118 element symbols (IUPAC). Used to validate parsed formulas. */
export const ELEMENT_SYMBOLS: ReadonlySet<string> = new Set(
  (
    'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
    'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
    'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
    'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'
  ).split(' '),
);

/**
 * Atomic weights (g/mol) for all 118 elements, as conventionally printed in school periodic tables
 * (IUPAC abridged standard atomic weights, 4-5 significant figures). Entered manually; re-verify against
 * the current IUPAC table before an official release.
 *
 * Elements that have no stable isotope and no standard atomic weight (see MASS_NUMBER_ONLY) are given
 * the mass number of their longest-lived or best-known isotope, which is how periodic tables print them.
 */
export const STANDARD_ATOMIC_WEIGHT: Readonly<Record<string, number>> = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180,
  Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948,
  K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693,
  Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798,
  Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95, Tc: 98, Ru: 101.07, Rh: 102.91, Pd: 106.42,
  Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71, Sb: 121.76, Te: 127.60, I: 126.90, Xe: 131.29,
  Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24, Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25,
  Tb: 158.93, Dy: 162.50, Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05, Lu: 174.97,
  Hf: 178.49, Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59,
  Tl: 204.38, Pb: 207.2, Bi: 208.98, Po: 209, At: 210, Rn: 222,
  Fr: 223, Ra: 226, Ac: 227, Th: 232.04, Pa: 231.04, U: 238.03, Np: 237, Pu: 244, Am: 243, Cm: 247, Bk: 247, Cf: 251,
  Es: 252, Fm: 257, Md: 258, No: 259, Lr: 266, Rf: 267, Db: 268, Sg: 269, Bh: 270, Hs: 277,
  Mt: 278, Ds: 281, Rg: 282, Cn: 285, Nh: 286, Fl: 289, Mc: 290, Lv: 293, Ts: 294, Og: 294,
};

/**
 * Elements whose value above is the mass number of the longest-lived/best-known isotope, not a measured
 * standard atomic weight (no stable isotopes, or no standard value). Calculators note this when they are used.
 */
export const MASS_NUMBER_ONLY: ReadonlySet<string> = new Set(
  'Tc Pm Po At Rn Fr Ra Ac Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' '),
);

export const ATOMIC_WEIGHT_SOURCE = 'IUPAC abridged standard atomic weights (manually entered; verify before release)';

/**
 * Pauling electronegativity for selected elements. Entered manually; verify before release.
 */
export const PAULING_ELECTRONEGATIVITY: Readonly<Record<string, number>> = {
  H: 2.2, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Na: 0.93, Mg: 1.31,
  Al: 1.61, Si: 1.9, P: 2.19, S: 2.58, Cl: 3.16, K: 0.82, Ca: 1.0, Br: 2.96, I: 2.66, Be: 1.57, Xe: 2.6,
};

/** English element names (IUPAC spellings), indexed by atomic number − 1. */
export const ELEMENT_NAMES =
  ('Hydrogen Helium Lithium Beryllium Boron Carbon Nitrogen Oxygen Fluorine Neon Sodium Magnesium Aluminium Silicon Phosphorus Sulfur Chlorine Argon ' +
  'Potassium Calcium Scandium Titanium Vanadium Chromium Manganese Iron Cobalt Nickel Copper Zinc Gallium Germanium Arsenic Selenium Bromine Krypton ' +
  'Rubidium Strontium Yttrium Zirconium Niobium Molybdenum Technetium Ruthenium Rhodium Palladium Silver Cadmium Indium Tin Antimony Tellurium Iodine Xenon ' +
  'Caesium Barium Lanthanum Cerium Praseodymium Neodymium Promethium Samarium Europium Gadolinium Terbium Dysprosium Holmium Erbium Thulium Ytterbium Lutetium ' +
  'Hafnium Tantalum Tungsten Rhenium Osmium Iridium Platinum Gold Mercury Thallium Lead Bismuth Polonium Astatine Radon ' +
  'Francium Radium Actinium Thorium Protactinium Uranium Neptunium Plutonium Americium Curium Berkelium Californium Einsteinium Fermium Mendelevium Nobelium Lawrencium ' +
  'Rutherfordium Dubnium Seaborgium Bohrium Hassium Meitnerium Darmstadtium Roentgenium Copernicium Nihonium Flerovium Moscovium Livermorium Tennessine Oganesson').split(' ');

export const SYMBOL_TO_NAME: Readonly<Record<string, string>> = Object.fromEntries([...ELEMENT_SYMBOLS].map((s, i) => [s, ELEMENT_NAMES[i]!]));
