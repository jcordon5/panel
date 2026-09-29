// Overlays: modal dialogs, popover menus, toasts, confirm/prompt helpers.

import { h, $ } from "./util.js";
import { icon } from "./icons.js";
import { t } from "./i18n.js";

const layer = () => $("#overlays");

/* ------------------------------------------------------------ toast */

export function toast(msg, opts = {}) {
  const box = $("#toasts") || layer().appendChild(h("div", { id: "toasts", role: "status", "aria-live": "polite" }));
  const el = h("div", { class: "toast" + (opts.error ? " toast-error" : "") },
    h("span", { class: "toast-msg" }, msg),
    opts.action ? h("button", { class: "toast-action", onclick: () => { opts.action.fn(); dismiss(); } }, opts.action.label) : null,
  );
  box.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  const dismiss = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 200); };
  setTimeout(dismiss, opts.duration || (opts.action ? 6000 : 2600));
  return dismiss;
}

export function errorToast(e) {
  console.error(e);
  toast(e && e.message ? e.message : String(e), { error: true });
}

/* ------------------------------------------------------------ modal */

let openModals = 0;
const closers = new Set();
export function isModalOpen() { return openModals > 0 || !!$(".menu"); }
export function closeModals() { for (const c of [...closers]) c(); }

/**
 * modal({ title, body: Node|Node[], actions: [{label, primary, danger, onClick}] , wide })
 * onClick may return false to keep the dialog open. Returns { close, el }.
 */
export function modal({ title, body, actions = [], wide = false, onClose, className = "" }) {
  const prevFocus = document.activeElement;
  const close = () => {
    if (!backdrop.isConnected) return;
    backdrop.remove(); openModals--; closers.delete(close);
    document.removeEventListener("keydown", onKey, true);
    if (onClose) onClose();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };
  const run = async (a) => {
    try {
      const r = await a.onClick?.();
      if (r !== false) close();
    } catch (e) { errorToast(e); }
  };
  const footer = actions.length ? h("div", { class: "modal-actions" }, actions.map((a) =>
    h("button", { class: "btn" + (a.primary ? " btn-primary" : "") + (a.danger ? " btn-danger" : ""), type: a.primary ? "submit" : "button", onclick: (e) => { e.preventDefault(); run(a); } }, a.label))) : null;
  const form = h("form", { class: "modal" + (wide ? " modal-wide" : "") + " " + className, role: "dialog", "aria-modal": "true", onsubmit: (e) => { e.preventDefault(); const p = actions.find((a) => a.primary); if (p) run(p); } },
    h("div", { class: "modal-head" },
      h("h2", { class: "modal-title" }, title),
      h("button", { class: "icon-btn", type: "button", "aria-label": t("common.close"), onclick: close }, icon("x"))),
    h("div", { class: "modal-body" }, body),
    footer);
  const backdrop = h("div", { class: "modal-backdrop", onmousedown: (e) => { if (e.target === backdrop) close(); } }, form);
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); } };
  document.addEventListener("keydown", onKey, true);
  layer().append(backdrop);
  openModals++;
  closers.add(close);
  requestAnimationFrame(() => {
    const f = form.querySelector("[autofocus]") || form.querySelector("input:not([type=hidden]):not([type=checkbox]), textarea, select");
    if (f) { f.focus(); if (f.select && f.type === "text") f.select(); }
  });
  return { close, el: form };
}

export function confirmDialog(message, { title = t("common.confirm"), ok = t("common.delete"), danger = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title, body: h("p", { class: "confirm-text" }, message),
      actions: [
        { label: t("common.cancel"), onClick: () => { done = true; resolve(false); } },
        { label: ok, primary: true, danger, onClick: () => { done = true; resolve(true); } },
      ],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

export function promptDialog(title, { label = "", placeholder = "", ok = t("common.save") } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const input = h("input", { class: "input", type: "text", placeholder, autofocus: true });
    modal({
      title, body: field(label, input),
      actions: [
        { label: t("common.cancel"), onClick: () => { done = true; resolve(null); } },
        { label: ok, primary: true, onClick: () => { if (!input.value.trim()) return false; done = true; resolve(input.value.trim()); } },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

/* ------------------------------------------------------------ fields */

export function field(label, input, hint) {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), input, hint ? h("span", { class: "field-hint" }, hint) : null);
}

/* ------------------------------------------------------------ menu */

/**
 * Popover menu anchored to an element or {x, y}.
 * items: [{label, icon, onClick, danger, hint, disabled} | "-" | {header}]
 */
export function menu(anchor, items, { align = "start" } = {}) {
  closeMenus();
  const el = h("div", { class: "menu", role: "menu" });
  const buttons = [];
  for (const it of items) {
    if (!it) continue;
    if (it === "-") { el.append(h("div", { class: "menu-sep" })); continue; }
    if (it.header) { el.append(h("div", { class: "menu-header" }, it.header)); continue; }
    if (it.node) { el.append(it.node); continue; }
    const b = h("button", { class: "menu-item" + (it.danger ? " danger" : ""), role: "menuitem", disabled: it.disabled, type: "button",
      onclick: (e) => { e.stopPropagation(); closeMenus(); it.onClick?.(); } },
    it.icon ? icon(it.icon, 15) : h("span", { class: "menu-noicon" }),
    h("span", { class: "menu-label" }, it.label),
    it.hint ? h("span", { class: "menu-hint" }, it.hint) : null);
    buttons.push(b);
    el.append(b);
  }
  layer().append(el);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const mw = el.offsetWidth, mh = el.offsetHeight;
  let x = align === "end" ? r.right - mw : r.left;
  let y = r.bottom + 4;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
  x = Math.min(Math.max(8, x), innerWidth - mw - 8);
  el.style.left = x + "px";
  el.style.top = y + "px";
  const onDoc = (e) => { if (!el.contains(e.target)) closeMenus(); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenus(); anchor.focus?.(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = buttons.indexOf(document.activeElement);
      const n = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
      buttons[n]?.focus();
    }
  };
  setTimeout(() => {
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
  });
  el._cleanup = () => { document.removeEventListener("mousedown", onDoc, true); document.removeEventListener("keydown", onKey, true); };
  if (anchor instanceof Element) anchor.setAttribute("aria-expanded", "true");
  el._anchor = anchor;
  buttons[0]?.focus({ preventScroll: true });
  return el;
}

export function closeMenus() {
  document.querySelectorAll(".menu").forEach((m) => {
    m._cleanup?.();
    if (m._anchor instanceof Element) m._anchor.removeAttribute("aria-expanded");
    m.remove();
  });
}

/* ------------------------------------------------------------ misc */

export function autoGrow(ta, max = 400) {
  const fit = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight + 2, max) + "px"; };
  ta.addEventListener("input", fit);
  requestAnimationFrame(fit);
  return fit;
}

export function emptyState(iconName, title, text, action) {
  return h("div", { class: "empty" },
    h("div", { class: "empty-icon" }, icon(iconName, 22)),
    h("div", { class: "empty-title" }, title),
    text ? h("div", { class: "empty-text" }, text) : null,
    action || null);
}
