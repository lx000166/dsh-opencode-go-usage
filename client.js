/**
 * dsh-opencode-go-usage — browser half.
 *
 * Two readouts, both drawn into the frame overlay and anchored to live DOM
 * geometry (the composer dock's context meter and the send button):
 *
 *  - a ring around the send button showing the 5h rolling window (display
 *    only: no pointer events, it never intercepts the button);
 *  - a compact meter to the right of DSH's context-usage ring showing the
 *    monthly window; clicking it opens a transient panel (outside pointer or
 *    Escape closes it) with all three windows and a refresh-interval slider.
 *
 * Data comes from the host route `GET /opencode-go-usage/status` (same
 * origin). The bundle registers under the package name via
 * `window.__ModuleLoader__`, the lazy-CJS format the client module loader
 * expects.
 */
window.__ModuleLoader__.load({
  id: "dsh-opencode-go-usage",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    const ReactDOM = require("react-dom");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    const Tooltip = primitives.Tooltip;
    const useAnchoredPosition = primitives.useAnchoredPosition;
    const useDismissOnOutsidePointer = primitives.useDismissOnOutsidePointer;

    const NS = "opencodeGoUsageWidget";
    const STATUS_URL = "/opencode-go-usage/status";
    const LIMITS = { rolling: "$12", weekly: "$30", monthly: "$60" };
    const POLLS = [30000, 60000, 120000, 300000];
    const POLL_DEFAULT = 120000;
    const POLL_KEY = "dsh-opencode-go-usage:pollMs";

    /** Ring geometry: mirrors the built-in ContextMeter (14px viewBox, 2px stroke). */
    const RADIUS = 5.5;
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

    const ZH = {
      title: "OpenCode Go 用量",
      rolling: "5h 滚动",
      weekly: "每周",
      monthly: "每月",
      limit: "限额",
      resets: "重置",
      loading: "查询中…",
      autoHint: "每 {interval}自动刷新",
      updated: "更新于",
      noKey: "未找到 OPENCODE_GO_API_KEY 或 OpenCode auth.json",
      unauthorized: "API Key 无效或已过期 (401)",
      network: "网络请求失败",
      httpError: "接口返回 HTTP {status}",
      badJson: "接口响应解析失败",
      retry: "重试",
      unknown: "未知",
      meterAria: "OpenCode Go 每月用量 {percent}",
      meterHint: "OpenCode Go 每月用量 · 点击查看详情",
      pollLabel: "刷新间隔",
      "poll.30000": "30 秒",
      "poll.60000": "1 分钟",
      "poll.120000": "2 分钟",
      "poll.300000": "5 分钟",
    };

    const EN = {
      title: "OpenCode Go usage",
      rolling: "5h rolling",
      weekly: "Weekly",
      monthly: "Monthly",
      limit: "limit",
      resets: "resets",
      loading: "Loading…",
      autoHint: "auto-refresh every {interval}",
      updated: "updated",
      noKey: "No OPENCODE_GO_API_KEY or OpenCode auth.json found",
      unauthorized: "API key invalid or expired (401)",
      network: "Network request failed",
      httpError: "HTTP {status} from usage endpoint",
      badJson: "Failed to parse usage response",
      retry: "Retry",
      unknown: "unknown",
      meterAria: "OpenCode Go monthly usage {percent}",
      meterHint: "OpenCode Go monthly usage · click for details",
      pollLabel: "Refresh",
      "poll.30000": "30s",
      "poll.60000": "1m",
      "poll.120000": "2m",
      "poll.300000": "5m",
    };

    const CSS = [
      // Send-button ring: display only, never intercepts pointer events.
      ".ogw-ring-wrap{position:fixed;pointer-events:none;z-index:2147483647}",
      ".ogw-ring-svg{display:block;width:100%;height:100%;overflow:visible}",
      // Dock meter: same metrics as the built-in ContextMeter trigger.
      ".ogw-meter{position:fixed;display:inline-flex;align-items:center;z-index:1000}",
      ".ogw-trigger{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;cursor:pointer;background:0 0;border:none;flex:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}",
      '.ogw-trigger[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      ".ogw-trigger:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
      ".ogw-ring-track{fill:none;stroke:var(--dsw-alias-border-l3);stroke-width:2px}",
      ".ogw-ring-fill{fill:none;stroke:var(--dsw-alias-label-tertiary);stroke-width:2px;stroke-linecap:round}",
      // Panel: same surface language as the built-in context panel.
      ".ogw-panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:min(280px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:12px;font-size:12px;line-height:20px;position:fixed;overflow:hidden auto}",
      ".ogw-head{display:flex;align-items:center;gap:8px;padding:0 0 8px}",
      ".ogw-title{color:var(--dsw-alias-label-primary);font-weight:500}",
      ".ogw-spacer{flex:1}",
      ".ogw-icon{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:13px;line-height:1;padding:3px 5px;border-radius:6px}",
      ".ogw-icon:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1,rgba(15,17,21,.06))}",
      ".ogw-body{display:flex;flex-direction:column;gap:10px;padding:2px 0 6px}",
      ".ogw-row{display:flex;flex-direction:column;gap:3px}",
      ".ogw-row-head{display:flex;justify-content:space-between;align-items:baseline}",
      ".ogw-name{color:var(--dsw-alias-label-secondary)}",
      ".ogw-pct{font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}",
      ".ogw-bar{height:4px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}",
      ".ogw-bar-fill{height:100%;border-radius:999px;transition:width .3s ease}",
      ".ogw-tone-ok{background:var(--dsw-alias-state-business-primary,#3964fe)}",
      ".ogw-tone-warn{background:var(--dsw-alias-state-warn-primary,#e6a23c)}",
      ".ogw-tone-error{background:var(--dsw-alias-state-error-primary,#e5484d)}",
      ".ogw-tone-none{background:var(--dsw-alias-label-tertiary)}",
      ".ogw-dot{width:8px;height:8px;border-radius:50%;flex:none}",
      ".ogw-meta{display:flex;justify-content:space-between;color:var(--dsw-alias-label-tertiary);font-size:10px}",
      ".ogw-foot{display:flex;justify-content:space-between;padding:7px 0 0;border-top:1px solid var(--dsw-alias-border-l2,rgba(15,17,21,.1));color:var(--dsw-alias-label-tertiary);font-size:10px}",
      ".ogw-status{display:flex;flex-direction:column;gap:8px;align-items:flex-start;padding:2px 0 6px}",
      ".ogw-error{color:var(--dsw-alias-state-error-primary,#e5484d);font-size:11px;line-height:1.5}",
      ".ogw-btn{border:1px solid var(--dsw-alias-border-l2,rgba(15,17,21,.14));background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;cursor:pointer;border-radius:6px;padding:3px 10px}",
      ".ogw-btn:hover{background:var(--dsw-alias-bg-layer-1,rgba(15,17,21,.06))}",
      // Refresh-interval slider: a thin native range with four fixed stops.
      ".ogw-poll{padding:10px 0 2px;border-top:1px solid var(--dsw-alias-border-l2,rgba(15,17,21,.1));margin:8px 0 0}",
      ".ogw-poll-head{display:flex;justify-content:space-between;color:var(--dsw-alias-label-tertiary);font-size:10px;padding-bottom:4px}",
      ".ogw-range{-webkit-appearance:none;appearance:none;width:100%;height:14px;background:transparent;cursor:pointer;margin:0;display:block}",
      ".ogw-range::-webkit-slider-runnable-track{height:3px;border-radius:999px;background:var(--dsw-alias-border-l2,rgba(15,17,21,.16))}",
      ".ogw-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:10px;height:10px;border-radius:50%;background:var(--dsw-alias-label-primary,#0f1115);margin-top:-3.5px;border:0}",
      ".ogw-range:focus{outline:none}",
      ".ogw-poll-labels{display:flex;justify-content:space-between;padding-top:3px;color:var(--dsw-alias-label-tertiary);font-size:10px}",
      ".ogw-poll-on{color:var(--dsw-alias-label-primary);font-weight:500}",
      ".ogw-spin{animation:ogw-rotate 1s linear infinite}",
      "@keyframes ogw-rotate{to{transform:rotate(360deg)}}",
    ].join("\n");

    function pctOf(w) {
      if (!w || typeof w.percent !== "number" || !Number.isFinite(w.percent))
        return null;
      return Math.max(0, Math.min(100, w.percent));
    }

    function toneOf(w) {
      const p = pctOf(w);
      if (p === null) return "none";
      if (p >= 100) return "error";
      if (p >= 80) return "warn";
      return "ok";
    }

    function fmtTime(iso) {
      if (!iso) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return d.getMonth() + 1 + "/" + d.getDate() + " " + hh + ":" + mi;
    }

    function readPoll() {
      try {
        const value = Number(window.localStorage.getItem(POLL_KEY));
        if (POLLS.indexOf(value) >= 0) return value;
      } catch (error) {
        // storage unavailable — default below
      }
      return POLL_DEFAULT;
    }

    /** One poller shared by both readouts; the panel's slider restarts it. */
    function createStore() {
      let state = { kind: "loading", pollMs: readPoll() };
      const subscribers = new Set();
      let timer = null;
      let inFlight = false;
      const emit = () => {
        for (const fn of subscribers) {
          try {
            fn();
          } catch (error) {
            console.error(
              "[dsh-opencode-go-usage] subscriber:",
              String((error && error.message) || error),
            );
          }
        }
      };
      const patch = (next) => {
        state = Object.assign({}, state, next);
        emit();
      };
      async function load() {
        if (inFlight) return;
        inFlight = true;
        if (state.kind === "done") patch({ refreshing: true });
        try {
          const response = await fetch(STATUS_URL, { cache: "no-store" });
          if (!response.ok) throw new Error("HTTP " + response.status);
          const result = await response.json();
          if (!result || result.ok !== true) {
            patch({
              kind: "failure",
              message: String((result && result.error) || "remote failed"),
              refreshing: false,
            });
          } else {
            patch({ kind: "done", value: result, refreshing: false });
          }
        } catch (error) {
          patch({
            kind: "failure",
            message: String((error && error.message) || error),
            refreshing: false,
          });
        } finally {
          inFlight = false;
        }
      }
      function restart() {
        if (timer !== null) window.clearInterval(timer);
        timer = window.setInterval(load, state.pollMs);
      }
      return {
        getSnapshot: () => state,
        subscribe: (fn) => {
          subscribers.add(fn);
          return () => subscribers.delete(fn);
        },
        start: () => {
          restart();
          load();
        },
        stop: () => {
          if (timer !== null) window.clearInterval(timer);
          timer = null;
        },
        setPoll: (ms) => {
          if (POLLS.indexOf(ms) < 0 || ms === state.pollMs) return;
          state = Object.assign({}, state, { pollMs: ms });
          emit();
          try {
            window.localStorage.setItem(POLL_KEY, String(ms));
          } catch (error) {
            // storage unavailable — the choice stays for this page only
          }
          restart();
        },
        load,
      };
    }

    /**
     * Locate the composer's primary submit button. Only the chat composer is
     * searched: pages without it (settings, panels) must hide the ring instead
     * of anchoring it to an unrelated button near the viewport bottom.
     */
    function findSendButton() {
      const card = document.querySelector("[data-composer-card]");
      if (!card) return null;
      const selectors = [
        'button[aria-label*="send" i]',
        'button[aria-label*="发送" i]',
        'button[title*="send" i]',
        'button[title*="发送" i]',
        '[data-testid*="send" i]',
        'button[class*="send" i]',
        'button[type="submit"]',
      ];
      for (const selector of selectors) {
        let elements;
        try {
          elements = card.querySelectorAll(selector);
        } catch (error) {
          continue;
        }
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width >= 24 && rect.height >= 24) return el;
        }
      }
      // Locale-independent fallback: the primary submit button is the last
      // aria-labelled button inside the composer card.
      const labelled = Array.from(card.querySelectorAll("button[aria-label]"));
      return labelled.length > 0 ? labelled[labelled.length - 1] : null;
    }

    function ringStrokeFor(tone) {
      // "ok" adapts to the theme: white on dark themes, dark on light themes.
      if (tone === "ok") return "var(--dsw-alias-label-primary,currentColor)";
      if (tone === "warn") return "var(--dsw-alias-state-warn-primary,#e6a23c)";
      if (tone === "error")
        return "var(--dsw-alias-state-error-primary,#e5484d)";
      return "var(--dsw-alias-label-tertiary,#81858c)";
    }

    // Rounded-rectangle outline path starting at the top-middle, clockwise.
    function ringPath(width, height, radius) {
      const x = radius;
      const y = radius;
      return (
        "M " +
        (width / 2).toFixed(2) +
        " 0" +
        " H " +
        (width - x).toFixed(2) +
        " A " +
        radius +
        " " +
        radius +
        " 0 0 1 " +
        width +
        " " +
        y +
        " V " +
        (height - y).toFixed(2) +
        " A " +
        radius +
        " " +
        radius +
        " 0 0 1 " +
        (width - x).toFixed(2) +
        " " +
        height +
        " H " +
        x +
        " A " +
        radius +
        " " +
        radius +
        " 0 0 1 0 " +
        (height - y).toFixed(2) +
        " V " +
        y +
        " A " +
        radius +
        " " +
        radius +
        " 0 0 1 " +
        x +
        " 0" +
        " H " +
        (width / 2).toFixed(2) +
        " Z"
      );
    }

    function ringPathLength(width, height, radius) {
      return (
        2 * (width - 2 * radius) +
        2 * (height - 2 * radius) +
        2 * Math.PI * radius
      );
    }

    function readButtonRadius(el, rect) {
      try {
        const style = window.getComputedStyle(el);
        const value = style.borderTopLeftRadius;
        if (typeof value === "string" && value.indexOf("%") >= 0) {
          return Math.min(rect.width, rect.height) / 2;
        }
        const px = parseFloat(value);
        if (Number.isFinite(px) && px > 0) {
          return Math.min(px, Math.min(rect.width, rect.height) / 2);
        }
      } catch (error) {
        // fall through
      }
      return Math.min(rect.width, rect.height) / 2;
    }

    function useStore(store) {
      return React.useSyncExternalStore(store.subscribe, store.getSnapshot);
    }

    /** Track the send button every frame; returns its box or null. */
    function useSendBox() {
      const [box, setBox] = React.useState(null);
      React.useEffect(() => {
        let raf = 0;
        let button = findSendButton();
        let lastKey = "";
        const loop = () => {
          raf = window.requestAnimationFrame(loop);
          if (
            !button ||
            !button.isConnected ||
            !button.closest("[data-composer-card]")
          ) {
            button = findSendButton();
          }
          if (!button) {
            if (lastKey !== "none") {
              lastKey = "none";
              setBox(null);
            }
            return;
          }
          const rect = button.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            if (lastKey !== "none") {
              lastKey = "none";
              setBox(null);
            }
            return;
          }
          const radius = readButtonRadius(button, rect);
          const key =
            rect.left +
            "|" +
            rect.top +
            "|" +
            rect.width +
            "|" +
            rect.height +
            "|" +
            radius;
          if (key !== lastKey) {
            lastKey = key;
            setBox({
              x: rect.left,
              y: rect.top,
              w: rect.width,
              h: rect.height,
              r: radius,
            });
          }
        };
        loop();
        return () => window.cancelAnimationFrame(raf);
      }, []);
      return box;
    }

    /** Track the built-in context meter; returns where our meter belongs. */
    function useDockAnchor() {
      const [anchor, setAnchor] = React.useState(null);
      React.useEffect(() => {
        let raf = 0;
        let lastKey = "";
        const loop = () => {
          raf = window.requestAnimationFrame(loop);
          let trigger = null;
          try {
            const dock = document.querySelector("[data-composer-dock]");
            if (dock) {
              // The dock holds several dialog-opening pills (activity, token
              // stats) before the context meter; the meter is the last one and
              // is the one drawn as an SVG ring (a circle inside the button).
              const buttons = Array.from(
                dock.querySelectorAll('button[aria-haspopup="dialog"]'),
              );
              for (let i = buttons.length - 1; i >= 0; i -= 1) {
                if (buttons[i].querySelector("svg circle")) {
                  trigger = buttons[i];
                  break;
                }
              }
              if (!trigger && buttons.length > 0)
                trigger = buttons[buttons.length - 1];
            }
          } catch (error) {
            // no dock — stay hidden
          }
          if (!trigger) {
            if (lastKey !== "none") {
              lastKey = "none";
              setAnchor(null);
            }
            return;
          }
          const rect = trigger.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            if (lastKey !== "none") {
              lastKey = "none";
              setAnchor(null);
            }
            return;
          }
          // 12px after the built-in trigger (the dock's own gap), clamped so a
          // narrow window never pushes the meter off-screen.
          const left = Math.min(rect.right + 12, window.innerWidth - 88);
          const key = left + "|" + rect.top + "|" + rect.height;
          if (key !== lastKey) {
            lastKey = key;
            setAnchor({ left, top: rect.top, height: rect.height });
          }
        };
        loop();
        return () => window.cancelAnimationFrame(raf);
      }, []);
      return anchor;
    }

    function Row(props) {
      const w = props.win;
      const p = pctOf(w);
      const tone = toneOf(w);
      return React.createElement(
        "div",
        { className: "ogw-row" },
        React.createElement(
          "div",
          { className: "ogw-row-head" },
          React.createElement("span", { className: "ogw-name" }, props.name),
          React.createElement(
            "span",
            { className: "ogw-pct" },
            p === null ? "–" : Math.round(p) + "%",
          ),
        ),
        React.createElement(
          "div",
          { className: "ogw-bar" },
          React.createElement("div", {
            className: "ogw-bar-fill ogw-tone-" + tone,
            style: { width: (p === null ? 0 : p) + "%" },
          }),
        ),
        React.createElement(
          "div",
          { className: "ogw-meta" },
          React.createElement(
            "span",
            null,
            props.t("limit") + " " + props.limit,
          ),
          React.createElement(
            "span",
            null,
            props.t("resets") +
              " " +
              (fmtTime(w && w.resetsAt) || props.t("unknown")),
          ),
        ),
      );
    }

    /** Ring around the send button: 5h rolling window, pointer-events none. */
    function SendRing(props) {
      const state = useStore(props.store);
      const box = useSendBox();
      if (!box) return null;
      const usage =
        state.kind === "done" && state.value ? state.value.usage : null;
      const win = usage && usage.rolling;
      const p = pctOf(win);
      const tone = state.kind === "failure" ? "error" : toneOf(win);
      const PAD = 3;
      const W = box.w + PAD * 2;
      const H = box.h + PAD * 2;
      const radius = Math.min(box.r + PAD, Math.min(W, H) / 2);
      const path = ringPath(W, H, radius);
      const length = ringPathLength(W, H, radius);
      const dash = p === null ? 0 : (length * p) / 100;
      return React.createElement(
        "div",
        {
          className: "ogw-ring-wrap",
          style: {
            left: box.x - PAD + "px",
            top: box.y - PAD + "px",
            width: W + "px",
            height: H + "px",
          },
        },
        React.createElement(
          "svg",
          { className: "ogw-ring-svg", viewBox: "0 0 " + W + " " + H },
          React.createElement("path", {
            d: path,
            fill: "none",
            stroke: "var(--dsw-alias-border-l2,rgba(15,17,21,.18))",
            strokeWidth: 2,
          }),
          React.createElement("path", {
            d: path,
            fill: "none",
            stroke: ringStrokeFor(tone),
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeDasharray: dash.toFixed(2) + " " + length.toFixed(2),
          }),
        ),
      );
    }

    /** Compact monthly meter beside the context ring; click opens the panel. */
    function DockMeter(props) {
      const store = props.store;
      const state = useStore(store);
      const anchor = useDockAnchor();
      const [open, setOpen] = React.useState(false);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);

      React.useEffect(() => {
        if (!anchor && open) setOpen(false);
      }, [anchor, open]);

      React.useEffect(() => {
        if (!open) return;
        const onKeyDown = (e) => {
          if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
      }, [open]);

      const position = useAnchoredPosition({
        open,
        anchorRef: rootRef,
        panelRef,
        side: "top",
        gap: 8,
        margin: 12,
      });
      useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);

      if (!anchor) return null;

      const t = props.t;
      const usage =
        state.kind === "done" && state.value ? state.value.usage : null;
      const win = usage && usage.monthly;
      const p = pctOf(win);
      const ringPct = p === null ? 0 : p;
      const aria = t("meterAria").replace(
        "{percent}",
        p === null ? "–" : Math.round(p) + "%",
      );
      const pollIndex = Math.max(0, POLLS.indexOf(state.pollMs));
      const pollLabel = t("poll." + state.pollMs);

      let body;
      if (state.kind === "loading") {
        body = React.createElement(
          "div",
          { className: "ogw-status" },
          t("loading"),
        );
      } else if (state.kind === "failure") {
        body = React.createElement(
          "div",
          { className: "ogw-status" },
          React.createElement("div", { className: "ogw-error" }, state.message),
          React.createElement(
            "button",
            { className: "ogw-btn", onClick: store.load },
            t("retry"),
          ),
        );
      } else {
        const value = state.value;
        if (value.configured !== true) {
          body = React.createElement(
            "div",
            { className: "ogw-status" },
            React.createElement("div", { className: "ogw-error" }, t("noKey")),
            React.createElement(
              "button",
              { className: "ogw-btn", onClick: store.load },
              t("retry"),
            ),
          );
        } else if (value.error) {
          body = React.createElement(
            "div",
            { className: "ogw-status" },
            React.createElement(
              "div",
              { className: "ogw-error" },
              errorText(t, value.error),
            ),
            React.createElement(
              "button",
              { className: "ogw-btn", onClick: store.load },
              t("retry"),
            ),
          );
        } else {
          const u = value.usage || {};
          body = React.createElement(
            "div",
            { className: "ogw-body" },
            React.createElement(Row, {
              name: t("rolling"),
              limit: LIMITS.rolling,
              win: u.rolling,
              t,
            }),
            React.createElement(Row, {
              name: t("weekly"),
              limit: LIMITS.weekly,
              win: u.weekly,
              t,
            }),
            React.createElement(Row, {
              name: t("monthly"),
              limit: LIMITS.monthly,
              win: u.monthly,
              t,
            }),
          );
        }
      }

      const refreshing = state.kind === "done" && state.refreshing === true;
      const dotTone =
        state.kind === "failure"
          ? "error"
          : state.kind === "done"
            ? "ok"
            : "none";

      const poll = React.createElement(
        "div",
        { className: "ogw-poll" },
        React.createElement(
          "div",
          { className: "ogw-poll-head" },
          React.createElement("span", null, t("pollLabel")),
          React.createElement("span", { className: "ogw-poll-on" }, pollLabel),
        ),
        React.createElement("input", {
          className: "ogw-range",
          type: "range",
          min: 0,
          max: POLLS.length - 1,
          step: 1,
          value: pollIndex,
          "aria-label": t("pollLabel"),
          onChange: (e) => store.setPoll(POLLS[Number(e.target.value)]),
        }),
        React.createElement(
          "div",
          { className: "ogw-poll-labels" },
          POLLS.map((ms, i) =>
            React.createElement(
              "span",
              {
                key: ms,
                className: i === pollIndex ? "ogw-poll-on" : "",
              },
              t("poll." + ms),
            ),
          ),
        ),
      );

      const panel =
        open &&
        ReactDOM.createPortal(
          React.createElement(
            "div",
            {
              ref: panelRef,
              className: "ogw-panel",
              style: position ?? { visibility: "hidden", left: 0, top: 0 },
              role: "dialog",
              "aria-label": t("title"),
            },
            React.createElement(
              "div",
              { className: "ogw-head" },
              React.createElement("span", {
                className: "ogw-dot ogw-tone-" + dotTone,
              }),
              React.createElement(
                "span",
                { className: "ogw-title" },
                t("title"),
              ),
              React.createElement("span", { className: "ogw-spacer" }),
              React.createElement(
                "button",
                {
                  className: "ogw-icon" + (refreshing ? " ogw-spin" : ""),
                  title: t("retry"),
                  "aria-label": t("retry"),
                  onClick: store.load,
                },
                "↻",
              ),
            ),
            body,
            poll,
            React.createElement(
              "div",
              { className: "ogw-foot" },
              React.createElement(
                "span",
                null,
                t("updated") +
                  " " +
                  (state.kind === "done" && state.value && state.value.fetchedAt
                    ? fmtTime(state.value.fetchedAt) || "–"
                    : "–"),
              ),
              React.createElement(
                "span",
                null,
                t("autoHint").replace("{interval}", pollLabel),
              ),
            ),
          ),
          document.body,
        );

      return React.createElement(
        "span",
        {
          className: "ogw-meter",
          ref: rootRef,
          style: {
            left: anchor.left + "px",
            top: anchor.top + "px",
            height: anchor.height + "px",
          },
        },
        React.createElement(
          Tooltip,
          {
            label: t("meterHint"),
            side: "top",
            delayMs: 200,
            disabled: open,
            portal: true,
          },
          React.createElement(
            "button",
            {
              type: "button",
              className: "ogw-trigger",
              "aria-label": aria,
              "aria-haspopup": "dialog",
              "aria-expanded": open,
              onClick: () => setOpen(!open),
            },
            React.createElement(
              "svg",
              {
                viewBox: "0 0 14 14",
                width: 14,
                height: 14,
                "aria-hidden": true,
              },
              React.createElement("circle", {
                className: "ogw-ring-track",
                cx: 7,
                cy: 7,
                r: RADIUS,
              }),
              React.createElement("circle", {
                className: "ogw-ring-fill",
                cx: 7,
                cy: 7,
                r: RADIUS,
                strokeDasharray:
                  ((CIRCUMFERENCE * ringPct) / 100).toFixed(2) +
                  " " +
                  CIRCUMFERENCE.toFixed(2),
                transform: "rotate(-90 7 7)",
              }),
            ),
            React.createElement(
              "span",
              null,
              p === null ? "–" : Math.round(p) + "%",
            ),
          ),
        ),
        panel,
      );
    }

    function errorText(t, error) {
      if (error === "unauthorized") return t("unauthorized");
      if (error === "network") return t("network");
      if (error === "bad-json") return t("badJson");
      if (typeof error === "string" && error.indexOf("http-") === 0) {
        return t("httpError").replace("{status}", error.slice(5));
      }
      return String(error || t("network"));
    }

    function apply(ctx) {
      let t = (key) => (ZH[key] !== undefined ? ZH[key] : String(key));
      try {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }));
        const translate = ctx.locale.bind(NS);
        t = (key) => {
          const value = translate(key);
          return typeof value === "string" && value !== key
            ? value
            : ZH[key] !== undefined
              ? ZH[key]
              : String(key);
        };
      } catch (error) {
        console.error(
          "[dsh-opencode-go-usage] locale unavailable:",
          String((error && error.message) || error),
        );
      }

      const style = document.createElement("style");
      style.dataset.plugin = "dsh-opencode-go-usage";
      style.textContent = CSS;
      document.head.append(style);
      ctx.effect(() => () => style.remove());

      const store = createStore();
      ctx.effect(() => {
        store.start();
        return () => store.stop();
      }, "opencode-go-usage: usage polling");

      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          { name: "shell.overlay", id: "opencode-go-send-ring", order: 50 },
          () => React.createElement(SendRing, { store }),
        ),
      );
      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          { name: "shell.overlay", id: "opencode-go-dock-meter", order: 51 },
          () => React.createElement(DockMeter, { store, t }),
        ),
      );
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    return module.exports;
  },
});
