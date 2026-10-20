import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { troopStats } from '@/domain/stat-sheet';
import { StatLines } from './StatLines';

const markup = (role: Parameters<typeof troopStats>[0]) =>
  renderToStaticMarkup(<StatLines rows={troopStats(role, 1, null)} />);

describe('StatLines', () => {
  it('names each statistic and ruler-marks a scaled value', () => {
    const html = markup('infantry');
    expect(html).toContain('data-stat="pace"');
    expect(html).toContain('allure');
    expect(html).toContain('toutes les pièces');
    expect(html).toContain('data-stat="detection"');
    expect(html).toContain('60 km');
  });

  it('writes a value without a scale in words, with no ruler', () => {
    const html = markup('infantry');
    expect(html).toContain('marche');
    expect(html).toContain('au contact · 25 km');
    const reach = html.split('data-stat="reach"')[1]!.split('data-stat=')[0]!;
    expect(reach).not.toContain('bg-[var(--arc-mine)]');
  });

  it('says a transport does not fire', () => {
    expect(markup('landTransport')).toContain('ne tire pas');
  });

  it('prints the dead zone and the reach of a gun', () => {
    expect(markup('artillery')).toContain('30–150 km');
  });

  it('groups under rubrics', () => {
    expect(markup('infantry')).toContain('mouvement');
  });
});
