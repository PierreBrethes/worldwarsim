// L'extglob de négation (`!(*.*.*)`) ne matche plus rien depuis le passage à Vite 8 : le
// moteur de glob a changé. La forme en tableau garde la même intention — un seul point
// d'extension, `.d.ts` et `.test.ts` exclus — via une exclusion explicite plutôt qu'un extglob.
export const modules = import.meta.glob(['./**/*.*s', '!./**/*.*.*s']);
