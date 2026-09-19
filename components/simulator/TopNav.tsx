"use client";

import {
  ChevronDown,
  Download,
  FlaskConical,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { APP_VERSION, CITY_OPTIONS, USE_MOCK_DATA } from "@/lib/config";
import { useSylvida } from "@/store/useSylvida";
import { Button, IconButton } from "@/components/shared/Button";
import { Modal, Popover, Tooltip } from "@/components/shared/Overlay";
import { Wordmark } from "@/components/shared/Wordmark";

export function TopNav() {
  const mode = useSylvida((s) => s.mode);
  const setMode = useSylvida((s) => s.setMode);
  const undo = useSylvida((s) => s.undo);
  const redo = useSylvida((s) => s.redo);
  const canUndo = useSylvida((s) => s.past.length > 0);
  const canRedo = useSylvida((s) => s.future.length > 0);
  const resetPlan = useSylvida((s) => s.resetPlan);
  const restoreDemo = useSylvida((s) => s.restoreDemo);
  const saveScenario = useSylvida((s) => s.saveScenario);
  const exportScenario = useSylvida((s) => s.exportScenario);
  const setMethodOpen = useSylvida((s) => s.setMethodOpen);

  const [resetOpen, setResetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("Healthcare Equity");

  return (
    <header
      className="flex h-[var(--nav-h)] shrink-0 items-center gap-4 border-b border-line bg-surface px-4"
      style={{ zIndex: 30 }}
    >
      <Link href="/" className="flex items-center gap-2.5 pr-1">
        <Wordmark size={17} />
        <span className="hidden text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-4 xl:block">
          Urban planning simulator
        </span>
      </Link>

      <div className="h-6 w-px bg-line-soft" />

      <CitySelector />

      <div className="mx-auto flex items-center gap-1 rounded-sm border border-line bg-surface-3 p-[3px]">
        {(["plan", "optimize"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
            className={`h-7 rounded-[4px] px-4 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors duration-150 ${
              mode === value
                ? "bg-brand/15 text-brand"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Tooltip label="Undo">
          <IconButton
            label="Undo"
            size="sm"
            disabled={!canUndo}
            onClick={undo}
            className="disabled:opacity-45"
          >
            <Undo2 size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Redo">
          <IconButton
            label="Redo"
            size="sm"
            disabled={!canRedo}
            onClick={redo}
            className="disabled:opacity-45"
          >
            <Redo2 size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Reset the scenario">
          <IconButton
            label="Reset"
            size="sm"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw size={14} />
          </IconButton>
        </Tooltip>

        <div className="mx-1 h-6 w-px bg-line-soft" />

        <Button size="sm" icon={<Save size={13} />} onClick={() => setSaveOpen(true)}>
          Save scenario
        </Button>

        <Popover
          align="right"
          width={216}
          trigger={({ open, toggle }) => (
            <IconButton
              label="Export and demo tools"
              size="sm"
              active={open}
              onClick={toggle}
            >
              <Download size={14} />
            </IconButton>
          )}
        >
          <MenuItem onClick={exportScenario}>Export scenario JSON</MenuItem>
          <MenuItem onClick={() => setMethodOpen(true)}>
            How this works
          </MenuItem>
          <div className="my-1.5 h-px bg-line-soft" />
          <MenuItem onClick={restoreDemo}>Restore the demo city</MenuItem>
        </Popover>
      </div>

      {USE_MOCK_DATA ? (
        <Tooltip label="Every figure comes from the bundled prototype engine" side="bottom">
          <span className="flex items-center gap-1.5 rounded-sm border border-warn/30 bg-warn/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-warn">
            <FlaskConical size={11} />
            Demo data
          </span>
        </Tooltip>
      ) : (
        <span className="flex items-center gap-1.5 rounded-sm border border-ok/30 bg-ok/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ok">
          Live backend
        </span>
      )}

      <Modal
        open={resetOpen}
        title="Reset current scenario?"
        description="Infrastructure you placed and any generated configuration are cleared. The city returns to its existing stock."
        onClose={() => setResetOpen(false)}
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetPlan();
                setResetOpen(false);
              }}
            >
              Reset
            </Button>
          </>
        }
      />

      <Modal
        open={saveOpen}
        title="Save scenario"
        description="Scenarios keep the facilities, budget, priorities and constraints you configured."
        onClose={() => setSaveOpen(false)}
        footer={
          <>
            <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                void saveScenario(name);
                setSaveOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <label
          htmlFor="scenario-name"
          className="mb-1.5 block text-[12px] text-ink-2"
        >
          Scenario name
        </label>
        <input
          id="scenario-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 w-full rounded-sm border border-line bg-surface-3 px-3 text-[13px] text-ink outline-none focus:border-brand/50"
        />
      </Modal>
    </header>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-xs px-2 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-surface-3 hover:text-ink"
    >
      {children}
    </button>
  );
}

function CitySelector() {
  const [city, setCity] = useState<string>(CITY_OPTIONS[0].id);
  const current = CITY_OPTIONS.find((c) => c.id === city) ?? CITY_OPTIONS[0];

  return (
    <Popover
      width={232}
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-surface-3"
        >
          {current.name}
          <ChevronDown size={13} className="text-ink-4" />
        </button>
      )}
    >
      <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-ink-3">
        City
      </p>
      {CITY_OPTIONS.map((option) => (
        <button
          key={option.id}
          disabled={!option.available}
          onClick={() => setCity(option.id)}
          className="flex w-full items-center justify-between rounded-xs px-2 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-surface-3 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent"
        >
          {option.name}
          {!option.available ? (
            <span className="text-[10.5px] text-ink-4">No data yet</span>
          ) : null}
        </button>
      ))}
      <p className="mt-2 border-t border-line-soft pt-2 text-[11px] leading-snug text-ink-4">
        {APP_VERSION}. Only Central Kolkata carries bundled prototype data.
      </p>
    </Popover>
  );
}
