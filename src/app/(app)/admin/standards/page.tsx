import { requireAdmin } from "@/lib/auth";
import { DIVISION_STANDARDS, STATION_KEYS, STATION_LABELS } from "@/domain/races";
import { formatSec } from "@/lib/utils";
import { divisionLabel, genderLabel } from "@/domain/benchmarks";

export const dynamic = "force-dynamic";

/**
 * Admin-only viewer for the **Division Standard** reference times used by the
 * radar's "vs Division Standard" mode.
 *
 * By design these values are NOT stored in the database — they're constants
 * in `src/domain/races.ts` (the `DIVISION_STANDARDS` map). Treating them as
 * code lets the AI co-coach reason about them and lets us version the
 * standard set with the application. To change a number, edit the file and
 * redeploy; this page is the canonical view of "what is currently in use".
 */
export default async function StandardsAdminPage() {
  await requireAdmin();

  const groups = [
    { key: "open_male", gender: "male", division: "open" },
    { key: "open_female", gender: "female", division: "open" },
    { key: "pro_male", gender: "male", division: "pro" },
    { key: "pro_female", gender: "female", division: "pro" },
  ] as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Division Standards</h1>
        <div className="text-sm text-muted mt-1">
          Reference times used by the radar&apos;s <em>vs Division Standard</em> mode.
        </div>
      </header>

      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 mb-6 text-sm">
        <div className="font-semibold mb-1">How to edit these values</div>
        These numbers live in <code className="bg-amber-100 px-1 rounded">src/domain/races.ts</code> (the
        <code className="bg-amber-100 px-1 rounded">DIVISION_STANDARDS</code> map). They&apos;re intentionally not stored
        in the database — they&apos;re config-as-code so the AI co-coach can reason about them and they can be versioned
        with the app. Change a number in that file, save, and the radar updates everywhere it&apos;s used.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((g) => {
          const set = DIVISION_STANDARDS[g.key];
          return (
            <div key={g.key} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold">{divisionLabel(g.division)} · {genderLabel(g.gender)}</div>
                  <div className="text-xs text-muted">key: <code>{g.key}</code></div>
                </div>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <tbody className="divide-y divide-border">
                  {STATION_KEYS.map((k) => (
                    <tr key={k}>
                      <td className="py-1.5 text-muted">{STATION_LABELS[k]}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium">{formatSec(set[k])}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1.5 text-muted">Run pace (1 km)</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{formatSec(set.runSec)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-muted">Roxzone (total)</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{formatSec(set.roxzoneSec)}</td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-xs text-muted">
        Doubles &amp; Relay aren&apos;t listed — for now they fall back to the Open standard set in the radar.
        We can add them here when you have target reference times to use.
      </div>
    </div>
  );
}
