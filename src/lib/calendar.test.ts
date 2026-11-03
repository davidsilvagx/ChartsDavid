import { describe, expect, it } from 'vitest';
import { formatDateBR, formatDateTimeBR, makeWeeks, parseDateBR } from './calendar';
import { defaults } from './types';

describe('Datas brasileiras sem alterar os limites das semanas', () => {
  it('exibe os dois anos corretos na virada de ano', () => {
    const weeks = makeWeeks({...defaults, startDate:'2025-12-26'}, Date.parse('2026-01-03T12:00Z'));
    expect(weeks[0].label).toBe('26/12/25 — 01/01/26');
    expect(weeks[0].id).toBe('2025-12-26');
  });
  it('formata e interpreta a data sem inversão entre dia e mês', () => {
    expect(formatDateBR('2016-06-24')).toBe('24/06/16');
    expect(parseDateBR('24/06/16')).toBe('2016-06-24');
    expect(parseDateBR('29/02/2024')).toBe('2024-02-29');
    expect(()=>parseDateBR('31/02/24')).toThrow();
    expect(()=>parseDateBR('06-24-2016')).toThrow('dd/mm/aa');
  });
  it('usa relógio de 24 horas, meia-noite 00 e o fuso escolhido', () => {
    const midnight = Date.parse('2026-11-03T00:05:00Z');
    expect(formatDateTimeBR(midnight,'UTC')).toBe('03/11/26 00:05');
    expect(formatDateTimeBR(midnight,'America/Sao_Paulo')).toBe('02/11/26 21:05');
  });
});
