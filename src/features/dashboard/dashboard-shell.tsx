"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState, type ReactNode } from "react";
import {
  BowlSteam,
  MagnifyingGlass,
  CaretDown,
  CaretRight,
  X,
  SidebarSimple,
  Flask,
  Info,
  CheckCircle,
  WarningCircle,
  CircleNotch,
  ArrowUpRight,
} from "@phosphor-icons/react";
import { RUN_MANIFEST } from "../runs/data/manifest";
import catalog from "../runs/data/catalog.json";
import type { CatalogEntry } from "../runs/model/view-types";
import { formatCount, formatValue, qualityCount } from "../runs/model/format";
import styles from "./dashboard-shell.module.css";

const entries = catalog as CatalogEntry[];
const summaries = new Map(entries.map((entry) => [entry.id, entry.summary]));

function RunBrowser({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("id");
  const [status, setStatus] = useState("all");
  const visible = RUN_MANIFEST.filter((run) => {
    const matchesText = `${run.name} ${run.id}`
      .toLowerCase()
      .includes(search.toLowerCase().trim());
    const issues = qualityCount(summaries.get(run.id)!) > 0;
    return (
      matchesText &&
      (filter === "all" || (filter === "issues" ? issues : !issues)) &&
      (status === "all" || run.status === status)
    );
  }).toSorted((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "en-US");
    if (sort === "steps")
      return (
        summaries.get(b.id)!.lastStep - summaries.get(a.id)!.lastStep ||
        a.id.localeCompare(b.id)
      );
    if (sort === "loss") {
      const left = summaries.get(a.id)!.lastFinite.loss?.value ?? Infinity;
      const right = summaries.get(b.id)!.lastFinite.loss?.value ?? Infinity;
      return left - right || a.id.localeCompare(b.id);
    }
    return a.id.localeCompare(b.id);
  });

  return (
    <>
      <div className={styles.browserHeading}>
        <span>Training runs</span>
        <span className={styles.count}>{RUN_MANIFEST.length}</span>
      </div>
      <div className={styles.search}>
        <MagnifyingGlass size={16} aria-hidden="true" />
        <label className={styles.srOnly} htmlFor={searchId}>
          Find a run
        </label>
        <input
          id={searchId}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a run…"
          autoComplete="off"
        />
        {search && (
          <button aria-label="Clear search" onClick={() => setSearch("")}>
            <X size={13} />
          </button>
        )}
      </div>
      <div
        className={styles.filterTabs}
        role="group"
        aria-label="Data quality filter"
      >
        {[
          ["all", "All"],
          ["issues", "With issues"],
          ["clean", "Clean"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.selectRow}>
        <label>
          <span className={styles.srOnly}>Filter by run status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <CaretDown size={10} aria-hidden="true" />
        </label>
        <label>
          <span className={styles.srOnly}>Sort runs</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="id">Run ID</option>
            <option value="name">Name</option>
            <option value="steps">Last step ↓</option>
            <option value="loss">Last valid loss ↑</option>
          </select>
          <CaretDown size={10} aria-hidden="true" />
        </label>
      </div>
      <nav className={styles.runList} aria-label="Training runs">
        {visible.map((run) => {
          const summary = summaries.get(run.id)!;
          const selected = pathname === `/runs/${run.id}`;
          const issues = qualityCount(summary) > 0;
          const Icon =
            run.status === "completed"
              ? CheckCircle
              : run.status === "failed"
                ? WarningCircle
                : CircleNotch;
          return (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              onClick={onNavigate}
              className={`${styles.run} ${selected ? styles.selected : ""}`}
              aria-current={selected ? "page" : undefined}
            >
              <Icon
                size={16}
                weight="regular"
                className={styles[run.status]}
                aria-label={run.status}
              />
              <span className={styles.runText}>
                <span className={styles.runName}>{run.name}</span>
                <span className={styles.runMeta}>
                  {run.id}
                  <span>·</span>
                  {formatCount(run.rowCount)} points
                </span>
                {sort === "loss" && (
                  <span className={styles.sortValue}>
                    Last valid:{" "}
                    {formatValue(summary.lastFinite.loss?.value ?? null)}
                    {summary.lastFinite.loss &&
                      ` @ ${formatCount(summary.lastFinite.loss.step)}`}
                  </span>
                )}
              </span>
              {issues && (
                <span
                  role="img"
                  className={styles.issueDot}
                  aria-label="Data quality issues"
                  title="Data quality issues"
                />
              )}
            </Link>
          );
        })}
        {!visible.length && (
          <div className={styles.noResults}>
            <MagnifyingGlass size={23} weight="light" />
            <strong>No matching runs</strong>
            <p>Try a different name or filter.</p>
            <button
              onClick={() => {
                setSearch("");
                setFilter("all");
                setStatus("all");
              }}
            >
              Reset filters
            </button>
          </div>
        )}
      </nav>
      <div className={styles.listFooter}>
        {visible.length} of {RUN_MANIFEST.length} runs<span>Dataset v1</span>
      </div>
    </>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const about = useRef<HTMLDialogElement>(null);
  return (
    <div className={styles.app}>
      <a href="#run-content" className={styles.skipLink}>
        Skip to run details
      </a>
      <aside className={styles.sidebar} aria-label="Run navigation">
        <Link href="/runs" className={styles.brand}>
          <BowlSteam size={31} weight="light" aria-hidden="true" />
          <span>
            soup<span className={styles.brandPeriod}>.</span>
          </span>
        </Link>
        <div className={styles.workspace}>
          <span className={styles.workspaceIcon}>
            <Flask size={17} weight="light" />
          </span>
          <div>
            <strong>Research workspace</strong>
            <span>Synthetic training data</span>
          </div>
        </div>
        <RunBrowser />
        <button
          className={styles.aboutButton}
          onClick={() => about.current?.showModal()}
        >
          <Info size={16} />
          About this dataset
          <ArrowUpRight size={13} />
        </button>
      </aside>
      <div className={styles.workspaceMain}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <button
              className={styles.mobileMenu}
              aria-label="Open run navigation"
              onClick={() => drawer.current?.showModal()}
            >
              <SidebarSimple size={20} />
            </button>
            <span>Workspace</span>
            <CaretRight size={12} aria-hidden="true" />
            <strong>Training runs</strong>
          </div>
          <div className={styles.topbarRight}>
            <Flask size={14} aria-hidden="true" />
            <span>Synthetic dataset</span>
            <span className={styles.version}>v1.0</span>
          </div>
        </header>
        <main id="run-content" className={styles.main}>
          {children}
        </main>
      </div>
      <dialog
        ref={drawer}
        className={styles.drawer}
        aria-label="Choose a training run"
      >
        <div className={styles.drawerHeading}>
          <span className={styles.drawerBrand}>soup.</span>
          <button
            aria-label="Close run navigation"
            onClick={() => drawer.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <RunBrowser onNavigate={() => drawer.current?.close()} />
      </dialog>
      <dialog
        ref={about}
        className={styles.aboutDialog}
        aria-labelledby="about-title"
      >
        <button
          className={styles.closeAbout}
          aria-label="Close dataset information"
          onClick={() => about.current?.close()}
        >
          <X size={20} />
        </button>
        <Flask size={28} weight="light" className={styles.aboutIcon} />
        <h2 id="about-title">A dataset designed to be questioned.</h2>
        <p>
          These 20 synthetic runs include invalid readings, duplicate steps,
          missing intervals, and a million-point series with one isolated spike.
        </p>
        <p>
          Charts preserve finite extremes and show breaks where telemetry is
          invalid or missing. Conflicting duplicates remain visible. Run
          statuses describe fixtures, not live training jobs.
        </p>
        <dl>
          <div>
            <dt>Source snapshot</dt>
            <dd>Nov 1, 2026 · 12:00 UTC</dd>
          </div>
          <div>
            <dt>Dataset</dt>
            <dd>soup-fixtures-v1</dd>
          </div>
          <div>
            <dt>Rendering</dt>
            <dd>Apache ECharts · linear scale</dd>
          </div>
        </dl>
        <button
          className={styles.aboutDone}
          onClick={() => about.current?.close()}
        >
          Back to runs
        </button>
      </dialog>
    </div>
  );
}
