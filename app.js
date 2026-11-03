(() => {
"use strict";

// Initialize Lenis smooth scroll (but keep it stopped until lock opens)
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lenis = new Lenis({
  duration: prefersReducedMotion ? 0 : 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  orientation: "vertical",
  gestureOrientation: "vertical",
  smoothWheel: !prefersReducedMotion,
  touchMultiplier: 2,
});

// Start Lenis in stopped state to allow the lock overlay to work
lenis.stop();

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// Listen for reduced motion changes
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
  lenis.options.duration = e.matches ? 0 : 1.2;
  lenis.options.smoothWheel = !e.matches;
});

const D = window.CHAT_DATA;
if (!D) { document.body.innerHTML = "<p style='padding:2rem'>data.js missing — run <code>node analyze.js</code> first.</p>"; return; }
const M = D.meta, R = D.rituals;
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const fmt = (n) => n.toLocaleString("en-US");
const pct = (a, b) => Math.round((a / (a + b)) * 100);
const esc = (s) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------------- intro lock ---------------- */
const lock = $("#lock"), story = $("#story"), env = $("#envelope");
let opened = false;
function open() {
  if (opened) return; opened = true;
  console.log("Lock is opening...");
  env.classList.add("sent");
  setTimeout(() => {
    console.log("Lock class 'open' applied");
    lock.classList.add("open");
    story.classList.add("live");
    story.removeAttribute("aria-hidden");
    document.body.style.overflow = "";
    // Start Lenis smooth scroll now that the lock is open
    lenis.start();
    kick();
    fireHearts(18);
  }, 850);
}
env.addEventListener("click", (e) => {
  console.log("Envelope clicked!");
  open();
});
env.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
document.body.style.overflow = "hidden";
if (location.hash === "#open") {
  requestAnimationFrame(() => {
    open();
    lenis.start(); // Start immediately for deep link
  });
}

/* ---------------- number count-up ---------------- */
function countUp(el, target, dur = 1600) {
  if (prefersReducedMotion) { el.textContent = fmt(target); return; }
  const t0 = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(2, -10 * p); // easeOutExpo
    el.textContent = fmt(Math.round(target * e));
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

/* ---------------- hero ---------------- */
$("#h-total").dataset.target = M.total;
$("#h-days").dataset.target = M.days;
const youBaby = (D.wordsBySender.You.find(w => w[0] === "baby") || ["baby", 0])[1];
const herBaby = (D.wordsBySender.Aarya.find(w => w[0] === "baby") || ["baby", 0])[1];
$("#hero-sub").textContent =
  `From ${M.firstDay} to ${M.lastDay} — that's ${M.avgPerDay} messages a day, every day you two could. ` +
  `You said "baby" ${youBaby} times. She said it ${herBaby} times back. Counting them took a machine a second. Living them took you three months.`;

/* ---------------- stat cards ---------------- */
function stat(id, v) {
  const el = $(id);
  if (el) {
    el.textContent = "0";
    el.dataset.target = v;
  }
}
stat("#s-total", M.total);
stat("#s-days", M.days);
stat("#s-avg", M.avgPerDay);
stat("#s-streak", M.bestStreak);
stat("#stk-total", R.stickersBy.You + R.stickersBy.Aarya);
stat("#e-top-n", D.emoji[0][1]);

/* ---------------- who talks more ---------------- */
const yPct = pct(M.bySender.You, M.bySender.Aarya);
function count(id, v) { const el = $(id); el.textContent = "0"; el.dataset.count = ""; el.dataset.target = v; }
count("#v-you", M.bySender.You);
count("#v-aarya", M.bySender.Aarya);
const barPair = $("#bar-pair");
barPair.querySelector(".f-you").style.setProperty("--w", yPct + "%");
barPair.querySelector(".f-her").style.setProperty("--w", (100 - yPct) + "%");
$("#vs-note").textContent =
  `Aarya sent ${fmt(M.bySender.Aarya - M.bySender.You)} more messages than you. ` +
  `Statistically, she's the one carrying this conversation. Emotionally — you both know the truth.`;

/* ---------------- podium + ranks ---------------- */
const medals = ["👑", "🥈", "🥉"];
const order = [D.wordyTopTexts[1], D.wordyTopTexts[0], D.wordyTopTexts[2]]; // 2nd, 1st, 3rd for podium shape
$("#podium").innerHTML = order.filter(Boolean).map(([txt, n], i) => {
  const first = txt === D.wordyTopTexts[0][0];
  return `<div class="pod ${first ? "first" : ""}">
    <span class="medal">${first ? medals[0] : medals[i === 0 ? 1 : 2]}</span>
    <span class="pod-text">“${esc(txt)}”</span>
    <span class="pod-n">${n}× sent</span>
  </div>`;
}).join("");

function rankList(el, arr) {
  el.innerHTML = arr.map(([txt, n]) =>
    `<li><span class="txt">“${esc(txt)}”</span><span class="n">${n}×</span></li>`).join("");
}
rankList($("#rank-you"), D.wordyBySender.You);
rankList($("#rank-her"), D.wordyBySender.Aarya);

/* ---------------- emoji ---------------- */
$("#e-top").textContent = D.emoji[0][0];
$("#emoji-row").innerHTML = D.emoji.slice(1, 10).map(([em, n]) =>
  `<div class="e-chip"><span class="em">${em}</span><span class="ct">${n}</span></div>`).join("");

/* ---------------- stickers ---------------- */
const stkTotal = R.stickersBy.You + R.stickersBy.Aarya;
const cells = [];
for (let i = 0; i < 10; i++) {
  const mine = i < Math.round((R.stickersBy.You / stkTotal) * 10);
  cells.push(`<span class="cell ${mine ? "you" : "her"}">${mine ? "🎴" : ""}</span>`);
}
$("#stk-split").innerHTML =
  `<span class="lab">You ${R.stickersBy.You}</span><div class="track">${cells.join("")}</div><span class="lab">${R.stickersBy.Aarya} Aarya</span>`;
$("#stk-days").innerHTML = M.topStickerDays.map(([d, n]) =>
  `<div class="sd"><span class="d">${esc(d)}</span><span class="v">${n} stickers</span></div>`).join("");

/* ---------------- word clouds ---------------- */
function cloud(el, arr) {
  const max = arr[0][1], min = arr[arr.length - 1][1];
  el.innerHTML = arr.map(([w, n]) => {
    const size = 1 + (n - min) / Math.max(1, max - min) * 1.9;
    return `<span class="w" style="font-size:${size.toFixed(2)}rem">${esc(w)}<i>${n}</i></span>`;
  }).join("");
}
cloud($("#cloud-you"), D.wordsBySender.You);
cloud($("#cloud-her"), D.wordsBySender.Aarya);

/* ---------------- timeline ---------------- */
const chart = $("#chart");
const maxDay = Math.max(...D.timeline.map(t => t.total));
chart.innerHTML = D.timeline.map((t, i) => {
  const hp = (v) => ((v / maxDay) * 100).toFixed(2);
  const delay = Math.min(i * 22, 1500);
  return `<div class="col">
    <div class="tip">${esc(t.date)} — <b>${t.You}</b> you · <span class="g">${t.Aarya}</span> her</div>
    <div class="seg you" style="--h:${hp(t.You)}%; transition-delay:${delay}ms"></div>
    <div class="seg her" style="--h:${hp(t.Aarya)}%; transition-delay:${delay + 100}ms"></div>
  </div>`;
}).join("");

const dayCards = [
  { when: "loudest day ever", what: M.busiest[0].date, num: `${fmt(M.busiest[0].total)} messages — you ${M.busiest[0].You}, her ${M.busiest[0].Aarya}. A whole marathon in one sitting.` },
  { when: "longest you kept it up", what: `${M.bestStreak} days straight`, num: "No gaps. Just waking up and talking, every single one of them." },
  { when: "the one-message day", what: M.quietest.date, num: `You: ${M.quietest.You}. Her: ${M.quietest.Aarya}. The quietest day on record. Never happened again, obviously.` },
  { when: "longest gap", what: `${M.longestGap.days} days`, num: `Between ${M.longestGap.from} and ${M.longestGap.to} — the only real silence in the entire export. The chart remembers, even if you don't.` },
];
$("#day-cards").innerHTML = dayCards.map(c =>
  `<div class="card reveal"><span class="when">${c.when}</span><div class="what">${esc(c.what)}</div><p class="num">${c.num}</p></div>`).join("");

/* ---------------- polar clock ---------------- */
(function clock() {
  const svg = $("#clock"), CX = 210, CY = 210;
  const maxH = Math.max(...[0, ...D.hours.You, ...D.hours.Aarya]);
  const ns = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  // rings + hour ticks
  [70, 110, 150, 190].forEach(r => svg.appendChild(mk("circle", { cx: CX, cy: CY, r, class: "ring" })));
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
    svg.appendChild(mk("line", {
      x1: CX + Math.cos(a) * 186, y1: CY + Math.sin(a) * 186,
      x2: CX + Math.cos(a) * 192, y2: CY + Math.sin(a) * 192,
      stroke: "#f7ece033", "stroke-width": 1
    }));
    const lab = mk("text", {
      x: CX + Math.cos(a) * 204, y: CY + Math.sin(a) * 204,
      fill: "#cbb6b0", "font-size": "9", "text-anchor": "middle", "dominant-baseline": "middle",
      "font-family": "Outfit, sans-serif", "letter-spacing": "0.08em"
    });
    lab.textContent = ((h % 12) || 12) + (h < 12 ? "a" : "p");
    svg.appendChild(lab);
  }

  function wedges(data, rIn, color) {
    const step = (Math.PI * 2) / 24;
    data.forEach((v, h) => {
      if (!v) return;
      const r = 62 + (v / maxH) * 124;
      const a0 = h * step - step / 2 - Math.PI / 2, a1 = a0 + step * 0.86;
      const p = mk("path", {
        d: `M ${CX + Math.cos(a0) * rIn} ${CY + Math.sin(a0) * rIn}
            L ${CX + Math.cos(a0) * r} ${CY + Math.sin(a0) * r}
            A ${r} ${r} 0 0 1 ${CX + Math.cos(a1) * r} ${CY + Math.sin(a1) * r}
            L ${CX + Math.cos(a1) * rIn} ${CY + Math.sin(a1) * rIn} A ${rIn} ${rIn} 0 0 0 ${CX + Math.cos(a0) * rIn} ${CY + Math.sin(a0) * rIn} Z`,
        fill: color, class: "wedge",
        style: `transition-delay:${(h * 33) % 900}ms`
      });
      svg.appendChild(p);
    });
  }
  wedges(D.hours.Aarya, 44, "#e9b95c55");
  wedges(D.hours.You, 54, "#ff6f8f88");

  const c = mk("text", { x: CX, y: CY - 6, fill: "#f7ece0", "font-size": "13", "text-anchor": "middle", "font-family": "Fraunces, serif", "font-style": "italic" });
  c.textContent = fmt(M.lateNight);
  const c2 = mk("text", { x: CX, y: CY + 12, fill: "#cbb6b0", "font-size": "8", "text-anchor": "middle", "letter-spacing": "0.2em", "font-family": "Outfit, sans-serif" });
  c2.textContent = "BETWEEN 1–5 AM";
  svg.appendChild(c); svg.appendChild(c2);

  $("#peak-line").innerHTML =
    `You both peak at <b>11 p.m.</b> — ${fmt(D.hours.You[23] + D.hours.Aarya[23])} messages in that hour alone. ` +
    `And <b>${fmt(M.lateNight)}</b> more after 1 a.m., when one of you swears the other is asleep.`;
})();

/* ---------------- rituals ---------------- */
const ritualCards = [
  { html:
    `<span class="who">who starts the day</span><div class="vs-mini"><span class="a">${R.firstOf.You}</span><span class="t">— tied at —</span><span class="b">${R.firstOf.Aarya}</span></div>
     <p class="note">First message of the day: ${R.firstOf.You} for you, ${R.firstOf.Aarya} for her. A dead tie, which is its own kind of romance — two people racing to wake up.</p>` },
  { html:
    `<span class="who">who ends it</span><div class="big">${R.lastOf.You}<small> vs ${R.lastOf.Aarya}</small></div>
     <p class="note">You got the last word ${R.lastOf.You} nights to her ${R.lastOf.Aarya}. Someone had to be the one who doesn't want the day to end. It was mostly you. It's fine, she does it in stickers.</p>` },
  { html:
    `<span class="who">voice notes</span><div class="big">${R.voiceBy.Aarya}<small> hers · ${R.voiceBy.You} yours</small></div>
     <p class="note">She sends ${R.voiceBy.Aarya} voice notes to your ${R.voiceBy.You}. Translation: she wants you to hear her, not read her. Smart girl.</p>` },
  { html:
    `<span class="who">reply speed</span><div class="big">${M.replyToHer.under1m}% / ${M.replyToYou.under1m}%<small> under a minute</small></div>
     <p class="note">${M.replyToHer.under1m}% of her replies and ${M.replyToYou.under1m}% of yours land within a minute. You are both, statistically, on your phones when you're supposed to be doing something else.</p>` },
];
$("#rituals").innerHTML = ritualCards.map(r => `<div class="card reveal">${r.html}</div>`).join("");

/* ---------------- love numbers ---------------- */
const love = [
  [R.phrases["love you"] || 194, "times “love you” was typed"],
  [R.phrases["miss you"] || 96, "times someone missed someone"],
  [R.phrases.baby, "“baby” — hers + yours"],
  [M.morningTexts, "messages before 9 a.m."],
  [M.lateNight, "messages between 1–5 a.m."],
  [D.timeline.filter(t => t.total > 300).length, "days you sent 300+ messages"],
];
$("#love-grid").innerHTML = love.map(([v, k]) =>
  `<div class="love reveal"><span class="lv" data-count data-target="${v}">0</span><span class="lk">${k}</span></div>`).join("");

/* ---------------- new stats (chapter 10) ---------------- */
if (D.newStats) {
  console.log("New stats data:", D.newStats);
  stat("#stat-len-you", D.newStats.messageLengths.You);
  stat("#stat-len-her", D.newStats.messageLengths.Aarya);
  stat("#stat-laugh-you", D.newStats.laughter.You);
  stat("#stat-laugh-her", D.newStats.laughter.Aarya);

  const nList = $("#radar-list");
  if (nList) {
    const combinedNicknames = [
      ["baby", (D.newStats.nicknames.You?.baby || 0) + (D.newStats.nicknames.Aarya?.baby || 0)],
      ["darling", (D.newStats.nicknames.You?.darling || 0) + (D.newStats.nicknames.Aarya?.darling || 0)],
      ["bae/babe", (D.newStats.nicknames.You?.bae || 0) + (D.newStats.nicknames.Aarya?.babe || 0)],
      ["bro/yaar", (D.newStats.nicknames.You?.bro || 0) + (D.newStats.nicknames.Aarya?.bro || 0)]
    ];
    nList.innerHTML = combinedNicknames.map(([k, v]) =>
      `<div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--line); padding-bottom:0.3rem;">
        <span style="color:var(--rose-soft);">${k}</span>
        <span style="color:var(--cream);">${v}×</span>
      </div>`
    ).join("");
  }

  const weekChart = $("#week-chart");
  const weekAxis = $("#week-axis");
  if (weekChart && weekAxis && D.newStats.daysOfWeek) {
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const youData = D.newStats.daysOfWeek.You;
    const herData = D.newStats.daysOfWeek.Aarya;
    const maxVal = Math.max(...youData, ...herData);
    weekAxis.innerHTML = days.map(d => `<span>${d}</span>`).join("");
    weekChart.innerHTML = days.map((d, i) => {
      const youH = ((youData[i] / maxVal) * 100).toFixed(2);
      const herH = ((herData[i] / maxVal) * 100).toFixed(2);
      return `<div class="col">
        <div class="seg you" style="--h:${youH}%"></div>
        <div class="seg her" style="--h:${herH}%"></div>
      </div>`;
    }).join("");
  }
}

/* ---------------- finale ---------------- */
$("#finale-p").textContent =
  `Seventeen thousand three hundred fifty-seven messages. Every "Mhmm" that meant keep talking, every 😭 that wasn't really crying, every sticker she sent instead of admitting she missed you. This is the receipt of three months of choosing each other, daily, in writing. Here's to the next ${fmt(M.total)} — but go easy on the data plan.`;

/* ---------------- observers ---------------- */
const seen = new WeakSet();
const io = new IntersectionObserver((ents) => {
  ents.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target;
    el.classList.add("in");
    $$("[data-count]", el).forEach(c => { if (!seen.has(c)) { seen.add(c); countUp(c, +c.dataset.target); } });
    if (el.querySelector("#chart")) $("#chart").classList.add("go");
    if (el.querySelector("#clock")) $("#clock").classList.add("go");
    if (el.querySelector(".bar-pair")) $(".bar-pair").classList.add("go");
    io.unobserve(el);
  });
}, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

function kick() {
  $$(".reveal").forEach(el => io.observe(el));
  // hero counts immediately
  ["h-total", "h-days"].forEach(id => { const c = $("#" + id); seen.add(c); countUp(c, +c.dataset.target, 2200); });
}

/* ---------------- confetti ---------------- */
const canvas = $("#confetti"), ctx = canvas.getContext("2d");
let parts = [], animationRaf = null;
function sizeCanvas() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); }
addEventListener("resize", sizeCanvas); sizeCanvas();
const COLORS = ["#ff6f8f", "#ffa2b6", "#e9b95c", "#ff9a6b", "#a06bff", "#f7ece0"];
const HEARTS = ["♥", "❤", "💗", "😍", "🥰"];
function burst(x, y, n, spread) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * spread;
    parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, g: 0.09 + Math.random() * 0.06,
      r: 3 + Math.random() * 5, rot: Math.random() * Math.PI, vr: (Math.random() - .5) * 0.2,
      c: COLORS[Math.random() * COLORS.length | 0],
      heart: Math.random() < 0.3 ? HEARTS[Math.random() * HEARTS.length | 0] : null,
      life: 1, decay: 0.004 + Math.random() * 0.006
    });
  }
  if (!animationRaf) loop();
}
function loop() {
  animationRaf = requestAnimationFrame(loop);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => p.life > 0);
  if (!parts.length) { cancelAnimationFrame(animationRaf); animationRaf = null; return; }
  for (const p of parts) {
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= p.decay;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life)); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    if (p.heart) { ctx.font = `${p.r * 3.4}px serif`; ctx.fillText(p.heart, 0, 0); }
    else { ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); }
    ctx.restore();
  }
}
function fireHearts(n) { burst(innerWidth / 2, innerHeight / 2.2, n * 2, 6); }
$("#wish").addEventListener("click", (e) => {
  const rect = e.target.getBoundingClientRect();
  burst(rect.left + rect.width / 2, rect.top, 90, 9);
  setTimeout(() => burst(innerWidth * 0.2, innerHeight * 0.3, 40, 7), 250);
  setTimeout(() => burst(innerWidth * 0.8, innerHeight * 0.35, 40, 7), 450);
});

})();
