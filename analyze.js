const fs = require("fs");

const CHAT = "C:/Users/USER/OneDrive/Desktop/claude 2.0/babyy/chat.md";
const OUT = "C:/Users/USER/OneDrive/Desktop/claude 2.0/babyy/data.json";

const t = fs.readFileSync(CHAT, "utf8");
const lines = t.split("\n");

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const re = /^\[([^\]]+)\] \*\*(You|Aarya):\*\* (.*)/;
const dateRe = /^## (.+)/;

const parseDate = (s) => {
  const m = s.match(/([A-Za-z]+)\s+(\d+),?\s+(\d+)/);
  if (!m) return null;
  return new Date(parseInt(m[3]), MONTHS.indexOf(m[1]), parseInt(m[2]));
};

// ---- Pass 1: collect messages grouped by day ----
let curDate = null;
const days = [];           // [{date, dateObj, msgs:[{time,sender,body,type,ts}]}]
let day = null;
const media = {};
const topTexts = {};
const topTextsBySender = { You: {}, Aarya: {} };
const wordsBySender = { You: {}, Aarya: {} };
const emoji = {};
const emojiBySender = { You: {}, Aarya: {} };
const times = { You: [], Aarya: [] };

const STOP = new Set(["the","and","not","but","for","you","your","with","that","this","have","has","was","were","are","its","it's","just","like","what","when","where","how","why","who","can","cant","didn","don","does","did","all","too","yes","yeah","yep","mhmm","mm","oh","ok","okay","i'm","i'll","i've","im","ill","ive"]);

const parseTime = (s) => {
  const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
};

for (const l of lines) {
  const d = l.match(dateRe);
  if (d) {
    const candidate = d[1].trim();
    const dateObj = parseDate(candidate);
    if (!dateObj) continue; // ignore non-date headers (pasted docs inside the chat)
    curDate = candidate;
    day = { date: curDate, dateObj, msgs: [] };
    days.push(day);
    continue;
  }
  const m = l.match(re);
  if (!m) continue;
  const time = m[1], sender = m[2];
  let body = m[3].trim();

  // handle quoted reply lines: they appear as "> _Name: text_" then real body on next line
  day.msgs.push({ time, sender, body, minutes: parseTime(time) });

  const mt = body.match(/^(\[.*?\](?:\s*\[.*?\])*)\s*(.*)$/);
  if (mt && mt[1]) {
    const tags = mt[1].match(/\[[^\]]+\]/g) || [];
    let counted = false;
    for (const tag of tags) {
      const key = tag.replace(/[\[\]]/g, "");
      if (["Image","Sticker","Video","GIF","Voice message","Audio","Document","album message","Forwarded"].includes(key)) {
        media[key] = (media[key] || 0) + 1;
        counted = true;
      }
    }
    const rest = mt[2].trim();
    if (counted && !rest) continue;
    if (counted) body = rest;
  }

  // pure text
  const isQuote = body.startsWith(">");
  if (!isQuote && body) {
    topTexts[body] = (topTexts[body] || 0) + 1;
    topTextsBySender[sender][body] = (topTextsBySender[sender][body] || 0) + 1;
    const cleaned = body.toLowerCase().replace(/[^\p{L}\p{N}']+[\p{P}]*/gu, " ");
    for (const w of cleaned.split(/\s+/).filter(Boolean)) {
      if (w.length < 3 || STOP.has(w)) continue;
      wordsBySender[sender][w] = (wordsBySender[sender][w] || 0) + 1;
    }
  }
  for (const ch of body) {
    const c = ch.codePointAt(0);
    if (c >= 0x1F3FB && c <= 0x1F3FF) continue; // skin-tone modifiers
    if (c === 0xfe0f || c === 0x200d) continue;  // variation selector, ZWJ
    if ((c >= 0x1F300 && c <= 0x1FAFF) || (c >= 0x2600 && c <= 0x27BF)) {
      emoji[ch] = (emoji[ch] || 0) + 1;
      emojiBySender[sender][ch] = (emojiBySender[sender][ch] || 0) + 1;
    }
  }
  if (day.msgs.length) times[sender].push(day.msgs[day.msgs.length - 1].minutes);
}

// ---- Pass 2: aggregate ----
let total = 0;
const bySender = { You: 0, Aarya: 0 };
const timeline = [];
for (const d of days) {
  const y = d.msgs.filter(m => m.sender === "You").length;
  const a = d.msgs.filter(m => m.sender === "Aarya").length;
  total += d.msgs.length;
  bySender.You += y;
  bySender.Aarya += a;
  timeline.push({ date: d.date, You: y, Aarya: a, total: d.msgs.length });
}

// busiest day
const busiest = [...timeline].sort((x, y) => y.total - x.total).slice(0, 5);
// quietest day (with at least 1 message)
const quietest = [...timeline].filter(x => x.total > 0).sort((x, y) => x.total - y.total)[0];

// longest gap between consecutive active days
let longestGap = { days: 0, from: null, to: null };
const active = days.filter(d => d.msgs.length > 0);
for (let i = 1; i < active.length; i++) {
  const gap = Math.round((active[i].dateObj - active[i - 1].dateObj) / 86400000);
  if (gap > longestGap.days) longestGap = { days: gap, from: active[i - 1].date, to: active[i].date };
}

// hour heatmap (messages per hour of day, per sender)
const hours = { You: Array(24).fill(0), Aarya: Array(24).fill(0) };
let lateNight = 0, morningTexts = 0;
for (const d of days) {
  for (const m of d.msgs) {
    if (m.minutes == null) continue;
    const h = Math.floor(m.minutes / 60);
    hours[m.sender][h]++;
    if (h >= 1 && h < 5) lateNight++;
    if (h >= 6 && h < 9) morningTexts++;
  }
}

// reply speed: median minutes between a message from A and the next from B (same day)
function replyStats(from, to) {
  const diffs = [];
  for (const d of days) {
    for (let i = 0; i < d.msgs.length - 1; i++) {
      if (d.msgs[i].sender === from && d.msgs[i + 1].sender === to && d.msgs[i].minutes != null) {
        let delta = d.msgs[i + 1].minutes - d.msgs[i].minutes;
        if (delta >= 0) diffs.push(delta);
      }
    }
  }
  diffs.sort((a, b) => a - b);
  if (!diffs.length) return null;
  const med = diffs[Math.floor(diffs.length / 2)];
  const mean = Math.round(diffs.reduce((s, v) => s + v, 0) / diffs.length);
  const under1m = Math.round((diffs.filter((x) => x <= 1).length / diffs.length) * 100);
  return { median: med, mean, under1m, samples: diffs.length };
}

// streaks: longest run of consecutive days with messages
const dayKeys = new Set();
for (const d of days) if (d.msgs.length > 0) dayKeys.add(d.dateObj.toDateString());
let bestStreak = 0, curStreak = 0;
const sortedDates = [...dayKeys].map(s => new Date(s)).sort((a, b) => a - b);
for (let i = 0; i < sortedDates.length; i++) {
  if (i === 0) { curStreak = 1; continue; }
  const diff = (sortedDates[i] - sortedDates[i - 1]) / 86400000;
  curStreak = diff === 1 ? curStreak + 1 : 1;
  bestStreak = Math.max(bestStreak, curStreak);
}

// ---- Pass 2a: per-day rituals & phrase counts ----
const firstOf = { You: 0, Aarya: 0 };   // who sends the first message of the day
const lastOf = { You: 0, Aarya: 0 };     // who sends the last message of the day
const stickersBy = { You: 0, Aarya: 0 };
const voiceBy = { You: 0, Aarya: 0 };
const phraseCounts = {};
const PHRASES = [
  ["miss you", /miss(ing)?\s+you/i],
  ["love you", /l(o|u)[vu]e\s+you/i],
  ["baby", /\bbaby\b/i],
  ["good morning", /goo+d\s*mornin(g'?|g\b)/i],
  ["gn / good night", /\b(gn|gud\s*night|good\s*night)\b/i],
];

for (const d of days) {
  if (!d.msgs.length) continue;
  const first = d.msgs[0].sender;
  const last = d.msgs[d.msgs.length - 1].sender;
  firstOf[first]++;
  lastOf[last]++;
}
for (const [txt, n] of Object.entries(topTexts)) {
  for (const [label, rx] of PHRASES) {
    if (rx.test(txt)) phraseCounts[label] = (phraseCounts[label] || 0) + n;
  }
}
// sticker + voice per sender (recount cheaply from stored msgs)
for (const d of days) {
  for (const m of d.msgs) {
    if (/^\[Sticker\]/.test(m.body) || m.body.includes("[Sticker]")) stickersBy[m.sender]++;
    if (m.body.includes("[Voice message]")) voiceBy[m.sender]++;
  }
}

const topN = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

const hasWord = (s) => /\p{L}|\p{N}/u.test(s);
const wordyTopTexts = Object.entries(topTexts).filter(([txt]) => hasWord(txt)).sort((a, b) => b[1] - a[1]).slice(0, 12);
const wordyBySender = {
  You: Object.entries(topTextsBySender.You).filter(([txt]) => hasWord(txt)).sort((a, b) => b[1] - a[1]).slice(0, 6),
  Aarya: Object.entries(topTextsBySender.Aarya).filter(([txt]) => hasWord(txt)).sort((a, b) => b[1] - a[1]).slice(0, 6),
};

// stickers per day -> top sticker days
const stickersByDay = {};
for (const d of days) {
  let n = 0;
  for (const m of d.msgs) if (m.body.includes("[Sticker]")) n++;
  if (n) stickersByDay[d.date] = n;
}
const topStickerDays = Object.entries(stickersByDay).sort((a, b) => b[1] - a[1]).slice(0, 3);

const out = {
  meta: {
    name: "Aarya",
    total,
    days: active.length,
    firstDay: active[0]?.date,
    lastDay: active[active.length - 1]?.date,
    bySender,
    avgPerDay: Math.round(total / (active.length || 1)),
    longestGap,
    busiest,
    quietest,
    bestStreak,
    lateNight,
    morningTexts,
    media: topN(media, 12),
    topStickerDays,
    replyToHer: replyStats("You", "Aarya"),
    replyToYou: replyStats("Aarya", "You"),
  },
  timeline,
  hours,
  topTexts: topN(topTexts, 20),
  wordyTopTexts,
  wordyBySender,
  topTextsBySender: { You: topN(topTextsBySender.You, 12), Aarya: topN(topTextsBySender.Aarya, 12) },
  wordsBySender: { You: topN(wordsBySender.You, 15), Aarya: topN(wordsBySender.Aarya, 15) },
  emoji: topN(emoji, 16),
  emojiBySender: { You: topN(emojiBySender.You, 8), Aarya: topN(emojiBySender.Aarya, 8) },
  rituals: { firstOf, lastOf, stickersBy, voiceBy, phrases: phraseCounts },
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
fs.writeFileSync(
  OUT.replace("data.json", "data.js"),
  "window.CHAT_DATA = " + JSON.stringify(out) + ";\n"
);
console.log("WROTE", OUT, "total", total);
console.log("rituals", JSON.stringify(out.rituals, null, 2));
console.log("wordyTopTexts", JSON.stringify(out.wordyTopTexts.slice(0, 10)));
console.log("wordyBy", JSON.stringify(out.wordyBySender));
console.log(JSON.stringify(out.meta, null, 2).slice(0, 2500));
console.log("reply her", out.meta.replyToHer, "reply you", out.meta.replyToYou);
console.log("streak", out.meta.bestStreak);
console.log("topTexts", JSON.stringify(out.topTexts.slice(0, 12)));
console.log("emoji", JSON.stringify(out.emoji.slice(0, 10)));
console.log("wordsYou", JSON.stringify(out.wordsBySender.You.slice(0, 8)));
console.log("wordsAarya", JSON.stringify(out.wordsBySender.Aarya.slice(0, 8)));
