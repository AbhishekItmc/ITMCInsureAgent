import { useNav } from '../../lib/nav';
import { daysBetween, fmtDate, todayISO } from '../../lib/format';
import { useDemo } from '../../store/store';
import { Empty, PageHeader, Pill, cx } from '../../ui/primitives';
import { RenewalWorkbench } from '../shared/RenewalWorkbench';
import { ViewingAs } from './common';

export function RenewalPage() {
  const s = useDemo();
  const { viewer, route, go } = useNav();
  const policies = s.policies.filter((p) => p.customerId === viewer);
  const selected = policies.find((p) => p.id === route.params?.policyId) ?? [...policies].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
  const customer = s.customers.find((c) => c.id === viewer);
  return (
    <div>
      <PageHeader eyebrow="Step 7 · Renewal" title="Renew my policy" description="The Renewal Agent prepares an illustrative estimate and a draft for you to review. Nothing is sent and no payment is taken." actions={<ViewingAs />} />
      {!selected ? <Empty>No policies to renew for this customer.</Empty> : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {policies.map((p) => {
              const d = daysBetween(todayISO(), p.expiryDate);
              return (
                <button key={p.id} onClick={() => go('portal', 'renewal', { policyId: p.id })} className={cx('rounded-lg border px-4 py-2.5 text-left', p.id === selected.id ? 'border-teal bg-tealsoft/50' : 'border-line bg-surface hover:border-teal/50')}>
                  <div className="font-mono text-[13px] font-semibold">{p.id}</div>
                  <div className="text-[12px] text-muted">Expires {fmtDate(p.expiryDate)} {d <= 60 && <Pill tone="warn" dot={false} className="ml-1">{d} days</Pill>}</div>
                </button>
              );
            })}
          </div>
          <RenewalWorkbench policyId={selected.id} actor={customer?.name ?? 'Customer'} />
        </>
      )}
    </div>
  );
}
