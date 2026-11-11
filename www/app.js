const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const K = "qra_v1";
let S;
try {
  S = JSON.parse(localStorage.getItem(K));
} catch (e) {}
S = Object.assign(
  {
    pin: null,
    sessions: [],
    cur: null,
    sound: true,
    vib: true,
    dup: true,
    lock: true,
    only: true,
    roster: null,
    cameraFacing: "environment",
  },
  S || {},
);
if (!S.roster) S.roster = Object.assign({}, window.ROSTER_DEFAULT || {});
const save = () => {
  try {
    localStorage.setItem(K, JSON.stringify(S));
  } catch (e) {
    toast("Storage full");
  }
};
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const hash = (p) => {
  let h = 5381;
  for (const c of "qra" + p) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return String(h);
};
const pad2 = (n) => String(n).padStart(2, "0");
const fmtT = (t) => {
  const d = new Date(t);
  return (
    pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds())
  );
};
const fmtD = (t) => {
  const d = new Date(t);
  return (
    d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
  );
};
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
let tt;
function toast(m, ms) {
  const e = $("#toast");
  e.textContent = m;
  e.classList.remove("hidden");
  clearTimeout(tt);
  tt = setTimeout(() => e.classList.add("hidden"), ms || 2200);
}
const nm = (c) => S.roster[String(c).trim().toUpperCase()] || null;
const total = () => Object.keys(S.roster).length;
const label = (c) => nm(c) || "Unknown student";

/* sessions */
function mk(name) {
  const s = {
    id: uid(),
    name: name || "Session " + fmtD(Date.now()),
    created: Date.now(),
    rows: [],
    dups: 0,
  };
  S.sessions.unshift(s);
  S.cur = s.id;
  save();
  return s;
}
const cur = () =>
  S.sessions.find((s) => s.id === S.cur) || S.sessions[0] || mk();
let viewId = null,
  absMode = false;
const view = () => S.sessions.find((s) => s.id === viewId) || cur();

/* PIN lock */
let pin = "",
  mode = "unlock",
  after = null,
  first = "";
function showLock(m, cb) {
  mode = m;
  after = cb || null;
  pin = "";
  first = "";
  $("#lock").classList.remove("hidden");
  lockUI();
}
function lockUI() {
  const t = {
    unlock: ["Enter PIN", "Unlock to continue"],
    set1: ["Create a PIN", "Choose a 4-digit PIN"],
    set2: ["Confirm PIN", "Enter the same PIN again"],
    cur: ["Current PIN", "Enter your current PIN"],
  }[mode];
  $("#lockT").textContent = t[0];
  $("#lockS").textContent = t[1];
  $$("#dots i").forEach((d, i) => d.classList.toggle("f", i < pin.length));
}
function build() {
  const p = $("#pad");
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].forEach((k) => {
    const b = document.createElement("button");
    b.textContent = k;
    if (!k) b.style.visibility = "hidden";
    b.onclick = () => key(k);
    p.appendChild(b);
  });
}
function bad(m) {
  const d = $("#dots");
  d.classList.add("bad");
  setTimeout(() => d.classList.remove("bad"), 350);
  toast(m);
  pin = "";
  lockUI();
  navigator.vibrate && navigator.vibrate(120);
}
function key(k) {
  if (k === "⌫") pin = pin.slice(0, -1);
  else if (pin.length < 4) pin += k;
  lockUI();
  if (pin.length < 4) return;
  setTimeout(() => {
    if (mode === "unlock" || mode === "cur") {
      if (hash(pin) !== S.pin) return bad("Wrong PIN");
      if (mode === "cur") {
        mode = "set1";
        pin = "";
        return lockUI();
      }
      done();
    } else if (mode === "set1") {
      first = pin;
      pin = "";
      mode = "set2";
      lockUI();
    } else if (mode === "set2") {
      if (pin !== first) {
        mode = "set1";
        return bad("PINs did not match");
      }
      S.pin = hash(pin);
      save();
      toast("PIN saved");
      done();
    }
  }, 120);
}
function done() {
  $("#lock").classList.add("hidden");
  pin = "";
  if (after) after();
  after = null;
  refresh();
}

/* navigation */
function go(t) {
  $$(".tab").forEach((e) => e.classList.toggle("on", e.id === t));
  $$("nav button").forEach((b) => b.classList.toggle("on", b.dataset.go === t));
  t === "scan" ? startCam() : stopCam();
  if (t === "rec") viewId = S.cur;
  refresh();
}
$$("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));

/* render */
function refresh() {
  const s = cur(),
    T = total(),
    n = s.rows.length,
    l = s.rows[n - 1];
  $("#pill").textContent = s.name;
  $("#sessName").value = s.name;
  $("#presT").textContent = T ? n + " / " + T : n;
  $("#presV").textContent = n;
  $("#presV").parentElement.style.setProperty(
    "--p",
    T ? Math.min(100, (n / T) * 100) : 100,
  );
  $("#dupT").textContent = s.dups || 0;
  $("#lastT").textContent = l ? label(l.c) + " · " + fmtT(l.t) : "—";
  $("#oSound").checked = S.sound;
  $("#oVib").checked = S.vib;
  $("#oDup").checked = S.dup;
  $("#oLock").checked = S.lock;
  $("#oOnly").checked = S.only;
  if ($("#cameraFacing"))
    $("#cameraFacing").value = S.cameraFacing || "environment";
  populatePalmStudents();
  renderPalmRecords();
  $("#rosterInfo").textContent = T
    ? T + " students on the class list."
    : "No class list yet. Import the QR cards PDF.";
  $("#latest").innerHTML = s.rows
    .slice(-4)
    .reverse()
    .map((r) => `<div>${esc(label(r.c))}<span>${fmtT(r.t)}</span></div>`)
    .join("");
  renderTable();
}
function renderTable() {
  const v = view(),
    q = $("#search").value.trim().toLowerCase(),
    seen = new Set(v.rows.map((r) => r.c.toUpperCase()));
  $("#sessSel").innerHTML = S.sessions
    .map(
      (x) =>
        `<option value="${x.id}" ${x.id === v.id ? "selected" : ""}>${esc(x.name)} (${x.rows.length})</option>`,
    )
    .join("");
  const T = total();
  $("#cnt").textContent = v.rows.length + (T ? " / " + T : "") + " present";
  $("#absBtn").textContent = absMode
    ? "Show present students"
    : "Show absent students (" +
      Math.max(0, Object.keys(S.roster).filter((k) => !seen.has(k)).length) +
      ")";
  let html = "",
    n = 0;
  if (absMode) {
    Object.entries(S.roster)
      .filter(([k]) => !seen.has(k))
      .sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([k, name]) => {
        if (q && !(name + k).toLowerCase().includes(q)) return;
        n++;
        html += `<tr class="abs"><td>${n}</td><td><b>${esc(name)}</b><small>${esc(k)}</small></td><td class="t">Absent</td><td></td></tr>`;
      });
  } else
    v.rows.forEach((r, i) => {
      if (q && !(label(r.c) + r.c).toLowerCase().includes(q)) return;
      n++;
      html += `<tr><td>${i + 1}</td><td><b>${esc(label(r.c))}</b><small>${esc(r.c)}</small></td><td class="t">${fmtT(r.t)}</td><td><button data-d="${i}">✕</button></td></tr>`;
    });
  $("#tb").innerHTML = html;
  $("#empty").classList.toggle("hidden", n > 0);
  $("#empty").textContent = absMode
    ? "Everyone is present. 🎉"
    : "No scans yet. Open Scan to start.";
}
$("#tb").onclick = (e) => {
  const i = e.target.dataset.d;
  if (i == null) return;
  const v = view();
  if (confirm('Remove "' + label(v.rows[i].c) + '"?')) {
    v.rows.splice(i, 1);
    save();
    refresh();
  }
};
$("#sessSel").onchange = (e) => {
  viewId = e.target.value;
  renderTable();
};
$("#search").oninput = renderTable;
$("#absBtn").onclick = () => {
  absMode = !absMode;
  renderTable();
};

/* QR and palm attendance histories are intentionally independent. */
if ($("#qrRecordsMode"))
  $("#qrRecordsMode").onclick = () => {
    $("#qrRecordsPanel").classList.remove("hidden");
    $("#palmRecordsPanel").classList.add("hidden");
    $("#qrRecordsMode").classList.remove("ghost");
    $("#palmRecordsMode").classList.add("ghost");
  };
if ($("#palmRecordsMode"))
  $("#palmRecordsMode").onclick = () => {
    $("#qrRecordsPanel").classList.add("hidden");
    $("#palmRecordsPanel").classList.remove("hidden");
    $("#palmRecordsMode").classList.remove("ghost");
    $("#qrRecordsMode").classList.add("ghost");
    renderPalmRecords();
  };
if ($("#palmSearch")) $("#palmSearch").oninput = renderPalmRecords;
if ($("#exportPalmCSV"))
  $("#exportPalmCSV").onclick = async () => {
    const q = (x) => '"' + String(x).replace(/"/g, '""') + '"';
    const lines = ["No.,Student No.,Name,Date,Time,Entry"];
    palmRecords
      .slice()
      .sort((a, b) => a.time - b.time)
      .forEach((r, i) =>
        lines.push(
          [
            i + 1,
            q(r.studentId),
            q(label(r.studentId)),
            r.date,
            fmtT(r.time),
            "Palm",
          ].join(","),
        ),
      );
    if (!palmRecords.length) return toast("No palm records to export");
    const csv = "\ufeff" + lines.join("\r\n"),
      name = "palm_attendance_" + fmtD(Date.now()) + ".csv",
      P = window.Capacitor && Capacitor.Plugins;
    try {
      const w = await P.Filesystem.writeFile({
        path: name,
        data: csv,
        directory: "CACHE",
        encoding: "utf8",
      });
      await P.Share.share({
        title: name,
        url: w.uri,
        dialogTitle: "Save or send palm attendance",
      });
    } catch (e) {
      if (e && /cancel/i.test(e.message || "")) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = name;
      a.click();
    }
  };
if ($("#clearPalmRecords"))
  $("#clearPalmRecords").onclick = () => {
    if (!palmRecords.length) return toast("No palm records to clear");
    if (
      confirm(
        "Clear all palm attendance records? QR attendance records will not be affected.",
      )
    ) {
      palmRecords = [];
      savePalmRecords();
      renderPalmRecords();
      toast("Palm records cleared");
    }
  };

/* scanning */
const vid = $("#vid"),
  cv = document.createElement("canvas"),
  cx = cv.getContext("2d", { willReadFrequently: true });
let stream,
  raf,
  wl,
  last = { c: "", t: 0 },
  ac,
  ftm;
let scanMode = "qr";
async function startCam() {
  if (stream) return;
  $("#camErr").classList.add("hidden");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: S.cameraFacing || "environment" },
        width: { ideal: 1280 },
        height: { ideal: 1280 },
      },
      audio: false,
    });
    vid.srcObject = stream;
    await vid.play();
    tick();
    try {
      wl = await navigator.wakeLock.request("screen");
    } catch (e) {}
  } catch (e) {
    stream = null;
    $("#camErr").textContent =
      "Camera unavailable. Allow camera access, then try the other camera. " +
      (e.message || "");
    $("#camErr").classList.remove("hidden");
  }
}
function stopCam() {
  cancelAnimationFrame(raf);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  try {
    wl && wl.release();
    wl = null;
  } catch (e) {}
}
function tick() {
  if (!stream) return;
  // Palm capture reads the video directly on demand; don't run QR canvas work in that mode.
  if (scanMode !== "qr") {
    raf = requestAnimationFrame(tick);
    return;
  }
  if (vid.readyState >= 2 && vid.videoWidth) {
    const sc = Math.min(1, 640 / vid.videoWidth);
    cv.width = (vid.videoWidth * sc) | 0;
    cv.height = (vid.videoHeight * sc) | 0;
    cx.drawImage(vid, 0, 0, cv.width, cv.height);
    if (scanMode === "qr") {
      const d = cx.getImageData(0, 0, cv.width, cv.height),
        r = jsQR(d.data, d.width, d.height, {
          inversionAttempts: "dontInvert",
        });
      if (r && r.data && r.data.trim()) onCode(r.data.trim());
    }
  }
  raf = requestAnimationFrame(tick);
}

/* Offline palm recognition: MediaPipe hand landmarks + CCNet ONNX embeddings.
 * No network calls are made by the app. Models are packaged under www/models.
 * The liveness gesture challenge is a basic replay deterrent, not certified PAD.
 */
const PALM_DB = "palm-attendance-biometric-v2";
const PALM_ATTENDANCE_KEY = "palm_attendance_records_v1";
let palmBusy = false;
let palmRecords = [];
try {
  palmRecords = JSON.parse(localStorage.getItem(PALM_ATTENDANCE_KEY) || "[]");
} catch (_) {
  palmRecords = [];
}
function savePalmRecords() {
  localStorage.setItem(PALM_ATTENDANCE_KEY, JSON.stringify(palmRecords));
}
function markPalmAttendance(studentId) {
  const day = fmtD(Date.now());
  const existing = palmRecords.find(
    (r) => r.studentId === studentId && r.date === day,
  );
  if (existing) {
    toast("Already marked present by palm today");
    palmStatus(
      "Palm attendance already recorded for " + label(studentId) + " today.",
    );
    return false;
  }
  palmRecords.push({ studentId, date: day, time: Date.now(), method: "Palm" });
  savePalmRecords();
  renderPalmRecords();
  beep(880);
  if (S.vib && navigator.vibrate) navigator.vibrate(60);
  toast("Palm attendance recorded");
  return true;
}
function renderPalmRecords() {
  const body = $("#palmTb");
  if (!body) return;
  const q = (($("#palmSearch") && $("#palmSearch").value) || "")
    .trim()
    .toLowerCase();
  const rows = palmRecords
    .slice()
    .sort((a, b) => b.time - a.time)
    .filter((r) =>
      (label(r.studentId) + r.studentId + r.date).toLowerCase().includes(q),
    );
  body.innerHTML = rows
    .map(
      (r, i) =>
        `<tr><td>${i + 1}</td><td><b>${esc(label(r.studentId))}</b><small>${esc(r.studentId)}</small></td><td class="t">${esc(r.date)} ${fmtT(r.time)}</td><td></td></tr>`,
    )
    .join("");
  const count = $("#palmCnt");
  if (count) count.textContent = rows.length + " palm records";
  const empty = $("#palmEmpty");
  if (empty) empty.classList.toggle("hidden", rows.length > 0);
}
function palmStatus(msg) {
  const el = $("#palmStatus");
  if (el) el.textContent = msg;
}
function populatePalmStudents() {
  const sel = $("#palmStudent");
  if (!sel) return;
  const old = sel.value;
  sel.innerHTML = Object.entries(S.roster)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(
      ([id, name]) =>
        `<option value="${esc(id)}">${esc(name)} · ${esc(id)}</option>`,
    )
    .join("");
  if (old && S.roster[old]) sel.value = old;
}
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return dot / (Math.sqrt(aa * bb) || 1);
}
function openPalmDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PALM_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("templates"))
        db.createObjectStore("templates", { keyPath: "studentId" });
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function palmCryptoKey() {
  if (!window.crypto || !crypto.subtle)
    throw new Error("Secure local storage is unavailable in this WebView.");
  const db = await openPalmDB();
  let key = await new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readonly"),
      r = tx.objectStore("keys").get("device-key");
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
  if (!key) {
    key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await new Promise((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      tx.objectStore("keys").put(key, "device-key");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  db.close();
  return key;
}
function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function palmDBPut(record) {
  const key = await palmCryptoKey(),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(
    JSON.stringify({
      descriptor: record.descriptor,
      samples: record.samples,
      updatedAt: record.updatedAt,
      descriptorVersion: record.descriptorVersion,
      model: record.model,
    }),
  );
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plain,
  );
  const db = await openPalmDB(),
    stored = {
      studentId: record.studentId,
      iv: toB64(iv),
      cipher: toB64(cipher),
    };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("templates", "readwrite");
    tx.objectStore("templates").put(stored);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
async function palmDBGetAll() {
  const db = await openPalmDB();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction("templates", "readonly"),
      r = tx.objectStore("templates").getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
  db.close();
  const key = await palmCryptoKey(),
    out = [];
  for (const row of rows) {
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromB64(row.iv) },
        key,
        fromB64(row.cipher),
      );
      const record = {
        studentId: row.studentId,
        ...JSON.parse(new TextDecoder().decode(plain)),
      };
      if (record.descriptorVersion === 2 && record.model === "CCNet")
        out.push(record);
    } catch (e) {
      console.warn(
        "Skipping unreadable or incompatible palm template",
        row.studentId,
      );
    }
  }
  return out;
}
async function palmDBDelete(id) {
  const db = await openPalmDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("templates", "readwrite");
    tx.objectStore("templates").delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/* Portable, password-encrypted palm backup. The device AES key is never exported.
 * Export decrypts templates in memory, then re-encrypts the bundle with a
 * password-derived AES-GCM key so another phone can import it offline.
 */
const PALM_BACKUP_FORMAT = "EVC-PALM-BACKUP";
const PALM_BACKUP_VERSION = 1;
const PALM_BACKUP_ITERATIONS = 310000;
function bytesToB64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
function b64ToBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
async function backupKeyFromPassword(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PALM_BACKUP_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
function askBackupPassword(confirmPassword) {
  const password = prompt(
    "Create a backup password (at least 10 characters). You will need this password on the other phone:",
  );
  if (password === null) return null;
  if (password.length < 10)
    throw new Error("Use a backup password with at least 10 characters.");
  if (confirmPassword) {
    const again = prompt("Enter the backup password again to confirm:");
    if (again === null) return null;
    if (password !== again) throw new Error("The passwords do not match.");
  }
  return password;
}
function validatePalmBackupPayload(payload) {
  if (
    !payload ||
    payload.schema !== PALM_BACKUP_FORMAT ||
    payload.version !== PALM_BACKUP_VERSION
  )
    throw new Error("This is not a supported Palm Attendance backup.");
  if (!Array.isArray(payload.templates) || !payload.templates.length)
    throw new Error("The backup contains no registered palm templates.");
  for (const r of payload.templates) {
    if (
      !r ||
      typeof r.studentId !== "string" ||
      !r.studentId.trim() ||
      !Array.isArray(r.descriptor) ||
      !r.descriptor.length ||
      !r.descriptor.every((v) => Number.isFinite(v)) ||
      r.descriptorVersion !== 2 ||
      r.model !== "CCNet"
    )
      throw new Error(
        "The backup contains an invalid or incompatible palm template.",
      );
  }
  if (
    !payload.roster ||
    typeof payload.roster !== "object" ||
    Array.isArray(payload.roster)
  )
    throw new Error("The backup student roster is invalid.");
}
async function exportPalmBackup() {
  try {
    const records = await palmDBGetAll();
    if (!records.length)
      return toast("No registered palm templates to export.");
    const password = askBackupPassword(true);
    if (password === null) return;
    const payload = {
      schema: PALM_BACKUP_FORMAT,
      version: PALM_BACKUP_VERSION,
      appId: "com.evc.palmattendance",
      createdAt: new Date().toISOString(),
      templateCount: records.length,
      roster: S.roster,
      templates: records,
    };
    validatePalmBackupPayload(payload);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await backupKeyFromPassword(password, salt);
    const plain = new TextEncoder().encode(JSON.stringify(payload));
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plain,
    );
    const envelope = {
      format: PALM_BACKUP_FORMAT,
      version: PALM_BACKUP_VERSION,
      kdf: "PBKDF2-SHA256",
      iterations: PALM_BACKUP_ITERATIONS,
      cipher: "AES-256-GCM",
      salt: bytesToB64(salt),
      iv: bytesToB64(iv),
      data: bytesToB64(new Uint8Array(cipher)),
    };
    const filename =
      "Palm_Attendance_Backup_" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      ".palmbackup";
    const json = JSON.stringify(envelope);
    const P = window.Capacitor && window.Capacitor.Plugins;
    if (P && P.Filesystem && P.Share) {
      const written = await P.Filesystem.writeFile({
        path: filename,
        data: json,
        directory: "CACHE",
        encoding: "utf8",
      });
      await P.Share.share({
        title: "Palm Attendance encrypted backup",
        text: "Encrypted palm registrations and student roster. Keep the backup password safe.",
        url: written.uri,
        dialogTitle: "Share Palm Attendance backup",
      });
    } else {
      const blob = new Blob([json], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    palmStatus(
      "Encrypted backup created for " +
        records.length +
        " registered palms. Transfer the file and password separately.",
    );
    toast("Palm backup ready to share");
  } catch (e) {
    palmStatus("Palm backup export failed: " + (e.message || e));
    toast("Could not export palm backup");
  }
}
async function importPalmBackup(file) {
  if (!file) return;
  try {
    const envelope = JSON.parse(await file.text());
    if (
      !envelope ||
      envelope.format !== PALM_BACKUP_FORMAT ||
      envelope.version !== PALM_BACKUP_VERSION ||
      envelope.kdf !== "PBKDF2-SHA256" ||
      envelope.cipher !== "AES-256-GCM" ||
      envelope.iterations !== PALM_BACKUP_ITERATIONS
    )
      throw new Error("Unsupported or damaged backup file.");
    const password = prompt(
      "Enter the password used when this Palm Attendance backup was exported:",
    );
    if (password === null) return;
    let plain;
    try {
      const key = await backupKeyFromPassword(
        password,
        b64ToBytes(envelope.salt),
      );
      plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64ToBytes(envelope.iv) },
        key,
        b64ToBytes(envelope.data),
      );
    } catch (_) {
      throw new Error(
        "Incorrect backup password or the backup file is damaged.",
      );
    }
    const payload = JSON.parse(new TextDecoder().decode(plain));
    validatePalmBackupPayload(payload);
    const existing = await palmDBGetAll();
    const incomingIds = new Set(payload.templates.map((r) => r.studentId));
    const overlap = existing.filter((r) => incomingIds.has(r.studentId)).length;
    const choice = confirm(
      `Import ${payload.templates.length} registered palm templates and ${Object.keys(payload.roster).length} roster entries?\n` +
        `${overlap} student palm template(s) already exist on this phone and will be replaced.\n\n` +
        "Choose OK to merge the backup. Choose Cancel to stop.",
    );
    if (!choice) return;
    // Validate every record before writing; each device encrypts templates with its own local key.
    for (const r of payload.templates) {
      if (!payload.roster[r.studentId] && !S.roster[r.studentId])
        throw new Error(
          "A palm template refers to a student missing from the backup roster.",
        );
    }
    const previousRoster = S.roster;
    S.roster = Object.assign({}, S.roster, payload.roster);
    try {
      for (const r of payload.templates) await palmDBPut(r);
      save();
      populatePalmStudents();
    } catch (writeError) {
      S.roster = previousRoster;
      throw writeError;
    }
    palmStatus(
      `Imported ${payload.templates.length} palm templates. This phone is ready for offline palm attendance, subject to model availability.`,
    );
    toast("Palm registrations imported");
  } catch (e) {
    palmStatus("Palm backup import failed: " + (e.message || e));
    alert("Could not import Palm Attendance backup.\n" + (e.message || e));
  }
}
function friendlyPalmModelError(error) {
  const raw = String(
    (error && (error.message || error)) || "Unknown model error",
  );
  if (
    /palm_ccnet\\.onnx|failed to load external data file|no such file|not found/i.test(
      raw,
    )
  ) {
    return "The trained CCNet palm model is not installed in this app. Add an authorized palm_ccnet.onnx model to www/models/ and rebuild the APK. QR and manual attendance are still available.";
  }
  if (/PalmEngine|offline palm engine is missing/i.test(raw)) {
    return "The offline palm engine is missing from this build. Restore www/palm-engine.js and rebuild the APK. QR and manual attendance are still available.";
  }
  return raw;
}

async function ensurePalmModel() {
  if (!window.PalmEngine || typeof window.PalmEngine.initPalm !== "function") {
    throw new Error(
      "The offline palm engine is missing from this build. QR and manual attendance are still available.",
    );
  }
  palmStatus("Loading offline hand and palm AI models…");
  try {
    await window.PalmEngine.initPalm();
  } catch (error) {
    throw new Error(friendlyPalmModelError(error));
  }
}
async function runLiveness() {
  palmStatus("Starting randomized liveness challenge…");
  await window.PalmEngine.livenessChallenge(vid, (msg) =>
    palmStatus("Liveness check: " + msg),
  );
  palmStatus("Liveness challenge passed. Capturing palm features…");
}
async function captureSamples(count, gapMs = 500) {
  const samples = [];
  for (let i = 0; i < count; i++) {
    palmStatus(
      `Extracting trained palm embedding ${i + 1} of ${count}. Keep your palm steady…`,
    );
    await new Promise((r) => setTimeout(r, gapMs));
    samples.push(await window.PalmEngine.capture(vid));
  }
  return samples;
}
function averageDescriptors(samples) {
  const out = new Array(samples[0].length).fill(0);
  samples.forEach((s) => s.forEach((v, i) => (out[i] += v / samples.length)));
  let n = Math.sqrt(out.reduce((a, v) => a + v * v, 0)) || 1;
  return out.map((v) => v / n);
}
async function registerPalm() {
  if (palmBusy) return;
  const id = $("#palmStudent").value;
  if (!id) return toast("Import or select a student first.");
  if (!S.roster[id]) return toast("Selected student is not in the class list.");
  // In-app consent checkbox avoids unreliable confirm() dialogs in Android WebView.
  const consent = $("#palmConsent");
  if (!consent || !consent.checked) {
    palmStatus(
      "Registration paused. Obtain the student's voluntary consent, then check the consent box and press Register palm again. QR/manual attendance remains available.",
    );
    toast("Consent is required before palm registration.");
    return;
  }
  palmBusy = true;
  try {
    if (!stream) await startCam();
    if (!stream) throw new Error("Camera permission is required.");
    await ensurePalmModel();
    await runLiveness();
    const samples = await captureSamples(3);
    await palmDBPut({
      studentId: id,
      descriptor: averageDescriptors(samples),
      samples: 3,
      updatedAt: Date.now(),
      descriptorVersion: 2,
      model: "CCNet",
    });
    palmStatus(
      "Trained-model palm template registered for " +
        label(id) +
        ". This model still requires local accuracy validation.",
    );
    toast("Palm registered");
  } catch (e) {
    palmStatus("Registration unavailable: " + (e.message || e));
  } finally {
    palmBusy = false;
  }
}
async function scanPalm() {
  if (palmBusy) return;
  palmBusy = true;
  try {
    if (!stream) await startCam();
    if (!stream) throw new Error("Camera permission is required.");
    await ensurePalmModel();
    await runLiveness();
    const probe = averageDescriptors(await captureSamples(2, 350));
    const records = await palmDBGetAll();
    if (!records.length) {
      palmStatus("No compatible CCNet palm templates registered yet.");
      return;
    }
    const ranked = records
      .map((r) => ({ r, score: cosine(probe, r.descriptor) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0],
      second = ranked[1];
    // Provisional threshold only. It is NOT a calibrated FAR/FRR operating point.
    if (
      !best ||
      best.score < 0.88 ||
      (second && best.score - second.score < 0.04)
    ) {
      palmStatus(
        "No sufficiently separated match. Try again or use QR/manual attendance.",
      );
      beep(220);
      return;
    }
    const student = label(best.r.studentId);
    const accepted = confirm(
      `Possible palm match: ${student}\nRaw cosine score: ${best.score.toFixed(3)} (not a probability)\n\nConfirm attendance?`,
    );
    if (accepted) {
      const saved = markPalmAttendance(best.r.studentId);
      if (saved)
        palmStatus(
          "Palm attendance recorded for " +
            student +
            " after manual confirmation.",
        );
    } else palmStatus("Match rejected. No attendance recorded.");
  } catch (e) {
    palmStatus("Palm scan unavailable: " + (e.message || e));
  } finally {
    palmBusy = false;
  }
}
$("#cameraFacing").onchange = async (e) => {
  S.cameraFacing = e.target.value;
  save();
  if ($("#scan").classList.contains("on")) {
    stopCam();
    await startCam();
  }
};
$("#qrMode").onclick = () => {
  scanMode = "qr";
  $("#qrMode").classList.remove("ghost");
  $("#palmMode").classList.add("ghost");
  $("#qrControls").classList.remove("hidden");
  $("#palmControls").classList.add("hidden");
  palmStatus("QR scanning mode.");
};
$("#palmMode").onclick = async () => {
  scanMode = "palm";
  $("#palmMode").classList.remove("ghost");
  $("#qrMode").classList.add("ghost");
  $("#qrControls").classList.add("hidden");
  $("#palmControls").classList.remove("hidden");
  try {
    if (!stream) await startCam();
    await window.PalmEngine.initHand();
    palmStatus(
      "Offline hand detection ready. Load the licensed CCNet model to enable palm identity matching.",
    );
  } catch (e) {
    palmStatus("Offline hand model unavailable: " + friendlyPalmModelError(e));
  }
};
$("#registerPalm").onclick = registerPalm;
$("#scanPalm").onclick = scanPalm;
$("#deletePalm").onclick = async () => {
  const id = $("#palmStudent").value;
  if (!id) return toast("Select a student.");
  if (
    !confirm(
      "Permanently delete this student's palm template from this device?",
    )
  )
    return;
  try {
    await palmDBDelete(id);
    palmStatus("Palm template deleted.");
    toast("Template deleted");
  } catch (e) {
    palmStatus("Could not delete template: " + e.message);
  }
};
$("#exportPalmBackup").onclick = exportPalmBackup;
$("#importPalmBackup").onclick = () => $("#palmBackupFile").click();
$("#palmBackupFile").onchange = (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (file) importPalmBackup(file);
};

function beep(f) {
  if (!S.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.frequency.value = f;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.12);
  } catch (e) {}
}
function flash(msg, warn) {
  const f = $("#flash");
  f.textContent = msg;
  f.className = "flash" + (warn ? " warn" : "");
  clearTimeout(ftm);
  ftm = setTimeout(() => f.classList.add("hidden"), 2200);
}
function add(raw, manual) {
  const c = raw.trim(),
    s = cur(),
    name = nm(c);
  if (S.only && total() && !name) {
    beep(220);
    S.vib && navigator.vibrate && navigator.vibrate([200]);
    flash("✕ Not on class list: " + c, true);
    return false;
  }
  if (S.dup && s.rows.some((r) => r.c.toUpperCase() === c.toUpperCase())) {
    s.dups = (s.dups || 0) + 1;
    save();
    beep(300);
    S.vib && navigator.vibrate && navigator.vibrate([80, 60, 80]);
    flash("⚠ Already scanned: " + label(c), true);
    refresh();
    return false;
  }
  s.rows.push({ c, t: Date.now(), m: manual ? 1 : 0 });
  save();
  beep(880);
  S.vib && navigator.vibrate && navigator.vibrate(60);
  flash("✓ " + label(c));
  refresh();
  return true;
}
function onCode(c) {
  const n = Date.now();
  if (c === last.c && n - last.t < 2500) {
    last.t = n;
    return;
  }
  last = { c, t: n };
  add(c);
}
$("#manBtn").onclick = () => {
  const v = (prompt("Type student no. (e.g. 00066) or part of the name:") || "")
    .trim()
    .toUpperCase();
  if (!v) return;
  const m = Object.entries(S.roster).filter(
    ([k, n]) => k === v || k.includes(v) || n.toUpperCase().includes(v),
  );
  if (m.length === 1) add(m[0][0], true);
  else if (!m.length)
    (toast(total() ? "No match on the class list" : "Class list is empty"),
      !total() && add(v, true));
  else toast(m.length + " matches. Type more of the number or name.", 3000);
};
$("#torch").onclick = async () => {
  try {
    if (!stream) throw new Error("Camera is not running");
    const t = stream.getVideoTracks()[0];
    t._on = !t._on;
    await t.applyConstraints({ advanced: [{ torch: t._on }] });
  } catch (e) {
    toast("Light not supported");
  }
};

/* export: full class list with Present/Absent */
async function exportCSV() {
  const v = cur();
  if (!v.rows.length && !total()) return toast("Nothing to export");
  const q = (x) => '"' + String(x).replace(/"/g, '""') + '"',
    at = {};
  v.rows.forEach((r) => (at[r.c.toUpperCase()] = r));
  const line = (i, id, n, r) =>
    [
      i,
      q(id),
      q(n),
      r ? "Present" : "Absent",
      r ? fmtD(r.t) : "",
      r ? fmtT(r.t) : "",
      r ? (r.m ? "Manual" : "Scan") : "",
    ].join(",");
  let i = 0;
  const L = ["No.,Student No.,Name,Status,Date,Time,Entry"];
  Object.entries(S.roster)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([k, n]) => L.push(line(++i, k, n, at[k])));
  v.rows
    .filter((r) => !nm(r.c))
    .forEach((r) => L.push(line(++i, r.c, "Unknown student", r)));
  const csv = "\ufeff" + L.join("\r\n");
  const name =
      (v.name.replace(/[^\w\-]+/g, "_") || "attendance") +
      "_" +
      fmtD(v.created) +
      ".csv",
    P = window.Capacitor && Capacitor.Plugins;
  try {
    const w = await P.Filesystem.writeFile({
      path: name,
      data: csv,
      directory: "CACHE",
      encoding: "utf8",
    });
    await P.Share.share({
      title: name,
      url: w.uri,
      dialogTitle: "Save or send attendance",
    });
  } catch (e) {
    if (e && /cancel/i.test(e.message || "")) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = name;
    a.click();
  }
}
$("#expBtn").onclick = $("#expTile").onclick = exportCSV;

/* import class list from a QR-cards PDF */
async function importPDF(file) {
  if (!window.pdfjsLib) return alert("PDF reader is missing from this build.");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";
  const found = {};
  let cards = 0,
    noQR = 0;
  const med = (a) => {
    a = [...a].sort((x, y) => x - y);
    return a[a.length >> 1];
  };
  /* decode one cropped card, retrying at other sizes */
  const readQR = (src) => {
    for (const k of [1, 1.5, 2, 0.7, 1.25]) {
      const w = Math.round((src.width + 100) * k),
        h = Math.round((src.height + 100) * k),
        t = document.createElement("canvas");
      t.width = w;
      t.height = h;
      const g = t.getContext("2d", { willReadFrequently: true });
      g.fillStyle = "#fff";
      g.fillRect(0, 0, w, h);
      g.imageSmoothingEnabled = false;
      g.drawImage(src, 50 * k, 50 * k, src.width * k, src.height * k);
      const d = g.getImageData(0, 0, w, h),
        r = jsQR(d.data, w, h, { inversionAttempts: "attemptBoth" });
      if (r && r.data && r.data.trim()) return r.data.trim();
    }
    return null;
  };
  try {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() })
      .promise;
    for (let p = 1; p <= pdf.numPages; p++) {
      toast("Reading page " + p + " of " + pdf.numPages + "…", 60000);
      await new Promise((r) => setTimeout(r, 30));
      const page = await pdf.getPage(p),
        vp = page.getViewport({
          scale: 1200 / page.getViewport({ scale: 1 }).width,
        });
      const c = document.createElement("canvas");
      c.width = vp.width | 0;
      c.height = vp.height | 0;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.fillStyle = "#fff";
      x.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: x, viewport: vp }).promise;
      /* 1. text lines: the names printed under each QR */
      const items = (await page.getTextContent()).items
        .filter((i) => i.str.trim())
        .map((i) => {
          const t = pdfjsLib.Util.transform(vp.transform, i.transform);
          return {
            s: i.str.trim(),
            x: t[4],
            y: t[5],
            w: i.width * vp.scale,
            h: Math.abs(i.height * vp.scale) || 12,
          };
        });
      items.sort(
        (a, b) => Math.round(a.y / 4) - Math.round(b.y / 4) || a.x - b.x,
      );
      const lines = [];
      for (const it of items) {
        const l = lines[lines.length - 1];
        if (
          l &&
          Math.abs(l.y - it.y) < 4 &&
          it.x - l.x1 < 18 &&
          it.x >= l.x0 - 1
        ) {
          l.s += " " + it.s;
          l.x1 = it.x + it.w;
        } else
          lines.push({ s: it.s, y: it.y, x0: it.x, x1: it.x + it.w, h: it.h });
      }
      lines.forEach((l) => (l.cx = (l.x0 + l.x1) / 2));
      /* 2. group lines into columns, then into name blocks (one per card) */
      const cols = [];
      for (const l of [...lines].sort((a, b) => a.cx - b.cx)) {
        const k = cols[cols.length - 1];
        if (k && Math.abs(l.cx - k[k.length - 1].cx) < 20) k.push(l);
        else cols.push([l]);
      }
      const cxs = cols.map((k) => k.reduce((s, l) => s + l.cx, 0) / k.length),
        diffs = cxs.slice(1).map((v, i) => v - cxs[i]);
      const pitch = diffs.length ? med(diffs) : c.width * 0.26,
        blocks = [];
      for (const k of cols) {
        k.sort((a, b) => a.y - b.y);
        let b = [k[0]];
        for (const l of k.slice(1)) {
          if (l.y - b[b.length - 1].y > c.width * 0.05) {
            blocks.push(b);
            b = [l];
          } else b.push(l);
        }
        blocks.push(b);
      }
      /* 3. for each name, read the QR in the card area just above it */
      for (const b of blocks) {
        cards++;
        const cxm = b.reduce((s, l) => s + l.cx, 0) / b.length,
          f = b[0];
        const yb = Math.max(1, Math.round(f.y - f.h * 1.1)),
          yt = Math.max(0, Math.round(yb - pitch * 1.05)),
          x0 = Math.max(0, Math.round(cxm - pitch * 0.46)),
          x1 = Math.min(c.width, Math.round(cxm + pitch * 0.46));
        const crop = document.createElement("canvas");
        crop.width = x1 - x0;
        crop.height = yb - yt;
        crop
          .getContext("2d")
          .drawImage(c, x0, yt, x1 - x0, yb - yt, 0, 0, x1 - x0, yb - yt);
        const id = readQR(crop),
          name = b
            .map((l) => l.s)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        if (id && name) found[id.toUpperCase()] = name;
        else noQR++;
      }
    }
  } catch (e) {
    $("#toast").classList.add("hidden");
    return alert("Could not read that PDF.\n" + (e.message || e));
  }
  $("#toast").classList.add("hidden");
  const n = Object.keys(found).length;
  if (!n)
    return alert("No QR codes with a name below them were found in this PDF.");
  const had = total();
  Object.assign(S.roster, found);
  save();
  refresh();
  alert(
    "Imported " +
      n +
      " of " +
      cards +
      " students found in the PDF." +
      (noQR
        ? "\n" + noQR + " names had no readable QR code and were skipped."
        : "") +
      "\nClass list now has " +
      total() +
      " students.",
  );
}
$("#impBtn").onclick = () => $("#pdfIn").click();
$("#pdfIn").onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) importPDF(f);
};
$("#resetRos").onclick = () => {
  if (!window.ROSTER_DEFAULT) return toast("No built-in list");
  if (confirm("Replace the class list with the built-in BSIT-2 list?")) {
    S.roster = Object.assign({}, window.ROSTER_DEFAULT);
    save();
    refresh();
    toast("BSIT-2 list restored");
  }
};
$("#clrRos").onclick = () => {
  if (
    confirm(
      "Remove all students from the class list? Existing scan records are kept.",
    )
  ) {
    S.roster = {};
    save();
    refresh();
  }
};

/* actions */
$("#renameBtn").onclick = () => {
  const n = $("#sessName").value.trim();
  if (!n) return toast("Enter a name");
  cur().name = n;
  save();
  refresh();
  toast("Saved");
};
$("#newBtn").onclick = () => {
  const n = prompt(
    "Name for the new session:",
    $("#sessName").value.trim() + " " + fmtD(Date.now()),
  );
  if (n) {
    mk(n.trim());
    refresh();
    toast("New session started");
  }
};
$("#clrBtn").onclick = () => {
  const v = view();
  if (
    v.rows.length &&
    confirm("Clear all " + v.rows.length + " records in this session?")
  ) {
    v.rows = [];
    v.dups = 0;
    save();
    refresh();
  }
};
$("#delSess").onclick = () => {
  const s = cur();
  if (confirm('Delete "' + s.name + '" and its records?')) {
    S.sessions = S.sessions.filter((x) => x !== s);
    S.cur = null;
    save();
    cur();
    refresh();
    toast("Deleted");
  }
};
$("#pinBtn").onclick = () => showLock("cur");
[
  ["oSound", "sound"],
  ["oVib", "vib"],
  ["oDup", "dup"],
  ["oLock", "lock"],
  ["oOnly", "only"],
].forEach(
  ([id, k]) =>
    ($("#" + id).onchange = (e) => {
      S[k] = e.target.checked;
      save();
    }),
);

/* battery */
if (navigator.getBattery)
  navigator
    .getBattery()
    .then((b) => {
      const u = () => {
        const p = Math.round(b.level * 100);
        $("#rBat").style.setProperty("--p", p);
        $("#batV").textContent = p + "%";
        $("#batT").textContent = b.charging ? "Charging" : p + "%";
      };
      u();
      b.onlevelchange = b.onchargingchange = u;
    })
    .catch(() => {});
$("#rBat").style.setProperty("--c", "var(--g)");

/* lifecycle */
let hid = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hid = Date.now();
    stopCam();
  } else {
    if (
      S.pin &&
      S.lock &&
      hid &&
      Date.now() - hid > 30000 &&
      $("#lock").classList.contains("hidden")
    )
      showLock("unlock");
    if ($("#scan").classList.contains("on")) startCam();
  }
});
build();
cur();
refresh();
S.pin ? showLock("unlock") : showLock("set1");
