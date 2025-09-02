import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  setDoc,
} from "firebase/firestore";

// -----------------------------
// 🔧 Insert your Firebase config here
// -----------------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

function initFirebase() {
  if (!getApps().length) {
    initializeApp(firebaseConfig);
  }
}

const pad = (n) => String(n).padStart(2, "0");
const formatDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const PRESETS = [
  { label: "Gym", value: "Gym session", from: 6, to: 8 },
  { label: "Get Ready", value: "Getting ready", at: 10 },
  { label: "Breakfast + Training", value: "Breakfast + Training/Learning", at: 11 },
  { label: "Lunch", value: "Lunch", at: 14 },
  { label: "Deep Work", value: "Deep work / Focus block", after: 14 },
  { label: "Break", value: "Short break / Walk", after: 14 },
  { label: "Admin", value: "Admin / Errands", after: 14 },
];

const BEEP_SRC =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAaW1wbAABAACAgICAgICAgP8AAP//AAD///8AAICAf4CAgICAf4CAgH+AgICAf4CAgH+Af4B/" +
  "gICAf4B/gH+AgICAf4B/gH+Af4CAgH+AgICAf4B/gH+AgH+AAAA";

const DAY_START_MINUTES = 5 * 60 + 30; // 05:30
const DAY_END_MINUTES = 22 * 60 + 30; // 22:30

export default function DailyMomentumTracker() {
  const [user, setUser] = useState(null);
  const [dateStr, setDateStr] = useState(formatDate(new Date()));
  const [logs, setLogs] = useState([]);
  const [nextTopOfHour, setNextTopOfHour] = useState(getNextTopOfHour());
  const [modalOpen, setModalOpen] = useState(false);
  const [note, setNote] = useState("");
  const [selectedHour, setSelectedHour] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioRef = useRef(null);
  const unsubRef = useRef(null);

  useEffect(() => {
    initFirebase();
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) setUser(u);
      else await signInAnonymously(auth);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setDateStr(formatDate(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    const db = getFirestore();
    const dayDoc = doc(db, "users", user.uid, "days", dateStr);
    setDoc(dayDoc, { createdAt: serverTimestamp() }, { merge: true });

    const entriesCol = collection(dayDoc, "entries");
    const q = query(entriesCol, orderBy("hour"));
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [user, dateStr]);

  useEffect(() => {
    const schedule = () => {
      const now = new Date();
      const ms = nextTopOfHour - now.getTime();
      const t = setTimeout(() => {
        const hit = new Date();
        const hr = hit.getHours();
        const minutesFromStart = hr * 60 + hit.getMinutes();
        if (
          minutesFromStart >= DAY_START_MINUTES &&
          minutesFromStart <= DAY_END_MINUTES &&
          hit.getMinutes() === 0
        ) {
          openLogModalForHour(hr);
          if (soundEnabled) tryPlay();
        }
        setNextTopOfHour(getNextTopOfHour());
      }, Math.max(0, ms));
      return () => clearTimeout(t);
    };
    const cleanup = schedule();
    return cleanup;
  }, [nextTopOfHour, soundEnabled]);

  function getNextTopOfHour() {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    if (!(now.getMinutes() === 0 && now.getSeconds() === 0)) {
      next.setHours(next.getHours() + 1);
    }
    return next.getTime();
  }

  function countdown() {
    const now = new Date().getTime();
    const diff = nextTopOfHour - now;
    const s = Math.max(0, Math.floor(diff / 1000));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }

  const procrastinationZone = useMemo(() => new Date().getHours() >= 14, [dateStr]);
  const withinDayWindow = useMemo(() => {
    const n = new Date();
    const mins = n.getHours() * 60 + n.getMinutes();
    return mins >= DAY_START_MINUTES && mins <= DAY_END_MINUTES;
  }, [dateStr]);

  const openLogModalForHour = (hour) => {
    setSelectedHour(hour);
    const auto = suggestForHour(hour);
    setNote(auto || "");
    setModalOpen(true);
  };

  const suggestForHour = (hour) => {
    if (hour >= 6 && hour < 8) return "Gym session";
    if (hour === 10) return "Getting ready";
    if (hour === 11) return "Breakfast + Training/Learning";
    if (hour === 14) return "Lunch";
    if (hour > 14) return "Deep work / Focus block";
    return "";
  };

  const tryPlay = async () => {
    if (audioRef.current) {
      try { await audioRef.current.play(); } catch {}
    }
  };
  const enableSound = async () => { setSoundEnabled(true); await tryPlay(); };

  const saveLog = async () => {
    if (!user || selectedHour == null) return;
    const db = getFirestore();
    const dayDoc = doc(db, "users", user.uid, "days", dateStr);
    const entriesCol = collection(dayDoc, "entries");
    const id = `${pad(selectedHour)}:00`;
    const entryDoc = doc(entriesCol, id);
    await setDoc(entryDoc, { hour: id, note: note.trim(), createdAt: serverTimestamp() }, { merge: true });
    setModalOpen(false);
    setNote("");
    setSelectedHour(null);
  };

  const today = new Date();

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100">
      <audio ref={audioRef} src={BEEP_SRC} preload="auto" />
      <header className="max-w-5xl mx-auto px-4 pt-6 pb-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Daily Momentum Tracker</h1>
            <p className="text-sm text-slate-300">Track every hour from 5:30 AM to 10:30 PM.</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Today</div>
            <div className="font-semibold">{today.toLocaleDateString()}</div>
            <div className="text-xs mt-1">User ID: <span className="font-mono">{user?.uid || "…"}</span></div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-24">
        <section className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">Next hourly check-in</div>
                <div className="text-3xl font-bold tabular-nums tracking-tight mt-1">{countdown()}</div>
              </div>
              <div className="flex items-center gap-2">
                {procrastinationZone ? (
                  <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium bg-yellow-100 border-yellow-300 text-yellow-800">Procrastination Zone</span>
                ) : (
                  <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium bg-emerald-100 border-emerald-300 text-emerald-800">Focus Window</span>
                )}
                <button onClick={() => openLogModalForHour(new Date().getHours())} className="rounded-xl bg-indigo-500 hover:bg-indigo-600 transition px-4 py-2 font-medium">Log now</button>
                {!soundEnabled && (
                  <button onClick={enableSound} className="rounded-xl border border-indigo-400/60 text-indigo-300 hover:bg-indigo-500/10 px-4 py-2">Enable sound</button>
                )}
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-2">
              {Array.from({ length: 17 }).map((_, i) => {
                const hr = 6 + i; const label = `${pad(hr)}:00`;
                const existing = logs.find((l) => l.hour === label);
                return (
                  <button key={label} onClick={() => openLogModalForHour(hr)} className={`group rounded-xl border p-3 text-left transition ${existing ? "border-emerald-500/50 bg-emerald-500/10" : "border-slate-800 hover:border-slate-700"}`}>
                    <div className="text-xs text-slate-400">{label}</div>
                    <div className="mt-1 line-clamp-2 min-h-[2.5rem] break-words">
                      {existing ? <span className="text-slate-100">{existing.note || <em className="text-slate-400">(no note)</em>}</span> : <em className="text-slate-500">Not logged</em>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <aside className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <h2 className="text-lg font-semibold">Today’s Log</h2>
            <div className="mt-3 divide-y divide-slate-800/60 border border-slate-800 rounded-xl overflow-hidden">
              {logs.length === 0 && (<div className="p-4 text-sm text-slate-400">No entries yet.</div>)}
              {logs.map((row) => (
                <div key={row.id} className="p-3 hover:bg-slate-800/50">
                  <div className="text-xs text-slate-400">{row.hour}</div>
                  <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{row.note || <em className="text-slate-500">(no note)</em>}</div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>

      {modalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-slate-950 border border-slate-800 shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div><div className="text-xs text-slate-400">Log for</div><div className="text-lg font-semibold">{pad(selectedHour ?? 0)}:00</div></div>
              <button onClick={() => setModalOpen(false)} className="rounded-lg px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700">Dismiss</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2">{PRESETS.filter(p => (p.at==null||p.at===selectedHour)&&(p.from==null||(selectedHour>=p.from&&selectedHour<p.to))&&(p.after==null||selectedHour>p.after)).map((p,idx)=>(<button key={idx} onClick={()=>setNote(p.value)} className="text-xs rounded-full border border-indigo-400/40 px-3 py-1.5 hover:bg-indigo-500/10">{p.label}</button>))}</div>
              <textarea value={note} onChange={(e)=>setNote(e.target.value)} placeholder="What did you do this hour?" className="w-full h-32 rounded-xl bg-slate-900 border border-slate-800 p-3 outline-none focus:ring-2 focus:ring-indigo-500" />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={()=>{setNote("");setModalOpen(false);}} className="rounded-xl border border-slate-700 px-4 py-2 hover:bg-slate-800">Skip</button>
                <button onClick={saveLog} className="rounded-xl bg-indigo-500 hover:bg-indigo-600 px-4 py-2 font-medium">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="fixed bottom-0 inset-x-0 border-t border-slate-800 bg-slate-950/70 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 text-xs text-slate-400 flex items-center justify-between">
          <div>Current time: <span className="font-mono">{formatTime(new Date())}</span></div>
          <div>Hourly alarm: <span className="font-semibold">{withinDayWindow ? "Armed" : "Idle"}</span></div>
        </div>
      </footer>
    </div>
  );
}
