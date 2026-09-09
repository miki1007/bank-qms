import {
  ArrowUpRight,
  LayoutDashboard,
  MapPin,
  MonitorUp,
  Settings,
  Smartphone,
  Store,
  UsersRound,
} from "lucide-react";
import { BankLogo } from "./bank-logo";
import { BANK_BRANCHES, BANK_NAME } from "@/lib/bank-brand";
import Link from "next/link";

const products = [
  {
    href: "/customer",
    icon: Smartphone,
    title: "Customer portal",
    description: "Reserve a ticket, confirm arrival and follow your place.",
    accent: "mint",
  },
  {
    href: "/staff/login?next=%2Fteller",
    icon: UsersRound,
    title: "Teller console",
    description: "Sign in to your assigned counter and call the next customer.",
    accent: "blue",
  },
  {
    href: "/staff/login?next=%2Fmanager",
    icon: LayoutDashboard,
    title: "Manager dashboard",
    description: "Monitor your branch, approve priority and review reports.",
    accent: "green",
  },
  {
    href: "/staff/login?next=%2Fadmin",
    icon: Settings,
    title: "Administration",
    description: "Manage staff assignments, services and branch security.",
    accent: "amber",
  },
  {
    href: "/display",
    icon: MonitorUp,
    title: "Public number display",
    description: "Open the full-screen ticket and counter monitor.",
    accent: "violet",
  },
];
export default function Home() {
  return (
    <main className="product-hub wl-hub">
      <header className="hub-header">
        <Link className="wl-brand" href="/">
          <BankLogo size={56} />
          <span>
            <strong>{BANK_NAME}</strong>
            <small>Queue management</small>
          </span>
        </Link>
        <span className="wl-demo-badge">Academic demonstration</span>
      </header>
      <section className="wl-hub-intro">
        <span className="wl-eyebrow">Welcome to WorldLink</span>
        <h1>
          Banking starts with
          <br />
          <em>a better wait.</em>
        </h1>
        <p>
          Choose your branch, save your place and let the queue come to you.
        </p>
        <Link className="wl-hub-cta" href="/customer">
          Reserve a ticket
          <ArrowUpRight />
        </Link>
      </section>
      <section className="hub-grid" aria-label="WorldLink Bank interfaces">
        {products.map((product, index) => {
          const Icon = product.icon;
          return (
            <Link
              className={`hub-card hub-${product.accent}`}
              href={product.href}
              key={product.href}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span className="hub-card-icon">
                <Icon />
              </span>
              <span className="hub-card-copy">
                <small>Web application</small>
                <strong>{product.title}</strong>
                <p>{product.description}</p>
              </span>
              <span className="hub-open">
                Open
                <ArrowUpRight />
              </span>
            </Link>
          );
        })}
      </section>
      <section className="wl-branch-directory">
        <div>
          <span className="wl-eyebrow">Addis Ababa</span>
          <h2>Find your branch</h2>
        </div>
        <div>
          {BANK_BRANCHES.map((branch) => (
            <Link key={branch.code} href={`/customer?branch=${branch.code}`}>
              <MapPin />
              {branch.name}
              <ArrowUpRight />
            </Link>
          ))}
        </div>
      </section>
      <aside className="hub-kiosk-note">
        <span className="hub-card-icon">
          <Store />
        </span>
        <span>
          <strong>Visiting without a smartphone?</strong>
          <p>Use the branch kiosk to get a walk-in ticket.</p>
        </span>
        <Link href="/kiosk">
          Open kiosk
          <ArrowUpRight />
        </Link>
      </aside>
      <footer className="wl-footer">
        WorldLink Bank · Academic demonstration. Account balances and activity
        are sample data; no real banking transactions are available.
        <Link href="/customer-app">Customer PWA</Link>
        <Link href="/staff-app">Staff companion</Link>
      </footer>
    </main>
  );
}
