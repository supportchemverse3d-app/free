/**
 * Per-element data used by the structure generator, polarity logic and viewer.
 * All values below were entered manually from general knowledge of the cited tables and must be
 * re-verified against the sources before records built from them are marked "reviewed".
 */

/** Valence electrons of the neutral main-group atom. */
export const VALENCE_ELECTRONS: Readonly<Record<string, number>> = {
  H: 1, Be: 2, B: 3, Al: 3, C: 4, N: 5, O: 6, F: 7, Si: 4, P: 5, S: 6, Cl: 7, Br: 7, I: 7, Xe: 8,
};

/** Single-bond covalent radii in ångström. Source: Cordero et al., Dalton Trans. 2008, 2832. */
export const COVALENT_RADIUS: Readonly<Record<string, number>> = {
  H: 0.31, Be: 0.96, B: 0.84, Al: 1.21, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Br: 1.2, I: 1.39, Xe: 1.4,
};

/** Van der Waals radii in ångström. Sources: Bondi (1964); Mantina et al. (2009) for B and Be. */
export const VDW_RADIUS: Readonly<Record<string, number>> = {
  H: 1.2, Be: 1.53, B: 1.92, Al: 1.84, C: 1.7, N: 1.55, O: 1.52, F: 1.47, Si: 2.1, P: 1.8, S: 1.8, Cl: 1.75, Br: 1.85, I: 1.98, Xe: 2.16,
};

/** Approximate bond-length scaling relative to the single-bond radius sum. */
export const BOND_ORDER_LENGTH_FACTOR: Readonly<Record<1 | 2 | 3, number>> = { 1: 1, 2: 0.88, 3: 0.79 };

export const COVALENT_RADIUS_SOURCE = 'Cordero et al., Dalton Trans. 2008, 2832 (single-bond covalent radii; order scaling is an approximation)';

/**
 * CPK-style display colours (a rendering convention, not scientific data).
 * Unlisted elements use FALLBACK_COLOR.
 */
export const CPK_COLOR: Readonly<Record<string, string>> = {
  H: '#F2F6FA', C: '#59627A', N: '#4A78FF', O: '#F2453D', F: '#8EE0A0', Cl: '#34C759', Br: '#A5322D', I: '#8A3FD1',
  S: '#F5D63D', P: '#FF9A2E', B: '#F2A8A0', Be: '#7FC96B', Al: '#B7B7C4', Si: '#C9A97E', Xe: '#5BCBE0',
  Li: '#CC80FF', Na: '#AB5CF2', K: '#8F40D4', Cs: '#6B2FA0', Mg: '#8AFF00', Ca: '#3DFF00', Zn: '#7D80B0', Fe: '#E06633', Cu: '#C88033', Ag: '#C0C0C0', Au: '#FFD123',
};
export const FALLBACK_COLOR = '#FF69B4';
export const FALLBACK_VDW_RADIUS = 1.7;
