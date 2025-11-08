"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Sparkles,
  PlayCircle,
  Star,
  Users,
  Building2,
  CalendarDays,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Landing page for magnifi.space
// Design goals: sexy, clean, minimalist, story-driven. AWWWARDS-level feel.
// No jargon. Clear promise. Smooth motion. Strong typography.

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <Decorations />
      <NavBar />
      <Hero />
      <StoryBlocks />
      <AudienceSection />
      <FeatureGallery />
      <Pillars />
      <SocialProof />
      <FinalCTA />
      <Footer />
    </main>
  );
}

function NavBar() {
  const { user } = useAuth();
  return (
    <div className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="group inline-flex items-center gap-2">
          <Image
            src="/magnifi-m.png"
            alt="Magnifi"
            width={28}
            height={28}
            className="rounded-sm"
            priority
          />
          <span className="spacegrot text-sm tracking-wide group-hover:opacity-80 transition-opacity">
            Magnifi
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 transition inline-flex items-center gap-2"
            >
              Welcome, {user.displayName || user.firstName}{" "}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border px-4 py-2 text-sm hover:bg-foreground hover:text-background transition"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 transition inline-flex items-center gap-1"
              >
                Try Magnifi <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-10 md:pt-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-3xl text-center"
      >
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Work that feels effortless
        </div>
        <h1 className="spacegrot text-balance text-5xl leading-tight md:text-7xl">
          Your Team, Totally in sync.
        </h1>
        <p className="proximavara mt-5 text-pretty text-base text-muted-foreground md:text-lg">
          Magnifi brings goals, tasks, people and progress into one calm place.
          No chaos. No juggling tools. Just momentum.
        </p>
        <div className="proximavara mt-9 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-full bg-foreground px-5 py-3 text-sm text-background hover:opacity-90 transition inline-flex items-center gap-2"
          >
            Get started free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="#features"
            className="proximavara rounded-full border px-5 py-3 text-sm hover:bg-foreground hover:text-background transition inline-flex items-center gap-2"
          >
            See how it works <PlayCircle className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="mx-auto mt-14 md:mt-16"
      >
        <div className="mx-auto max-w-[1280px] overflow-hidden rounded-2xl border bg-card/40 shadow-sm">
          <Image
            src="/landing-page/dashboard-overview.png"
            alt="login overview — Magnifi"
            width={1280}
            height={800}
            className="object-contain w-full h-auto"
            sizes="(max-width: 1024px) 100vw, 1280px"
            priority
          />
        </div>
      </motion.div>
    </section>
  );
}

// Reusable elegant placeholder for imagery, with caption for what to insert later
function ImageFrame({
  aspect = "aspect-[16/9]",
  caption,
}: {
  aspect?: string;
  caption: string;
}) {
  return (
    <figure
      className={`group relative overflow-hidden rounded-3xl border bg-card/40 shadow-sm ${aspect}`}
    >
      <div className="absolute inset-0 grid place-items-center">
        <div className="rounded-xl border border-dashed px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm">
          {caption}
        </div>
      </div>
      <div className="h-full w-full opacity-0" />
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

function StoryBlocks() {
  const blocks = [
    {
      heading: "See the whole picture",
      copy: "logins make progress obvious. Budgets, timelines, workloads—clear at a glance.",
      badge: "Clarity",
    },
    {
      heading: "Move work, not weight",
      copy: "Boards turn tasks into simple, tactile cards. Drag. Drop. Done.",
      badge: "Flow",
    },
    {
      heading: "Teams that mirror your org",
      copy: "Departments and sub-departments match how you actually work. Ownership is obvious.",
      badge: "Structure",
    },
    {
      heading: "People feel in the loop",
      copy: "Comments, mentions and updates keep context in one place—without the noise.",
      badge: "Calm",
    },
  ];

  return (
    <section id="story" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        {blocks.map((b, i) => (
          <motion.div
            key={b.heading}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ delay: 0.05 * i, duration: 0.5 }}
            className="rounded-2xl border p-6 md:p-8"
          >
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5" /> {b.badge}
            </div>
            <h3 className="proximavara-700 text-xl md:text-2xl">{b.heading}</h3>
            <p className="mt-2 text-muted-foreground">{b.copy}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function AudienceSection() {
  const cards = [
    {
      title: "Marketing",
      icon: Users,
      caption: "Insert: Board view with campaign tasks and assets",
    },
    {
      title: "Product & Engineering",
      icon: Building2,
      caption: "Insert: Kanban + timeline snapshot",
    },
    {
      title: "Operations",
      icon: CalendarDays,
      caption: "Insert: Department tree with assignees",
    },
    {
      title: "Agencies",
      icon: Users,
      caption: "Insert: Multi-client login tiles",
    },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 py-14 md:py-20">
      <div className="mb-6 md:mb-10">
        <h2 className="spacegrot text-3xl md:text-5xl">Who we’re built for</h2>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Different teams, same calm flow. Pick your lane—Magnifi adapts.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.04 * i, duration: 0.45 }}
            className="rounded-2xl border p-4 md:p-5"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {c.icon && <c.icon className="h-4 w-4" />}
              {c.title}
            </div>
            <div className="mt-4">
              <ImageFrame aspect="aspect-[4/3]" caption={c.caption} />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function FeatureGallery() {
  const features = [
    {
      title: "Project logins",
      byline: "Understand status in a second",
      bullets: [
        "Progress bars, charts and key stats",
        "Upcoming deadlines called out",
        "Workload and burndown at a glance",
      ],
    },
    {
      title: "Kanban Boards",
      byline: "Work that moves with you",
      bullets: [
        "Drag cards through clear stages",
        "Priorities, assignees and comments built-in",
        "Fast, friendly, focused",
      ],
    },
    {
      title: "Departments",
      byline: "Your org, not a spreadsheet",
      bullets: [
        "Nested teams with real ownership",
        "Managers, members and roles",
        "Invite and onboard in minutes",
      ],
    },
  ];

  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="mb-8 text-center">
        <h2 className="proximavara-700 text-3xl md:text-4xl">
          What makes Magnifi different
        </h2>
        <p className="mt-3 text-muted-foreground">
          Not more features—better ones. Everything earns its place.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.05 * i, duration: 0.5 }}
            className="group relative overflow-hidden rounded-2xl border p-6 md:p-8"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/0 to-white/5 dark:from-white/0 dark:via-white/0 dark:to-white/5" />
            <h3 className="proximavara-700 text-lg md:text-xl">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.byline}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {f.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-[#22c55e]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      <div className="mt-12 grid grid-cols-1 items-center gap-6 rounded-2xl border p-6 md:grid-cols-2 md:p-8">
        <div>
          <h3 className="proximavara-700 text-xl md:text-2xl">
            Calm collaboration
          </h3>
          <p className="mt-2 text-muted-foreground">
            Comments keep context with the work. Mentions notify the right
            people. Updates feel helpful, not noisy.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 text-[#22c55e]" /> Real-time
              updates where they matter
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 text-[#22c55e]" /> Smart
              reminders for what’s due soon
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 text-[#22c55e]" /> Invite
              anyone—no training required
            </li>
          </ul>
        </div>
        <div className="relative overflow-hidden rounded-xl border bg-card/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-[#22c55e]" /> Live feed
          </div>
          <div className="space-y-2 text-sm">
            {[
              { who: "Alex", what: "moved a task to In Review" },
              { who: "Priya", what: "commented: “Looks ready to ship.”" },
              { who: "Sam", what: "completed ‘Budget check’" },
              { who: "Ava", what: "invited Marketing team" },
            ].map((e, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.05 * idx }}
                className="rounded-lg border bg-background/60 px-3 py-2"
              >
                <span className="font-medium">{e.who}</span> {e.what}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Pillars() {
  const items = [
    {
      title: "Clarity",
      copy: "See progress, priorities and deadlines without digging.",
      caption: "Insert: login KPIs with clean charts",
    },
    {
      title: "Flow",
      copy: "Move tasks forward with a tap. Drag. Drop. Done.",
      caption: "Insert: Kanban column transition moment",
    },
    {
      title: "Ownership",
      copy: "Departments and roles make responsibility obvious.",
      caption: "Insert: Department tree with avatars",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-14 md:py-20">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {items.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.05 * i, duration: 0.45 }}
            className="rounded-2xl border p-6"
          >
            <h3 className="proximavara-700 text-xl">{p.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{p.copy}</p>
            <div className="mt-4">
              <ImageFrame aspect="aspect-[16/10]" caption={p.caption} />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
      <div className="rounded-2xl border p-6 md:p-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {[
            { kpi: "2×", text: "Faster from idea to done" },
            { kpi: "-40%", text: "Less tool-switching noise" },
            { kpi: "+87%", text: "More on-time deliveries" },
          ].map((s) => (
            <div key={s.kpi} className="text-center">
              <div className="proximavara-700 text-4xl">{s.kpi}</div>
              <div className="mt-2 text-muted-foreground">{s.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      <div className="relative overflow-hidden rounded-3xl border p-8 md:p-12">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        <div className="max-w-2xl">
          <h3 className="proximavara-700 text-3xl md:text-4xl">
            Make work feel light.
          </h3>
          <p className="mt-3 text-muted-foreground">
            Start free. Bring your team. See what happens when everything just
            fits.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-foreground px-5 py-3 text-sm text-background hover:opacity-90 transition inline-flex items-center gap-2"
            >
              Create your workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/create-organization"
              className="rounded-full border px-5 py-3 text-sm hover:bg-foreground hover:text-background transition"
            >
              Create an organization
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-7xl px-6 pb-12 pt-8 text-sm text-muted-foreground">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <Image
            src="/magnifi-m.png"
            alt="Magnifi"
            width={18}
            height={18}
            className="rounded-sm"
          />
          <span>Magnifi</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Get started</Link>
        </div>
      </div>
      <div className="mt-4 text-xs">
        © {new Date().getFullYear()} Magnifi. All rights reserved.
      </div>
    </footer>
  );
}

function Decorations() {
  // Soft gradients and subtle grid for depth; stays lightweight.
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute left-1/2 top-[-10%] h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.25),transparent_60%)] blur-3xl" />
      <div className="absolute right-[-10%] top-1/3 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.18),transparent_60%)] blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.15),transparent_60%)] blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.04))] dark:bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.04))]" />
    </div>
  );
}
