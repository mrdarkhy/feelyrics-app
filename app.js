// ── core state & helpers ──
const $ = (id) => document.getElementById(id);
// Safety net: if ANY runtime error occurs, never leave the intro stuck over the app.
window.addEventListener("error", () => {
  const i = document.getElementById("intro");
  if (i && !i.classList.contains("end")) { i.classList.add("end"); setTimeout(() => i.classList.add("gone"), 600); }
});
const app = $("app"), lane = $("lane"), stream = $("stream");
let song, lines, singable, transFirst, KEY;
let idx = -1, mode = "idle", t0 = 0, timings = null, timers = [], capture = [];
let pubFixes = {}, fixTarget = null, fixTags = new Set();

const b64u = {
  enc: (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};
function encodeSong(s) {
  const pkg = { v: 1, title: s.title, artist: s.artist, pair: s.pair, engine: s.engine,
    tLabel: s.tLabel, oLabel: s.oLabel, feel: s.feel || "", sections: s.sections };
  return "f1." + b64u.enc(pako.deflate(JSON.stringify(pkg)));
}
function decodeSong(frag) {
  const raw = frag.replace(/^.*#/, "").replace(/^f1\./, "");
  const pkg = JSON.parse(pako.inflate(b64u.dec(raw), { to: "string" }));
  if (!pkg.sections) throw new Error("bad pkg");
  const id = "link-" + (pkg.title + "-" + pkg.artist).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
  return { id, grp: "Opened from links", title: pkg.title, artist: pkg.artist, pair: pkg.pair || "?",
    engine: pkg.engine || "?", tLabel: pkg.tLabel || "translation first", oLabel: pkg.oLabel || "original first",
    transFirst: true, feel: pkg.feel || "", sections: pkg.sections };
}

// remember songs opened from links (this browser only; no server)
function loadSaved() {
  try { (JSON.parse(localStorage.getItem("fl-pub-songs") || "[]")).forEach((s) => {
    if (!SONGS.some((x) => x.id === s.id)) SONGS.push(s);
  }); } catch {}
}
function saveSong(s) {
  if (!SONGS.some((x) => x.id === s.id)) SONGS.push(s);
  try {
    const keep = SONGS.filter((x) => x.grp === "Opened from links");
    localStorage.setItem("fl-pub-songs", JSON.stringify(keep));
  } catch {}
}

// ── library: search + target/source filters ──
const LANGS = { ES: "Spanish", IT: "Italian", NAP: "Italian", FR: "French", EN: "English", DE: "German", TR: "Turkish", "PT-BR": "Portuguese" };
const SRC_ORDER = ["ES", "IT", "FR", "EN", "DE", "PT-BR", "TR"];
const TGT_ORDER = ["TR", "EN", "ES", "PT-BR"];
const INTO_LABEL = { TR: "Türkçe", EN: "English", ES: "Español", "PT-BR": "Português" };
const srcOf = (s) => { const c = (s.pair || "").split("→")[0]; return c === "NAP" ? "IT" : c; };
const tgtOf = (s) => (s.pair || "").split("→")[1] || "";
const groupOf = (s) => {
  if (s.grp === "Opened from links") return "Opened from links";
  if (s.id === "guantanamera-es-tr") return "Start here";
  return (LANGS[srcOf(s)] || srcOf(s)) + " → " + (LANGS[tgtOf(s)] || tgtOf(s));
};
let intoF = "ALL", fromF = "ALL", query = "";
function resetFilters() {
  intoF = "ALL"; fromF = "ALL"; query = "";
  const q = $("q"); if (q) q.value = "";
  renderFilters(); renderLibrary();
}
function renderFilters() {
  const box = $("f-into"); box.innerHTML = "";
  const present = [...new Set(SONGS.map(tgtOf))];
  const opts = [["ALL", "All"], ...TGT_ORDER.filter((c) => present.includes(c)).map((c) => [c, INTO_LABEL[c] || c])];
  opts.forEach(([code, label]) => {
    const b = document.createElement("button");
    b.className = "fchip" + (intoF === code ? " on" : "");
    b.textContent = label;
    b.addEventListener("click", () => { intoF = code; renderFilters(); renderLibrary(); });
    box.appendChild(b);
  });
  const sel = $("f-from");
  const srcs = [...new Set(SONGS.map(srcOf))];
  sel.innerHTML = "";
  [["ALL", "Any language"], ...SRC_ORDER.filter((c) => srcs.includes(c)).map((c) => [c, LANGS[c]])].forEach(([v, t]) => {
    const o = document.createElement("option"); o.value = v; o.textContent = t;
    if (v === fromF) o.selected = true;
    sel.appendChild(o);
  });
}
function renderLibrary() {
  const list = $("songlist"); list.innerHTML = "";
  const order = ["Start here"];
  TGT_ORDER.forEach((t) => SRC_ORDER.forEach((f) => order.push((LANGS[f]) + " → " + (LANGS[t]))));
  order.push("Opened from links");
  const q = query.trim().toLowerCase();
  const shown = SONGS.filter((s) => {
    if (s.grp === "Opened from links") { /* links stay visible unless searching */ }
    else {
      if (intoF !== "ALL" && tgtOf(s) !== intoF) return false;
      if (fromF !== "ALL" && srcOf(s) !== fromF) return false;
    }
    if (q && !(s.title + " " + s.artist).toLowerCase().includes(q)) return false;
    return true;
  });
  if (!shown.length) {
    const d = document.createElement("div");
    d.className = "grp"; d.textContent = "No songs match — try Request a song";
    list.appendChild(d); markLibrary(); return;
  }
  const sorted = [...shown].sort((a, b) => order.indexOf(groupOf(a)) - order.indexOf(groupOf(b)));
  let lastGrp = null;
  sorted.forEach((s) => {
    const g = groupOf(s);
    if (g !== lastGrp) {
      const h = document.createElement("div"); h.className = "grp"; h.textContent = g;
      list.appendChild(h); lastGrp = g;
    }
    const b = document.createElement("button");
    b.className = "song"; b.dataset.id = s.id;
    b.innerHTML = `<span class="tt"><b></b><span></span></span><span class="pair"></span>`;
    b.querySelector("b").textContent = s.title;
    b.querySelector(".tt span").textContent = s.artist;
    b.querySelector(".pair").textContent = s.pair;
    b.addEventListener("click", () => { loadSong(s.id); syncUrl(); app.classList.remove("libopen"); });
    list.appendChild(b);
  });
  markLibrary();
}
function markLibrary() {
  document.querySelectorAll(".song").forEach((b) => b.classList.toggle("on", song && b.dataset.id === song.id));
}

// ── song load / render ──
function loadSong(id) {
  clearTimers();
  song = SONGS.find((s) => s.id === id) || SONGS[0];
  transFirst = song.transFirst !== false;
  KEY = `fl-pub-t-${song.id}-${song.engine}`;
  lines = [];
  song.sections.forEach(([kind, arr]) => {
    lines.push({ header: kind });
    arr.forEach(([o, t, note]) => lines.push({ o, t, note }));
  });
  singable = lines.filter((l) => !l.header);
  singable.forEach((l, i) => (l.idx = i));
  try { pubFixes = JSON.parse(localStorage.getItem("fl-pub-fix-" + song.id) || "{}"); } catch { pubFixes = {}; }
  idx = -1; mode = "idle"; capture = [];
  $("t-title").textContent = song.title;
  $("t-sub").textContent = `${song.artist} · ${song.pair} · Feelyrics v${song.engine}`
    + (song.requestedBy ? ` · requested by ${song.requestedBy} ♥` : "");
  $("m-t").textContent = song.tLabel; $("m-o").textContent = song.oLabel;
  $("notice").innerHTML = song.feel
    ? `<b>Feel profile:</b> ${song.feel}`
    : `Feelyrics translates lyrics not word for word but into the <b>closest feeling</b> — the line notes explain each call (✎ notes).`;
  setSeg();
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null");
    timings = Array.isArray(v) && v.length === singable.length ? v : null; } catch { timings = null; }
  document.title = `${song.title} – ${song.artist} (${song.pair}) · Feelyrics`;
  render(); markLibrary();
  $("b-main").textContent = timings ? "Play synced" : "Start tap-sync";
  setStatus(timings
    ? "Timings are saved on this device. Start the track and hit <b>Play synced</b> at that exact moment."
    : "Read along while listening — or play the track and tap each line to sync it.");
}
function setSeg() { $("m-t").classList.toggle("on", transFirst); $("m-o").classList.toggle("on", !transFirst); }
function render() {
  lane.innerHTML = "";
  lines.forEach((l) => {
    if (l.header) {
      const h = document.createElement("div"); h.className = "kind"; h.textContent = l.header;
      lane.appendChild(h); l.el = null; return;
    }
    const d = document.createElement("div"); d.className = "ln";
    const fx = pubFixes[l.idx];
    if (fx) d.classList.add("fixed");
    d.innerHTML = `<div class="main"></div><div class="alt"></div>` + (l.note ? `<div class="note"></div>` : "") + `<div class="fixtag">✦ YOUR FIT · ${fx ? fx.tags.join(" · ") : ""}</div>`;
    const tt = fx ? fx.fit : l.t;
    d.querySelector(".main").textContent = transFirst ? tt : l.o;
    d.querySelector(".alt").textContent = transFirst ? l.o : tt;
    if (l.note) d.querySelector(".note").textContent = l.note;
    d.addEventListener("click", () => {
      if (app.classList.contains("fix")) return openFix(l);
      jumpTo(singable.indexOf(l));
    });
    l.el = d; lane.appendChild(d);
  });
  paint();
}

// ── transport (tap-sync + synced replay; this device only) ──
function paint() {
  singable.forEach((l, i) => { l.el.classList.toggle("now", i === idx); l.el.classList.toggle("done", i < idx); });
  app.classList.toggle("still", idx < 0 && mode === "idle");
  $("prog").style.width = (idx < 0 ? 0 : ((idx + 1) / singable.length) * 100) + "%";
  if (idx >= 0 && singable[idx].el) singable[idx].el.scrollIntoView({ block: "center", behavior: "smooth" });
}
function setStatus(html) { $("status").innerHTML = html; }
function advance() {
  if (mode !== "tap") return;
  if (idx >= singable.length - 1) return finishTap();
  idx++; capture[idx] = performance.now() - t0; paint();
  if (idx === singable.length - 1) finishTap();
}
function jumpTo(i) {
  if (mode === "tap") { idx = i; capture[idx] = performance.now() - t0; paint(); if (idx === singable.length - 1) finishTap(); }
  else { idx = i; paint(); }
}
function startTap() {
  clearTimers(); capture = new Array(singable.length).fill(null);
  mode = "tap"; idx = -1; t0 = performance.now(); paint();
  setStatus("<b>Tap-sync on.</b> Tap (or press space) as each line is sung.");
  $("b-main").textContent = "Finish"; stream.focus();
}
function finishTap() {
  mode = "idle";
  const got = capture.filter((x) => x != null).length;
  if (got >= singable.length * 0.9) {
    for (let i = 0; i < capture.length; i++) if (capture[i] == null) capture[i] = i ? capture[i - 1] + 2400 : 0;
    timings = capture;
    try { localStorage.setItem(KEY, JSON.stringify(timings)); } catch {}
    setStatus("<b>Timings captured</b> (stored on this device). Rewind the track and hit Play synced.");
  } else setStatus(`Captured ${got}/${singable.length} lines — run tap-sync again for a full take.`);
  $("b-main").textContent = timings ? "Play synced" : "Start tap-sync";
}
function startReplay() {
  clearTimers(); mode = "replay"; idx = -1; paint();
  setStatus("<b>Synced.</b> You should have pressed play right as the track started.");
  timings.forEach((t, i) => timers.push(setTimeout(() => { idx = i; paint(); if (i === timings.length - 1) endReplay(); }, t)));
}
function endReplay() { mode = "idle"; setStatus('Done <span class="hrt">♥</span> Replay it, or tighten the timing with another tap-sync.'); }
function clearTimers() { timers.forEach(clearTimeout); timers = []; }

// ── deep links (D13): #s=<song-id> opens a library song ──
// Static pages /songs/<id>.html link here as ../#s=<id>, so a visitor arriving
// from search lands on the exact song instead of the default one.
const songIdFromHash = (h) => { const m = /^#s=([A-Za-z0-9_-]+)$/.exec(h || ""); return m ? m[1] : null; };
function syncUrl() {
  if (!song || song.grp === "Opened from links") return; // personal #f1 links keep their own hash
  const h = "#s=" + song.id;
  if (location.hash !== h) { try { history.replaceState(null, "", h); } catch {} }
}
function openFromHash(h) {
  const id = songIdFromHash(h);
  if (!id) return h && h.length > 4 ? openFromText(h) : false;
  if (song && song.id === id) return true;
  resetFilters();
  if (SONGS.some((s) => s.id === id)) { loadSong(id); return true; }
  loadSong(SONGS[0].id);
  setStatus('That song isn\'t in the library yet — <b>＋ Request a song</b> and we\'ll feel-translate it.');
  return true;
}

// ── share / open ──
function openFromText(txt) {
  try {
    const s = decodeSong(txt.trim());
    saveSong(s); resetFilters(); loadSong(s.id);
    setStatus("<b>Song opened from the link</b> and added to this device's library.");
    return true;
  } catch { return false; }
}
$("b-share").addEventListener("click", () => {
  const base = location.href.split("#")[0];
  $("share-text").value = base + "#" + encodeSong(song);
  $("share-msg").textContent = "";
  $("sharesheet").classList.add("open");
});
$("share-copy").addEventListener("click", async () => {
  const t = $("share-text"); t.select();
  let ok = false;
  try { await navigator.clipboard.writeText(t.value); ok = true; } catch {
    try { ok = document.execCommand("copy"); } catch {}
  }
  $("share-msg").textContent = ok ? "Copied." : "Couldn't copy — select the text and copy it manually.";
});
$("b-open").addEventListener("click", () => { app.classList.remove("libopen"); $("open-text").value = ""; $("opensheet").classList.add("open"); });
$("open-go").addEventListener("click", () => {
  if (openFromText($("open-text").value)) $("opensheet").classList.remove("open");
  else { $("open-text").style.outline = "1px solid var(--ember)"; setTimeout(() => ($("open-text").style.outline = ""), 900); }
});
$("b-req").addEventListener("click", () => { app.classList.remove("libopen"); $("reqsheet").classList.add("open"); });
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest(".sheet").classList.remove("open")));

// ── controls ──
$("b-main").addEventListener("click", () => {
  if (mode === "tap") return finishTap();
  if (mode === "replay") { clearTimers(); return endReplay(); }
  timings ? startReplay() : startTap();
});
$("b-reset").addEventListener("click", () => {
  clearTimers(); mode = "idle"; idx = -1; timings = null; capture = [];
  try { localStorage.removeItem(KEY); } catch {}
  paint(); $("b-main").textContent = "Start tap-sync";
  setStatus("Reset. Play the track and tap on each line.");
});
$("m-t").addEventListener("click", () => { transFirst = true; setSeg(); render(); });
$("m-o").addEventListener("click", () => { transFirst = false; setSeg(); render(); });
$("b-notes").addEventListener("click", () => { app.classList.toggle("notes"); $("b-notes").classList.toggle("on"); });
$("b-lib").addEventListener("click", () => app.classList.toggle("libopen"));
$("scrim").addEventListener("click", () => app.classList.remove("libopen"));
document.addEventListener("keydown", (e) => {
  if (e.code === "Escape") document.querySelectorAll(".sheet.open").forEach((s) => s.classList.remove("open"));
  const sheetOpen = !!document.querySelector(".sheet.open");
  if (e.code === "Space" && !sheetOpen && !["TEXTAREA", "INPUT"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    mode === "tap" ? advance() : (mode === "idle" && timings ? startReplay() : startTap());
  }
});
stream.addEventListener("click", (e) => { if (mode === "tap" && !e.target.closest(".ln")) advance(); });

// ── feel card: one-tap 1080×1920 card from the current song (canvas) ──
const CARD_URL = "mrdarkhy.github.io/feelyrics";
function cardAccent() { return (song.pair || "").endsWith("TR") ? "#b7c56b" : "#E5A943"; }
function cardLine() {
  const l = (idx >= 0 && singable[idx]) ? singable[idx] : singable.find((x) => x.note) || singable[0];
  const m = (l.note || "").match(/\[([^\]]+)\]\s*$/);
  const tags = m ? m[1].split("·").map((t) => t.trim()).slice(0, 2) : [];
  let why = (l.note || "").replace(/\[([^\]]+)\]\s*$/, "").trim();
  const cut = why.indexOf(". ");
  if (cut > 30) why = why.slice(0, cut + 1);
  if (why.length > 150) why = why.slice(0, 147) + "…";
  return { o: l.o, t: fitLineText(l), why, tags };
}
function fitLineText(l) { const f = pubFixes[l.idx]; return f ? f.fit : l.t; }
function wrapText(ctx, text, x, y, maxW, lh, maxLines) {
  const words = text.split(" "); let line = "", n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (++n === maxLines) { ctx.fillText(line.replace(/.{3}$/, "…"), x, y); return y + lh; }
      ctx.fillText(line, x, y); y += lh; line = words[i];
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}
function chip(ctx, text, x, y, color, dashed) {
  ctx.font = "600 26px 'Instrument Sans',sans-serif";
  const w = ctx.measureText(text).width + 56, h = 62;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 3;
  if (dashed) ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 31); ctx.stroke();
  ctx.fillStyle = color; ctx.textBaseline = "middle";
  ctx.fillText(text, x + 28, y + h / 2 + 2);
  ctx.restore();
  return w;
}
const LOGO_IMG = new Image();
LOGO_IMG.src = document.querySelector(".brand .cover img").src;
function drawLogo(ctx, x, y, w) {
  const h = w * (LOGO_IMG.naturalHeight / (LOGO_IMG.naturalWidth || 1)) || w * 0.48;
  try { ctx.drawImage(LOGO_IMG, x, y - h * 0.18, w, h); } catch {}
}
async function makeCard() {
  try { await document.fonts.load("800 92px 'Bricolage Grotesque'"); await document.fonts.ready; } catch {}
  const d = cardLine(), ac = cardAccent();
  const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1920;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#0B1511"; ctx.fillRect(0, 0, 1080, 1920);
  // light grain
  ctx.globalAlpha = .05;
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = Math.random() > .5 ? "#E8E5D5" : "#000"; ctx.fillRect(Math.random() * 1080, Math.random() * 1920, 1.4, 1.4); }
  ctx.globalAlpha = 1;
  // header row
  drawLogo(ctx, 96, 150, 96);
  ctx.fillStyle = "#E8E5D5"; ctx.textBaseline = "alphabetic";
  ctx.font = "700 44px 'Quicksand','Instrument Sans',sans-serif"; ctx.fillText("feelyrics", 216, 214);
  ctx.font = "600 26px 'Instrument Sans',sans-serif";
  const pw = ctx.measureText(song.pair).width + 56;
  ctx.strokeStyle = ac; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(1080 - 96 - pw, 150, pw, 62, 31); ctx.stroke();
  ctx.fillStyle = ac; ctx.textBaseline = "middle"; ctx.fillText(song.pair, 1080 - 96 - pw + 28, 183);
  ctx.textBaseline = "alphabetic";
  // middle flow
  let y = 560; const X = 96, MW = 888;
  ctx.fillStyle = "#9B9B70"; ctx.font = "600 26px 'Instrument Sans',sans-serif";
  try { ctx.letterSpacing = "6px"; } catch {}
  ctx.fillText((song.artist + " — " + song.title).toUpperCase(), X, y);
  try { ctx.letterSpacing = "0px"; } catch {}
  y += 76;
  ctx.fillStyle = "rgba(232,229,213,.62)"; ctx.font = "italic 400 46px 'Instrument Sans',sans-serif";
  y = wrapText(ctx, "“" + d.o + "”", X, y, MW, 62, 2) + 40;
  ctx.fillStyle = "#E8E5D5"; ctx.font = "800 92px 'Bricolage Grotesque','Instrument Sans',sans-serif";
  y = wrapText(ctx, d.t, X, y, MW, 103, 4) + 26;
  ctx.fillStyle = ac; ctx.fillRect(X, y, 120, 6); y += 66;
  if (d.why) {
    ctx.fillStyle = "#9B9B70"; ctx.font = "italic 400 39px 'Instrument Sans',sans-serif";
    y = wrapText(ctx, d.why, X, y, MW, 57, 4) + 44;
  }
  let cx = X;
  d.tags.forEach((t) => { cx += chip(ctx, t, cx, y, ac, false) + 16; });
  // bottom block
  ctx.textBaseline = "alphabetic";
  chip(ctx, song.pair.endsWith("TR") ? "AI taslak — insan his onayı bekliyor" : "AI draft — human feel-check pending", X, 1560, "rgba(232,229,213,.5)", true);
  ctx.strokeStyle = "rgba(232,229,213,.14)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(X, 1682); ctx.lineTo(984, 1682); ctx.stroke();
  ctx.fillStyle = "#E8E5D5"; ctx.font = "700 40px 'Bricolage Grotesque','Instrument Sans',sans-serif";
  ctx.fillText(song.pair.endsWith("TR") ? "Sen bu satırı nasıl oturturdun?" : "How would you land this line?", X, 1748);
  ctx.fillStyle = ac; ctx.font = "600 28px 'Instrument Sans',sans-serif";
  ctx.fillText(CARD_URL, 1080 - 96 - ctx.measureText(CARD_URL).width, 1748);
  ctx.fillStyle = "rgba(232,229,213,.35)"; ctx.font = "600 22px 'Instrument Sans',sans-serif";
  try { ctx.letterSpacing = "5px"; } catch {}
  ctx.fillText("SAME MUSIC. A DEEPER STORY.", X, 1848);
  try { ctx.letterSpacing = "0px"; } catch {}
  return cv;
}
$("b-card").addEventListener("click", async () => {
  setStatus("Making the card…");
  const cv = await makeCard();
  cv.toBlob((blob) => {
    if (!blob) return setStatus("Couldn't render the card on this device.");
    if (location.hostname.endsWith("github.io") || location.protocol === "file:") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "feelyrics-card-" + song.id + ".png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setStatus('Card saved <span class="hrt">♥</span> Tap a line first to put a different line on the card.');
    } else {
      setStatus("Card preview works everywhere, but saving works on the public site — open " + CARD_URL);
    }
  }, "image/png");
});

// ── ✦ suggest: land the line yourself; the suggestion goes to GitHub ──
const FIX_TAGS = ["feel", "register", "metaphor", "prosody", "cultural-code", "literal-wins", "form-embedded"];
const REPO = "https://github.com/mrdarkhy/feelyrics";
$("b-fix").addEventListener("click", () => {
  const on = app.classList.toggle("fix");
  $("b-fix").classList.toggle("on", on);
  setStatus(on ? "<b>Suggest mode.</b> Tap the line you would land differently." : "Suggest mode off.");
});
function openFix(l) {
  fixTarget = l; fixTags = new Set();
  $("fix-src").textContent = l.o;
  $("fix-text").value = (pubFixes[l.idx] && pubFixes[l.idx].fit) || l.t;
  const box = $("fix-chips"); box.innerHTML = "";
  FIX_TAGS.forEach((t) => {
    const c = document.createElement("button");
    c.className = "chip"; c.textContent = t;
    c.addEventListener("click", () => { c.classList.toggle("on"); c.classList.contains("on") ? fixTags.add(t) : fixTags.delete(t); });
    box.appendChild(c);
  });
  $("fixsheet").classList.add("open");
  $("fix-text").focus();
}
function fixPayload() {
  const fit = $("fix-text").value.trim();
  if (!fit) return null;
  if (!fixTags.size) { $("fix-chips").style.outline = "1px solid var(--ember)"; setTimeout(() => ($("fix-chips").style.outline = ""), 900); return null; }
  return { fit, tags: [...fixTags] };
}
function saveFixLocal(p) {
  pubFixes[fixTarget.idx] = p;
  try { localStorage.setItem("fl-pub-fix-" + song.id, JSON.stringify(pubFixes)); } catch {}
  $("fixsheet").classList.remove("open"); render();
}
function fixText(p) {
  return `Song: ${song.artist} — ${song.title} (${song.pair})\nOriginal: ${fixTarget.o}\nCurrent: ${fixTarget.t}\nSuggestion: ${p.fit}\nReason tags: ${p.tags.join(", ")}\n— suggested via feelyrics`;
}
$("fix-gh").addEventListener("click", () => {
  const p = fixPayload(); if (!p) return;
  saveFixLocal(p);
  const u = REPO + "/issues/new?title=" + encodeURIComponent(`[Line] ${song.title} (${song.pair}): "${p.fit.slice(0, 40)}"`) + "&body=" + encodeURIComponent(fixText(p));
  window.open(u, "_blank");
  setStatus('Suggestion opened on GitHub — hit “Submit” there. Your fit already shows on this device <span class="hrt">♥</span>');
});
$("fix-copy").addEventListener("click", async () => {
  const p = fixPayload(); if (!p) return;
  saveFixLocal(p);
  try { await navigator.clipboard.writeText(fixText(p)); setStatus("Suggestion copied — send it to whoever shared this with you. Your fit shows on this device."); }
  catch { setStatus("Couldn\'t copy automatically — your fit is saved on this device."); }
});

// ── request queue (D11): who asked for what, and where it stands ──
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSduENEnGo7rQIAWEvv8gyqFY1xXjFg3z75VMEgRfDvJ0JS1Sg/viewform";
function renderQueue() {
  const box = $("reqqueue");
  if (!box || typeof REQUESTS === "undefined" || !REQUESTS.length) return;
  box.innerHTML = "";
  const h = document.createElement("div"); h.className = "grp"; h.textContent = "Request queue"; box.appendChild(h);
  REQUESTS.forEach((r) => {
    const ready = r.status === "ready" && r.songId;
    const d = document.createElement(ready ? "button" : "div");
    d.className = "req" + (ready ? " ready" : "");
    d.innerHTML = `<span class="tt"><b></b><span></span></span><span class="rst"></span>`;
    d.querySelector("b").textContent = r.title;
    d.querySelector(".tt span").textContent = r.artist + " · into " + r.into.join(" + ") + (r.by ? " · for " + r.by : "");
    d.querySelector(".rst").textContent = ready ? "ready ♥" : (r.status === "lyrics-needed" ? "lyrics needed" : "queued");
    if (ready) d.addEventListener("click", () => { loadSong(r.songId); app.classList.remove("libopen"); });
    box.appendChild(d);
  });
  const n = document.createElement("div"); n.className = "reqnote";
  n.innerHTML = `A “lyrics needed” song unlocks the moment someone pastes its lyrics in the <a href="${FORM_URL}" target="_blank" rel="noopener">request form</a> — lyrics are never scraped.`;
  box.appendChild(n);
}

const qEl = $("q"), fromEl = $("f-from");
if (qEl) qEl.addEventListener("input", (e) => { query = e.target.value; renderLibrary(); });
if (fromEl) fromEl.addEventListener("change", (e) => { fromF = e.target.value; renderLibrary(); });

// ── boot ──
try {
loadSaved();
renderFilters();
renderLibrary();
renderQueue();
let opened = false;
opened = openFromHash(location.hash);
if (!opened) loadSong(SONGS[0].id);
window.addEventListener("hashchange", () => openFromHash(location.hash));
} catch (e) { console.error("boot failed:", e); }

// ── intro: once per session; any interaction ends it; never blocks the app ──
(function () {
  const el = $("intro");
  let seen = false;
  try { seen = sessionStorage.getItem("fl-intro") === "1"; } catch {}
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finish = () => {
    if (el.classList.contains("end")) return;
    el.classList.add("end");
    try { sessionStorage.setItem("fl-intro", "1"); } catch {}
    // the green path hands off as a single playback sweep
    const p = $("prog");
    if (!reduced && p) { p.classList.add("handoff"); p.addEventListener("animationend", () => p.classList.remove("handoff"), { once: true }); }
    setTimeout(() => el.classList.add("gone"), 600);
  };
  const deep = /^#(s=|f1\.)/.test(location.hash);
  if (seen || deep) { el.classList.add("end", "gone"); return; }
  el.addEventListener("pointerdown", finish);
  el.addEventListener("keydown", (e) => { if (e.code === "Enter" || e.code === "Space" || e.code === "Escape") { e.preventDefault(); finish(); } });
  const total = reduced ? 700 : (matchMedia("(max-width: 600px)").matches ? 2400 : 3600);
  setTimeout(finish, total);
})();
