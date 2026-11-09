"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
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
import { getRunDescriptor } from "../runs/data/manifest";
import catalog from "../runs/data/catalog.json";
import type { CatalogEntry } from "../runs/model/view-types";
import { selectRunList, type BrowserFilters, type RunListEntry, type RunSort } from "../runs/model/run-list";
import {
  formatCount,
  formatReading,
  formatValue,
  qualityCount,
} from "../runs/model/format";
import styles from "./dashboard-shell.module.css";

const defaultCatalog = catalog as CatalogEntry[];

function RunBrowser({
  filters,
  onFilterChange,
  onNavigate,
  entries,
}: {
  filters: BrowserFilters;
  onFilterChange: (change: Partial<BrowserFilters>) => void;
  onNavigate?: () => void;
  entries: readonly RunListEntry[];
}) {
  const pathname = usePathname();
  const searchId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const { search, quality: filter, sort, status } = filters;
  const visible = selectRunList(entries, filters);

  return (
    <>
      <div className={styles.browserHeading}>
        <span>Training runs</span>
        <span className={styles.count}>{entries.length}</span>
      </div>
      <div className={styles.search}>
        <MagnifyingGlass size={16} aria-hidden="true" />
        <label className={styles.srOnly} htmlFor={searchId}>
          Find a run
        </label>
        <input
          ref={searchInput}
          id={searchId}
          value={search}
          onChange={(event) => onFilterChange({ search: event.target.value })}
          placeholder="Find a run…"
          autoComplete="off"
        />
        {search && (
          <button
            aria-label="Clear search"
            onClick={() => {
              onFilterChange({ search: "" });
              searchInput.current?.focus();
            }}
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
            onChange={(event) => onFilterChange({ sort: event.target.value as RunSort })}
          >
            <option value="id">Run ID</option>
            <option value="name">Name</option>
            <option value="steps">Last step ↓</option>
            <option value="loss">Valid loss ↑</option>
            <option value="loss-desc">Valid loss ↓</option>
          </select>
          <CaretDown size={10} aria-hidden="true" />
        </label>
      </div>
      <nav className={styles.runList} aria-label="Training runs">
        {visible.map(({ run, summary }) => {
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
                {(sort === "loss" || sort === "loss-desc") && summary.latest.loss.kind !== "finite" && (
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
        {!entries.length ? (
          <div className={styles.noResults} role="status">
            <strong>No training runs</strong>
            <p>This dataset has no runs yet.</p>
          </div>
        ) : !visible.length && (
          <div className={styles.noResults}>
            <MagnifyingGlass size={23} weight="light" />
            <strong>No matching runs</strong>
            <p>Try a different name or filter.</p>
            <button
              onClick={() => {
                onFilterChange({ search: "", quality: "all", status: "all" });
                searchInput.current?.focus();
              }}
            >
              Reset filters
            </button>
          </div>
        )}
      </nav>
      <div className={styles.listFooter} role="status" aria-atomic="true">
        {visible.length} of {entries.length} runs
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

export function DashboardShell({ children, catalogEntries = defaultCatalog }: {
  children: ReactNode;
  catalogEntries?: readonly CatalogEntry[];
}) {
  const entries = useMemo(() => catalogEntries.map((entry) => ({
    run: getRunDescriptor(entry.id), summary: entry.summary,
  })), [catalogEntries]);
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
        <RunBrowser entries={entries} filters={filters} onFilterChange={updateFilters} />
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
          entries={entries}
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
