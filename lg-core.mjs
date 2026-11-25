"use client";

// src/components/GlassButton/GlassButton.tsx
import React, { useImperativeHandle, useRef } from "react";

// src/engine/press.ts
import { useEffect } from "react";

// src/engine/spring.ts
var active = /* @__PURE__ */ new Set();
var frame = 0;
var last = 0;
function step(s, dt) {
  const x = s.value - s.target;
  const v = s.velocity;
  const half = s.c / 2;
  const disc = half * half - s.k;
  if (Math.abs(disc) < 1e-6) {
    const decay = Math.exp(-half * dt);
    const b = v + half * x;
    s.value = s.target + decay * (x + b * dt);
    s.velocity = decay * (v - half * b * dt);
  } else if (disc > 0) {
    const root2 = Math.sqrt(disc);
    const r1 = -half + root2;
    const r2 = -half - root2;
    const a = (v - r2 * x) / (r1 - r2);
    const b = x - a;
    const e1 = Math.exp(r1 * dt);
    const e2 = Math.exp(r2 * dt);
    s.value = s.target + a * e1 + b * e2;
    s.velocity = a * r1 * e1 + b * r2 * e2;
  } else {
    const w = Math.sqrt(-disc);
    const decay = Math.exp(-half * dt);
    const cos = Math.cos(w * dt);
    const sin = Math.sin(w * dt);
    s.value = s.target + decay * (x * cos + (v + half * x) / w * sin);
    s.velocity = decay * (v * cos - (half * v + s.k * x) / w * sin);
  }
}
function loop(time) {
  frame = 0;
  const dt = Math.min(0.064, Math.max(0, (time - last) / 1e3));
  last = time;
  for (const s of [...active]) {
    step(s, dt);
    if (Math.abs(s.value - s.target) < 1e-4 && Math.abs(s.velocity) < 1e-3) {
      s.value = s.target;
      s.velocity = 0;
      active.delete(s);
    }
    s.onUpdate(s.value, s.velocity);
  }
  if (active.size && !frame) frame = requestAnimationFrame(loop);
}
function wake() {
  if (frame) return;
  last = performance.now();
  frame = requestAnimationFrame(loop);
}
function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function createSpring(initial, config, onUpdate) {
  const s = {
    value: initial,
    target: initial,
    velocity: 0,
    k: config.stiffness,
    c: config.damping,
    onUpdate
  };
  return {
    get value() {
      return s.value;
    },
    get velocity() {
      return s.velocity;
    },
    get target() {
      return s.target;
    },
    set(target, instant = false) {
      s.target = target;
      if (instant || prefersReducedMotion() || typeof document !== "undefined" && document.hidden) {
        s.value = target;
        s.velocity = 0;
        active.delete(s);
        onUpdate(s.value, 0);
        return;
      }
      active.add(s);
      wake();
    },
    tune(next) {
      s.k = next.stiffness;
      s.c = next.damping;
    },
    impulse(velocity) {
      s.velocity += velocity;
      active.add(s);
      wake();
    },
    stop() {
      active.delete(s);
    }
  };
}
function springFrom(response, dampingFraction) {
  const w = 2 * Math.PI / response;
  return { stiffness: w * w, damping: 2 * dampingFraction * w };
}
var SPRINGS = {
  /** Finger down: quick, almost no overshoot. */
  press: springFrom(0.22, 0.86),
  /** Finger up: soft settle with the gentle jelly wobble. */
  release: springFrom(0.42, 0.5),
  /** Following the finger during a drag. */
  drag: springFrom(0.12, 0.92),
  /** Sliding into a new slot after release. */
  snap: springFrom(0.36, 0.72),
  /** Lens inflating out of a selection pill. */
  lift: springFrom(0.26, 0.78),
  /** Lens deflating back into a pill: visibly wobbly. */
  settle: springFrom(0.45, 0.46),
  /** Colour cross-fades. */
  fade: springFrom(0.3, 1),
  /** A dragged lens's stretch: loose, so it wobbles when the drag stops. */
  jelly: springFrom(0.3, 0.3)
};
function createJelly(onUpdate, max, speed) {
  const spring = createSpring(0, SPRINGS.jelly, (value) => onUpdate(value));
  return {
    feed(velocity, reach = max) {
      spring.set(reach * Math.tanh(Math.abs(velocity) / speed));
    },
    tune(next) {
      spring.tune(next);
    },
    stop() {
      spring.stop();
    }
  };
}
function rubberband(offset, dimension, constant = 0.55) {
  const sign = Math.sign(offset);
  const x = Math.abs(offset);
  return sign * (1 - 1 / (x * constant / dimension + 1)) * dimension;
}
var clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// src/engine/selection.ts
function guardSelection(el2) {
  let held = false;
  const block = (event) => {
    if (held) event.preventDefault();
  };
  const clear = () => {
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
  };
  const down = () => {
    held = true;
    clear();
  };
  const up = () => {
    if (!held) return;
    held = false;
    clear();
  };
  el2.addEventListener("pointerdown", down, true);
  document.addEventListener("selectstart", block, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  return () => {
    el2.removeEventListener("pointerdown", down, true);
    document.removeEventListener("selectstart", block, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
  };
}

// src/engine/press.ts
var FOLLOW = springFrom(0.2, 0.82);
function usePress(ref, options = {}) {
  const { grow, lean = 10, stretch = 0.2, disabled = false } = options;
  useEffect(() => {
    const el2 = ref.current;
    if (!el2 || disabled) return;
    const v = { sx: 1, sy: 1, tx: 0, ty: 0 };
    const paint = () => {
      el2.style.scale = `${v.sx} ${v.sy}`;
      el2.style.translate = `${v.tx}px ${v.ty}px`;
    };
    const springs = ["sx", "sy", "tx", "ty"].map(
      (key) => createSpring(key[0] === "s" ? 1 : 0, SPRINGS.release, (value) => {
        v[key] = value;
        paint();
      })
    );
    const to = (targets, feel) => springs.forEach((s, i) => {
      s.tune(feel);
      s.set(targets[i]);
    });
    let pointer = null;
    const light = (event, box) => {
      el2.style.setProperty("--lg-x", `${(event.clientX - box.left) / box.width * 100}%`);
      el2.style.setProperty("--lg-y", `${(event.clientY - box.top) / box.height * 100}%`);
    };
    const track = (event) => {
      if (!pointer) return;
      const { box, base, w, h } = pointer;
      light(event, box);
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      const dist = Math.hypot(dx, dy);
      const cx = dist ? (dx / dist) ** 2 : 0;
      const cy = dist ? (dy / dist) ** 2 : 0;
      const span = Math.min(w * cx + h * cy, 64);
      const reach = rubberband(dist, span * stretch * 2, 0.55);
      const ex = reach * cx / w;
      const ey = reach * cy / h;
      const tx = Math.sign(dx) * (reach * cx * base) / 2 + rubberband(dx, lean * 0.6, 0.4);
      const ty = Math.sign(dy) * (reach * cy * base) / 2 + rubberband(dy, lean * 0.6, 0.4);
      to([base * (1 + ex - ey * 0.35), base * (1 + ey - ex * 0.35), tx, ty], FOLLOW);
    };
    const move = (event) => {
      if (event.pointerId === pointer?.id) track(event);
    };
    const up = (event) => {
      if (event && event.pointerId !== pointer?.id) return;
      pointer = null;
      delete el2.dataset.pressed;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      to([1, 1, 0, 0], SPRINGS.release);
    };
    const down = (event) => {
      if (!event.isPrimary || event.button !== 0 || pointer) return;
      if (el2.disabled || el2.getAttribute("aria-disabled") === "true") return;
      const box = el2.getBoundingClientRect();
      const w = el2.offsetWidth || 1;
      const h = el2.offsetHeight || 1;
      const natural = Math.min(0.22, Math.max(0.07, 9 / Math.sqrt(w * h)));
      const amount = (grow ?? natural) * (event.pointerType === "mouse" ? 0.75 : 1);
      const base = 1 + amount;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, box, base, w, h };
      el2.dataset.pressed = "";
      light(event, box);
      to([base, base, 0, 0], SPRINGS.press);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
    const blur = () => up();
    const hold = (event) => {
      if (pointer && event.cancelable) event.preventDefault();
    };
    const noDrag = (event) => event.preventDefault();
    el2.setAttribute("data-lg-press", "");
    el2.addEventListener("dragstart", noDrag);
    const unguard = guardSelection(el2);
    el2.addEventListener("touchmove", hold, { passive: false });
    el2.addEventListener("pointerdown", down);
    window.addEventListener("blur", blur);
    return () => {
      up();
      springs.forEach((s) => s.stop());
      unguard();
      el2.removeEventListener("pointerdown", down);
      el2.removeEventListener("touchmove", hold);
      el2.removeEventListener("dragstart", noDrag);
      el2.removeAttribute("data-lg-press");
      window.removeEventListener("blur", blur);
      el2.style.removeProperty("scale");
      el2.style.removeProperty("translate");
    };
  }, [ref, grow, lean, stretch, disabled]);
}

// src/engine/refraction.ts
import { useEffect as useEffect2 } from "react";

// src/engine/mirror.ts
var SELF = "data-lg-mirror-self";
function clone(source) {
  const root2 = source.cloneNode(true);
  const originals = [source, ...Array.from(source.querySelectorAll("*"))];
  const copies = [root2, ...Array.from(root2.querySelectorAll("*"))];
  const pairs = [];
  originals.forEach((original, i) => {
    const copy = copies[i];
    if (!copy) return;
    copy.removeAttribute("id");
    copy.removeAttribute("tabindex");
    if (copy instanceof HTMLImageElement) copy.loading = "eager";
    pairs.push({ original, copy, css: original.style.cssText, cls: original.className.toString() });
  });
  root2.querySelectorAll(`[${SELF}], .lg-mirror, [data-lg-mirror-skip], input, textarea, select`).forEach((n) => n.remove());
  root2.removeAttribute("data-mirror");
  root2.setAttribute("data-lg-copy", "");
  root2.setAttribute("inert", "");
  root2.setAttribute("aria-hidden", "true");
  return { root: root2, pairs };
}
var alpha = (color) => {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color === "transparent" ? 0 : 1;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length > 3 ? parseFloat(parts[3]) : 1;
};
function backdropChain(glass, source) {
  const chain = [];
  if (glass.hasAttribute("data-lg-mirror-bare")) return chain;
  for (let node = glass.parentElement; node; node = node.parentElement) {
    if (node === source || source.contains(node)) continue;
    const cs = getComputedStyle(node);
    const image = cs.backgroundImage !== "none";
    const a = alpha(cs.backgroundColor);
    if (image || a > 0) chain.unshift(node);
    if (image || a >= 1 || node.classList.contains("lg-glass")) break;
  }
  return chain;
}
var stateOf = (el2) => Array.from(el2.attributes).map((a) => a.name).filter((name) => name.startsWith("data-") && name !== "data-mirror" && !name.startsWith("data-lg-mirror")).sort().join(" ");
var paints = (name) => !!name && name !== "style" && name !== "class" && name !== "tabindex" && !name.startsWith("data-") && !name.startsWith("aria-");
var BACKGROUND = ["background-color", "background-image", "background-size", "background-position", "background-repeat", "border-radius"];
var PLACEMENT = /* @__PURE__ */ new Set(["position", "left", "top", "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "width", "height", "max-width", "max-height", "min-width", "min-height", "scale", "translate", "transform-origin", "transform"]);
function syncStyle(original, copy, root2) {
  for (const name of Array.from(copy.style)) {
    if (root2 && PLACEMENT.has(name)) continue;
    if (!original.style.getPropertyValue(name)) copy.style.removeProperty(name);
  }
  for (const name of Array.from(original.style)) {
    if (root2 && PLACEMENT.has(name)) continue;
    const value = original.style.getPropertyValue(name);
    const priority = original.style.getPropertyPriority(name);
    if (copy.style.getPropertyValue(name) !== value || copy.style.getPropertyPriority(name) !== priority) {
      copy.style.setProperty(name, value, priority);
    }
  }
}
function mirrorBackdrop(glass, source, padding, zoom, active2 = () => true) {
  const layer = document.createElement("div");
  layer.className = "lg-mirror";
  layer.setAttribute("aria-hidden", "true");
  glass.setAttribute(SELF, "");
  glass.prepend(layer);
  const viewport = document.createElement("div");
  viewport.className = "lg-mirror__viewport";
  layer.append(viewport);
  const zoomer = document.createElement("div");
  zoomer.className = "lg-mirror__zoom";
  viewport.append(zoomer);
  let copy = clone(source);
  let under = [];
  const buildUnder = () => {
    under.forEach((u) => u.copy.remove());
    under = backdropChain(glass, source).map((original) => {
      const div = document.createElement("div");
      const cs = getComputedStyle(original);
      for (const name of BACKGROUND) div.style.setProperty(name, cs.getPropertyValue(name));
      div.style.position = "absolute";
      div.style.left = "0px";
      div.style.top = "0px";
      div.style.transformOrigin = "0 0";
      return { original, copy: div, placed: "" };
    });
    zoomer.prepend(...under.map((u) => u.copy));
  };
  zoomer.append(copy.root);
  buildUnder();
  let stopped = false;
  let frame2 = 0;
  let visible = true;
  let placed = "";
  let shown = true;
  let pad = 0;
  const place = (from, g, sgx, sgy) => {
    const sw = from.offsetWidth;
    const sh = from.offsetHeight;
    if (!sw || !sh) return null;
    const s = from.getBoundingClientRect();
    const kx = s.width / sw / sgx;
    const ky = s.height / sh / sgy;
    const px = (s.left - g.left) / sgx + pad;
    const py = (s.top - g.top) / sgy + pad;
    return { sw, sh, key: `${sw}|${sh}|${px.toFixed(2)}|${py.toFixed(2)}|${kx.toFixed(4)}|${ky.toFixed(4)}`, transform: `translate(${px}px, ${py}px) scale(${kx}, ${ky})` };
  };
  const align = () => {
    const nextPad = padding();
    if (nextPad !== pad) {
      pad = nextPad;
      viewport.style.inset = `${-pad}px`;
      under.forEach((u) => u.placed = "");
      placed = "";
    }
    const gw = glass.offsetWidth;
    const gh = glass.offsetHeight;
    if (!gw || !gh) return;
    const g = glass.getBoundingClientRect();
    const sgx = g.width / gw;
    const sgy = g.height / gh;
    for (const u of under) {
      const at2 = place(u.original, g, sgx, sgy);
      if (!at2 || at2.key === u.placed) continue;
      u.placed = at2.key;
      u.copy.style.width = `${at2.sw}px`;
      u.copy.style.height = `${at2.sh}px`;
      u.copy.style.transform = at2.transform;
    }
    const at = place(source, g, sgx, sgy);
    if (!at) return;
    const { sw, sh } = at;
    const next = at.key;
    if (next === placed) return;
    placed = next;
    const root2 = copy.root;
    root2.style.position = "absolute";
    root2.style.left = "0px";
    root2.style.top = "0px";
    root2.style.margin = "0px";
    root2.style.width = `${sw}px`;
    root2.style.height = `${sh}px`;
    root2.style.maxWidth = "none";
    root2.style.maxHeight = "none";
    root2.style.minWidth = "0px";
    root2.style.minHeight = "0px";
    root2.style.scale = "none";
    root2.style.translate = "none";
    root2.style.transformOrigin = "0 0";
    root2.style.transform = at.transform;
  };
  const sync = () => {
    for (const pair of copy.pairs) {
      const css = pair.original.style.cssText;
      const cls = pair.original.className.toString();
      if (css !== pair.css) {
        pair.css = css;
        syncStyle(pair.original, pair.copy, pair.copy === copy.root);
      }
      if (cls !== pair.cls) {
        pair.cls = cls;
        pair.copy.className = cls;
      }
    }
    const flags = stateOf(source);
    if (flags !== copyFlags) {
      const now = new Set(flags.split(" "));
      for (const name of copyFlags.split(" ")) if (name && !now.has(name)) copy.root.removeAttribute(name);
      for (const name of flags.split(" ")) if (name) copy.root.setAttribute(name, source.getAttribute(name) ?? "");
      copyFlags = flags;
    }
  };
  let copyFlags = "";
  let zoomed = "";
  const applyZoom = () => {
    const z = zoom();
    const value = Array.isArray(z) ? `scale(${z[0]}, ${z[1]})` : `scale(${z})`;
    if (value !== zoomed) zoomer.style.transform = zoomed = value;
  };
  const tick = () => {
    frame2 = 0;
    if (stopped) return;
    const on = visible && !document.hidden && active2();
    if (on !== shown) {
      shown = on;
      layer.style.visibility = on ? "" : "hidden";
    }
    if (!on) return;
    applyZoom();
    sync();
    align();
    frame2 = requestAnimationFrame(tick);
  };
  const wake2 = () => {
    if (!frame2 && !stopped) frame2 = requestAnimationFrame(tick);
  };
  wake2();
  let pending = 0;
  const recopy = () => {
    pending = 0;
    if (stopped) return;
    const next = clone(source);
    copy.root.replaceWith(next.root);
    copy = next;
    copyFlags = "";
    placed = "";
    buildUnder();
    align();
  };
  const mutations = new MutationObserver((records) => {
    if (records.every((r) => layer.contains(r.target) || r.target === layer || r.target === glass)) return;
    wake2();
    const structural = records.some((r) => !layer.contains(r.target) && (r.type !== "attributes" || paints(r.attributeName)));
    if (structural && !pending) pending = requestAnimationFrame(recopy);
    else if (!structural && !stopped && visible && !document.hidden && active2()) {
      applyZoom();
      sync();
      align();
    }
  });
  mutations.observe(source, { childList: true, characterData: true, attributes: true, subtree: true });
  const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    wake2();
  }) : null;
  io?.observe(glass);
  document.addEventListener("visibilitychange", wake2);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame2);
    cancelAnimationFrame(pending);
    mutations.disconnect();
    io?.disconnect();
    document.removeEventListener("visibilitychange", wake2);
    layer.remove();
    glass.removeAttribute(SELF);
  };
}

// src/engine/quality.ts
var started = false;
var pinned = "auto";
var probing = false;
var offscreen = null;
var root = () => document.documentElement;
function apply(level) {
  if (root().getAttribute("data-lg-quality") !== level) root().setAttribute("data-lg-quality", level);
}
function guess() {
  const nav = navigator;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) return "low";
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) return "low";
  return "high";
}
function probe() {
  if (probing || pinned !== "auto" || root().getAttribute("data-lg-quality") === "low") return;
  probing = true;
  const gaps = [];
  let last2 = 0;
  let frame2 = 0;
  const end = performance.now() + 2e3;
  const step2 = (now) => {
    if (last2) gaps.push(now - last2);
    last2 = now;
    if (now < end && gaps.length < 120) {
      frame2 = requestAnimationFrame(step2);
      return;
    }
    probing = false;
    if (gaps.length < 20 || pinned !== "auto") return;
    const slow = gaps.filter((gap) => gap > 26).length / gaps.length;
    if (slow > 0.2) apply("low");
  };
  frame2 = requestAnimationFrame(step2);
  void frame2;
}
function watchScroll() {
  let timer = 0;
  let probes = 0;
  const settle = () => {
    timer = 0;
    root().removeAttribute("data-lg-scrolling");
  };
  const onScroll = () => {
    if (!timer) {
      root().setAttribute("data-lg-scrolling", "");
      if (probes < 2) {
        probes++;
        probe();
      }
    } else {
      clearTimeout(timer);
    }
    timer = window.setTimeout(settle, 140);
  };
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
}
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  apply(pinned === "auto" ? guess() : pinned);
  watchScroll();
  if (typeof IntersectionObserver === "function") {
    offscreen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el2 = entry.target;
          if (entry.isIntersecting) el2.removeAttribute("data-lg-offscreen");
          else el2.setAttribute("data-lg-offscreen", "");
        }
      },
      // Turn back on a little before it scrolls into view.
      { rootMargin: "25% 0px" }
    );
  }
}
function governRefraction(element) {
  start();
  offscreen?.observe(element);
  return () => {
    offscreen?.unobserve(element);
    element.removeAttribute("data-lg-offscreen");
  };
}
function setGlassQuality(quality) {
  pinned = quality;
  if (typeof window === "undefined") return;
  if (!started) start();
  apply(quality === "auto" ? guess() : quality);
}

// src/engine/refraction.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var cache = /* @__PURE__ */ new Map();
function encode(canvas) {
  return new Promise((done) => {
    if (typeof canvas.toBlob !== "function" || typeof FileReader !== "function") return done(canvas.toDataURL());
    canvas.toBlob((blob) => {
      if (!blob) return done(canvas.toDataURL());
      const reader = new FileReader();
      reader.onload = () => done(reader.result);
      reader.onerror = () => done(canvas.toDataURL());
      reader.readAsDataURL(blob);
    });
  });
}
var defs = null;
var counter = 0;
function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const key in attrs) node.setAttribute(key, String(attrs[key]));
  return node;
}
function container() {
  if (defs?.isConnected) return defs;
  const root2 = el("svg", { width: 0, height: 0, "aria-hidden": "true", "data-liquid-glass-defs": "" });
  root2.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  defs = el("defs", {});
  root2.append(defs);
  document.body.append(root2);
  return defs;
}
function canRefractBackdrop() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Chrom(e|ium)\/|Edg\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
function filtersTearWhileMoving() {
  if (typeof navigator === "undefined" || typeof CSS === "undefined") return false;
  const ua = navigator.userAgent;
  const webkit = /AppleWebKit\//.test(ua) && !/Chrom(e|ium)\/|Edg\//.test(ua);
  return webkit && !CSS.supports("anchor-name", "--lg");
}
function bevelProfile(bezel, thickness, ior) {
  const N = 256;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = Math.max(2e-3, i / (N - 1));
    const q = 1 - t;
    const base = 1 - q ** 4;
    const height = base ** 0.25;
    const slope = q ** 3 / Math.max(1e-4, base ** 0.75);
    const incident = Math.atan(slope);
    const refracted = Math.asin(Math.sin(incident) / ior);
    out[i] = Math.tan(incident - refracted) * thickness * (0.35 + 0.65 * height);
  }
  return (distance) => {
    if (distance < 0 || distance >= bezel) return 0;
    const f = distance / bezel * (N - 1);
    const i = Math.floor(f);
    const a = out[i];
    const b = out[Math.min(i + 1, N - 1)];
    return a + (b - a) * (f - i);
  };
}
function fillPixels(image, r, g, b, a) {
  const word = new Uint32Array(new Uint8ClampedArray([r, g, b, a]).buffer)[0];
  new Uint32Array(image.data.buffer, image.data.byteOffset, image.data.length / 4).fill(word);
}
function bake(width, height, radius, shape, pad = 0, simple = false, fringe = false, box = false) {
  const W = width + pad * 2;
  const H = height + pad * 2;
  let density = Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, 2);
  while (W * H * density * density > 1e6 && density > 0.35) density *= 0.85;
  const cw = Math.max(1, Math.ceil(W * density));
  const ch = Math.max(1, Math.ceil(H * density));
  const lens = shape.kind === "lens";
  const shift = bevelProfile(shape.bezel, shape.thickness, shape.ior);
  const magnify = lens ? 1 - 1 / Math.max(0.5, shape.zoom) : 0;
  const direction = lens ? 1 : -1;
  const dx = new Float32Array(cw * ch);
  const dy = new Float32Array(cw * ch);
  const rimA = new Float32Array(cw * ch);
  const rimHue = new Float32Array(lens && shape.dispersion > 0 ? cw * ch : 0);
  const inside = new Float32Array(cw * ch);
  const zone = new Float32Array(lens && !simple ? cw * ch : 0);
  const outer = new Int32Array(cw * ch);
  let edges = 0;
  let max = 1e-4;
  let maxX = 1e-4;
  let maxY = 1e-4;
  const hw = width / 2;
  const hh = height / 2;
  const px1 = 1 / density;
  const edge = hh - shape.inset;
  const band = (py) => {
    if (!shape.inset) return 1;
    const t = clamp((Math.abs(py) - (edge - 2)) / 3, 0, 1);
    return 1 - t * t * (3 - 2 * t);
  };
  const flat = simple && magnify ? Infinity : Math.max(shape.bezel * 1.7, 5);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const px = (x + 0.5) * W / cw - W / 2;
      const py = (y + 0.5) * H / ch - H / 2;
      const qx = Math.abs(px) - (hw - radius);
      const qy = Math.abs(py) - (hh - radius);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const len = Math.hypot(ox, oy);
      const d = radius - (len + Math.min(Math.max(qx, qy), 0));
      if (d > flat) {
        inside[y * cw + x] = 1;
        continue;
      }
      outer[edges++] = y * cw + x;
      let nx;
      let ny;
      if (len > 0) {
        nx = ox / len * Math.sign(px);
        ny = oy / len * Math.sign(py);
      } else if (qx > qy) {
        nx = Math.sign(px);
        ny = 0;
      } else {
        nx = 0;
        ny = Math.sign(py);
      }
      const i = y * cw + x;
      const u = d / shape.bezel;
      const s = (lens && shape.stretch > 0 ? d >= 0 && u < 1 ? -shape.bezel * shape.stretch * 0.5 * (1 - u) ** 2 : 0 : shift(d) * direction) * shape.strength * band(py);
      let vx = nx * s;
      let vy = ny * s;
      if (simple && magnify) {
        vx -= px * magnify * band(py);
        vy -= py * magnify * band(py);
      }
      dx[i] = vx;
      dy[i] = vy;
      const m = Math.max(Math.abs(vx), Math.abs(vy));
      if (m > max) max = m;
      if (Math.abs(vx) > maxX) maxX = Math.abs(vx);
      if (Math.abs(vy) > maxY) maxY = Math.abs(vy);
      inside[i] = clamp(d / px1 + 0.5, 0, 1);
      zone[i] = (d <= 0 ? 1 : clamp(1 - d / Math.max(1, shape.bezel), 0, 1) ** 1.3) * band(py);
      if (d >= -px1) {
        const facing = -(nx + ny) * Math.SQRT1_2;
        const light = 0.22 + 0.78 * Math.abs(facing) ** 2.2 * (facing > 0 ? 1 : 0.62);
        const hair = Math.max(0.55, px1 * 0.75);
        const line = Math.exp(-(((d - hair) / hair) ** 2));
        const inner = Math.exp(-((d / (shape.bezel * 0.55)) ** 2)) * 0.14;
        const edgeAA = clamp(d / px1 + 1, 0, 1);
        rimA[i] = clamp((line * (lens ? 0.95 : 0.7) + inner) * light * edgeAA, 0, 1);
        rimHue[i] = Math.atan2(ny, nx);
      }
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const scale = box ? 2 * Math.max(maxX / W, maxY / H) : max * 2;
  const spanX = box ? scale * W / 2 : max;
  const spanY = box ? scale * H / 2 : max;
  const field = ctx.createImageData(cw, ch);
  fillPixels(field, 128, 128, 128, 255);
  for (let e = 0; e < edges; e++) {
    const i = outer[e];
    const o = i * 4;
    field.data[o] = Math.round(127.5 + dx[i] / spanX * 127.5);
    field.data[o + 1] = Math.round(127.5 + dy[i] / spanY * 127.5);
    field.data[o + 2] = 128;
    field.data[o + 3] = 255;
  }
  ctx.putImageData(field, 0, 0);
  const map = encode(canvas);
  const reach = Math.max(W, H) / 2;
  let zoomMap = Promise.resolve("");
  if (magnify && !simple) {
    const ramp = ctx.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const o = (y * cw + x) * 4;
        const px = (x + 0.5) * W / cw - W / 2;
        const py = (y + 0.5) * H / ch - H / 2;
        const k = band(py);
        ramp.data[o] = Math.round(127.5 - px / (box ? W / 2 : reach) * 127.5 * k);
        ramp.data[o + 1] = Math.round(127.5 - py / (box ? H / 2 : reach) * 127.5 * k);
        ramp.data[o + 2] = 128;
        ramp.data[o + 3] = 255;
      }
    }
    ctx.putImageData(ramp, 0, 0);
    zoomMap = encode(canvas);
  }
  const shine = ctx.createImageData(cw, ch);
  fillPixels(shine, 255, 255, 255, 0);
  for (let e = 0; e < edges; e++) {
    const i = outer[e];
    const o = i * 4;
    let r = 255;
    let g = 255;
    let b = 255;
    if (lens && shape.dispersion > 0) {
      const h = rimHue[i];
      const k = 0.14 * shape.dispersion;
      r = 255 * (1 - k + k * (0.5 + 0.5 * Math.cos(h)));
      g = 255 * (1 - k + k * (0.5 + 0.5 * Math.cos(h - 2.1)));
      b = 255 * (1 - k + k * (0.5 + 0.5 * Math.cos(h + 2.1)));
    }
    shine.data[o] = r;
    shine.data[o + 1] = g;
    shine.data[o + 2] = b;
    shine.data[o + 3] = Math.round(rimA[i] * 255);
  }
  ctx.putImageData(shine, 0, 0);
  const rim = encode(canvas);
  const shapeMask = ctx.createImageData(cw, ch);
  fillPixels(shapeMask, 255, 255, 255, 255);
  for (let e = 0; e < edges; e++) {
    const i = outer[e];
    const o = i * 4;
    shapeMask.data[o] = shapeMask.data[o + 1] = shapeMask.data[o + 2] = 255;
    shapeMask.data[o + 3] = Math.round(inside[i] * 255);
  }
  ctx.putImageData(shapeMask, 0, 0);
  const mask = encode(canvas);
  let smooth = Promise.resolve("");
  if (lens && !simple) {
    const soft = ctx.createImageData(cw, ch);
    fillPixels(soft, 255, 255, 255, 0);
    for (let e = 0; e < edges; e++) {
      const i = outer[e];
      const o = i * 4;
      soft.data[o] = soft.data[o + 1] = soft.data[o + 2] = 255;
      soft.data[o + 3] = Math.round(zone[i] * 255);
    }
    ctx.putImageData(soft, 0, 0);
    smooth = encode(canvas);
  }
  return Promise.all([map, zoomMap, rim, mask, smooth]).then(
    ([map2, zoomMap2, rim2, mask2, smooth2]) => assemble(W, H, box, magnify, reach, scale, shape, simple, fringe, map2, zoomMap2, rim2, mask2, smooth2)
  );
}
function assemble(W, H, box, magnify, reach, scale, shape, simple, fringe, map, zoomMap, rim, mask, smooth) {
  const id = `lg-refract-${++counter}`;
  const area = box ? { x: 0, y: 0, width: 1, height: 1 } : { x: 0, y: 0, width: W, height: H };
  const filter = el(
    "filter",
    box ? { id, filterUnits: "objectBoundingBox", primitiveUnits: "objectBoundingBox", x: 0, y: 0, width: 1, height: 1, "color-interpolation-filters": "sRGB" } : {
      id,
      // Generous region: the rim samples content from beyond the glass edge.
      x: -0.25,
      y: -0.25,
      width: 1.5,
      height: 1.5,
      "color-interpolation-filters": "sRGB"
    }
  );
  filter.append(el("feImage", { href: map, ...area, preserveAspectRatio: "none", result: "field" }));
  let source = "SourceGraphic";
  if (zoomMap) {
    filter.append(
      el("feImage", { href: zoomMap, ...area, preserveAspectRatio: "none", result: "zoom" }),
      el("feDisplacementMap", {
        in: "SourceGraphic",
        in2: "zoom",
        scale: box ? magnify : 2 * reach * magnify,
        xChannelSelector: "R",
        yChannelSelector: "G",
        result: "magnified"
      })
    );
    source = "magnified";
  }
  if (shape.dispersion > 0 && !simple && fringe) {
    const spread = (shape.stretch > 0 ? 0.12 : 0.3) * shape.dispersion;
    for (const [name, factor] of [["r", 1 + spread], ["g", 1], ["b", 1 - spread]]) {
      filter.append(
        el("feDisplacementMap", {
          in: source,
          in2: "field",
          scale: scale * factor,
          xChannelSelector: "R",
          yChannelSelector: "G",
          result: `${name}-ray`
        })
      );
    }
    filter.append(
      el("feComposite", { in: "r-ray", in2: "g-ray", operator: "out", result: "r-edge" }),
      el("feColorMatrix", { in: "r-edge", type: "matrix", values: "0.2 0 0 0 0.62  0 0.2 0 0 0.16  0 0 0.2 0 0.8  0 0 0 1 0", result: "warm" }),
      el("feComposite", { in: "b-ray", in2: "g-ray", operator: "out", result: "b-edge" }),
      el("feColorMatrix", { in: "b-edge", type: "matrix", values: "0.2 0 0 0 0.1  0 0.2 0 0 0.78  0 0 0.2 0 0.62  0 0 0 1 0", result: "cool" }),
      el("feMerge", {})
    );
    const merge = filter.lastElementChild;
    for (const name of ["warm", "cool", "g-ray"]) merge.append(el("feMergeNode", { in: name }));
    merge.setAttribute("result", "bent");
  } else if (shape.dispersion > 0 && !simple) {
    const spread = 0.16 * shape.dispersion;
    const channels = [
      ["r", 1 + spread, "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"],
      ["g", 1, "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"],
      ["b", 1 - spread, "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"]
    ];
    for (const [name, factor, matrix] of channels) {
      filter.append(
        el("feDisplacementMap", {
          in: source,
          in2: "field",
          scale: scale * factor,
          xChannelSelector: "R",
          yChannelSelector: "G",
          result: `${name}-ray`
        }),
        el("feColorMatrix", { in: `${name}-ray`, type: "matrix", values: matrix, result: name })
      );
    }
    filter.append(
      el("feComposite", { in: "r", in2: "g", operator: "arithmetic", k2: 1, k3: 1, result: "rg" }),
      el("feComposite", { in: "rg", in2: "b", operator: "arithmetic", k2: 1, k3: 1, result: "bent" })
    );
  } else {
    filter.append(
      el("feDisplacementMap", {
        in: source,
        in2: "field",
        scale,
        xChannelSelector: "R",
        yChannelSelector: "G",
        result: "bent"
      })
    );
  }
  let out = "bent";
  const soften = shape.stretch > 0 ? 1.1 : 0.65;
  if (smooth) {
    filter.append(
      // A stretched rim magnifies the pixel steps of whatever edge it smears,
      // so it gets a little more softening.
      el("feGaussianBlur", { in: "bent", stdDeviation: box ? `${soften / W} ${soften / H}` : soften, result: "bent-soft" }),
      el("feImage", { href: smooth, ...area, preserveAspectRatio: "none", result: "rim-zone" }),
      el("feComposite", { in: "bent-soft", in2: "rim-zone", operator: "in", result: "rim-soft" }),
      el("feComposite", { in: "bent", in2: "rim-zone", operator: "out", result: "core" }),
      el("feComposite", { in: "rim-soft", in2: "core", operator: "arithmetic", k2: 1, k3: 1, result: "smoothed" })
    );
    out = "smoothed";
  }
  filter.append(
    el("feImage", { href: mask, ...area, preserveAspectRatio: "none", result: "shape" }),
    el("feComposite", { in: out, in2: "shape", operator: "in" })
  );
  container().append(filter);
  return { filter: `url(#${id})`, rim: `url("${rim}")`, inner: `url("${mask}")` };
}
function resolve(shape, width, height) {
  const kind = shape.kind ?? "surface";
  const short = Math.min(width, height);
  const lens = kind === "lens";
  return {
    kind,
    bezel: shape.bezel ?? (lens ? short * 0.32 : clamp(short * 0.2, 5, 16)),
    thickness: shape.thickness ?? (lens ? short * 0.55 : clamp(short * 0.32, 8, 26)),
    ior: shape.ior ?? 1.5,
    zoom: shape.zoom ?? (lens ? 1.16 : 1),
    zoomX: shape.zoomX ?? shape.zoom ?? (lens ? 1.16 : 1),
    dispersion: shape.dispersion ?? (lens ? 1 : 0),
    strength: shape.strength ?? 1,
    inset: shape.inset ?? 0,
    stretch: shape.stretch ?? 0,
    copy: shape.copy ?? false,
    copyOnly: shape.copyOnly ?? false
  };
}
function glassFor(width, height, radius, shape = {}, pad = 0, simple = false, fringe = false, box = false) {
  const w = Math.round(width);
  const h = Math.round(height);
  const r = Math.min(w / 2, h / 2, Math.max(0, radius));
  const full = resolve(shape, w, h);
  const key = [w, h, Math.round(r * 2) / 2, full.kind, full.bezel.toFixed(1), full.thickness.toFixed(1), full.ior, full.zoom, full.dispersion, full.strength, full.inset, full.stretch, pad, simple, fringe, box].join("|");
  let baked = cache.get(key);
  if (!baked) {
    baked = bake(w, h, r, full, pad, simple, fringe, box);
    cache.set(key, baked);
  }
  return baked;
}
var soon = [];
var later = [];
var pumping = false;
var encoding = 0;
var settled = [];
var quiet = () => !soon.length && !later.length && !encoding;
function checkSettled() {
  if (!quiet()) return;
  const waiting = settled;
  settled = [];
  waiting.forEach((done) => done());
}
function whenBaked(timeout = 160) {
  return new Promise((resolve2) => {
    if (quiet()) return resolve2();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve2();
    };
    settled.push(finish);
    setTimeout(finish, timeout);
  });
}
function pump() {
  pumping = true;
  const run = (deadline) => {
    const end = performance.now() + 8;
    const left = () => deadline ? deadline.timeRemaining() > 4 : performance.now() < end;
    let ran = 0;
    while ((soon.length || later.length) && (ran === 0 || left())) {
      (soon.shift() ?? later.shift())();
      ran++;
    }
    if (soon.length || later.length) idle(run);
    else {
      pumping = false;
      checkSettled();
    }
  };
  idle(run);
}
function bakeSoon(job, urgent = true) {
  (urgent ? soon : later).push(job);
  if (!pumping) pump();
  return () => {
    for (const list of [soon, later]) {
      const at = list.indexOf(job);
      if (at >= 0) list.splice(at, 1);
    }
  };
}
function idle(callback) {
  if (typeof requestIdleCallback === "function") {
    const handle2 = requestIdleCallback(callback, { timeout: 120 });
    return () => cancelIdleCallback(handle2);
  }
  const handle = setTimeout(callback, 16);
  return () => clearTimeout(handle);
}
function cornerRadius(element, width, height) {
  const value = getComputedStyle(element).borderTopLeftRadius;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return value.endsWith("%") ? Math.min(width, height) * n / 100 : n;
}
function useRefraction(ref, shape = {}, enabled = true, mirror, mirrorActive) {
  const signature = JSON.stringify(shape);
  useEffect2(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const live = canRefractBackdrop() && !(shape.copy && mirror);
    let cancel;
    let filter = "";
    let pad = 0;
    let zoom = 1;
    let zoomX = 1;
    const chromium = canRefractBackdrop();
    const tears = filtersTearWhileMoving();
    const bendCopy = !!mirror && (shape.copy === "refract" || !chromium) && !tears;
    let copyFilter = "";
    const applyCopyFilter = () => {
      const viewport = element.querySelector(":scope > .lg-mirror > .lg-mirror__viewport");
      if (viewport && copyFilter) viewport.style.filter = copyFilter;
    };
    let fits = 0;
    let gone = false;
    const fit = () => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (!width || !height) return;
      const run = ++fits;
      const radius = cornerRadius(element, width, height);
      const mirrored = !live && !!mirror?.current;
      if (mirrored) {
        pad = Math.ceil(Math.min(width, height) * 0.45 + 6);
        ({ zoom, zoomX } = resolve(shape, width, height));
        if (tears) {
          zoom = Math.min(zoom, 1);
          zoomX = Math.min(zoomX, 1);
        }
      }
      const refractBackdrop = live || bendCopy && chromium && !shape.copyOnly;
      const none = Promise.resolve(null);
      encoding++;
      Promise.all([
        glassFor(width, height, radius, shape),
        // The copy is magnified by CSS; the filter only bends the rim and
        // fringes what it bends with colour.
        mirrored && bendCopy ? glassFor(width, height, radius, { ...shape, zoom: 1, zoomX: 1 }, pad, false, true, !chromium) : none,
        // Behind a bent copy the backdrop only carries the bar's glass and
        // edges: the copy already magnifies the content, so the backdrop isn't
        // zoomed (that pushed the bar's edge into a ring inside the lens) and
        // its rim bends gently, curling the bar's edge into thin arcs.
        refractBackdrop && !live ? glassFor(width, height, radius, { ...shape, zoom: 1, zoomX: 1, strength: (shape.strength ?? 1) * 0.45 }) : none
      ]).then(([baked, copy, behind]) => {
        if (run !== fits || gone) return;
        filter = baked.filter;
        if (mirrored) {
          element.style.setProperty("--lg-inner-mask", baked.inner);
          if (copy) {
            copyFilter = copy.filter;
            applyCopyFilter();
          }
        }
        if (refractBackdrop) {
          element.style.setProperty("--lg-refraction", live ? baked.filter : behind.filter);
          element.setAttribute("data-lg-refract", shape.kind ?? "surface");
        }
        element.style.setProperty("--lg-rim", baked.rim);
      }).finally(() => {
        encoding--;
        checkSettled();
      });
    };
    let seen = typeof IntersectionObserver !== "function";
    let queued = false;
    const job = () => {
      queued = false;
      fit();
    };
    const request = () => {
      cancel?.();
      queued = true;
      cancel = bakeSoon(job, seen);
    };
    const near = typeof IntersectionObserver === "function" ? new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        seen = true;
        near?.disconnect();
        request();
      },
      { rootMargin: "100% 0px" }
    ) : null;
    near?.observe(element);
    const observer = new ResizeObserver(() => {
      if (queued) return;
      cancel?.();
      const timer = setTimeout(request, 140);
      cancel = () => clearTimeout(timer);
    });
    observer.observe(element);
    request();
    const source = mirror?.current;
    const unmirror = !live && source ? mirrorBackdrop(element, source, () => pad, () => [zoomX, zoom], mirrorActive) : void 0;
    applyCopyFilter();
    const ungovern = governRefraction(element);
    return () => {
      gone = true;
      cancel?.();
      unmirror?.();
      ungovern();
      near?.disconnect();
      observer.disconnect();
      element.style.removeProperty("--lg-refraction");
      element.style.removeProperty("--lg-rim");
      element.removeAttribute("data-lg-refract");
    };
  }, [ref, signature, enabled, mirror]);
}

// src/engine/haptics.ts
var label = null;
var isIOS = () => typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function haptic() {
  if (typeof window === "undefined") return;
  if (!matchMedia("(pointer: coarse)").matches) return;
  try {
    if (typeof navigator.vibrate === "function" && !isIOS()) {
      navigator.vibrate(8);
      return;
    }
    if (!isIOS()) return;
    if (!label?.isConnected) {
      label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9px;top:-9px";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.append(input);
      document.body.append(label);
    }
    label.click();
  } catch {
  }
}

// src/components/GlassButton/GlassButton.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var GlassButton = React.forwardRef(
  ({
    intensity = 5,
    tint,
    shimmer = true,
    thickness = 1,
    size = "md",
    variant = "glass",
    destructive = false,
    icon,
    className,
    style,
    children,
    type = "button",
    href,
    target,
    rel,
    onPointerDown,
    ...rest
  }, forwardedRef) => {
    const ref = useRef(null);
    useImperativeHandle(forwardedRef, () => ref.current);
    const level = Math.max(1, Math.min(10, intensity));
    const height = size === "sm" ? 36 : size === "lg" ? 52 : 44;
    usePress(ref, { disabled: rest.disabled });
    useRefraction(ref, {
      kind: "surface",
      strength: level / 5,
      bezel: Math.min(height * 0.36, 22) * Math.max(0.5, thickness)
    });
    const iconOnly = icon != null && (children == null || children === false);
    const red = destructive || variant === "destructive";
    const kind = variant === "ghost" ? "clear" : variant === "default" || variant === "destructive" ? "glass" : variant;
    const classes = ["lg-glass", "lg-button", `lg-button--${size}`, `lg-button--${kind}`, className].filter(Boolean).join(" ");
    const Element = href != null ? "a" : "button";
    const link = href != null ? { href, target, rel: rel ?? (target === "_blank" ? "noopener noreferrer" : void 0), draggable: false } : { type };
    return /* @__PURE__ */ jsxs(
      Element,
      {
        ref,
        ...link,
        className: classes,
        "data-liquid-glass": "",
        "data-icon-only": iconOnly ? "" : void 0,
        "data-shimmer": shimmer ? "" : void 0,
        "data-destructive": red ? "" : void 0,
        style: tint ? { "--lg-tint": tint, ...style } : style,
        onPointerDown: (event) => {
          if (!rest.disabled) haptic();
          onPointerDown?.(event);
        },
        ...rest,
        children: [
          icon != null && /* @__PURE__ */ jsx("span", { className: "lg-button__icon", children: icon }),
          !iconOnly && children != null && /* @__PURE__ */ jsx("span", { className: "lg-button__label", children })
        ]
      }
    );
  }
);
GlassButton.displayName = "GlassButton";

// src/components/GlassCard/GlassCard.tsx
import React2, { useImperativeHandle as useImperativeHandle2, useRef as useRef2 } from "react";
import { jsx as jsx2 } from "react/jsx-runtime";
var GlassCard = React2.forwardRef(
  ({ intensity = 5, tint, shimmer: _shimmer, thickness = 1, padding = "24px", radius = "28px", variant = "regular", className, style, children, ...rest }, forwardedRef) => {
    const ref = useRef2(null);
    useImperativeHandle2(forwardedRef, () => ref.current);
    useRefraction(ref, {
      kind: "surface",
      strength: Math.max(1, Math.min(10, intensity)) / 5,
      bezel: 16 * Math.max(0.5, thickness),
      thickness: 22 * Math.max(0.5, thickness)
    });
    return /* @__PURE__ */ jsx2(
      "div",
      {
        ref,
        className: ["lg-glass", "lg-glass--host", "lg-card", `lg-card--${variant}`, className].filter(Boolean).join(" "),
        "data-liquid-glass": "",
        style: { padding, borderRadius: radius, ...tint ? { "--lg-host-tint": tint } : {}, ...style },
        ...rest,
        children
      }
    );
  }
);
GlassCard.displayName = "GlassCard";

// src/components/GlassInput/GlassInput.tsx
import React3, { useImperativeHandle as useImperativeHandle3, useRef as useRef3, useState } from "react";

// src/components/internal/Symbol.tsx
import { jsx as jsx3 } from "react/jsx-runtime";
function Symbol({ source, size = 24, className, style, ...props }) {
  const mask = `url("${source}")`;
  return /* @__PURE__ */ jsx3(
    "span",
    {
      "aria-hidden": "true",
      ...props,
      className: ["lg-symbol", className].filter(Boolean).join(" "),
      style: { "--lg-symbol-size": `${size}px`, WebkitMaskImage: mask, maskImage: mask, ...style }
    }
  );
}

// src/components/internal/inputSymbols.ts
var searchSymbol = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='black'%3E%3Cpath d='M232.49,215.51,185,168a92.12,92.12,0,1,0-17,17l47.53,47.54a12,12,0,0,0,17-17ZM44,112a68,68,0,1,1,68,68A68.07,68.07,0,0,1,44,112Z'/%3E%3C/svg%3E";
var clearSymbol = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='black'%3E%3Cpath d='M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm37.66,130.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32L139.31,128Z'/%3E%3C/svg%3E";

// src/components/GlassInput/GlassInput.tsx
import { jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
var Magnifier = /* @__PURE__ */ jsx4(Symbol, { source: searchSymbol, size: 20 });
var ClearGlyph = /* @__PURE__ */ jsx4(Symbol, { source: clearSymbol, size: 20 });
var GlassInput = React3.forwardRef(
  ({ intensity = 5, tint, label: label2, icon, trailing, onClear, className, style, value, onChange, type = "text", disabled, onFocus, onBlur, ...rest }, forwardedRef) => {
    const fieldRef = useRef3(null);
    const inputRef = useRef3(null);
    useImperativeHandle3(forwardedRef, () => inputRef.current);
    const [focused, setFocused] = useState(false);
    const [inner, setInner] = useState("");
    const current = value ?? inner;
    useRefraction(fieldRef, { kind: "surface", strength: Math.max(1, Math.min(10, intensity)) / 5 });
    usePress(fieldRef, { grow: 0.03, lean: 3, stretch: 0.03, disabled });
    const leading = icon ?? (type === "search" ? Magnifier : null);
    const clear = () => {
      if (onClear) onClear();
      else {
        const input = inputRef.current;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      inputRef.current?.focus();
    };
    return /* @__PURE__ */ jsxs2(
      "label",
      {
        className: ["lg-input", className].filter(Boolean).join(" "),
        "data-liquid-glass": "",
        style: tint ? { "--lg-input-tint": tint, ...style } : style,
        children: [
          label2 && /* @__PURE__ */ jsx4("span", { className: "lg-input__label", children: label2 }),
          /* @__PURE__ */ jsxs2("div", { ref: fieldRef, className: "lg-glass lg-input__field", "data-focused": focused ? "" : void 0, children: [
            leading && /* @__PURE__ */ jsx4("span", { className: "lg-input__icon", children: leading }),
            /* @__PURE__ */ jsx4(
              "input",
              {
                ref: inputRef,
                type,
                value: current,
                disabled,
                onChange: (event) => {
                  if (value === void 0) setInner(event.target.value);
                  onChange?.(event);
                },
                onFocus: (event) => {
                  setFocused(true);
                  onFocus?.(event);
                },
                onBlur: (event) => {
                  setFocused(false);
                  onBlur?.(event);
                },
                ...rest
              }
            ),
            current && !disabled ? /* @__PURE__ */ jsx4(
              "button",
              {
                type: "button",
                className: "lg-input__clear",
                "aria-label": "Clear",
                onPointerDown: (event) => event.preventDefault(),
                onClick: clear,
                children: ClearGlyph
              }
            ) : trailing && /* @__PURE__ */ jsx4("span", { className: "lg-input__icon lg-input__trailing", children: trailing })
          ] })
        ]
      }
    );
  }
);
GlassInput.displayName = "GlassInput";

// src/components/GlassSheet/GlassSheet.tsx
import { useEffect as useEffect3, useRef as useRef4, useState as useState2 } from "react";
import { createPortal } from "react-dom";
import { jsx as jsx5, jsxs as jsxs3 } from "react/jsx-runtime";
var OPEN = springFrom(0.42, 0.86);
var CLOSE = springFrom(0.34, 1);
var SNAP = springFrom(0.4, 0.84);
var GlassSheet = ({ open, onClose, intensity = 5, tint, container: container2, detents, children, "aria-label": ariaLabel }) => {
  const [mounted, setMounted] = useState2(open);
  const sheetRef = useRef4(null);
  const scrimRef = useRef4(null);
  const api = useRef4(null);
  const stopsKey = detents?.join(",") ?? "";
  const closeRef = useRef4(onClose);
  closeRef.current = onClose;
  useEffect3(() => {
    if (open) setMounted(true);
    else api.current?.close();
  }, [open]);
  useRefraction(sheetRef, { kind: "surface", strength: Math.max(1, Math.min(10, intensity)) / 5, bezel: 20, thickness: 28 }, mounted);
  useEffect3(() => {
    if (!mounted) return;
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    const layer = sheet.parentElement;
    const wanted = stopsKey ? stopsKey.split(",") : [];
    let height = 0;
    let hidden = 0;
    let stops = [0];
    let rest = 0;
    let medium = 0;
    const measure = () => {
      height = sheet.offsetHeight || 400;
      const top = sheet.offsetTop;
      hidden = layer.clientHeight - top + 24;
      medium = Math.max(0, layer.clientHeight * 0.5 - top);
      stops = wanted.length ? wanted.map((d) => d === "large" ? 0 : medium).sort((x, y) => x - y) : [0];
      rest = wanted.includes("medium") ? medium : stops[0];
    };
    measure();
    const paint = (y) => {
      sheet.style.transform = `translateY(${y}px)`;
      const dim = wanted.includes("medium") && medium > 0 ? clamp(1 - y / medium, 0, 1) : clamp(1 - y / Math.max(1, height), 0, 1);
      scrim.style.opacity = String(dim);
      const raised = y <= 1;
      if (wanted.length && sheet.hasAttribute("data-raised") !== raised) sheet.toggleAttribute("data-raised", raised);
    };
    let closing = false;
    const position = createSpring(hidden, OPEN, (y) => {
      paint(y);
      if (closing && y >= hidden - 1) setMounted(false);
    });
    const go = (y, feel) => {
      position.tune(feel);
      position.set(y);
    };
    api.current = {
      close() {
        closing = true;
        go(hidden, CLOSE);
      }
    };
    paint(hidden);
    let stale = false;
    let started2 = false;
    whenBaked().then(
      () => requestAnimationFrame(() => {
        if (stale || closing) return;
        started2 = true;
        measure();
        position.set(hidden, true);
        if (open) go(rest, OPEN);
      })
    );
    let gesture = null;
    const down = (event) => {
      if (event.defaultPrevented || closing) return;
      const target = event.target;
      const raised = position.value <= 1;
      if (raised && !target.closest(".lg-sheet__grabber-zone") && sheet.scrollTop > 0) return;
      if (target.closest('input, textarea, button, a, [role="slider"], [role="switch"]')) return;
      position.stop();
      gesture = { id: event.pointerId, y: event.clientY, from: position.value, t: event.timeStamp, v: 0, last: position.value };
      sheet.setPointerCapture(event.pointerId);
    };
    const move = (event) => {
      if (event.pointerId !== gesture?.id) return;
      const raw = gesture.from + event.clientY - gesture.y;
      const y = raw < 0 ? rubberband(raw, height, 0.3) : raw;
      const dt = Math.max(1, event.timeStamp - gesture.t);
      gesture.v = gesture.v * 0.2 + (y - gesture.last) / dt * 0.8;
      gesture.t = event.timeStamp;
      gesture.last = y;
      position.set(y, true);
      paint(y);
    };
    const up = (event) => {
      if (event.pointerId !== gesture?.id) return;
      const { v, last: last2 } = gesture;
      gesture = null;
      const projected = last2 + v * 180;
      const lowest = stops[stops.length - 1];
      if (projected > lowest + (hidden - lowest) * 0.45 || v > 0.9 && last2 >= lowest - 4) {
        closing = true;
        go(hidden, CLOSE);
        closeRef.current?.();
        return;
      }
      const target = stops.reduce((best, stop) => Math.abs(stop - projected) < Math.abs(best - projected) ? stop : best, stops[0]);
      go(target, SNAP);
    };
    const key = (event) => {
      if (event.key === "Escape") closeRef.current?.();
    };
    const resize = () => {
      if (!started2) return;
      const at = position.target;
      const was = stops.indexOf(at);
      measure();
      if (!closing) go(was >= 0 ? stops[Math.min(was, stops.length - 1)] : rest, SNAP);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(layer);
    sheet.addEventListener("pointerdown", down);
    sheet.addEventListener("pointermove", move);
    sheet.addEventListener("pointerup", up);
    sheet.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    if (!container2) document.body.style.overflow = "hidden";
    sheet.focus({ preventScroll: true });
    return () => {
      stale = true;
      position.stop();
      api.current = null;
      observer.disconnect();
      sheet.removeEventListener("pointerdown", down);
      sheet.removeEventListener("pointermove", move);
      sheet.removeEventListener("pointerup", up);
      sheet.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      if (!container2) document.body.style.overflow = overflow;
    };
  }, [mounted, container2, stopsKey]);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    /* @__PURE__ */ jsxs3("div", { className: "lg-sheet-layer", "data-liquid-glass": "", style: container2 ? { position: "absolute" } : void 0, children: [
      /* @__PURE__ */ jsx5("div", { ref: scrimRef, className: "lg-sheet__scrim", onClick: () => onClose?.(), "aria-hidden": "true" }),
      /* @__PURE__ */ jsxs3(
        "div",
        {
          ref: sheetRef,
          role: "dialog",
          "aria-modal": "true",
          "aria-label": ariaLabel,
          tabIndex: -1,
          className: ["lg-glass", "lg-glass--host", "lg-sheet", detents?.length ? "lg-sheet--detents" : ""].filter(Boolean).join(" "),
          style: tint ? { "--lg-host-tint": tint } : void 0,
          children: [
            /* @__PURE__ */ jsx5("div", { className: "lg-sheet__grabber-zone", "aria-hidden": "true", children: /* @__PURE__ */ jsx5("span", { className: "lg-sheet__grabber" }) }),
            /* @__PURE__ */ jsx5("div", { className: "lg-sheet__content", children })
          ]
        }
      )
    ] }),
    container2 ?? document.body
  );
};
GlassSheet.displayName = "GlassSheet";

// src/components/GlassMenu/GlassMenu.tsx
import { useEffect as useEffect4, useLayoutEffect, useRef as useRef5, useState as useState3 } from "react";
import { jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
var OPEN2 = springFrom(0.36, 0.74);
var CLOSE2 = springFrom(0.42, 0.66);
var FADE = springFrom(0.24, 1);
var FADE_OUT = springFrom(0.2, 1);
var Tick = () => /* @__PURE__ */ jsx6("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ jsx6("path", { d: "M3.5 8.5l3 3 6-7", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) });
var GlassMenu = ({
  icon,
  items,
  "aria-label": ariaLabel,
  align = "end",
  size = "md",
  width = 230,
  check,
  className
}) => {
  const [open, setOpen] = useState3(false);
  const [mounted, setMounted] = useState3(false);
  const anchorRef = useRef5(null);
  const triggerRef = useRef5(null);
  const surfaceRef = useRef5(null);
  const panelRef = useRef5(null);
  const contentRef = useRef5(null);
  const spring = useRef5(null);
  const itemsRef = useRef5(items);
  itemsRef.current = items;
  usePress(surfaceRef, { grow: 0.035, lean: 6, stretch: 0.1, disabled: !mounted });
  useEffect4(() => {
    if (open) {
      setMounted(true);
      if (spring.current) {
        spring.current.tune(OPEN2);
        spring.current.set(1);
      }
    } else if (spring.current) {
      spring.current.tune(CLOSE2);
      spring.current.set(0);
    }
  }, [open]);
  useLayoutEffect(() => {
    if (!mounted) return;
    const surface = surfaceRef.current;
    const panel = panelRef.current;
    const content = contentRef.current;
    const trigger = triggerRef.current;
    const w = trigger.offsetWidth;
    const h = trigger.offsetHeight;
    const W = Math.max(w, Math.min(width, window.innerWidth - 24));
    content.style.width = `${W}px`;
    const H = Math.max(h, content.offsetHeight);
    surface.style.width = `${W}px`;
    surface.style.height = `${H}px`;
    const end = align === "end";
    const box = { cw: w, ch: h, r: h / 2 };
    let scaleNow = 1;
    let closing = false;
    const clipContent = () => {
      const k = scaleNow;
      const right = Math.max(0, W - box.cw / k);
      const bottom = Math.max(0, H - box.ch / k);
      content.style.clipPath = box.cw >= W - 0.5 && box.ch >= H - 0.5 && k === 1 ? "" : `inset(0 ${end ? 0 : right}px ${bottom}px ${end ? right : 0}px round ${box.r / k}px)`;
    };
    const shape = (p) => {
      const cw = Math.max(1, w + (W - w) * p);
      const ch = Math.max(1, h + (H - h) * p);
      const sx = cw / W;
      const sy = ch / H;
      panel.style.transform = `scale(${sx}, ${sy})`;
      const land = clamp((p - 0.5) / 0.5, 0, 1);
      const r = Math.min(cw, ch) / 2 * (1 - land) + 24 * land;
      panel.style.borderRadius = `${r / sx}px / ${r / sy}px`;
      box.cw = cw;
      box.ch = ch;
      box.r = r;
      clipContent();
      const k = clamp(p / (closing ? 0.7 : 0.35), 0, 1);
      panel.style.opacity = String(closing ? Math.min(1, k * 1.4) : k);
      trigger.style.opacity = String(1 - k);
      trigger.style.scale = closing && p < -5e-4 ? `${1 - p * 0.6} ${1 + p * 1.2}` : "";
    };
    const reveal = (q) => {
      const t = clamp(q, 0, 1);
      const blur = 9 * (1 - t) ** 2.5;
      content.style.opacity = String(t);
      scaleNow = t < 0.999 ? 0.82 + 0.18 * t : 1;
      content.style.scale = scaleNow === 1 ? "" : String(scaleNow);
      clipContent();
      content.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
    };
    shape(0);
    reveal(0);
    const s = createSpring(0, OPEN2, (p, v) => {
      shape(p);
      if (s.target === 0 && p === 0 && v === 0) {
        trigger.style.opacity = "";
        trigger.style.scale = "";
        setMounted(false);
      }
    });
    const fade = createSpring(0, FADE, reveal);
    spring.current = {
      ...s,
      tune: s.tune,
      set(target, instant) {
        closing = target === 0;
        surface.style.pointerEvents = closing ? "none" : "";
        fade.tune(target ? FADE : FADE_OUT);
        fade.set(target, instant);
        s.set(target, instant);
      }
    };
    spring.current.set(1);
    content.querySelector('[role^="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
    return () => {
      s.stop();
      fade.stop();
      spring.current = null;
      trigger.style.opacity = "";
      trigger.style.scale = "";
    };
  }, [mounted]);
  useEffect4(() => {
    if (!mounted) return;
    const panel = surfaceRef.current;
    let held = null;
    let hot = null;
    const itemAt = (x, y) => document.elementFromPoint(x, y)?.closest(".lg-menu__item:not(:disabled)") ?? null;
    const light = (next) => {
      if (next === hot) return;
      hot?.removeAttribute("data-active");
      hot = next;
      if (hot) {
        hot.setAttribute("data-active", "");
        haptic();
      }
    };
    const down = (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      held = event.pointerId;
      hot = null;
      light(itemAt(event.clientX, event.clientY));
    };
    const move = (event) => {
      if (event.pointerId === held) light(itemAt(event.clientX, event.clientY));
    };
    const up = (event) => {
      if (event.pointerId !== held) return;
      held = null;
      const target = hot;
      light(null);
      const index = target ? Number(target.dataset.index) : -1;
      const item = itemsRef.current[index];
      if (item && !item.disabled) {
        event.preventDefault();
        haptic();
        item.onSelect?.();
        setOpen(false);
      }
    };
    const cancel = (event) => {
      if (event.pointerId !== held) return;
      held = null;
      light(null);
    };
    const hold = (event) => {
      if (held !== null && event.cancelable) event.preventDefault();
    };
    panel.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    panel.addEventListener("touchmove", hold, { passive: false });
    return () => {
      panel.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      panel.removeEventListener("touchmove", hold);
    };
  }, [mounted]);
  useEffect4(() => {
    if (!open) return;
    const outside = (event) => {
      if (!anchorRef.current?.contains(event.target)) setOpen(false);
    };
    const key = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  const select = (item) => {
    haptic();
    item.onSelect?.();
    setOpen(false);
  };
  return /* @__PURE__ */ jsxs4("span", { ref: anchorRef, className: ["lg-menu-anchor", className].filter(Boolean).join(" "), "data-align": align, children: [
    /* @__PURE__ */ jsx6(
      GlassButton,
      {
        ref: triggerRef,
        size,
        icon,
        "aria-label": ariaLabel,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        onClick: () => setOpen((value) => !value)
      }
    ),
    mounted && /* @__PURE__ */ jsxs4("div", { ref: surfaceRef, className: "lg-menu-surface", children: [
      /* @__PURE__ */ jsx6("div", { ref: panelRef, className: "lg-glass lg-menu", "data-liquid-glass": "", "aria-hidden": "true" }),
      /* @__PURE__ */ jsx6("div", { ref: contentRef, className: "lg-menu__content", role: "menu", "aria-label": ariaLabel, children: items.map((item, index) => /* @__PURE__ */ jsxs4(
        "button",
        {
          type: "button",
          role: item.checked === void 0 ? "menuitem" : "menuitemradio",
          "aria-checked": item.checked === void 0 ? void 0 : item.checked,
          className: "lg-menu__item",
          "data-destructive": item.destructive ? "" : void 0,
          "data-index": index,
          disabled: item.disabled,
          onClick: (event) => {
            if (event.detail === 0) select(item);
          },
          children: [
            item.icon != null && /* @__PURE__ */ jsx6("span", { className: "lg-menu__icon", children: item.icon }),
            /* @__PURE__ */ jsx6("span", { className: "lg-menu__label", children: item.label }),
            item.checked && /* @__PURE__ */ jsx6("span", { className: "lg-menu__check", children: check ?? /* @__PURE__ */ jsx6(Tick, {}) })
          ]
        },
        index
      )) })
    ] })
  ] });
};
GlassMenu.displayName = "GlassMenu";

// src/components/GlassNav/GlassNav.tsx
import React7 from "react";

// src/components/internal/LensTrack.tsx
import { useRef as useRef7 } from "react";

// src/engine/lensTrack.ts
import { useEffect as useEffect5, useRef as useRef6 } from "react";
var FOLLOW2 = springFrom(0.2, 0.82);
var WOBBLE = springFrom(0.3, 0.24);
var WOBBLE_REACH = 0.17;
function useLensTrack(refs, options) {
  const latest = useRef6(options);
  latest.current = options;
  const api = useRef6(null);
  useEffect5(() => {
    const bar = refs.bar.current;
    const lens = refs.lens.current;
    const glass = refs.glass.current;
    const select = refs.select.current;
    if (!bar || !lens || !glass || !select) return;
    const parent = bar.parentElement;
    const shell = parent?.classList.contains("lg-glass") && parent.childElementCount === 1 ? parent : bar;
    let slot = 0;
    let height = 0;
    let pad = 0;
    let padY = 0;
    let W = 0;
    let H = 0;
    const state = { x: 0, lift: 0, swell: 0, squash: 0, pull: 0 };
    let current = latest.current.index;
    let gesture = null;
    let dropTimer = 0;
    let suppressClick = false;
    const buttons = Array.from(bar.querySelectorAll(":scope > [data-lg-item]"));
    let glyphs = [];
    const preview = (index) => {
      if (index === void 0) delete bar.dataset.previewing;
      else bar.dataset.previewing = "";
      buttons.forEach((button, i) => button.toggleAttribute("data-lg-preview", i === index));
    };
    const measure = () => {
      const style = getComputedStyle(bar);
      pad = parseFloat(style.paddingLeft) || 0;
      padY = parseFloat(style.paddingTop) || 0;
      slot = (bar.clientWidth - pad - (parseFloat(style.paddingRight) || 0)) / latest.current.count;
      height = bar.clientHeight - padY - (parseFloat(style.paddingBottom) || 0);
      const { overhang, spread } = latest.current;
      H = Math.round(bar.offsetHeight + overhang);
      W = Math.round(Math.max(slot * (1 + spread), slot + H - height));
      lens.style.width = `${W}px`;
      lens.style.height = `${H}px`;
      lens.style.left = `${pad + (slot - W) / 2}px`;
      lens.style.top = `${padY + (height - H) / 2}px`;
      select.style.width = `${slot}px`;
      select.style.left = `${pad}px`;
      glyphs = buttons.flatMap(
        (button) => Array.from(button.querySelectorAll(".lg-nav__label, .lg-nav__icon")).map((box) => {
          const label2 = box.classList.contains("lg-nav__label");
          const node = label2 ? box : box.querySelector(":scope > .lg-symbol") ?? box;
          const host = box;
          const n = node.getBoundingClientRect();
          const h = host.getBoundingClientRect();
          return {
            node,
            x: button.offsetLeft + node.offsetLeft - pad,
            y: node.offsetTop,
            width: node.offsetWidth,
            height: node.offsetHeight,
            label: label2,
            host,
            dx: n.left - h.left,
            dy: n.top - h.top
          };
        })
      );
    };
    const paint = () => {
      const { swell: swell2, squash } = state;
      const x2 = state.x;
      const lift2 = clamp(state.lift, 0, 1.08);
      if (!W || !H) return;
      const kx = (slot + (W - slot) * lift2) / W * (1 + squash);
      const ky = (height + (H - height) * lift2) / H * (1 - squash * 0.6);
      const grow = 1 + latest.current.swell / Math.max(bar.offsetWidth, 1) * swell2;
      const pull2 = state.pull;
      const ey = Math.abs(pull2) / Math.max(bar.offsetHeight, 1);
      const transform = `translateX(${x2}px) scale(${kx}, ${ky})`;
      lens.style.transform = transform;
      select.style.transform = `translateX(${x2}px)`;
      lens.style.opacity = String(clamp(lift2 * 4, 0, 1));
      shell.style.scale = latest.current.pull === false ? `${grow} 1` : `${grow * (1 - ey * 0.15)} ${grow * (1 + ey * 0.5)}`;
      shell.style.translate = `0px ${pull2 / 2}px`;
      lens.style.setProperty("--lg-lift", String(clamp(lift2, 0, 1)));
      bar.style.setProperty("--lg-lift", String(clamp(lift2, 0, 1)));
      for (const glyph of glyphs) {
        if (lift2 <= 0.02 && !gesture) {
          glyph.node.style.removeProperty("--lg-content-tint");
          glyph.node.style.removeProperty("transform");
          glyph.host.style.removeProperty("--lg-content-hide");
          continue;
        }
        if (latest.current.copied) {
          const hy = H * ky / 2;
          const hx = H * kx / 2;
          const run = Math.max(0, (W - H) * kx / 2);
          const ccx = x2 + slot / 2 - glyph.x + glyph.dx;
          const ccy = height / 2 - glyph.y + glyph.dy;
          const fade = clamp(lift2 * 3, 0, 1);
          const solid = `rgb(0 0 0 / ${fade})`;
          glyph.host.style.setProperty("--lg-content-hide", [
            "linear-gradient(#000, #000)",
            `radial-gradient(ellipse ${hx}px ${hy}px at ${ccx - run}px ${ccy}px, ${solid} calc(100% - 1px), transparent 100%)`,
            `radial-gradient(ellipse ${hx}px ${hy}px at ${ccx + run}px ${ccy}px, ${solid} calc(100% - 1px), transparent 100%)`,
            `linear-gradient(${solid}, ${solid}) ${ccx - run}px ${ccy - hy}px / ${run * 2}px ${hy * 2}px no-repeat`
          ].join(", "));
        }
        const zoom = latest.current.contentZoom ?? 1;
        const ry = H * ky / (2 * zoom);
        const rx = H * kx / (2 * zoom);
        const straight = Math.max(0, (W - H) * kx / (2 * zoom));
        const dy = clamp(Math.abs(glyph.y + glyph.height / 2 - height / 2) / ry, 0, 1);
        const half = straight + rx * Math.sqrt(1 - dy * dy);
        const from = x2 + slot / 2 - half - glyph.x;
        const to = x2 + slot / 2 + half - glyph.x;
        const normal = "var(--lg-fg)";
        const active2 = "var(--lg-track-active, var(--lg-accent))";
        const coverage = clamp((Math.min(glyph.width, to) - Math.max(0, from)) / Math.max(1, glyph.width), 0, 1);
        const scale = 1 + clamp(lift2, 0, 1) * coverage * (glyph.label ? 0.035 : 0.08);
        const cx = (x2 + slot / 2 - glyph.x - glyph.width / 2) / scale + glyph.width / 2;
        const cy = (height / 2 - glyph.y - glyph.height / 2) / scale + glyph.height / 2;
        const left = cx - straight / scale;
        const right = cx + straight / scale;
        const radiusX = rx / scale;
        const radiusY = ry / scale;
        glyph.node.style.setProperty("--lg-content-tint", [
          `radial-gradient(ellipse ${radiusX}px ${radiusY}px at ${left}px ${cy}px, ${active2} calc(100% - 0.5px), transparent 100%)`,
          `radial-gradient(ellipse ${radiusX}px ${radiusY}px at ${right}px ${cy}px, ${active2} calc(100% - 0.5px), transparent 100%)`,
          `linear-gradient(${active2}, ${active2}) ${left}px ${cy - radiusY}px / ${right - left}px ${radiusY * 2}px no-repeat`,
          `linear-gradient(${normal}, ${normal})`
        ].join(", "));
        glyph.node.style.transform = `scale(${scale})`;
      }
      if (!gesture && lift2 < 0.02) delete bar.dataset.lifted;
    };
    let dragging = false;
    const jelly = createJelly((value) => {
      state.squash = value;
      paint();
    }, 0.13, 1600);
    const x = createSpring(current * slot, SPRINGS.snap, (value, velocity) => {
      state.x = value;
      jelly.feed(velocity, dragging ? WOBBLE_REACH : void 0);
      paint();
    });
    const lift = createSpring(0, SPRINGS.lift, (value) => {
      state.lift = value;
      paint();
    });
    const swell = createSpring(0, SPRINGS.press, (value) => {
      state.swell = value;
      paint();
    });
    const pullY = createSpring(0, SPRINGS.release, (value) => {
      state.pull = value;
      paint();
    });
    const pull = (dy) => {
      if (latest.current.pull === false) return;
      pullY.tune(FOLLOW2);
      pullY.set(rubberband(dy, Math.min(10, bar.offsetHeight * 0.2), 0.5));
    };
    const letGo = () => {
      pullY.tune(SPRINGS.release);
      pullY.set(0);
    };
    const place = (index, instant = false) => {
      current = index;
      if (!gesture) {
        x.tune(SPRINGS.snap);
        x.set(index * slot, instant);
      }
    };
    const position = (clientX) => {
      if (!gesture) return 0;
      const raw = gesture.anchor + (clientX - gesture.startX) * bar.offsetWidth / Math.max(1, gesture.box.width);
      const max = slot * (latest.current.count - 1);
      const give = Math.min(14, slot * 0.12);
      if (raw < 0) return rubberband(raw, give, 0.55);
      if (raw > max) return max + rubberband(raw - max, give, 0.55);
      return raw;
    };
    const light = (clientX, box) => {
      glass.style.setProperty("--lg-x", `${clamp((clientX - box.left) / box.width * 100, 0, 100)}%`);
      lens.style.setProperty("--lg-x", `${clamp((clientX - box.left - pad - state.x) / slot * 100, 0, 100)}%`);
    };
    const itemAt = (event) => {
      const target = event.target.closest("[data-lg-item]");
      return target && bar.contains(target) ? Number(target.dataset.lgItem) : -1;
    };
    const onDown = (event) => {
      delete bar.dataset.keyboard;
      if (!event.isPrimary || event.button !== 0 || gesture) return;
      const index = itemAt(event);
      if (index < 0) return;
      clearTimeout(dropTimer);
      measure();
      dragging = false;
      jelly.tune(SPRINGS.jelly);
      const box = bar.getBoundingClientRect();
      gesture = { id: event.pointerId, startX: event.clientX, startY: event.clientY, anchor: index * slot, moved: false, box, hovered: index, startedAt: performance.now() };
      suppressClick = false;
      bar.dataset.lifted = "";
      preview(index);
      lens.dataset.pressed = "";
      light(event.clientX, box);
      haptic();
      lift.tune(SPRINGS.lift);
      lift.set(1);
      swell.tune(SPRINGS.press);
      swell.set(1);
      x.tune(SPRINGS.snap);
      x.set(index * slot);
      paint();
    };
    const onMove = (event) => {
      if (event.pointerId !== gesture?.id) return;
      if (!gesture.moved && Math.abs(event.clientX - gesture.startX) > 5) {
        gesture.moved = true;
        try {
          bar.setPointerCapture(event.pointerId);
        } catch {
        }
      }
      light(event.clientX, gesture.box);
      pull(event.clientY - gesture.startY);
      if (!gesture.moved) return;
      const at = position(event.clientX);
      if (!dragging) {
        dragging = true;
        jelly.tune(WOBBLE);
      }
      x.tune(SPRINGS.drag);
      x.set(at);
      const hovered = clamp(Math.round(at / slot), 0, latest.current.count - 1);
      if (hovered !== gesture.hovered) {
        gesture.hovered = hovered;
        preview(hovered);
        haptic();
      }
    };
    const finish = (event, commit) => {
      if (event.pointerId !== gesture?.id) return;
      const { moved, box, startedAt } = gesture;
      const at = moved ? position(event.clientX) : gesture.anchor;
      const index = clamp(Math.round(at / slot), 0, latest.current.count - 1);
      gesture = null;
      preview();
      delete lens.dataset.pressed;
      if (bar.hasPointerCapture?.(event.pointerId)) bar.releasePointerCapture(event.pointerId);
      const inside = event.clientY >= box.top - 30 && event.clientY <= box.bottom + 30;
      const drop = () => {
        lift.tune(SPRINGS.settle);
        lift.set(0);
      };
      const hold = commit && !moved ? Math.max(0, 200 - (performance.now() - startedAt)) : 0;
      if (hold) dropTimer = window.setTimeout(drop, hold);
      else drop();
      swell.tune(SPRINGS.release);
      swell.set(0);
      letGo();
      x.tune(SPRINGS.snap);
      if (commit && (moved || inside)) {
        suppressClick = true;
        current = index;
        x.set(index * slot);
        if (index !== latest.current.index) latest.current.onSelect(index);
      } else {
        x.set(current * slot);
      }
    };
    const onUp = (event) => finish(event, true);
    const onCancel = (event) => finish(event, false);
    const onBlur = () => {
      clearTimeout(dropTimer);
      if (!gesture) {
        lift.tune(SPRINGS.settle);
        lift.set(0);
        return;
      }
      const id = gesture.id;
      gesture = null;
      preview();
      delete lens.dataset.pressed;
      if (bar.hasPointerCapture(id)) bar.releasePointerCapture(id);
      lift.tune(SPRINGS.settle);
      lift.set(0);
      swell.tune(SPRINGS.release);
      swell.set(0);
      letGo();
      x.tune(SPRINGS.snap);
      x.set(current * slot);
    };
    const onClick = (event) => {
      if (suppressClick && event.detail !== 0) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = event.target.closest("[data-lg-item]");
      if (!target) return;
      const index = Number(target.dataset.lgItem);
      if (index !== latest.current.index) latest.current.onSelect(index);
    };
    const onKey = (event) => {
      const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
      if (!keys.includes(event.key)) return;
      bar.dataset.keyboard = "";
      event.preventDefault();
      const { count, index } = latest.current;
      const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (index + (event.key === "ArrowRight" ? 1 : count - 1)) % count;
      latest.current.onSelect(next);
      bar.querySelector(`[data-lg-item="${next}"]`)?.focus();
    };
    const onTouchMove = (event) => {
      if (gesture && event.cancelable) event.preventDefault();
    };
    const observer = new ResizeObserver(() => {
      measure();
      if (!gesture) x.set(current * slot, true);
    });
    measure();
    x.set(current * slot, true);
    bar.dataset.ready = "";
    observer.observe(bar);
    const unguard = guardSelection(bar);
    bar.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);
    bar.addEventListener("click", onClick, true);
    bar.addEventListener("keydown", onKey);
    bar.addEventListener("touchmove", onTouchMove, { passive: false });
    api.current = { setIndex: place };
    return () => {
      clearTimeout(dropTimer);
      api.current = null;
      [x, lift, swell, pullY, jelly].forEach((s) => s.stop());
      shell.style.removeProperty("scale");
      shell.style.removeProperty("translate");
      unguard();
      observer.disconnect();
      bar.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onBlur);
      bar.removeEventListener("click", onClick, true);
      bar.removeEventListener("keydown", onKey);
      bar.removeEventListener("touchmove", onTouchMove);
      delete bar.dataset.ready;
      delete bar.dataset.lifted;
      preview();
      glyphs.forEach(({ node, host }) => {
        node.style.removeProperty("--lg-content-tint");
        node.style.removeProperty("transform");
        host.style.removeProperty("--lg-content-hide");
      });
    };
  }, [options.count]);
  useEffect5(() => {
    api.current?.setIndex(options.index);
  }, [options.index]);
}

// src/components/internal/LensTrack.tsx
import { jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
function LensTrack({
  items,
  labels,
  index,
  onChange,
  variant,
  intensity = 5,
  className,
  style,
  "aria-label": ariaLabel
}) {
  const bar = useRef7(null);
  const glass = useRef7(null);
  const lens = useRef7(null);
  const select = useRef7(null);
  const strength = Math.max(1, Math.min(10, intensity)) / 5;
  const tabbar = variant === "tabbar";
  const zoom = tabbar ? 1.04 : 1.1;
  useRefraction(glass, { kind: "surface", strength });
  const overhang = tabbar ? 14 : 12;
  useRefraction(
    lens,
    { kind: "lens", strength: 1, stretch: 1, bezel: tabbar ? 24 : 16, zoom, dispersion: 1, copy: "refract", copyOnly: true },
    true,
    bar,
    () => bar.current?.hasAttribute("data-lifted") ?? false
  );
  useLensTrack(
    { bar, glass, lens, select },
    {
      count: items.length,
      index,
      onSelect: (next) => onChange?.(next),
      overhang,
      spread: tabbar ? 0.3 : 0.16,
      contentZoom: zoom,
      copied: true,
      swell: tabbar ? 8 : 14,
      // Neither bar stretches or moves up and down.
      pull: false
    }
  );
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      ref: bar,
      role: "tablist",
      "aria-label": ariaLabel,
      className: ["lg-track", `lg-track--${variant}`, className].filter(Boolean).join(" "),
      "data-liquid-glass": "",
      style: { ...style, "--lg-count": items.length, "--lg-index": index },
      children: [
        /* @__PURE__ */ jsx7("span", { ref: glass, className: "lg-glass lg-track__glass", "aria-hidden": "true" }),
        /* @__PURE__ */ jsx7("span", { ref: select, className: "lg-track__select", "aria-hidden": "true" }),
        items.map((item, i) => /* @__PURE__ */ jsx7(
          "button",
          {
            type: "button",
            role: "tab",
            "data-lg-item": i,
            "aria-selected": i === index,
            "aria-label": labels[i],
            tabIndex: i === index ? 0 : -1,
            className: "lg-track__item",
            children: item
          },
          i
        )),
        /* @__PURE__ */ jsx7("span", { ref: lens, className: "lg-glass lg-track__lens", "data-lg-mirror-bare": "", "aria-hidden": "true" })
      ]
    }
  );
}

// src/components/GlassNav/GlassNav.tsx
import { jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
var GlassNav = ({
  items,
  activeIndex = 0,
  onChange,
  intensity = 5,
  showLabels = true,
  className,
  style,
  "aria-label": ariaLabel = "Tabs"
}) => {
  const hasIcons = items.some((item) => item.icon != null);
  const iconsOnly = hasIcons && !showLabels;
  return /* @__PURE__ */ jsx8(
    LensTrack,
    {
      variant: "tabbar",
      className: ["lg-nav", hasIcons ? "" : "lg-track--labels-only", iconsOnly ? "lg-track--icons-only" : "", className].filter(Boolean).join(" "),
      style,
      "aria-label": ariaLabel,
      intensity,
      index: activeIndex,
      onChange,
      labels: items.map((item) => item.label),
      items: items.map((item, i) => /* @__PURE__ */ jsxs6(React7.Fragment, { children: [
        item.icon != null && (item.activeIcon != null ? /* @__PURE__ */ jsxs6("span", { className: "lg-nav__icons", children: [
          /* @__PURE__ */ jsx8("span", { className: "lg-nav__icon lg-nav__icon--idle", children: item.icon }),
          /* @__PURE__ */ jsx8("span", { className: "lg-nav__icon lg-nav__icon--active", children: item.activeIcon })
        ] }) : /* @__PURE__ */ jsx8("span", { className: "lg-nav__icon", children: item.icon })),
        !iconsOnly && /* @__PURE__ */ jsx8("span", { className: "lg-nav__label", children: item.label })
      ] }, i))
    }
  );
};
GlassNav.displayName = "GlassNav";

// src/components/GlassSegmented/GlassSegmented.tsx
import React8 from "react";
import { jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
var GlassSegmented = ({
  options,
  value,
  onChange,
  size = "md",
  intensity = 5,
  className,
  style,
  "aria-label": ariaLabel
}) => {
  const normalized = options.map((option) => typeof option === "string" ? { label: option } : option);
  return /* @__PURE__ */ jsx9(
    LensTrack,
    {
      variant: "segmented",
      className: [size === "sm" ? "lg-track--sm" : "", className].filter(Boolean).join(" "),
      style,
      "aria-label": ariaLabel,
      intensity,
      index: value,
      onChange,
      labels: normalized.map((option) => option.label),
      items: normalized.map((option, i) => /* @__PURE__ */ jsxs7(React8.Fragment, { children: [
        option.icon != null && /* @__PURE__ */ jsx9("span", { className: "lg-nav__icon", children: option.icon }),
        /* @__PURE__ */ jsx9("span", { className: "lg-nav__label", children: option.label })
      ] }, i))
    }
  );
};
GlassSegmented.displayName = "GlassSegmented";

// src/components/GlassSlider/GlassSlider.tsx
import React9, { useEffect as useEffect6, useImperativeHandle as useImperativeHandle4, useRef as useRef8 } from "react";
import { jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
var GlassSlider = React9.forwardRef(
  ({
    value = 0,
    min = 0,
    max = 100,
    step: step2 = "any",
    intensity = 5,
    tint,
    shimmer: _shimmer,
    thickness: _thickness,
    showThumb = true,
    icon,
    label: label2,
    onChange,
    className,
    style,
    disabled,
    ...rest
  }, forwardedRef) => {
    const rootRef = useRef8(null);
    const inputRef = useRef8(null);
    const thumbRef = useRef8(null);
    const faceRef = useRef8(null);
    const blockRef = useRef8(null);
    const pastRef = useRef8(0);
    useImperativeHandle4(forwardedRef, () => inputRef.current);
    useEffect6(() => {
      const input2 = inputRef.current;
      const root2 = rootRef.current;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      let drag = null;
      const update = (clientX) => {
        if (!drag || max <= min) return;
        const raw = drag.from + (clientX - drag.x) / drag.travel;
        const fraction = clamp(raw, 0, 1);
        pastRef.current = (raw - fraction) * drag.travel;
        let next = min + fraction * (max - min);
        const increment = Number(step2);
        if (step2 !== "any" && Number.isFinite(increment) && increment > 0) {
          next = clamp(min + Math.round((next - min) / increment) * increment, min, max);
          next = Number(next.toFixed(10));
        }
        root2.style.setProperty("--lg-progress", String((next - min) / (max - min)));
        if (next === input2.valueAsNumber) return;
        setValue.call(input2, String(next));
        input2.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const down = (event) => {
        if (input2.disabled || !event.isPrimary || event.button !== 0 || drag) return;
        event.preventDefault();
        delete root2.dataset.keyboard;
        if (event.pointerType !== "touch") input2.focus({ preventScroll: true });
        const box = root2.getBoundingClientRect();
        const inset = showThumb ? 19 * box.width / root2.offsetWidth : 0;
        const from = max > min ? clamp((input2.valueAsNumber - min) / (max - min), 0, 1) : 0;
        drag = { id: event.pointerId, x: event.clientX, from, travel: Math.max(1, box.width - inset * 2) };
        pastRef.current = 0;
        root2.dataset.dragging = "";
        root2.setPointerCapture(event.pointerId);
      };
      const move = (event) => {
        if (event.pointerId !== drag?.id) return;
        event.preventDefault();
        update(event.clientX);
      };
      const release = () => {
        if (!drag) return;
        const id = drag.id;
        drag = null;
        pastRef.current = 0;
        delete root2.dataset.dragging;
        if (root2.hasPointerCapture(id)) root2.releasePointerCapture(id);
      };
      const up = (event) => {
        if (event.pointerId !== drag?.id) return;
        update(event.clientX);
        release();
      };
      const unguard = guardSelection(root2);
      root2.addEventListener("pointerdown", down);
      root2.addEventListener("pointermove", move);
      root2.addEventListener("pointerup", up);
      root2.addEventListener("pointercancel", release);
      root2.addEventListener("lostpointercapture", release);
      window.addEventListener("blur", release);
      return () => {
        release();
        unguard();
        root2.removeEventListener("pointerdown", down);
        root2.removeEventListener("pointermove", move);
        root2.removeEventListener("pointerup", up);
        root2.removeEventListener("pointercancel", release);
        root2.removeEventListener("lostpointercapture", release);
        window.removeEventListener("blur", release);
      };
    }, [min, max, step2, showThumb]);
    const strength = Math.max(1, Math.min(10, intensity)) / 5;
    const [mirrored, setMirrored] = React9.useState(false);
    useEffect6(() => setMirrored(!canRefractBackdrop()), []);
    const progress = max > min ? clamp((Number(value) - min) / (max - min), 0, 1) : 0;
    useRefraction(
      thumbRef,
      { kind: "lens", zoom: 1.95, bezel: 7, thickness: 16, strength, dispersion: 0.6, inset: 11 },
      showThumb,
      rootRef,
      () => parseFloat(rootRef.current?.style.getPropertyValue("--lg-lift") || "0") > 0.01
    );
    useRefraction(blockRef, { kind: "surface", strength }, !showThumb);
    useEffect6(() => {
      if (!showThumb) return;
      const input2 = inputRef.current;
      const thumb = thumbRef.current;
      const face = faceRef.current;
      const root2 = rootRef.current;
      const v = { lift: 0, stretch: 0, over: 0 };
      const paint = () => {
        const s = 0.655 + 0.345 * v.lift;
        const pull = Math.abs(v.over) / 58 * 0.6;
        thumb.style.scale = `${s * (1 + v.stretch + pull)} ${s * (1 - v.stretch * 0.5 - pull * 0.4)}`;
        face.style.opacity = String(1 - clamp(v.lift, 0, 1) * 0.92);
        root2.style.setProperty("--lg-lift", String(clamp(v.lift, 0, 1)));
        root2.style.setProperty("--lg-over", `${v.over.toFixed(2)}px`);
        if (v.lift < 0.01 && lift.target === 0) delete root2.dataset.lifted;
      };
      const lift = createSpring(0, SPRINGS.lift, (x) => {
        v.lift = x;
        paint();
      });
      const stretch = createSpring(0, SPRINGS.release, (x) => {
        v.stretch = x;
        paint();
      });
      const over = createSpring(0, SPRINGS.release, (x) => {
        v.over = x;
        paint();
      });
      paint();
      let lastX = 0;
      let lastT = 0;
      const down = (event) => {
        if (input2.disabled || !event.isPrimary || event.button !== 0) return;
        lastX = event.clientX;
        lastT = event.timeStamp;
        root2.dataset.lifted = "";
        lift.tune(SPRINGS.lift);
        lift.set(1);
        haptic();
      };
      const move = (event) => {
        if (lift.target !== 1) return;
        const dt = Math.max(1, event.timeStamp - lastT);
        const speed = Math.abs(event.clientX - lastX) / dt;
        lastX = event.clientX;
        lastT = event.timeStamp;
        stretch.tune(SPRINGS.drag);
        stretch.set(clamp(speed * 0.015, 0, 0.035));
        over.tune(SPRINGS.drag);
        over.set(rubberband(pastRef.current, 12, 0.5));
      };
      const up = () => {
        if (lift.target === 0) return;
        lift.tune(SPRINGS.settle);
        lift.set(0);
        stretch.tune(SPRINGS.release);
        stretch.set(0);
        over.tune(SPRINGS.release);
        over.set(0);
      };
      root2.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      root2.addEventListener("lostpointercapture", up);
      window.addEventListener("blur", up);
      return () => {
        lift.stop();
        stretch.stop();
        over.stop();
        root2.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        root2.removeEventListener("lostpointercapture", up);
        window.removeEventListener("blur", up);
        delete root2.dataset.lifted;
      };
    }, [showThumb]);
    useEffect6(() => {
      if (showThumb) return;
      const input2 = inputRef.current;
      const block = blockRef.current;
      const root2 = rootRef.current;
      const v = { swell: 0, over: 0 };
      const paint = () => {
        const w = block.offsetWidth || 1;
        const grow = 1 + 10 / Math.max(w, 1) * v.swell;
        const stretchX = 1 + Math.abs(v.over) / w;
        block.style.scale = `${grow * stretchX} ${grow * (1 - Math.abs(v.over) / w / 2)}`;
        block.style.translate = `${v.over / 2}px 0`;
      };
      const swell = createSpring(0, SPRINGS.press, (x) => {
        v.swell = x;
        paint();
      });
      const over = createSpring(0, SPRINGS.release, (x) => {
        v.over = x;
        paint();
      });
      let active2 = null;
      const down = (event) => {
        if (input2.disabled || !event.isPrimary || event.button !== 0) return;
        active2 = { id: event.pointerId };
        swell.tune(SPRINGS.press);
        swell.set(1);
        haptic();
      };
      const move = (event) => {
        if (event.pointerId !== active2?.id) return;
        over.tune(SPRINGS.drag);
        over.set(rubberband(pastRef.current, 26, 0.6));
      };
      const reset = () => {
        if (!active2) return;
        active2 = null;
        swell.tune(SPRINGS.release);
        swell.set(0);
        over.tune(SPRINGS.release);
        over.set(0);
      };
      const up = (event) => {
        if (event.pointerId === active2?.id) reset();
      };
      root2.addEventListener("pointerdown", down);
      root2.addEventListener("lostpointercapture", reset);
      window.addEventListener("blur", reset);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      return () => {
        swell.stop();
        over.stop();
        root2.removeEventListener("pointerdown", down);
        root2.removeEventListener("lostpointercapture", reset);
        window.removeEventListener("blur", reset);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
    }, [showThumb]);
    const input = /* @__PURE__ */ jsx10(
      "input",
      {
        ref: inputRef,
        type: "range",
        min,
        max,
        step: step2,
        value,
        disabled,
        "aria-label": rest["aria-label"] ?? label2,
        onChange: (event) => onChange?.(Number(event.currentTarget.value)),
        onKeyDown: () => rootRef.current?.setAttribute("data-keyboard", ""),
        onPointerDown: () => rootRef.current?.removeAttribute("data-keyboard"),
        className: "lg-slider__input",
        ...rest
      }
    );
    const vars = { "--lg-progress": progress, ...tint ? { "--lg-slider-fill": tint } : {}, ...style };
    if (!showThumb) {
      return /* @__PURE__ */ jsxs8(
        "div",
        {
          ref: rootRef,
          className: ["lg-slider", "lg-slider--block", className].filter(Boolean).join(" "),
          "data-liquid-glass": "",
          style: vars,
          children: [
            /* @__PURE__ */ jsxs8("div", { ref: blockRef, className: "lg-glass lg-slider__block", children: [
              /* @__PURE__ */ jsxs8("span", { className: "lg-slider__block-content", "aria-hidden": "true", children: [
                icon && /* @__PURE__ */ jsx10("span", { className: "lg-slider__icon", children: icon }),
                label2 && /* @__PURE__ */ jsx10("span", { className: "lg-slider__label", children: label2 }),
                /* @__PURE__ */ jsx10("span", { className: "lg-slider__value", children: Math.round(Number(value)) })
              ] }),
              /* @__PURE__ */ jsx10("span", { className: "lg-slider__block-fill", "aria-hidden": "true", children: /* @__PURE__ */ jsxs8("span", { className: "lg-slider__block-content lg-slider__block-content--lit", children: [
                icon && /* @__PURE__ */ jsx10("span", { className: "lg-slider__icon", children: icon }),
                label2 && /* @__PURE__ */ jsx10("span", { className: "lg-slider__label", children: label2 }),
                /* @__PURE__ */ jsx10("span", { className: "lg-slider__value", children: Math.round(Number(value)) })
              ] }) })
            ] }),
            input
          ]
        }
      );
    }
    return /* @__PURE__ */ jsxs8(
      "div",
      {
        ref: rootRef,
        className: ["lg-slider", className].filter(Boolean).join(" "),
        "data-liquid-glass": "",
        "data-mirror": mirrored ? "" : void 0,
        style: vars,
        children: [
          /* @__PURE__ */ jsx10("span", { className: "lg-slider__rail", "aria-hidden": "true", children: /* @__PURE__ */ jsx10("span", { className: "lg-slider__fill" }) }),
          /* @__PURE__ */ jsx10("span", { className: "lg-slider__thumb-slot", "aria-hidden": "true", children: /* @__PURE__ */ jsx10("span", { ref: thumbRef, className: "lg-glass lg-slider__thumb", "data-lg-mirror-bare": "", children: /* @__PURE__ */ jsx10("span", { ref: faceRef, className: "lg-slider__face" }) }) }),
          input
        ]
      }
    );
  }
);
GlassSlider.displayName = "GlassSlider";

// src/components/GlassSwitch/GlassSwitch.tsx
import React10, { useEffect as useEffect7, useImperativeHandle as useImperativeHandle5, useRef as useRef9, useState as useState4 } from "react";
import { jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
var SETTLE = springFrom(0.36, 0.68);
var TINT = springFrom(0.5, 1);
var REST = 0.655;
var TRAVEL = 22;
var GlassSwitch = React10.forwardRef(
  ({ checked: checkedProp, defaultChecked = false, onChange, tint, intensity = 5, className, style, disabled, ...rest }, forwardedRef) => {
    const ref = useRef9(null);
    const thumbRef = useRef9(null);
    const fillRef = useRef9(null);
    const faceRef = useRef9(null);
    useImperativeHandle5(forwardedRef, () => ref.current);
    const [inner, setInner] = useState4(defaultChecked);
    const controlled = checkedProp !== void 0;
    const checked = controlled ? checkedProp : inner;
    const latest = useRef9({ checked, set: (_) => {
    }, disabled });
    latest.current = {
      checked,
      disabled,
      set: (next) => {
        if (!controlled) setInner(next);
        onChange?.(next);
      }
    };
    const sync = useRef9(null);
    useRefraction(
      thumbRef,
      { kind: "lens", zoom: 0.72, zoomX: 1, dispersion: 0, stretch: 1, copy: "refract", strength: Math.max(1, Math.min(10, intensity)) / 5 },
      true,
      ref,
      () => parseFloat(ref.current?.style.getPropertyValue("--lg-lift") || "0") > 0.01
    );
    useEffect7(() => {
      const el2 = ref.current;
      const thumb = thumbRef.current;
      const fill = fillRef.current;
      const v = { x: checked ? 1 : 0, lift: 0, glass: 0, stretch: 0 };
      const paint = () => {
        const s = REST + (1 - REST) * v.lift;
        const sx = s * (1 + v.stretch);
        const sy = s * (1 - v.stretch * 0.5);
        thumb.style.transform = `translate(${v.x * TRAVEL}px, -50%) scale(${sx}, ${sy})`;
        const l = clamp(v.glass, 0, 1);
        el2.style.setProperty("--lg-knob-x", `${(21 + v.x * TRAVEL).toFixed(2)}px`);
        el2.style.setProperty("--lg-hole", `${(l > 0.01 ? 23 * sx : 0).toFixed(2)}px`);
        el2.style.setProperty("--lg-lift", String(l));
        el2.toggleAttribute("data-lifted", l > 0.01);
      };
      const jelly = createJelly((value) => {
        v.stretch = value;
        paint();
      }, 0.14, 5);
      const position = createSpring(v.x, SPRINGS.snap, (value, velocity) => {
        v.x = value;
        jelly.feed(velocity);
        paint();
      });
      const lift = createSpring(0, SPRINGS.lift, (value) => {
        v.lift = value;
        v.glass = lift.target ? value : Math.min(v.glass, value);
        paint();
      });
      const color = createSpring(checked ? 1 : 0, TINT, (value) => {
        fill.style.opacity = String(clamp(value, 0, 1));
      });
      fill.style.opacity = checked ? "1" : "0";
      paint();
      sync.current = (value) => {
        position.tune(SPRINGS.snap);
        position.set(value ? 1 : 0);
        color.set(value ? 1 : 0);
      };
      const flips = (from, raw) => from ? raw > 0.3 : raw > 0.7;
      let gesture = null;
      let dropTimer = 0;
      let ignoreClick = false;
      const drop = (delay) => {
        clearTimeout(dropTimer);
        dropTimer = window.setTimeout(() => {
          lift.tune(SETTLE);
          lift.set(0);
        }, delay);
      };
      const down = (event) => {
        el2.removeAttribute("data-keyboard");
        if (!event.isPrimary || event.button !== 0 || latest.current.disabled) return;
        clearTimeout(dropTimer);
        gesture = { id: event.pointerId, x: event.clientX, from: latest.current.checked ? 1 : 0, moved: false, at: performance.now() };
        try {
          el2.setPointerCapture(event.pointerId);
        } catch {
        }
        lift.tune(SPRINGS.lift);
        lift.set(1);
        haptic();
      };
      const move = (event) => {
        if (event.pointerId !== gesture?.id) return;
        const dx = event.clientX - gesture.x;
        if (!gesture.moved && Math.abs(dx) < 3) return;
        gesture.moved = true;
        const raw = gesture.from + dx / TRAVEL;
        const over = raw < 0 ? rubberband(raw * TRAVEL, TRAVEL, 0.6) / TRAVEL : raw > 1 ? 1 + rubberband((raw - 1) * TRAVEL, TRAVEL, 0.6) / TRAVEL : raw;
        position.tune(SPRINGS.drag);
        position.set(over);
        const on = flips(gesture.from, raw);
        if (color.target === 1 !== on) haptic();
        color.set(on ? 1 : 0);
      };
      const up = (event) => {
        if (event.pointerId !== gesture?.id) return;
        const { from, x, moved, at } = gesture;
        gesture = null;
        ignoreClick = true;
        const next = moved ? flips(from, from + (event.clientX - x) / TRAVEL) : !latest.current.checked;
        position.tune(SPRINGS.snap);
        position.set(next ? 1 : 0);
        color.set(next ? 1 : 0);
        if (next !== latest.current.checked) latest.current.set(next);
        drop(moved ? 0 : Math.max(0, 200 - (performance.now() - at)));
      };
      const cancel = (event) => {
        if (event.pointerId !== gesture?.id) return;
        gesture = null;
        sync.current?.(latest.current.checked);
        drop(0);
      };
      const click = (event) => {
        if (ignoreClick) {
          ignoreClick = false;
          return;
        }
        if (latest.current.disabled) return;
        event.preventDefault();
        const next = !latest.current.checked;
        lift.set(1);
        drop(220);
        latest.current.set(next);
        sync.current?.(next);
      };
      const unguard = guardSelection(el2);
      el2.addEventListener("pointerdown", down);
      el2.addEventListener("pointermove", move);
      el2.addEventListener("pointerup", up);
      el2.addEventListener("pointercancel", cancel);
      el2.addEventListener("click", click);
      return () => {
        clearTimeout(dropTimer);
        [position, lift, color, jelly].forEach((s) => s.stop());
        unguard();
        el2.removeEventListener("pointerdown", down);
        el2.removeEventListener("pointermove", move);
        el2.removeEventListener("pointerup", up);
        el2.removeEventListener("pointercancel", cancel);
        el2.removeEventListener("click", click);
      };
    }, []);
    useEffect7(() => {
      sync.current?.(checked);
    }, [checked]);
    return /* @__PURE__ */ jsxs9(
      "button",
      {
        ref,
        type: "button",
        role: "switch",
        "aria-checked": checked,
        disabled,
        className: ["lg-switch", className].filter(Boolean).join(" "),
        "data-liquid-glass": "",
        style: tint ? { "--lg-switch-on": tint, ...style } : style,
        ...rest,
        onKeyDown: (event) => {
          event.currentTarget.setAttribute("data-keyboard", "");
          rest.onKeyDown?.(event);
        },
        children: [
          /* @__PURE__ */ jsx11("span", { className: "lg-switch__track", "aria-hidden": "true" }),
          /* @__PURE__ */ jsx11("span", { ref: fillRef, className: "lg-switch__fill", "aria-hidden": "true" }),
          /* @__PURE__ */ jsx11("span", { ref: thumbRef, className: "lg-glass lg-switch__thumb", "aria-hidden": "true", children: /* @__PURE__ */ jsx11("span", { ref: faceRef, className: "lg-switch__face" }) })
        ]
      }
    );
  }
);
GlassSwitch.displayName = "GlassSwitch";

// src/filters/LiquidGlassFilter.tsx
import { createContext, useContext } from "react";
import { jsx as jsx12, jsxs as jsxs10 } from "react/jsx-runtime";
var GlassFilterContext = createContext(false);
function LiquidGlassFilter({ children }) {
  return /* @__PURE__ */ jsxs10(GlassFilterContext.Provider, { value: true, children: [
    /* @__PURE__ */ jsx12(GlassFilterSVG, {}),
    children
  ] });
}
function GlassFilterSVG() {
  return /* @__PURE__ */ jsx12(
    "svg",
    {
      width: "0",
      height: "0",
      style: { position: "absolute", pointerEvents: "none" },
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx12("defs", { children: Array.from({ length: 10 }, (_, i) => {
        const level = i + 1;
        const scale = level * 2;
        const freq1 = 0.012 + level * 1e-3;
        const freq2 = 0.01 + level * 8e-4;
        return /* @__PURE__ */ jsxs10(
          "filter",
          {
            id: `liquid-glass-refract-${level}`,
            x: "-10%",
            y: "-10%",
            width: "120%",
            height: "120%",
            colorInterpolationFilters: "sRGB",
            children: [
              /* @__PURE__ */ jsx12(
                "feTurbulence",
                {
                  type: "fractalNoise",
                  baseFrequency: `${freq1} ${freq2}`,
                  numOctaves: 3,
                  seed: 42,
                  result: "noise"
                }
              ),
              /* @__PURE__ */ jsx12(
                "feDisplacementMap",
                {
                  in: "SourceGraphic",
                  in2: "noise",
                  scale,
                  xChannelSelector: "R",
                  yChannelSelector: "G"
                }
              )
            ]
          },
          level
        );
      }) })
    }
  );
}

// src/hooks/useGlassEffect.ts
import { useMemo } from "react";
function parseTintColor(tint) {
  const defaults = { h: 0, s: 0, l: 100, a: 0.1 };
  if (!tint) return defaults;
  const rgbaMatch = tint.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]) / 255;
    const g = parseInt(rgbaMatch[2]) / 255;
    const b = parseInt(rgbaMatch[3]) / 255;
    const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100, a };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s: s * 100, l: l * 100, a };
  }
  const hexMatch = tint.match(/^#([\da-f]{3,8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100, a };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s: s * 100, l: l * 100, a };
  }
  return defaults;
}
function useGlassEffect(options = {}) {
  const {
    intensity = 5,
    tint,
    shimmer = true,
    thickness,
    blur
  } = options;
  return useMemo(() => {
    const clampedIntensity = Math.max(1, Math.min(10, Math.round(intensity)));
    const filterId = `liquid-glass-refract-${clampedIntensity}`;
    const style = {
      "--glass-intensity": clampedIntensity,
      "--glass-shimmer": shimmer ? 1 : 0
    };
    if (tint) {
      const parsed = parseTintColor(tint);
      style["--glass-tint-h"] = parsed.h;
      style["--glass-tint-s"] = `${parsed.s}%`;
      style["--glass-tint-l"] = `${parsed.l}%`;
      style["--glass-tint-a"] = parsed.a;
    }
    if (thickness !== void 0) {
      style["--glass-border-width"] = `${thickness}px`;
    }
    if (blur !== void 0) {
      style["--glass-blur"] = `${blur}px`;
    }
    return { style, filterId };
  }, [intensity, tint, shimmer, thickness, blur]);
}

// src/hooks/useGlassAnimation.ts
import { useCallback, useState as useState5 } from "react";
function useGlassAnimation() {
  const [isHovered, setIsHovered] = useState5(false);
  const [isPressed, setIsPressed] = useState5(false);
  const [isFocused, setIsFocused] = useState5(false);
  const handlers = {
    onPointerEnter: useCallback(() => setIsHovered(true), []),
    onPointerLeave: useCallback(() => {
      setIsHovered(false);
      setIsPressed(false);
    }, []),
    onPointerDown: useCallback(() => setIsPressed(true), []),
    onPointerUp: useCallback(() => setIsPressed(false), []),
    onFocus: useCallback(() => setIsFocused(true), []),
    onBlur: useCallback(() => setIsFocused(false), [])
  };
  return { isHovered, isPressed, isFocused, handlers };
}
export {
  GlassButton,
  GlassCard,
  GlassInput,
  GlassMenu,
  GlassNav,
  GlassSegmented,
  GlassSheet,
  GlassSlider,
  GlassSwitch,
  LiquidGlassFilter,
  SPRINGS,
  canRefractBackdrop,
  createSpring,
  haptic,
  setGlassQuality,
  springFrom,
  useGlassAnimation,
  useGlassEffect,
  usePress,
  useRefraction
};
//# sourceMappingURL=index.mjs.map