const CLE = 'wws-jeton';

export const lireJeton = (): string | null => localStorage.getItem(CLE);
export const garderJeton = (jeton: string): void => localStorage.setItem(CLE, jeton);
export const oublierJeton = (): void => localStorage.removeItem(CLE);
