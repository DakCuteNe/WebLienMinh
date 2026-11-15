import { loadGolMatchFallback } from '../server/esports-match-gol-fallback.js';

const cases = [
  {
    label: 'KRX-NS-G1', startTime: '2026-08-20T10:00:00Z', number: 1,
    teams: [{ id: 'krx', code: 'KRX', name: 'KIWOOM DRX' }, { id: 'ns', code: 'NS', name: 'NONGSHIM RED FORCE' }],
    sides: [{ id: 'krx', side: 'blue' }, { id: 'ns', side: 'red' }]
  },
  {
    label: 'KRX-NS-G2', startTime: '2026-08-20T10:00:00Z', number: 2,
    teams: [{ id: 'krx', code: 'KRX', name: 'KIWOOM DRX' }, { id: 'ns', code: 'NS', name: 'NONGSHIM RED FORCE' }],
    sides: [{ id: 'krx', side: 'red' }, { id: 'ns', side: 'blue' }]
  },
  {
    label: 'T1-KT-G1', startTime: '2026-08-21T10:00:00Z', number: 1,
    teams: [{ id: 't1', code: 'T1', name: 'T1' }, { id: 'kt', code: 'KT', name: 'KT ROLSTER' }],
    sides: [{ id: 't1', side: 'blue' }, { id: 'kt', side: 'red' }]
  },
  {
    label: 'T1-KT-G2', startTime: '2026-08-21T10:00:00Z', number: 2,
    teams: [{ id: 't1', code: 'T1', name: 'T1' }, { id: 'kt', code: 'KT', name: 'KT ROLSTER' }],
    sides: [{ id: 't1', side: 'red' }, { id: 'kt', side: 'blue' }]
  },
  {
    label: 'T1-KT-G3', startTime: '2026-08-21T10:00:00Z', number: 3,
    teams: [{ id: 't1', code: 'T1', name: 'T1' }, { id: 'kt', code: 'KT', name: 'KT ROLSTER' }],
    sides: [{ id: 't1', side: 'blue' }, { id: 'kt', side: 'red' }]
  }
];

for (const item of cases) {
  const body = {
    ok: true,
    startTime: item.startTime,
    teams: item.teams,
    state: 'completed',
    viewGame: { id: item.label, number: item.number, state: 'completed', teams: item.sides }
  };
  const value = await loadGolMatchFallback(body);
  console.log(JSON.stringify({ label: item.label, value }, null, 2));
}
