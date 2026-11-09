"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useId, useRef, useState, type ReactNode } from "react";
import {
  MagnifyingGlass,
  CaretDown,
  X,
  SidebarSimple,
  Info,
  CheckCircle,
  WarningCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import { RUN_MANIFEST } from "../runs/data/manifest";
import catalog from "../runs/data/catalog.json";
import type { CatalogEntry } from "../runs/model/view-types";
import {
  formatCount,
  formatReading,
  formatValue,
  qualityCount,
} from "../runs/model/format";
import styles from "./dashboard-shell.module.css";

const entries = catalog as CatalogEntry[];
const summaries = new Map(entries.map((entry) => [entry.id, entry.summary]));

interface BrowserFilters {
  search: string;
  quality: string;
  sort: string;
  status: string;
}

function RunBrowser({
  filters,
  onFilterChange,
  onNavigate,
}: {
  filters: BrowserFilters;
  onFilterChange: (change: Partial<BrowserFilters>) => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchId = useId();
  const { search, quality: filter, sort, status } = filters;
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
          onChange={(event) => onFilterChange({ search: event.target.value })}
          placeholder="Find a run…"
          autoComplete="off"
        />
        {search && (
          <button
            aria-label="Clear search"
            onClick={() => onFilterChange({ search: "" })}
          >
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
            onClick={() => onFilterChange({ quality: value })}
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
            onChange={(event) => onFilterChange({ status: event.target.value })}
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
            onChange={(event) => onFilterChange({ sort: event.target.value })}
          >
            <option value="id">Run ID</option>
            <option value="name">Name</option>
            <option value="steps">Last step ↓</option>
            <option value="loss">Valid loss ↑</option>
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
                className={styles.statusIcon}
                aria-label={run.status}
              />
              <span className={styles.runText}>
                <span className={styles.runName}>{run.name}</span>
                <span className={styles.runMeta}>
                  {run.id}
                  <span>·</span>
                  Step {formatCount(summary.lastStep)}
                </span>
                <span className={styles.runReading}>
                  <span>Loss {formatReading(summary.latest.loss)}</span>
                  {issues && <span className={styles.qualityFlag}>Issues</span>}
                </span>
                {sort === "loss" && summary.latest.loss.kind !== "finite" && (
                  <span className={styles.sortValue}>
                    Last valid{" "}
                    {formatValue(summary.lastFinite.loss?.value ?? null)}
                    {summary.lastFinite.loss &&
                      ` at step ${formatCount(summary.lastFinite.loss.step)}`}
                  </span>
                )}
              </span>
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
                onFilterChange({ search: "", quality: "all", status: "all" });
              }}
            >
              Reset filters
            </button>
          </div>
        )}
      </nav>
      <div className={styles.listFooter}>
        {visible.length} of {RUN_MANIFEST.length} runs
      </div>
    </>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/runs"
      className={styles.brand}
      aria-label="Soup training runs"
      onClick={onNavigate}
    >
      <Image src="/soup-icon.png" width={28} height={28} alt="" />
      <span>soup</span>
    </Link>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const about = useRef<HTMLDialogElement>(null);
  const [filters, setFilters] = useState<BrowserFilters>({
    search: "",
    quality: "all",
    sort: "id",
    status: "all",
  });
  const updateFilters = (change: Partial<BrowserFilters>) => {
    setFilters((previous) => ({ ...previous, ...change }));
  };
  const showAbout = () => about.current?.showModal();

  return (
    <div className={styles.app}>
      <a href="#run-content" className={styles.skipLink}>
        Skip to run details
      </a>
      <aside className={styles.sidebar} aria-label="Run navigation">
        <div className={styles.brandRow}>
          <Brand />
        </div>
        <RunBrowser filters={filters} onFilterChange={updateFilters} />
        <button
          className={styles.aboutButton}
          onClick={showAbout}
          aria-haspopup="dialog"
        >
          <Info size={16} aria-hidden="true" />
          Synthetic data
        </button>
      </aside>
      <div className={styles.workspaceMain}>
        <header className={styles.mobileHeader}>
          <button
            className={styles.mobileMenu}
            aria-label="Open run navigation"
            aria-haspopup="dialog"
            onClick={() => drawer.current?.showModal()}
          >
            <SidebarSimple size={21} aria-hidden="true" />
          </button>
          <Brand />
          <button
            className={styles.mobileAbout}
            onClick={showAbout}
            aria-haspopup="dialog"
          >
            <Info size={15} aria-hidden="true" />
            Synthetic data
          </button>
        </header>
        <main id="run-content" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>
      <dialog
        ref={drawer}
        className={styles.drawer}
        aria-label="Choose a training run"
      >
        <div className={styles.drawerHeading}>
          <Brand onNavigate={() => drawer.current?.close()} />
          <button
            aria-label="Close run navigation"
            onClick={() => drawer.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <RunBrowser
          filters={filters}
          onFilterChange={updateFilters}
          onNavigate={() => drawer.current?.close()}
        />
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
          <X size={20} aria-hidden="true" />
        </button>
        <h2 id="about-title">Synthetic training data</h2>
        <p>
          These 20 generated runs include invalid readings, duplicate steps,
          missing intervals, and a million-point series with one isolated spike.
          Run statuses describe the fixtures, not live training jobs.
        </p>
        <dl>
          <div>
            <dt>Source snapshot</dt>
            <dd>Nov 1, 2026 · 12:00 UTC</dd>
          </div>
          <div>
            <dt>Dataset version</dt>
            <dd>soup-fixtures-v1</dd>
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
