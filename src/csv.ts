import type { Player } from './fpl';
import type { Pick } from './state';

const cell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per pick, in draft order — easy to re-import into a spreadsheet. */
export function picksToCsv(
  managers: string[],
  picks: Pick[],
  playersById: Map<number, Player>
): string {
  const header = [
    'Overall',
    'Round',
    'Manager',
    'Position',
    'Player',
    'Team',
    'Price',
    'TotalPoints',
  ];
  const rows: string[][] = [header];
  const ordered = [...picks].sort((a, b) => a.overall - b.overall);
  for (const pk of ordered) {
    const p = playersById.get(pk.playerId);
    if (!p) continue;
    rows.push([
      String(pk.overall + 1),
      String(pk.round + 1),
      managers[pk.managerIndex],
      p.position,
      p.fullName,
      p.teamShort,
      p.price.toFixed(1),
      String(p.totalPoints),
    ]);
  }
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
