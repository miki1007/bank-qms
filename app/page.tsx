import {
  ArrowUpRight,
  Building2,
  LayoutDashboard,
  MonitorUp,
  Smartphone,
  Sparkles,
  Store,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

const products = [
  {
    href: "/customer-app",
    icon: Smartphone,
    eyebrow: "Android customer app",
    title: "Bank QMS Customer",
    description:
      "Join the queue, track your position and keep your private ticket on your phone.",
    accent: "mint",
  },
  {
    href: "/staff-app",
    icon: UsersRound,
    eyebrow: "Android staff app",
    title: "Bank QMS Staff",
    description:
      "Fast teller operations in a secure, role-aware mobile workspace.",
    accent: "blue",
  },
  {
    href: "/display",
    icon: MonitorUp,
    eyebrow: "TV and monitor",
    title: "Public Display",
    description:
      "A privacy-safe, full-screen now-serving display with live calls and sound.",
    accent: "violet",
  },
  {
    href: "/manager",
    icon: LayoutDashboard,
    eyebrow: "Desktop operations",
    title: "Manager Dashboard",
    description:
      "Live KPIs, queue control, fairness settings, reports and audit visibility.",
    accent: "green",
  },
];

export default function Home() {
  return (
    <main className="product-hub">
      <header className="hub-header">
        <Link className="hub-brand" href="/">
          <span>
            <Building2 />
          </span>
          <strong>Bank QMS</strong>
        </Link>
        <span className="hub-badge">
          <i /> Connected system
        </span>
      </header>
      <section className="hub-hero">
        <div className="hub-copy">
          <span className="hub-kicker">
            <Sparkles /> One queue. Every screen.
          </span>
          <h1>
            A complete branch experience, <em>perfectly connected.</em>
          </h1>
          <p>
            Two Android apps and two focused web screens. Every surface reads
            and updates the same authoritative queue in real time.
          </p>
        </div>
        <div className="hub-visual" aria-hidden="true">
          <span className="hub-core">
            <Building2 />
          </span>
          <i />
          <i />
          <i />
          <i />
          <b>Live</b>
        </div>
      </section>
      <section className="hub-grid" aria-label="Bank QMS interfaces">
        {products.map((product, index) => {
          const Icon = product.icon;
          return (
            <a
              className={`hub-card hub-${product.accent}`}
              href={product.href}
              key={product.href}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span className="hub-card-icon">
                <Icon />
              </span>
              <span className="hub-card-copy">
                <small>{product.eyebrow}</small>
                <strong>{product.title}</strong>
                <p>{product.description}</p>
              </span>
              <span className="hub-open">
                Open <ArrowUpRight />
              </span>
            </a>
          );
        })}
      </section>
      <aside className="hub-kiosk-note">
        <span className="hub-card-icon">
          <Store />
        </span>
        <span>
          <small>Optional branch fallback</small>
          <strong>Customer Kiosk</strong>
          <p>
            Keep a shared touch screen for visitors without a smartphone,
            connectivity or battery.
          </p>
        </span>
        <a href="/kiosk">
          Open kiosk <ArrowUpRight />
        </a>
      </aside>
      <footer className="hub-footer">
        <span>
          <i /> Database authoritative
        </span>
        <span>
          <i /> Role protected
        </span>
        <span>
          <i /> Privacy-safe display
        </span>
      </footer>
    </main>
  );
}
