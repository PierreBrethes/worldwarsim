import { DRAWN_SHARE } from '@/domain/piece-size';

/**
 * **Au plus près, la troupe grandit avec le zoom** (ADR 0035 §10, #535) : d = 0,25, l'homme à
 * ≈ 40 px et le char à ≈ 135 px, bien au-delà du plancher qui les retenait à taille fixe. Une
 * seule source : le moteur et les tests la lisent ici, sans recopier le produit.
 */
export const CLOSEST_DISTANCE = DRAWN_SHARE;
