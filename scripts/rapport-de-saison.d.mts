import type { SeasonReport } from '../src/domain/season-report';

export function renderReport(data: {
  code: string;
  launchedAt: number;
  now: number;
  players: Array<{ id: string; nation: string | null; nickname: string; irregular?: boolean }>;
  report: SeasonReport;
}): string;
