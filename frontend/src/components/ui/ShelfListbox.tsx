"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { formControlClass } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";

type Props = {
  id: string;
  value: string;
  options: string[];
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
};

export function ShelfListbox({ id, value, options, disabled, invalid, onChange }: Props) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const entries = ["", ...options];
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded]);

  useEffect(() => {
    if (expanded) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [expanded, active]);

  function show() {
    setActive(Math.max(0, entries.indexOf(value)));
    setOpen(true);
  }

  function choose(index: number) {
    onChange(entries[index]);
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!expanded) show();
      else setActive((current) => event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1
        : Math.max(0, Math.min(entries.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (expanded) choose(active);
      else show();
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const match = entries.findIndex((entry) => (entry || "Sin estante").toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if (match >= 0) {
        event.preventDefault();
        setActive(match);
        setOpen(true);
      }
    }
  }

  return (
    <div ref={root} className="relative min-w-0">
      <button ref={trigger} id={id} type="button" role="combobox" disabled={disabled}
        aria-expanded={expanded} aria-haspopup="listbox" aria-controls={listId}
        aria-activedescendant={expanded ? listId + "-" + active : undefined}
        aria-invalid={invalid} onKeyDown={onKeyDown}
        onClick={() => expanded ? setOpen(false) : show()}
        onBlur={(event) => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }}
        className={formControlClass + " flex min-h-11 items-center justify-between gap-3 text-left"}>
        <span className="truncate">{value || "Sin estante"}</span>
        <span aria-hidden="true" className={"shrink-0 transition-transform " + (expanded ? "rotate-180" : "")}>
          <Icon name="expand_more" className="text-lg text-on-surface-variant" />
        </span>
      </button>
      {expanded && (
        <ul ref={list} id={listId} role="listbox" aria-label="Estantes disponibles"
          className="absolute inset-x-0 top-full z-20 mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-2xl border border-outline-variant bg-white p-1.5 shadow-lg">
          {entries.map((entry, index) => (
            <li key={entry} id={listId + "-" + index} role="option" aria-selected={entry === value}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}
              onPointerMove={() => setActive(index)}
              className={"flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm break-words " + (
                active === index ? "bg-primary/10 text-primary" : entry === value ? "bg-surface-container text-primary" : "text-on-surface hover:bg-surface-container"
              )}>
              <span>{entry || "Sin estante"}</span>
              {entry === value && <span aria-hidden="true"><Icon name="check" className="text-lg" /></span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
