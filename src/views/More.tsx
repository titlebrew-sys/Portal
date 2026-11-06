import { Head, Icon } from '../components';

/** Phone menu: every page, since the bottom bar has room for only five. */
export function More({ views }: { views: readonly { id: string; label: string; icon: string }[] }) {
  return (
    <>
      <Head eyebrow="Menu" title="All pages" />
      <div className="panel">
        <div className="rows">
          {views.map((v) => (
            <a key={v.id} className="r" href={'#' + v.id} style={{ color: 'inherit', textDecoration: 'none' }}>
              <Icon name={v.icon} />
              <div className="t"><b>{v.label}</b></div>
              <span style={{ color: 'var(--muted)' }}>›</span>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
