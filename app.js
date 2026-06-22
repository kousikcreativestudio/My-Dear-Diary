import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtV2UTqGfnxmC8-8iauzCzf4Wmr8nlxE8",
  authDomain: "my-personal-dairy-3ea88.firebaseapp.com",
  projectId: "my-personal-dairy-3ea88",
  storageBucket: "my-personal-dairy-3ea88.firebasestorage.app",
  messagingSenderId: "1083149158022",
  appId: "1:1083149158022:web:921fd40981c451cc82f307",
  measurementId: "G-SXND511CDH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let allEntries = [];
let editingEntryId = null;
let calendarDate = new Date();
let diaryPages = [""];
let currentDiaryPageIndex = 0;

const $ = (id) => document.getElementById(id);

window.emailLogin = async function () {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  if (!email || !password) {
    alert("Enter email and password");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert(error.message);
    }
  }
};

window.googleLogin = async function () {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    alert(error.message);
  }
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    $("loginPage").classList.remove("active");
    $("diaryPage").classList.add("active");

    loadTheme();
    loadCustomDesign();
    loadLampColor();
    loadProfile(user);
    await loadEntries();
  } else {
    currentUser = null;
    $("diaryPage").classList.remove("active");
    $("loginPage").classList.add("active");

    loadCustomDesign();
    loadLampColor();
  }
});

window.logout = async function () {
  await signOut(auth);
};

function sanitizeEditorHTML(html) {
  const box = document.createElement("div");
  box.innerHTML = html;

  box.querySelectorAll("span").forEach((span) => {
    const text = (span.textContent || "").replace(/\u200B/g, "").trim();
    if (!text && span.children.length === 0) span.remove();
  });

  return box.innerHTML.replace(/\u200B/g, "");
}


function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    if(!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

window.saveEntry = async function () {
  if (!currentUser) return;

  const title = $("entryTitle").value.trim();
  
  saveCurrentDiaryPage();
  const pages = diaryPages.map(p => sanitizeEditorHTML((p || "").trim())).filter(p => stripHTML(p));
  const text = pages.join("<hr class='entry-page-break'>");
  const mood = $("entryMood").value;
  const tags = $("entryTags").value.split(",").map((t) => t.trim()).filter(Boolean);
  const mediaFile = $("entryPhoto")?.files?.[0];
  const mediaUrl = mediaFile ? await fileToDataUrl(mediaFile) : "";

  if (!pages.length) {
    alert("Write your diary first");
    return;
  }

  try {
    await addDoc(collection(db, "diaryEntries"), {
      uid: currentUser.uid,
      title: title || "Untitled Diary",
      text,
      pages,
      mood,
      tags,
      favorite: false,
      pinned: false,
      createdAt: serverTimestamp(),
      dateText: new Date().toLocaleString(),
      dateOnly: new Date().toISOString().split("T")[0],
      mediaUrl: mediaUrl || "",
      mediaType: mediaFile ? mediaFile.type : ""
    });

    $("entryTitle").value = "";

    diaryPages = [""];
    currentDiaryPageIndex = 0;
    $("entryText").innerHTML = "";
    updateWritingPageInfo();
    $("entryTags").value = "";
    removeMemoryMedia();
    await loadEntries();
  } catch (error) {
    alert(error.message);
  }
};

window.loadEntries = async function () {
  if (!currentUser) return;

  $("entriesList").innerHTML = `<div class="empty">Loading your diary...</div>`;

  const selectedDate = $("dateFilter").value;
  const q = selectedDate
    ? query(collection(db, "diaryEntries"), where("uid", "==", currentUser.uid), where("dateOnly", "==", selectedDate))
    : query(collection(db, "diaryEntries"), where("uid", "==", currentUser.uid));

  try {
    const snap = await getDocs(q);
    allEntries = [];

    snap.forEach((docSnap) => {
      allEntries.push({ id: docSnap.id, ...docSnap.data() });
    });

    allEntries.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    renderEntries();
    renderStats();
    renderCalendar();
  } catch (error) {
    $("entriesList").innerHTML = `<div class="empty">${escapeHTML(error.message)}</div>`;
  }
};

window.renderEntries = function () {
  const search = $("searchInput")?.value.toLowerCase().trim() || "";
  const mood = $("moodFilter")?.value || "";

  const list = allEntries.filter((entry) => {
    const hay = `${entry.title || ""} ${stripHTML(entry.text || "")} ${(entry.tags || []).join(" ")} ${entry.dateText || ""}`.toLowerCase();
    return (!search || hay.includes(search)) && (!mood || entry.mood === mood);
  });

  if (!list.length) {
    $("entriesList").innerHTML = `<div class="empty">No diary entries found.</div>`;
    return;
  }

  $("entriesList").innerHTML = list.map((entry) => `
    <div class="entry-card">
      <h3>${entry.pinned ? "📌 " : ""}${escapeHTML(entry.title || "Untitled Diary")} ${entry.favorite ? "⭐" : ""}</h3>
      <small>${escapeHTML(entry.dateText || "")}</small>
      <h4>${escapeHTML(entry.mood || "")}</h4>
      ${renderEntryPages(entry)}${renderMedia(entry)}
      <div class="tags">${(entry.tags || []).map((tag) => `<span class="tag">#${escapeHTML(tag)}</span>`).join("")}</div>
      <div class="entry-actions">
        <button onclick="togglePin('${entry.id}', ${!entry.pinned})">${entry.pinned ? "Unpin" : "Pin"}</button>
        <button onclick="toggleFavorite('${entry.id}', ${!entry.favorite})">${entry.favorite ? "Unfavorite" : "Favorite"}</button>
        <button onclick="openEditEntryModal('${entry.id}')">Edit</button>
        <button class="delete-btn" onclick="deleteEntry('${entry.id}')">Delete</button>
      </div>
    </div>
  `).join("");
};

window.deleteEntry = async function (id) {
  if (!confirm("Delete this diary entry?")) return;
  await deleteDoc(doc(db, "diaryEntries", id));
  await loadEntries();
};

window.togglePin = async function (id, value) {
  await updateDoc(doc(db, "diaryEntries", id), { pinned: value });
  await loadEntries();
};

window.toggleFavorite = async function (id, value) {
  await updateDoc(doc(db, "diaryEntries", id), { favorite: value });
  await loadEntries();
};

window.openEditEntryModal = function (id) {
  const entry = allEntries.find((e) => e.id === id);
  if (!entry) return;

  editingEntryId = id;
  $("editEntryTitle").value = entry.title || "";
  $("editEntryText").innerHTML = (entry.pages && entry.pages.length) ? entry.pages.join("<hr>") : (entry.text || "");
  $("editEntryTags").value = (entry.tags || []).join(", ");
  $("editEntryMood").value = entry.mood || "😊 Happy";
  $("editEntryModal").classList.add("active");
};

window.closeEditEntryModal = function () {
  editingEntryId = null;
  $("editEntryModal").classList.remove("active");
};

window.saveEditedEntry = async function () {
  if (!editingEntryId) return;

  const tags = $("editEntryTags").value.split(",").map((t) => t.trim()).filter(Boolean);

  await updateDoc(doc(db, "diaryEntries", editingEntryId), {
    title: $("editEntryTitle").value.trim() || "Untitled Diary",
    text: sanitizeEditorHTML($("editEntryText").innerHTML.trim()),
    mood: $("editEntryMood").value,
    tags
  });

  closeEditEntryModal();
  await loadEntries();
};

window.clearDateFilter = function () {
  $("dateFilter").value = "";
  loadEntries();
};

window.setTheme = function (theme) {
  document.body.className = "";
  if (theme !== "dark") document.body.classList.add(theme);
  localStorage.setItem("diaryTheme", theme);
};

function loadTheme() {
  setTheme(localStorage.getItem("diaryTheme") || "dark");
}

window.openDesignPanel = function () {
  $("primaryColor").value = localStorage.getItem("primaryColor") || "#00c3ff";
  $("accentColor").value = localStorage.getItem("accentColor") || "#ff4da6";
  $("bgColor").value = localStorage.getItem("bgColor") || "#050816";
  $("fontSelect").value = localStorage.getItem("fontChoice") || "Inter";

  const lampPicker = $("lampColor");
  if (lampPicker) lampPicker.value = localStorage.getItem("lampColor") || "#00bfff";

  $("designModal").classList.add("active");
};

window.closeDesignPanel = function () {
  $("designModal").classList.remove("active");
};

window.applyCustomDesign = function () {
  document.documentElement.style.setProperty("--primary", $("primaryColor").value);
  document.documentElement.style.setProperty("--accent", $("accentColor").value);
  document.documentElement.style.setProperty("--bg", $("bgColor").value);
  document.documentElement.style.setProperty("--font", `"${$("fontSelect").value}", Arial, sans-serif`);
};

window.saveCustomDesign = function () {
  localStorage.setItem("primaryColor", $("primaryColor").value);
  localStorage.setItem("accentColor", $("accentColor").value);
  localStorage.setItem("bgColor", $("bgColor").value);
  localStorage.setItem("fontChoice", $("fontSelect").value);

  const lampPicker = $("lampColor");
  if (lampPicker) changeLampColor(lampPicker.value);

  applyCustomDesign();
  closeDesignPanel();
};

function loadCustomDesign() {
  const primary = localStorage.getItem("primaryColor");
  const accent = localStorage.getItem("accentColor");
  const bg = localStorage.getItem("bgColor");
  const font = localStorage.getItem("fontChoice");

  if (primary) document.documentElement.style.setProperty("--primary", primary);
  if (accent) document.documentElement.style.setProperty("--accent", accent);
  if (bg) document.documentElement.style.setProperty("--bg", bg);
  if (font) document.documentElement.style.setProperty("--font", `"${font}", Arial, sans-serif`);
}

window.changeLampColor = function (color) {
  document.documentElement.style.setProperty("--lamp-color", color);
  localStorage.setItem("lampColor", color);

  const lampPicker = $("lampColor");
  if (lampPicker) lampPicker.value = color;
};

function loadLampColor() {
  changeLampColor(localStorage.getItem("lampColor") || "#00bfff");
}

function loadProfile(user) {
  const name = localStorage.getItem("profileName_" + user.uid) || user.displayName || "My Diary";
  const photo = localStorage.getItem("profilePhoto_" + user.uid) || user.photoURL || "";

  $("profileName").innerText = name;
  $("profileEmail").innerText = user.email || "No email";
  $("profileAvatar").innerHTML = photo ? `<img src="${escapeHTML(photo)}" alt="Profile">` : "👤";
}

window.openProfileModal = function () {
  $("editName").value = $("profileName").innerText;
  $("editPhoto").value = localStorage.getItem("profilePhoto_" + currentUser.uid) || currentUser.photoURL || "";
  $("profileModal").classList.add("active");
};

window.closeProfileModal = function () {
  $("profileModal").classList.remove("active");
};

window.saveProfile = function () {
  const name = $("editName").value.trim();
  const photo = $("editPhoto").value.trim();

  if (!name) {
    alert("Enter your name");
    return;
  }

  localStorage.setItem("profileName_" + currentUser.uid, name);
  localStorage.setItem("profilePhoto_" + currentUser.uid, photo);

  loadProfile(currentUser);
  closeProfileModal();
};

function renderStats() {
  $("totalCount").innerText = allEntries.length;
  $("happyCount").innerText = allEntries.filter((e) => e.mood === "😊 Happy").length;
  $("favCount").innerText = allEntries.filter((e) => e.favorite).length;
  $("pinCount").innerText = allEntries.filter((e) => e.pinned).length;
}

window.changeMonth = function (step) {
  calendarDate.setMonth(calendarDate.getMonth() + step);
  renderCalendar();
};

function renderCalendar() {
  const grid = $("calendarGrid");
  const title = $("calendarTitle");
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  title.innerText = calendarDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = days.map((day) => `<div class="cal-head-cell">${day}</div>`).join("");

  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) html += `<div></div>`;

  for (let day = 1; day <= totalDays; day++) {
    const dateOnly = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const entries = allEntries.filter((e) => e.dateOnly === dateOnly);
    const mood = entries[0]?.mood?.split(" ")[0] || "";

    html += `
      <div class="cal-day ${entries.length ? "has-entry" : ""}" onclick="filterByCalendarDate('${dateOnly}')">
        ${day}<span class="cal-mood">${mood}</span>
      </div>
    `;
  }

  grid.innerHTML = html;
}

window.filterByCalendarDate = function (dateOnly) {
  $("dateFilter").value = dateOnly;
  loadEntries();
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
};


function renderMedia(entry){
  if(!entry || !entry.mediaUrl) return "";

  if((entry.mediaType || "").startsWith("video")){
    return `
      <div class="memory-media-card">
        <video controls src="${entry.mediaUrl}" class="memory-media"></video>
      </div>
    `;
  }

  return `
    <div class="memory-media-card">
      <img src="${entry.mediaUrl}" alt="Memory photo" class="memory-media" onclick="openMediaViewer('${entry.mediaUrl}', 'image')">
    </div>
  `;
}

window.previewMemoryMedia = function(){
  const input = $("entryPhoto");
  const box = $("photoPreviewBox");
  const removeBtn = $("removePhotoBtn");

  if(!input || !box) return;

  const file = input.files && input.files[0];

  if(!file){
    box.innerHTML = "";
    if(removeBtn) removeBtn.style.display = "none";
    return;
  }

  if(file.size > 1800000){
    alert("Photo/video is too large for free Firebase document storage. Please choose file below 1.8MB.");
    input.value = "";
    box.innerHTML = "";
    if(removeBtn) removeBtn.style.display = "none";
    return;
  }

  const url = URL.createObjectURL(file);

  if(file.type.startsWith("video")){
    box.innerHTML = `
      <div class="preview-card">
        <video controls src="${url}"></video>
        <p>🎞️ ${escapeHTML(file.name)}</p>
      </div>
    `;
  }else{
    box.innerHTML = `
      <div class="preview-card">
        <img src="${url}" alt="Preview">
        <p>📷 ${escapeHTML(file.name)}</p>
      </div>
    `;
  }

  if(removeBtn) removeBtn.style.display = "block";
};

window.removeMemoryMedia = function(){
  const input = $("entryPhoto");
  const box = $("photoPreviewBox");
  const removeBtn = $("removePhotoBtn");

  if(input) input.value = "";
  if(box) box.innerHTML = "";
  if(removeBtn) removeBtn.style.display = "none";
};

window.openMediaViewer = function(url, type){
  const viewer = document.createElement("div");
  viewer.className = "media-viewer";
  viewer.innerHTML = `
    <div class="media-viewer-content">
      <button class="media-viewer-close">✕</button>
      ${type === "video"
        ? `<video controls autoplay src="${url}"></video>`
        : `<img src="${url}" alt="Memory preview">`
      }
    </div>
  `;

  viewer.addEventListener("click", function(e){
    if(e.target === viewer || e.target.classList.contains("media-viewer-close")){
      viewer.remove();
    }
  });

  document.body.appendChild(viewer);
};


function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripHTML(value) {
  const div = document.createElement("div");
  div.innerHTML = value;
  return (div.textContent || div.innerText || "").replace(/\u200B/g, "").trim();
}

/* DATE */
const todayDateEl = $("todayDate");
if (todayDateEl) {
  todayDateEl.innerText = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

/* LAMP PULL */
(function setupLampPull() {
  const pull = $("lampPull");
  const lamp = $("cuteLamp");
  if (!pull || !lamp) return;

  let startY = 0;
  let dragging = false;

  function start(e) {
    dragging = true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    pull.classList.add("dragging");
  }

  function move(e) {
    if (!dragging) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    if (y - startY > 35) turnOn();
  }

  function end() {
    dragging = false;
    pull.classList.remove("dragging");
  }

  function turnOn() {
    document.body.classList.add("lamp-on");
    lamp.classList.add("awake", "light-on", "happy");
  }

  pull.addEventListener("mousedown", start);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  pull.addEventListener("touchstart", start);
  window.addEventListener("touchmove", move);
  window.addEventListener("touchend", end);
})();

/* PREMIUM RICH TEXT EDITOR */
let savedEditorRange = null;

function saveEditorSelection() {
  const editor = $("entryText");
  const selection = window.getSelection();

  if (!editor || !selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  if (editor.contains(range.commonAncestorContainer)) {
    savedEditorRange = range.cloneRange();
  }
}

function restoreEditorSelection() {
  const editor = $("entryText");
  if (!editor) return false;
  editor.focus();

  if (!savedEditorRange) return false;

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedEditorRange);
  return true;
}

function applySpanStyle(span, styleName, value) {
  const cssMap = {
    fontFamily: "font-family",
    fontSize: "font-size",
    color: "color",
    backgroundColor: "background-color"
  };

  if (cssMap[styleName]) {
    span.style.setProperty(cssMap[styleName], value, "important");
  } else {
    span.style[styleName] = value;
  }
}

function insertFutureTypingSpan(styleName, value) {
  const editor = $("entryText");
  if (!editor) return;

  restoreEditorSelection();

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const span = document.createElement("span");
  applySpanStyle(span, styleName, value);
  span.appendChild(document.createTextNode("\u200B"));

  range.insertNode(span);

  const newRange = document.createRange();
  newRange.setStart(span.firstChild, 1);
  newRange.collapse(true);

  selection.removeAllRanges();
  selection.addRange(newRange);
  savedEditorRange = newRange.cloneRange();
}

function applyStyleToEditor(styleName, value) {
  const editor = $("entryText");
  if (!editor) return;

  restoreEditorSelection();

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    insertFutureTypingSpan(styleName, value);
    return;
  }

  const range = selection.getRangeAt(0);

  if (!editor.contains(range.commonAncestorContainer)) {
    insertFutureTypingSpan(styleName, value);
    return;
  }

  const selectedText = selection.toString();

  if (!selectedText || selectedText.trim() === "") {
    insertFutureTypingSpan(styleName, value);
    return;
  }

  const span = document.createElement("span");
  applySpanStyle(span, styleName, value);

  const content = range.extractContents();
  span.appendChild(content);
  range.insertNode(span);

  const newRange = document.createRange();
  newRange.setStartAfter(span);
  newRange.collapse(true);

  selection.removeAllRanges();
  selection.addRange(newRange);
  savedEditorRange = newRange.cloneRange();
}

window.editorCommand = function (command) {
  restoreEditorSelection();
  document.execCommand(command, false, null);
  saveEditorSelection();
};

window.formatText = window.editorCommand;

function setupPremiumEditor() {
  const editor = $("entryText");
  const fontTool = $("fontTool");
  const fontSizeTool = $("fontSizeTool");
  const textColorTool = $("textColorTool");
  const highlightTool = $("highlightTool");

  if (!editor) return;

  editor.addEventListener("mouseup", saveEditorSelection);
  editor.addEventListener("keyup", saveEditorSelection);
  editor.addEventListener("touchend", saveEditorSelection);
  editor.addEventListener("input", saveEditorSelection);

  if (fontTool) {

  fontTool.addEventListener("mousedown", saveEditorSelection);
  fontTool.addEventListener("touchstart", saveEditorSelection);
  fontTool.addEventListener("pointerdown", saveEditorSelection);

  fontTool.addEventListener("change", function () {

    saveEditorSelection();

    if (!this.value) return;

    applyStyleToEditor(
      "fontFamily",
      `"${this.value}", Arial, sans-serif`
    );

  });

}

  if (fontSizeTool) {

  fontSizeTool.addEventListener("mousedown", saveEditorSelection);
  fontSizeTool.addEventListener("touchstart", saveEditorSelection);
  fontSizeTool.addEventListener("pointerdown", saveEditorSelection);

  fontSizeTool.addEventListener("change", function () {

    saveEditorSelection();

    if (!this.value) return;

    const selected = window.getSelection()?.toString()?.trim();

    if (selected) {
      applyStyleToEditor("fontSize", this.value);
    } else {
      editor.style.setProperty("font-size", this.value, "important");
      insertFutureTypingSpan("fontSize", this.value);
    }

  });

}
  if (textColorTool) {
    textColorTool.addEventListener("mousedown", saveEditorSelection);
    textColorTool.addEventListener("input", function () {
      applyStyleToEditor("color", this.value);
    });
    textColorTool.addEventListener("change", function () {
      applyStyleToEditor("color", this.value);
    });
  }

  if (highlightTool) {
    highlightTool.addEventListener("mousedown", saveEditorSelection);
    highlightTool.addEventListener("input", function () {
      applyStyleToEditor("backgroundColor", this.value);
    });
    highlightTool.addEventListener("change", function () {
      applyStyleToEditor("backgroundColor", this.value);
    });
  }
}

setupPremiumEditor();
loadCustomDesign();
loadLampColor();



/* ===== SUPER FEATURES FINAL ADDON ===== */
let slideshowIndex = 0;
let slideshowTimer = null;
let handwritingReady = false;
let handCtx = null;
let handDrawing = false;

window.openMoreFeatures = function(){
  $("moreFeaturesModal").classList.add("active");
};

window.closeMoreFeatures = function(){
  $("moreFeaturesModal").classList.remove("active");
};

window.generateAIAssistant = function(){
  const text = stripHTML($("entryText")?.innerHTML || "").toLowerCase();
  let message = "🤖 AI Memory Assistant\n\n";

  if(!text.trim()){
    message += "Write something in your diary first. I will understand your mood and give helpful suggestions.";
  }else if(text.includes("sad") || text.includes("cry") || text.includes("bad") || text.includes("stress")){
    message += "I feel you had a heavy moment today. Try writing one small thing that made you feel safe, even if it was tiny.\n\nSuggestion: Add mood 😢 Sad and tag it as #feelings.";
  }else if(text.includes("happy") || text.includes("good") || text.includes("love") || text.includes("great")){
    message += "This looks like a positive memory. You can mark it as favorite ⭐ so it appears in your best memories later.";
  }else if(text.includes("goal") || text.includes("work") || text.includes("study") || text.includes("dream")){
    message += "This sounds like a growth or motivated memory. Add tag #goals or #dreams and revisit it in Timeline.";
  }else{
    message += "Your entry looks meaningful. Add a mood, tags, and maybe a title so it becomes easier to find later.";
  }

  $("aiOutput").innerText = message;
  $("moreFeaturesModal").classList.add("active");
};

window.generateMonthlySummary = function(){
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const monthEntries = allEntries.filter(e => (e.dateOnly || "").startsWith(monthKey));

  const moodCount = {};
  monthEntries.forEach(e => moodCount[e.mood || "Unknown"] = (moodCount[e.mood || "Unknown"] || 0) + 1);

  const topMood = Object.entries(moodCount).sort((a,b)=>b[1]-a[1])[0];

  let summary = `🧠 Monthly Summary\n\nEntries this month: ${monthEntries.length}\n`;
  summary += `Top mood: ${topMood ? `${topMood[0]} (${topMood[1]})` : "No entries yet"}\n\n`;

  if(monthEntries.length){
    const tags = monthEntries.flatMap(e => e.tags || []);
    const tagCount = {};
    tags.forEach(t => tagCount[t] = (tagCount[t] || 0) + 1);
    const topTag = Object.entries(tagCount).sort((a,b)=>b[1]-a[1])[0];
    summary += `Most used tag: ${topTag ? "#" + topTag[0] : "No tags"}\n`;
    summary += "Your month has been saved as memories. Keep writing consistently 💙";
  }else{
    summary += "Start writing today and I will summarize your month automatically.";
  }

  $("aiOutput").innerText = summary;
  $("moreFeaturesModal").classList.add("active");
};

window.startVoiceDiary = function(){
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    alert("Voice diary is not supported in this browser. Try Chrome on Android.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    $("entryText").innerHTML += `<p>${escapeHTML(transcript)}</p>`;
  };

  recognition.onerror = (event) => {
    alert("Voice error: " + event.error);
  };

  recognition.start();
};

window.exportDiaryPDF = function(){
  const title = "Kousik Diary Export";
  let html = `<h1>${title}</h1>`;
  const entries = allEntries.length ? allEntries : [];

  entries.forEach((e, i)=>{
    html += `<hr><h2>${i+1}. ${escapeHTML(e.title || "Untitled Diary")}</h2>`;
    html += `<p><b>Date:</b> ${escapeHTML(e.dateText || "")}</p>`;
    html += `<p><b>Mood:</b> ${escapeHTML(e.mood || "")}</p>`;
    html += `<div>${e.text || ""}</div>`;
  });

  const w = window.open("", "_blank");
  w.document.write(`
    <html><head><title>${title}</title>
    <style>
      body{font-family:Georgia,serif;padding:30px;line-height:1.6;color:#222}
      h1{text-align:center}
      img,video{max-width:100%}
      @media print{button{display:none}}
    </style></head><body>
    <button onclick="window.print()">Print / Save as PDF</button>
    ${html}
    </body></html>
  `);
  w.document.close();
};

window.openTimelineModal = function(){
  const box = $("timelineContent");
  const groups = {};

  allEntries.forEach(e=>{
    const d = e.dateOnly || "Unknown";
    const [year, month] = d.split("-");
    const y = year || "Unknown";
    const m = month || "Unknown";
    groups[y] ??= {};
    groups[y][m] ??= [];
    groups[y][m].push(e);
  });

  if(!Object.keys(groups).length){
    box.innerHTML = `<div class="empty">No memories yet.</div>`;
  }else{
    box.innerHTML = Object.keys(groups).sort().reverse().map(year=>{
      const months = groups[year];
      return `<div class="timeline-year"><h3>${year}</h3>${
        Object.keys(months).sort().reverse().map(month=>`
          <div class="timeline-month">📅 ${month} — ${months[month].length} memories</div>
        `).join("")
      }</div>`;
    }).join("");
  }

  $("timelineModal").classList.add("active");
};

window.closeTimelineModal = function(){
  $("timelineModal").classList.remove("active");
};

window.openSlideshowModal = function(){
  slideshowIndex = 0;
  renderSlide();
  $('slideshowModal').classList.add('active');
  startSlideshow();
};

window.closeSlideshowModal = function(){
  $('slideshowModal').classList.remove('active');
  stopSlideshow();
};

function renderSlide(){
  const box = $("slideshowBox");
  if(!allEntries.length){
    box.innerHTML = `<div>No memories yet.</div>`;
    return;
  }

  const e = allEntries[slideshowIndex % allEntries.length];
  box.innerHTML = `
    <div class="cinematic-slide">
      <div class="slide-progress"><div class="slide-bar" style="width:${((slideshowIndex+1)/allEntries.length)*100}%"></div></div>
      <h3>${escapeHTML(e.title || "Untitled Diary")}</h3>
      <p>${escapeHTML(e.dateText || "")}</p>
      <h2>${escapeHTML(e.mood || "")}</h2>
      <div>${e.text || ""}</div>${renderMedia(e)}
      <div style="margin-top:12px;display:flex;gap:10px;justify-content:center;">
      <button onclick="prevSlide()">◀</button>
      <button onclick="toggleSlideshowPlay()">⏯</button>
      <button onclick="nextSlide()">▶</button>
      </div>
    </div>
  `;
}


window.startSlideshow = function(){
  stopSlideshow();
  slideshowTimer=setInterval(()=>nextSlide(),4000);
};
window.stopSlideshow = function(){
  if(slideshowTimer){clearInterval(slideshowTimer); slideshowTimer=null;}
};
window.toggleSlideshowPlay = function(){
  if(slideshowTimer){stopSlideshow();} else {startSlideshow();}
};

window.nextSlide = function(){
  if(!allEntries.length) return;
  slideshowIndex = (slideshowIndex + 1) % allEntries.length;
  renderSlide();
};

window.prevSlide = function(){
  if(!allEntries.length) return;
  slideshowIndex = (slideshowIndex - 1 + allEntries.length) % allEntries.length;
  renderSlide();
};

window.openHandwritingModal = function(){
  $("handwritingModal").classList.add("active");
  setupHandwritingCanvas();
};

window.closeHandwritingModal = function(){
  $("handwritingModal").classList.remove("active");
};

function setupHandwritingCanvas(){
  if(handwritingReady) return;

  const canvas = $("handCanvas");
  if(!canvas) return;

  handCtx = canvas.getContext("2d");
  handCtx.lineWidth = 4;
  handCtx.lineCap = "round";
  handCtx.strokeStyle = "#3b2412";

  function pos(e){
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return {
      x:(point.clientX - rect.left) * (canvas.width / rect.width),
      y:(point.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function start(e){
    e.preventDefault();
    handDrawing = true;
    const p = pos(e);
    handCtx.beginPath();
    handCtx.moveTo(p.x, p.y);
  }

  function move(e){
    if(!handDrawing) return;
    e.preventDefault();
    const p = pos(e);
    handCtx.lineTo(p.x, p.y);
    handCtx.stroke();
  }

  function end(){
    handDrawing = false;
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);

  canvas.addEventListener("touchstart", start, {passive:false});
  canvas.addEventListener("touchmove", move, {passive:false});
  canvas.addEventListener("touchend", end);

  handwritingReady = true;
}

window.clearHandwriting = function(){
  const canvas = $("handCanvas");
  if(canvas && handCtx) handCtx.clearRect(0,0,canvas.width,canvas.height);
};

window.insertHandwriting = function(){
  const canvas = $("handCanvas");
  if(!canvas) return;
  const data = canvas.toDataURL("image/png");
  $("entryText").innerHTML += `<p><img src="${data}" style="max-width:100%;border-radius:14px"></p>`;
  closeHandwritingModal();
};

window.openVaultModal = function(){
  $("vaultArea").classList.remove("active");
  $("vaultModal").classList.add("active");
  removeVaultMedia();
};

window.closeVaultModal = function(){
  $("vaultModal").classList.remove("active");
};

window.saveVaultPasswords = function(){
  if(!currentUser) return alert("Login first");
  const pass = $("vaultPassword").value.trim();
  const fake = $("vaultFakePassword").value.trim();

  if(!pass) return alert("Enter vault password");

  localStorage.setItem("vaultPass_" + currentUser.uid, pass);
  if(fake) localStorage.setItem("vaultFakePass_" + currentUser.uid, fake);

  alert("Vault passwords saved");
};

window.unlockVault = async function(){
  if(!currentUser) return alert("Login first");

  const pass = $("vaultPassword").value.trim();
  const real = localStorage.getItem("vaultPass_" + currentUser.uid);
  const fake = localStorage.getItem("vaultFakePass_" + currentUser.uid);

  if(!real){
    return alert("Set vault password first");
  }

  if(pass === fake && fake){
    $("vaultArea").classList.add("active");
    $("vaultEntries").innerHTML = `<div class="empty">Fake vault opened. No secret memories here.</div>`;
    return;
  }

  if(pass !== real){
    return alert("Wrong password");
  }

  $("vaultArea").classList.add("active");
  await loadVaultEntries("all");
};

window.previewVaultMedia = function(){
  const input = $("vaultMediaFile");
  const box = $("vaultMediaPreview");
  const removeBtn = $("removeVaultMediaBtn");

  if(!input || !box) return;

  const file = input.files && input.files[0];

  if(!file){
    box.innerHTML = "";
    if(removeBtn) removeBtn.style.display = "none";
    return;
  }

  if(file.size > 1800000){
    alert("Secret photo/video is too large for free Firebase document storage. Please choose file below 1.8MB.");
    input.value = "";
    box.innerHTML = "";
    if(removeBtn) removeBtn.style.display = "none";
    return;
  }

  const url = URL.createObjectURL(file);

  if(file.type.startsWith("video")){
    box.innerHTML = `
      <div class="preview-card">
        <video controls src="${url}"></video>
        <p>🎞️ ${escapeHTML(file.name)}</p>
      </div>
    `;
  }else{
    box.innerHTML = `
      <div class="preview-card">
        <img src="${url}" alt="Vault preview">
        <p>📷 ${escapeHTML(file.name)}</p>
      </div>
    `;
  }

  if(removeBtn) removeBtn.style.display = "block";
};

window.removeVaultMedia = function(){
  const input = $("vaultMediaFile");
  const box = $("vaultMediaPreview");
  const removeBtn = $("removeVaultMediaBtn");

  if(input) input.value = "";
  if(box) box.innerHTML = "";
  if(removeBtn) removeBtn.style.display = "none";
};

function renderVaultMedia(entry){
  if(!entry || !entry.mediaUrl) return "";

  if((entry.mediaType || "").startsWith("video")){
    return `
      <div class="memory-media-card vault-secret-media">
        <video controls src="${entry.mediaUrl}" class="memory-media"></video>
      </div>
    `;
  }

  return `
    <div class="memory-media-card vault-secret-media">
      <img src="${entry.mediaUrl}" alt="Secret memory" class="memory-media" onclick="openMediaViewer('${entry.mediaUrl}', 'image')">
    </div>
  `;
}

window.saveVaultEntry = async function(){
  if(!currentUser) return alert("Login first");

  const title = $("vaultTitle").value.trim() || "Secret Memory";
  const text = sanitizeEditorHTML(($("vaultText").innerHTML || "").trim());
  const mediaFile = $("vaultMediaFile")?.files?.[0];
  const mediaUrl = mediaFile ? await fileToDataUrl(mediaFile) : "";

  if(!stripHTML(text) && !mediaUrl) return alert("Write secret memory or add photo/video");

  await addDoc(collection(db, "vaultEntries"), {
    uid: currentUser.uid,
    title,
    text,
    mediaUrl: mediaUrl || "",
    mediaType: mediaFile ? mediaFile.type : "",
    createdAt: serverTimestamp(),
    dateText: new Date().toLocaleString()
  });

  $("vaultTitle").value = "";
  $("vaultText").innerHTML = "";
  removeVaultMedia();
  await loadVaultEntries("all");
};

window.loadVaultEntries = async function(filterType = "all"){
  if(!currentUser) return;

  const q = query(collection(db, "vaultEntries"), where("uid", "==", currentUser.uid));
  const snap = await getDocs(q);
  let list = [];

  snap.forEach(d=>list.push({id:d.id, ...d.data()}));

  if(filterType === "photos"){
    list = list.filter(e => (e.mediaType || "").startsWith("image"));
  }else if(filterType === "videos"){
    list = list.filter(e => (e.mediaType || "").startsWith("video"));
  }

  list.sort((a,b)=>(b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  $("vaultEntries").innerHTML = list.length ? list.map(e=>`
    <div class="vault-entry vault-entry-card">
      <h3>${escapeHTML(e.title || "Secret Memory")}</h3>
      <small>${escapeHTML(e.dateText || "")}</small>
      ${e.text ? `<div>${e.text}</div>` : ""}
      ${renderVaultMedia(e)}
      <button class="delete-btn" onclick="deleteVaultEntry('${e.id}', '${filterType}')">Delete Secret</button>
    </div>
  `).join("") : `<div class="empty">No secret memories yet.</div>`;
};

window.deleteVaultEntry = async function(id, filterType = "all"){
  if(!confirm("Delete this secret memory?")) return;
  await deleteDoc(doc(db, "vaultEntries", id));
  await loadVaultEntries(filterType);
};


window.openFingerprintUnlock = function(){
  $("fingerprintModal").classList.add("active");
};

window.closeFingerprintUnlock = function(){
  $("fingerprintModal").classList.remove("active");
};

window.tryFingerprint = async function(){
  const out = $("fingerprintStatus");

  if(!window.PublicKeyCredential || !navigator.credentials){
    out.innerText = "Fingerprint/WebAuthn is not supported in this browser. Use Chrome + HTTPS/PWA install.";
    return;
  }

  try{
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if(!available){
      out.innerText = "Device biometric unlock not available on this device/browser.";
      return;
    }

    out.innerText = "Device supports biometric unlock. Full production setup needs HTTPS domain and passkey registration.";
  }catch(e){
    out.innerText = "Fingerprint check failed: " + e.message;
  }
};

window.toggleSettingsMenu = function(event){
  if(event) event.stopPropagation();

  const menu = document.getElementById("settingsMenu");
  if(!menu) return;

  menu.classList.toggle("active");
};

document.addEventListener("click", function(e){

    const settingsBtn = document.getElementById("settingsBtn");
    const settingsMenu = document.getElementById("settingsMenu");

    if(!settingsBtn || !settingsMenu) return;

    if(
        !settingsMenu.contains(e.target) &&
        !settingsBtn.contains(e.target)
    ){
        settingsMenu.classList.remove("show");
    }

});

document.addEventListener("pointerdown", function(e){
  const menu = document.getElementById("settingsMenu");
  const button = e.target.closest("button");

  if(!menu) return;

  const clickedSettingsButton =
    button && button.getAttribute("onclick")?.includes("toggleSettingsMenu");

  if(
    menu.classList.contains("active") &&
    !menu.contains(e.target) &&
    !clickedSettingsButton
  ){
    menu.classList.remove("active");
  }
});



/* ===== PREMIUM PDF BOOK EXPORT FINAL ===== */
window.openPDFExportModal = function(){
  const modal = $("pdfExportModal");
  if(!modal) return exportPremiumPDF();

  const title = $("pdfBookTitle");
  if(title) title.value = "My Dear Diary";

  const status = $("pdfExportStatus");
  if(status) status.innerText = "";

  modal.classList.add("active");
};

window.closePDFExportModal = function(){
  $("pdfExportModal")?.classList.remove("active");
};

function getPDFEntriesByType(){
  const type = $("pdfExportType")?.value || "all";
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  let entries = [...allEntries];

  if(type === "favorites"){
    entries = entries.filter(e => e.favorite);
  }else if(type === "pinned"){
    entries = entries.filter(e => e.pinned);
  }else if(type === "currentMonth"){
    entries = entries.filter(e => (e.dateOnly || "").startsWith(monthKey));
  }

  return entries.sort((a,b)=>(a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

function buildPrintableDiaryHTML(entries, includePhotos, title){
  const nowText = new Date().toLocaleDateString("en-IN", {
    day:"2-digit",
    month:"long",
    year:"numeric"
  });

  const pages = entries.map((entry, index)=>{
    const tags = (entry.tags || []).map(t => `#${escapeHTML(t)}`).join(" ");
    const media = includePhotos && entry.mediaUrl && !(entry.mediaType || "").startsWith("video")
      ? `<img class="pdf-photo" src="${entry.mediaUrl}" alt="Memory photo">`
      : "";

    return `
      <section class="pdf-entry">
        <div class="pdf-entry-number">Memory ${index + 1}</div>
        <h2>${escapeHTML(entry.title || "Untitled Diary")}</h2>
        <div class="pdf-date">${escapeHTML(entry.dateText || "")}</div>
        <div class="pdf-mood">${escapeHTML(entry.mood || "")}</div>
        ${media}
        <div class="pdf-text">${entry.text || ""}</div>
        <div class="pdf-tags">${tags}</div>
      </section>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html>
<head>
<title>${escapeHTML(title)}</title>
<meta charset="UTF-8">
<style>
  *{box-sizing:border-box}
  body{
    margin:0;
    padding:35px;
    font-family:Georgia,'Times New Roman',serif;
    color:#2a1f12;
    background:#f7ead0;
    line-height:1.7;
  }
  .cover{
    min-height:90vh;
    display:flex;
    flex-direction:column;
    justify-content:center;
    align-items:center;
    text-align:center;
    border:4px double #8b5e22;
    padding:40px;
    background:
      radial-gradient(circle at 20% 20%,rgba(255,255,255,.75),transparent 35%),
      linear-gradient(135deg,#fff7df,#e7c88f);
    page-break-after:always;
  }
  .cover h1{
    font-size:54px;
    margin:0;
    color:#3b2412;
    letter-spacing:1px;
  }
  .cover p{
    font-size:20px;
    color:#6b3f18;
    margin-top:18px;
  }
  .cover .count{
    margin-top:35px;
    padding:12px 24px;
    border-radius:999px;
    background:#8b5e22;
    color:#fff;
    font-weight:bold;
  }
  .pdf-entry{
    page-break-inside:avoid;
    page-break-after:always;
    min-height:88vh;
    padding:32px;
    border:2px solid rgba(139,94,34,.35);
    border-radius:18px;
    background:
      repeating-linear-gradient(to bottom,#fff7df 0,#fff7df 33px,#ead8b4 34px);
    box-shadow:inset 0 0 35px rgba(139,94,34,.10);
  }
  .pdf-entry-number{
    text-align:right;
    font-weight:bold;
    color:#8b5e22;
  }
  .pdf-entry h2{
    font-size:34px;
    margin:10px 0 4px;
    color:#3b2412;
  }
  .pdf-date{
    color:#6b3f18;
    font-weight:bold;
    margin-bottom:8px;
  }
  .pdf-mood{
    font-size:24px;
    margin:12px 0;
  }
  .pdf-photo{
    width:100%;
    max-height:360px;
    object-fit:cover;
    border-radius:16px;
    margin:14px 0;
    border:2px solid rgba(139,94,34,.30);
  }
  .pdf-text{
    margin-top:15px;
    font-size:18px;
  }
  .pdf-tags{
    margin-top:24px;
    color:#8b5e22;
    font-weight:bold;
  }
  button{
    position:fixed;
    top:18px;
    right:18px;
    padding:12px 18px;
    border:0;
    border-radius:12px;
    background:#8b5e22;
    color:white;
    font-weight:bold;
    cursor:pointer;
  }
  @media print{
    body{background:white;padding:0}
    button{display:none}
    .cover,.pdf-entry{
      border-radius:0;
      box-shadow:none;
    }
  }
</style>
</head>
<body>
<button onclick="window.print()">Print / Save as PDF</button>
<div class="cover">
  <h1>📖 ${escapeHTML(title)}</h1>
  <p>Every Memory Has a Home.</p>
  <p>Exported on ${nowText}</p>
  <div class="count">${entries.length} Memories</div>
</div>
${pages || `<section class="pdf-entry"><h2>No memories found</h2><p>Write some diary entries first.</p></section>`}
</body>
</html>
  `;
}

window.exportPremiumPDF = function(){
  const status = $("pdfExportStatus");
  const title = $("pdfBookTitle")?.value?.trim() || "My Dear Diary";
  const includePhotos = ($("pdfIncludePhotos")?.value || "yes") === "yes";
  const entries = getPDFEntriesByType();

  if(status) status.innerText = "Preparing your diary book...";

  const printableHTML = buildPrintableDiaryHTML(entries, includePhotos, title);
  const win = window.open("", "_blank");

  if(!win){
    if(status) status.innerText = "Popup blocked. Please allow popups and try again.";
    return;
  }

  win.document.open();
  win.document.write(printableHTML);
  win.document.close();

  if(status) status.innerText = "PDF book opened. Click Print / Save as PDF in the new tab.";
};

window.exportDiaryPDF = window.openPDFExportModal;




/* ===== PREMIUM TIMELINE 2.0 FINAL ===== */
let timelineFilterMode = "all";

window.setTimelineFilter = function(mode){
  timelineFilterMode = mode || "all";
  renderPremiumTimeline();
};

window.openTimelineModal = function(){
  const modal = $("timelineModal");
  if(!modal) return;

  timelineFilterMode = "all";
  if($("timelineSearch")) $("timelineSearch").value = "";

  modal.classList.add("active");
  renderPremiumTimeline();
};

window.closeTimelineModal = function(){
  $("timelineModal")?.classList.remove("active");
};

function monthNameFromDate(dateOnly){
  if(!dateOnly) return "Unknown Month";
  const parts = dateOnly.split("-");
  if(parts.length < 2) return "Unknown Month";
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  return d.toLocaleDateString("en-US", { month:"long" });
}

function renderPremiumTimeline(){
  const box = $("timelineContent");
  if(!box) return;

  const search = ($("timelineSearch")?.value || "").toLowerCase().trim();

  let list = [...allEntries];

  if(timelineFilterMode === "pinned"){
    list = list.filter(e => e.pinned);
  }else if(timelineFilterMode === "favorites"){
    list = list.filter(e => e.favorite);
  }

  if(search){
    list = list.filter(e => {
      const hay = `${e.title || ""} ${stripHTML(e.text || "")} ${(e.tags || []).join(" ")} ${e.dateText || ""} ${e.mood || ""}`.toLowerCase();
      return hay.includes(search);
    });
  }

  list.sort((a,b)=>{
    if(a.pinned && !b.pinned) return -1;
    if(!a.pinned && b.pinned) return 1;
    if(a.favorite && !b.favorite) return -1;
    if(!a.favorite && b.favorite) return 1;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

  if(!list.length){
    box.innerHTML = `<div class="empty">No memories found in timeline.</div>`;
    return;
  }

  const groups = {};
  list.forEach(entry=>{
    const dateOnly = entry.dateOnly || "";
    const year = dateOnly.split("-")[0] || "Unknown Year";
    const month = monthNameFromDate(dateOnly);
    groups[year] ??= {};
    groups[year][month] ??= [];
    groups[year][month].push(entry);
  });

  const years = Object.keys(groups).sort((a,b)=>String(b).localeCompare(String(a)));

  box.innerHTML = years.map(year=>{
    const months = Object.keys(groups[year]);

    return `
      <div class="timeline-year-title">📅 ${escapeHTML(year)}</div>
      ${months.map(month=>`
        <div class="timeline-month-title">✨ ${escapeHTML(month)}</div>
        ${groups[year][month].map(entry=>renderTimelineItem(entry)).join("")}
      `).join("")}
    `;
  }).join("");
}

function renderTimelineItem(entry){
  const snippet = stripHTML(entry.text || "").slice(0, 120);
  const tags = (entry.tags || []).slice(0,3).map(t=>`<span class="timeline-badge">#${escapeHTML(t)}</span>`).join("");

  return `
    <div class="timeline-item-pro" onclick="openTimelineMemory('${entry.id}')">
      <h3>${entry.pinned ? "📌 " : ""}${escapeHTML(entry.title || "Untitled Diary")} ${entry.favorite ? "⭐" : ""}</h3>
      <small>${escapeHTML(entry.dateText || "")}</small>
      <div class="timeline-badges">
        <span class="timeline-badge">${escapeHTML(entry.mood || "Memory")}</span>
        ${entry.pinned ? `<span class="timeline-badge">Pinned</span>` : ""}
        ${entry.favorite ? `<span class="timeline-badge">Favorite</span>` : ""}
        ${tags}
      </div>
      <div class="timeline-snippet">${escapeHTML(snippet)}${snippet.length >= 120 ? "..." : ""}</div>
    </div>
  `;
}

window.openTimelineMemory = function(id){
  const entry = allEntries.find(e => e.id === id);
  const box = $("timelineContent");

  if(!entry || !box) return;

  box.innerHTML = `
    <button onclick="renderPremiumTimeline()">⬅ Back to Timeline</button>
    <div class="timeline-full-view">
      <h2>${entry.pinned ? "📌 " : ""}${escapeHTML(entry.title || "Untitled Diary")} ${entry.favorite ? "⭐" : ""}</h2>
      <small>${escapeHTML(entry.dateText || "")}</small>
      <h3>${escapeHTML(entry.mood || "")}</h3>
      <div>${entry.text || ""}</div>
      ${renderMedia(entry)}
      <div class="tags">${(entry.tags || []).map(tag => `<span class="tag">#${escapeHTML(tag)}</span>`).join("")}</div>
      <div class="entry-actions">
        <button onclick="togglePin('${entry.id}', ${!entry.pinned}).then(()=>openTimelineModal())">${entry.pinned ? "Unpin" : "Pin"}</button>
        <button onclick="toggleFavorite('${entry.id}', ${!entry.favorite}).then(()=>openTimelineModal())">${entry.favorite ? "Unfavorite" : "Favorite"}</button>
      </div>
    </div>
  `;
};




/* ===== REAL MULTI-PAGE DIARY SYSTEM FINAL ===== */
function animateEditorPage(){
  const editor = $("entryText");
  if(!editor) return;
  editor.classList.remove("page-flip-in");
  void editor.offsetWidth;
  editor.classList.add("page-flip-in");
}

window.saveCurrentDiaryPage = function(){
  const editor = $("entryText");
  if(!editor) return;
  diaryPages[currentDiaryPageIndex] = editor.innerHTML;
  updateWritingPageInfo();
};

function loadWritingPage(index){
  const editor = $("entryText");
  if(!editor) return;

  saveCurrentDiaryPage();

  if(index < 0) index = 0;
  if(index >= diaryPages.length) index = diaryPages.length - 1;

  currentDiaryPageIndex = index;
  editor.innerHTML = diaryPages[currentDiaryPageIndex] || "";
  updateWritingPageInfo();
  animateEditorPage();
}

window.nextWritingPage = function(){
  saveCurrentDiaryPage();

  if(currentDiaryPageIndex === diaryPages.length - 1){
    diaryPages.push("");
  }

  loadWritingPage(currentDiaryPageIndex + 1);
};

window.prevWritingPage = function(){
  saveCurrentDiaryPage();
  loadWritingPage(currentDiaryPageIndex - 1);
};

window.addWritingPage = function(){
  saveCurrentDiaryPage();
  diaryPages.splice(currentDiaryPageIndex + 1, 0, "");
  loadWritingPage(currentDiaryPageIndex + 1);
};

window.deleteWritingPage = function(){
  if(diaryPages.length === 1){
    diaryPages = [""];
    currentDiaryPageIndex = 0;
  }else{
    diaryPages.splice(currentDiaryPageIndex, 1);
    if(currentDiaryPageIndex >= diaryPages.length){
      currentDiaryPageIndex = diaryPages.length - 1;
    }
  }

  const editor = $("entryText");
  if(editor) editor.innerHTML = diaryPages[currentDiaryPageIndex] || "";
  updateWritingPageInfo();
  animateEditorPage();
};

function updateWritingPageInfo(){
  const info = $("writingPageInfo");
  if(info){
    info.innerText = `Page ${currentDiaryPageIndex + 1} / ${diaryPages.length}`;
  }
}

function renderEntryPages(entry){
  const pages = entry.pages && entry.pages.length ? entry.pages : [entry.text || ""];

  if(pages.length <= 1){
    return `<p>${pages[0] || ""}</p>`;
  }

  return `
    <div class="entry-pages-view">
      ${pages.map((page, i)=>`
        <div class="entry-page-card">
          <h4>📄 Page ${i + 1}</h4>
          <div>${page || ""}</div>
        </div>
      `).join("")}
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", updateWritingPageInfo);




/* ===== AI MEMORY CHAT FINAL ===== */
window.openAIMemoryChat = function(){
  $("aiMemoryChatModal").classList.add("active");
  scrollAIChatBottom();
};

window.closeAIMemoryChat = function(){
  $("aiMemoryChatModal").classList.remove("active");
};

window.askAIQuick = function(text){
  const input = $("aiMemoryQuestion");
  if(input) input.value = text;
  askAIMemoryChat();
};

function addAIChatBubble(text, type="bot"){
  const box = $("aiChatMessages");
  if(!box) return;

  const div = document.createElement("div");
  div.className = "ai-bubble " + type;
  div.innerHTML = text;
  box.appendChild(div);
  scrollAIChatBottom();
}

function scrollAIChatBottom(){
  const box = $("aiChatMessages");
  if(box) box.scrollTop = box.scrollHeight;
}

window.askAIMemoryChat = function(){
  const input = $("aiMemoryQuestion");
  const question = (input?.value || "").trim();

  if(!question) return;

  addAIChatBubble(escapeHTML(question), "user");
  input.value = "";

  const answer = generateMemoryAnswer(question);
  addAIChatBubble(answer, "bot");
};

function generateMemoryAnswer(question){
  const q = question.toLowerCase();
  const entries = [...allEntries];

  if(!entries.length){
    return "I could not find any diary memories yet. Save some diary pages first, then ask me again.";
  }

  if(q.includes("happy")){
    return buildMemorySearchAnswer("😊 Happy memories", entries.filter(e => (e.mood || "").includes("Happy")));
  }

  if(q.includes("sad")){
    return buildMemorySearchAnswer("😢 Sad memories", entries.filter(e => (e.mood || "").includes("Sad")));
  }

  if(q.includes("favorite") || q.includes("favourite")){
    return buildMemorySearchAnswer("⭐ Favorite memories", entries.filter(e => e.favorite));
  }

  if(q.includes("pinned") || q.includes("pin")){
    return buildMemorySearchAnswer("📌 Pinned memories", entries.filter(e => e.pinned));
  }

  if(q.includes("photo") || q.includes("image")){
    return buildMemorySearchAnswer("📷 Photo memories", entries.filter(e => e.mediaUrl && (e.mediaType || "").startsWith("image")));
  }

  if(q.includes("video")){
    return buildMemorySearchAnswer("🎞️ Video memories", entries.filter(e => e.mediaUrl && (e.mediaType || "").startsWith("video")));
  }

  if(q.includes("this month") || q.includes("month") || q.includes("monthly")){
    return buildMonthlyAIAnswer(entries);
  }

  if(q.includes("summary") || q.includes("summarize") || q.includes("summarise")){
    return buildAllMemorySummary(entries);
  }

  const keyword = extractKeywordFromQuestion(q);
  if(keyword){
    const found = entries.filter(e => {
      const hay = `${e.title || ""} ${stripHTML((e.pages && e.pages.length) ? e.pages.join(" ") : (e.text || ""))} ${(e.tags || []).join(" ")} ${e.mood || ""}`.toLowerCase();
      return hay.includes(keyword);
    });
    return buildMemorySearchAnswer(`🔍 Memories about "${escapeHTML(keyword)}"`, found);
  }

  return buildAllMemorySummary(entries);
}

function extractKeywordFromQuestion(q){
  const removeWords = [
    "what","did","i","write","about","show","me","my","memories","memory",
    "tell","diary","entries","entry","find","search","for","the","a","an",
    "how","many","times","mention","mentioned"
  ];

  const cleaned = q
    .replace(/[?.,!]/g, " ")
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w && !removeWords.includes(w));

  return cleaned[0] || "";
}

function buildMemorySearchAnswer(title, list){
  if(!list.length){
    return `${title}\n\nNo matching memories found.`;
  }

  const top = list.slice(0, 5).map(e => {
    const text = stripHTML((e.pages && e.pages.length) ? e.pages.join(" ") : (e.text || "")).slice(0, 130);
    return `
      <div class="ai-memory-result">
        <h4>${e.pinned ? "📌 " : ""}${e.favorite ? "⭐ " : ""}${escapeHTML(e.title || "Untitled Diary")}</h4>
        <small>${escapeHTML(e.dateText || "")} • ${escapeHTML(e.mood || "")}</small>
        <div>${escapeHTML(text)}${text.length >= 130 ? "..." : ""}</div>
      </div>
    `;
  }).join("");

  return `<b>${title}</b>\nFound ${list.length} memory/memories.\n${top}`;
}

function buildMonthlyAIAnswer(entries){
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const monthEntries = entries.filter(e => (e.dateOnly || "").startsWith(monthKey));

  if(!monthEntries.length){
    return "No memories found for this month yet.";
  }

  return buildSummaryFromList("🧠 This Month Summary", monthEntries);
}

function buildAllMemorySummary(entries){
  return buildSummaryFromList("📖 Diary Summary", entries);
}

function buildSummaryFromList(title, list){
  const moods = {};
  const tags = {};
  let favoriteCount = 0;
  let pinnedCount = 0;

  list.forEach(e => {
    moods[e.mood || "Unknown"] = (moods[e.mood || "Unknown"] || 0) + 1;
    (e.tags || []).forEach(t => tags[t] = (tags[t] || 0) + 1);
    if(e.favorite) favoriteCount++;
    if(e.pinned) pinnedCount++;
  });

  const topMood = Object.entries(moods).sort((a,b)=>b[1]-a[1])[0];
  const topTag = Object.entries(tags).sort((a,b)=>b[1]-a[1])[0];

  const recent = list
    .slice()
    .sort((a,b)=>(b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0,3)
    .map(e => `• ${escapeHTML(e.title || "Untitled Diary")} (${escapeHTML(e.mood || "Memory")})`)
    .join("\n");

  return `<b>${title}</b>

Total memories: ${list.length}
Top mood: ${topMood ? `${escapeHTML(topMood[0])} (${topMood[1]})` : "No mood"}
Top tag: ${topTag ? `#${escapeHTML(topTag[0])} (${topTag[1]})` : "No tags"}
Favorites: ${favoriteCount}
Pinned: ${pinnedCount}

Recent memories:
${recent || "No recent memories."}`;
}






/* ===== TIME CAPSULE MEMORIES FIXED SAFE ===== */
function capsuleLocalKey(){
  return "myDearDiaryTimeCapsules_" + (currentUser?.uid || "guest");
}

function getLocalCapsules(){
  try{
    return JSON.parse(localStorage.getItem(capsuleLocalKey()) || "[]");
  }catch(e){
    return [];
  }
}

function saveLocalCapsules(list){
  localStorage.setItem(capsuleLocalKey(), JSON.stringify(list));
}

window.openTimeCapsuleModal = async function(){
  $("timeCapsuleModal").classList.add("active");
  setDefaultCapsuleDate();
  await loadTimeCapsules("all");
};

window.closeTimeCapsuleModal = function(){
  $("timeCapsuleModal").classList.remove("active");
};

function setDefaultCapsuleDate(){
  const input = $("capsuleUnlockDate");
  if(!input || input.value) return;
  const d = new Date();
  d.setDate(d.getDate() + 30);
  input.value = d.toISOString().split("T")[0];
}

window.setCapsuleQuickDate = function(days){
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 30));
  $("capsuleUnlockDate").value = d.toISOString().split("T")[0];
};

window.saveTimeCapsule = async function(){
  if(!currentUser) return alert("Login first");

  const title = $("capsuleTitle").value.trim() || "Future Memory";
  const text = sanitizeEditorHTML(($("capsuleText").innerHTML || "").trim());
  const unlockDate = $("capsuleUnlockDate").value;

  if(!stripHTML(text)){
    alert("Write your time capsule message");
    return;
  }

  if(!unlockDate){
    alert("Choose unlock date");
    return;
  }

  const today = new Date();
  today.setHours(0,0,0,0);

  const unlock = new Date(unlockDate + "T00:00:00");
  if(unlock <= today){
    alert("Unlock date must be in the future");
    return;
  }

  const capsuleData = {
    uid: currentUser.uid,
    title,
    text,
    unlockDate,
    createdAtLocal: Date.now(),
    createdDateText: new Date().toLocaleString()
  };

  let savedToCloud = false;

  try{
    await addDoc(collection(db, "timeCapsules"), {
      ...capsuleData,
      createdAt: serverTimestamp()
    });
    savedToCloud = true;
  }catch(error){
    console.warn("Cloud time capsule save failed. Saved locally instead:", error.message);
  }

  if(!savedToCloud){
    const localList = getLocalCapsules();
    localList.push({
      id: "local_" + Date.now(),
      ...capsuleData,
      localOnly: true
    });
    saveLocalCapsules(localList);
  }

  $("capsuleTitle").value = "";
  $("capsuleText").innerHTML = "";
  setCapsuleQuickDate(30);

  alert(savedToCloud ? "Time Capsule saved" : "Time Capsule saved locally");
  await loadTimeCapsules("all");
};

window.loadTimeCapsules = async function(filterType = "all"){
  if(!currentUser) return;

  const box = $("timeCapsuleList");
  if(!box) return;

  box.innerHTML = `<div class="empty">Loading time capsules...</div>`;

  let list = [];

  try{
    const q = query(collection(db, "timeCapsules"), where("uid", "==", currentUser.uid));
    const snap = await getDocs(q);
    snap.forEach(d => list.push({id:d.id, ...d.data(), cloud:true}));
  }catch(error){
    console.warn("Cloud time capsule load failed:", error.message);
  }

  list = list.concat(getLocalCapsules());

  const now = new Date();
  now.setHours(0,0,0,0);

  list = list.map(c => {
    const unlock = new Date((c.unlockDate || "") + "T00:00:00");
    return {...c, unlocked: unlock <= now, daysLeft: Math.ceil((unlock - now) / 86400000)};
  });

  if(filterType === "locked"){
    list = list.filter(c => !c.unlocked);
  }else if(filterType === "unlocked"){
    list = list.filter(c => c.unlocked);
  }

  list.sort((a,b)=>{
    if(a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1;
    return String(a.unlockDate || "").localeCompare(String(b.unlockDate || ""));
  });

  box.innerHTML = list.length
    ? list.map(renderTimeCapsuleCard).join("")
    : `<div class="empty">No time capsules yet.</div>`;
};

function renderTimeCapsuleCard(c){
  const status = c.unlocked ? "🔓 Unlocked" : "🔒 Locked";
  const className = c.unlocked ? "unlocked" : "locked";
  const countdown = c.unlocked
    ? "Ready to open now"
    : `${Math.max(c.daysLeft, 0)} day(s) left • Unlocks on ${escapeHTML(c.unlockDate || "")}`;

  const content = c.unlocked
    ? `<div class="capsule-content">${c.text || ""}</div>`
    : `<div class="capsule-content">🔒 This memory is sealed until ${escapeHTML(c.unlockDate || "")}</div>`;

  return `
    <div class="capsule-card ${className}">
      <h3>${status} — ${escapeHTML(c.title || "Future Memory")}</h3>
      <small>Created: ${escapeHTML(c.createdDateText || "")}${c.localOnly ? " • Local" : ""}</small>
      <div class="capsule-countdown">${countdown}</div>
      ${content}
      <div class="capsule-actions">
        <button onclick="openTimeCapsuleNow('${c.id}')">${c.unlocked ? "Open" : "Check"}</button>
        <button class="delete-btn" onclick="deleteTimeCapsule('${c.id}')">Delete</button>
      </div>
    </div>
  `;
}

window.openTimeCapsuleNow = async function(id){
  const capsule = await getTimeCapsuleById(id);
  if(!capsule) return alert("Capsule not found");

  const today = new Date();
  today.setHours(0,0,0,0);
  const unlock = new Date((capsule.unlockDate || "") + "T00:00:00");

  if(unlock > today){
    alert("This time capsule is still locked. Unlock date: " + capsule.unlockDate);
    return;
  }

  alert("Time Capsule Unlocked: " + (capsule.title || "Future Memory"));
};

async function getTimeCapsuleById(id){
  const local = getLocalCapsules().find(c => c.id === id);
  if(local) return local;

  try{
    const q = query(collection(db, "timeCapsules"), where("uid", "==", currentUser.uid));
    const snap = await getDocs(q);
    let found = null;
    snap.forEach(d => {
      if(d.id === id) found = {id:d.id, ...d.data()};
    });
    return found;
  }catch(e){
    return null;
  }
}

window.deleteTimeCapsule = async function(id){
  if(!confirm("Delete this time capsule?")) return;

  if(String(id).startsWith("local_")){
    const list = getLocalCapsules().filter(c => c.id !== id);
    saveLocalCapsules(list);
  }else{
    try{
      await deleteDoc(doc(db, "timeCapsules", id));
    }catch(error){
      alert("Delete failed: " + error.message);
      return;
    }
  }

  await loadTimeCapsules("all");
};




/* ===== BACKUP & RESTORE FINAL ===== */
window.openBackupRestoreModal = async function(){
  $("backupRestoreModal").classList.add("active");
  await updateBackupStats();
};

window.closeBackupRestoreModal = function(){
  $("backupRestoreModal").classList.remove("active");
};

function setBackupStatus(message){
  const box = $("backupRestoreStatus");
  if(box) box.innerText = message || "";
}

async function updateBackupStats(){
  if(!currentUser) return;

  const stats = $("backupStats");
  if(!stats) return;

  const localCapsules = getBackupLocalCapsules();

  let vaultCount = 0;
  let cloudCapsuleCount = 0;

  try{
    const vaultSnap = await getDocs(query(collection(db, "vaultEntries"), where("uid", "==", currentUser.uid)));
    vaultCount = vaultSnap.size;
  }catch(e){}

  try{
    const capSnap = await getDocs(query(collection(db, "timeCapsules"), where("uid", "==", currentUser.uid)));
    cloudCapsuleCount = capSnap.size;
  }catch(e){}

  stats.innerHTML = `
    📖 Diary entries: <b>${allEntries.length}</b><br>
    🔒 Vault entries: <b>${vaultCount}</b><br>
    ⏳ Time capsules: <b>${cloudCapsuleCount + localCapsules.length}</b><br>
    👤 User: <b>${escapeHTML(currentUser.email || "No email")}</b>
  `;
}

async function getCollectionBackup(collectionName){
  const out = [];
  try{
    const snap = await getDocs(query(collection(db, collectionName), where("uid", "==", currentUser.uid)));
    snap.forEach(d => {
      const data = d.data();
      delete data.createdAt;
      out.push({backupId:d.id, ...data});
    });
  }catch(error){
    console.warn("Backup read failed for", collectionName, error.message);
  }
  return out;
}

function getBackupLocalCapsules(){
  try{
    return JSON.parse(localStorage.getItem("myDearDiaryTimeCapsules_" + currentUser.uid) || "[]");
  }catch(e){
    return [];
  }
}

window.exportDiaryBackup = async function(){
  if(!currentUser) return alert("Login first");

  setBackupStatus("Preparing backup file...");

  const backup = {
    appName: "My Dear Diary",
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    userEmail: currentUser.email || "",
    diaryEntries: await getCollectionBackup("diaryEntries"),
    vaultEntries: await getCollectionBackup("vaultEntries"),
    timeCapsules: await getCollectionBackup("timeCapsules"),
    localTimeCapsules: getBackupLocalCapsules(),
    design: {
      diaryTheme: localStorage.getItem("diaryTheme") || "dark",
      primaryColor: localStorage.getItem("primaryColor") || "",
      accentColor: localStorage.getItem("accentColor") || "",
      bgColor: localStorage.getItem("bgColor") || "",
      fontChoice: localStorage.getItem("fontChoice") || "",
      lampColor: localStorage.getItem("lampColor") || ""
    }
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  const date = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `my-dear-diary-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setBackupStatus("Backup downloaded successfully.");
};

window.importDiaryBackup = async function(event){
  if(!currentUser) return alert("Login first");

  const file = event.target.files && event.target.files[0];
  if(!file) return;

  if(!confirm("Restore this backup? It will add memories to your current account. Existing memories will not be deleted.")){
    event.target.value = "";
    return;
  }

  try{
    const text = await file.text();
    const backup = JSON.parse(text);

    if(!backup || backup.appName !== "My Dear Diary"){
      alert("Invalid My Dear Diary backup file.");
      event.target.value = "";
      return;
    }

    setBackupStatus("Restoring backup...");

    let restored = 0;
    restored += await restoreBackupCollection("diaryEntries", backup.diaryEntries || []);
    restored += await restoreBackupCollection("vaultEntries", backup.vaultEntries || []);
    restored += await restoreBackupCollection("timeCapsules", backup.timeCapsules || []);

    if(Array.isArray(backup.localTimeCapsules) && backup.localTimeCapsules.length){
      const key = "myDearDiaryTimeCapsules_" + currentUser.uid;
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      const imported = backup.localTimeCapsules.map(c => ({
        ...c,
        id: "local_import_" + Date.now() + "_" + Math.random().toString(16).slice(2),
        uid: currentUser.uid,
        localOnly: true
      }));
      localStorage.setItem(key, JSON.stringify(existing.concat(imported)));
      restored += imported.length;
    }

    if(backup.design){
      if(backup.design.diaryTheme) localStorage.setItem("diaryTheme", backup.design.diaryTheme);
      if(backup.design.primaryColor) localStorage.setItem("primaryColor", backup.design.primaryColor);
      if(backup.design.accentColor) localStorage.setItem("accentColor", backup.design.accentColor);
      if(backup.design.bgColor) localStorage.setItem("bgColor", backup.design.bgColor);
      if(backup.design.fontChoice) localStorage.setItem("fontChoice", backup.design.fontChoice);
      if(backup.design.lampColor) localStorage.setItem("lampColor", backup.design.lampColor);
      loadTheme();
      loadCustomDesign();
      loadLampColor();
    }

    await loadEntries();
    await updateBackupStats();

    setBackupStatus(`Restore complete. Restored ${restored} item(s).`);
    alert("Backup restored successfully.");

  }catch(error){
    alert("Restore failed: " + error.message);
    setBackupStatus("Restore failed.");
  }

  event.target.value = "";
};

async function restoreBackupCollection(collectionName, items){
  let count = 0;

  for(const raw of items){
    try{
      const item = {...raw};
      delete item.backupId;
      delete item.cloud;
      delete item.localOnly;
      delete item.id;

      item.uid = currentUser.uid;
      item.restoredAt = new Date().toISOString();

      if(collectionName === "diaryEntries"){
        item.createdAt = serverTimestamp();
        item.dateText = item.dateText || new Date().toLocaleString();
        item.dateOnly = item.dateOnly || new Date().toISOString().split("T")[0];
        item.favorite = !!item.favorite;
        item.pinned = !!item.pinned;
      }else if(collectionName === "vaultEntries"){
        item.createdAt = serverTimestamp();
        item.dateText = item.dateText || new Date().toLocaleString();
      }else if(collectionName === "timeCapsules"){
        item.createdAt = serverTimestamp();
        item.createdDateText = item.createdDateText || new Date().toLocaleString();
      }

      await addDoc(collection(db, collectionName), item);
      count++;
    }catch(error){
      console.warn("Restore failed for item", collectionName, error.message);
    }
  }

  return count;
}




/* ===== FINGERPRINT VAULT UNLOCK FINAL ===== */
function vaultFingerprintKey(){
  return "myDearDiaryVaultFingerprint_" + (currentUser?.uid || "guest");
}

function setVaultFingerprintStatus(message, type=""){
  const box = $("vaultFingerprintStatus");
  if(!box) return;
  box.innerText = message || "";
  box.classList.remove("success","error");
  if(type) box.classList.add(type);
}

function bufferToBase64(buffer){
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function base64ToBuffer(base64){
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function randomChallenge(length=32){
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr;
}

function isSecureEnoughForFingerprint(){
  return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

window.setupVaultFingerprint = async function(){
  if(!currentUser) return alert("Login first");

  if(!window.PublicKeyCredential || !navigator.credentials){
    setVaultFingerprintStatus("Fingerprint is not supported in this browser. Try Chrome on Android with HTTPS/PWA.", "error");
    return;
  }

  if(!isSecureEnoughForFingerprint()){
    setVaultFingerprintStatus("Fingerprint needs HTTPS. Upload to GitHub Pages/Netlify or install as PWA.", "error");
    return;
  }

  try{
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if(!available){
      setVaultFingerprintStatus("Device biometric unlock is not available on this device/browser.", "error");
      return;
    }

    setVaultFingerprintStatus("Follow your device fingerprint / screen-lock popup...");

    const userId = randomChallenge(16);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(32),
        rp: { name: "My Dear Diary" },
        user: {
          id: userId,
          name: currentUser.email || "mydiaryuser",
          displayName: currentUser.email || "My Dear Diary User"
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required"
        },
        timeout: 60000,
        attestation: "none"
      }
    });

    if(!credential){
      setVaultFingerprintStatus("Fingerprint setup cancelled.", "error");
      return;
    }

    localStorage.setItem(vaultFingerprintKey(), JSON.stringify({
      id: credential.id,
      rawId: bufferToBase64(credential.rawId),
      createdAt: new Date().toISOString()
    }));

    setVaultFingerprintStatus("Fingerprint setup completed. You can now unlock Vault with fingerprint.", "success");
  }catch(error){
    setVaultFingerprintStatus("Fingerprint setup failed: " + error.message, "error");
  }
};

window.unlockVaultWithFingerprint = async function(){
  if(!currentUser) return alert("Login first");

  if(!window.PublicKeyCredential || !navigator.credentials){
    setVaultFingerprintStatus("Fingerprint is not supported in this browser. Use vault password.", "error");
    return;
  }

  if(!isSecureEnoughForFingerprint()){
    setVaultFingerprintStatus("Fingerprint needs HTTPS/PWA. Use vault password fallback.", "error");
    return;
  }

  const savedText = localStorage.getItem(vaultFingerprintKey());
  if(!savedText){
    setVaultFingerprintStatus("Setup fingerprint first, or unlock using vault password.", "error");
    return;
  }

  try{
    const saved = JSON.parse(savedText);

    setVaultFingerprintStatus("Verify fingerprint / screen-lock to unlock Vault...");

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(32),
        allowCredentials: [{
          type: "public-key",
          id: base64ToBuffer(saved.rawId)
        }],
        userVerification: "required",
        timeout: 60000
      }
    });

    if(!assertion){
      setVaultFingerprintStatus("Fingerprint unlock cancelled.", "error");
      return;
    }

    $("vaultArea").classList.add("active");
    await loadVaultEntries("all");
    setVaultFingerprintStatus("Vault unlocked with fingerprint.", "success");
  }catch(error){
    setVaultFingerprintStatus("Fingerprint unlock failed. Use vault password fallback. " + error.message, "error");
  }
};




/* ===== MOOD ANALYTICS DASHBOARD FINAL ===== */
window.openMoodAnalyticsModal = function(){
  $("moodAnalyticsModal").classList.add("active");
  renderMoodAnalytics();
};

window.closeMoodAnalyticsModal = function(){
  $("moodAnalyticsModal").classList.remove("active");
};

function getMoodStats(){
  const moodOrder = ["😊 Happy","😢 Sad","🔥 Motivated","😌 Peaceful","🥰 Loved","😴 Tired"];
  const counts = {};
  moodOrder.forEach(m => counts[m] = 0);

  allEntries.forEach(e => {
    const mood = e.mood || "Unknown";
    counts[mood] = (counts[mood] || 0) + 1;
  });

  return counts;
}

function renderMoodAnalytics(){
  const entries = [...allEntries];
  const total = entries.length;
  const favoriteCount = entries.filter(e => e.favorite).length;
  const pinnedCount = entries.filter(e => e.pinned).length;
  const mediaCount = entries.filter(e => e.mediaUrl).length;

  const summary = $("analyticsSummaryCards");
  if(summary){
    summary.innerHTML = `
      <div class="analytics-card"><span>📖</span><b>${total}</b><p>Total Memories</p></div>
      <div class="analytics-card"><span>⭐</span><b>${favoriteCount}</b><p>Favorites</p></div>
      <div class="analytics-card"><span>📌</span><b>${pinnedCount}</b><p>Pinned</p></div>
      <div class="analytics-card"><span>📷</span><b>${mediaCount}</b><p>Photo / Video</p></div>
    `;
  }

  renderMoodDonut(total);
  renderMoodBars(total);
  renderTagAnalytics();
  renderMonthAnalytics();
  renderAnalyticsInsight();
}

function renderMoodDonut(total){
  const donut = $("moodDonut");
  const legend = $("moodLegend");
  const moodStats = getMoodStats();
  const colors = ["#22c55e","#60a5fa","#f97316","#14b8a6","#ec4899","#a855f7"];

  if(!donut || !legend) return;

  if(!total){
    donut.style.background = "rgba(255,255,255,.10)";
    donut.innerHTML = `<div class="mood-donut-center">No<br>Data</div>`;
    legend.innerHTML = `<div class="empty">Write diary entries to see mood analytics.</div>`;
    return;
  }

  let start = 0;
  const segments = Object.entries(moodStats).map(([mood, count], i) => {
    const percent = (count / total) * 100;
    const end = start + percent;
    const seg = `${colors[i % colors.length]} ${start}% ${end}%`;
    start = end;
    return seg;
  });

  donut.style.background = `conic-gradient(${segments.join(",")})`;
  const topMood = Object.entries(moodStats).sort((a,b)=>b[1]-a[1])[0];
  donut.innerHTML = `<div class="mood-donut-center">${escapeHTML(topMood?.[0] || "Mood")}<br>${Math.round(((topMood?.[1] || 0) / total) * 100)}%</div>`;

  legend.innerHTML = Object.entries(moodStats).map(([mood,count], i)=>{
    const percent = total ? Math.round((count/total)*100) : 0;
    return `<div class="mood-legend-item">${mood} — ${count} (${percent}%)</div>`;
  }).join("");
}

function renderMoodBars(total){
  const box = $("moodBarChart");
  if(!box) return;

  const moodStats = getMoodStats();
  const max = Math.max(...Object.values(moodStats), 1);

  box.innerHTML = Object.entries(moodStats).map(([mood,count])=>{
    const width = Math.round((count / max) * 100);
    return `
      <div class="mood-bar-row">
        <div>${escapeHTML(mood)}</div>
        <div class="mood-bar-track"><div class="mood-bar-fill" style="width:${width}%"></div></div>
        <div>${count}</div>
      </div>
    `;
  }).join("");
}

function renderTagAnalytics(){
  const box = $("tagAnalytics");
  if(!box) return;

  const tags = {};
  allEntries.forEach(e => (e.tags || []).forEach(t => tags[t] = (tags[t] || 0) + 1));

  const topTags = Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,10);

  if(!topTags.length){
    box.innerHTML = `<div class="empty">No tags yet.</div>`;
    return;
  }

  box.innerHTML = `<div class="tag-pill-row">${
    topTags.map(([tag,count]) => `<span class="analytics-tag-pill">#${escapeHTML(tag)} ${count}</span>`).join("")
  }</div>`;
}

function renderMonthAnalytics(){
  const box = $("monthAnalytics");
  if(!box) return;

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const monthEntries = allEntries.filter(e => (e.dateOnly || "").startsWith(monthKey));

  const monthMood = {};
  monthEntries.forEach(e => monthMood[e.mood || "Unknown"] = (monthMood[e.mood || "Unknown"] || 0) + 1);
  const topMood = Object.entries(monthMood).sort((a,b)=>b[1]-a[1])[0];

  box.innerHTML = `
    <div class="month-line"><span>This month entries</span><b>${monthEntries.length}</b></div>
    <div class="month-line"><span>Top mood</span><b>${escapeHTML(topMood?.[0] || "No mood")}</b></div>
    <div class="month-line"><span>Favorites this month</span><b>${monthEntries.filter(e=>e.favorite).length}</b></div>
    <div class="month-line"><span>Pinned this month</span><b>${monthEntries.filter(e=>e.pinned).length}</b></div>
  `;
}

function renderAnalyticsInsight(){
  const box = $("analyticsInsight");
  if(!box) return;

  const total = allEntries.length;
  if(!total){
    box.innerHTML = "Start writing memories and I will show your emotional pattern here.";
    return;
  }

  const moodStats = getMoodStats();
  const topMood = Object.entries(moodStats).sort((a,b)=>b[1]-a[1])[0];
  const happyScore = Math.round((((moodStats["😊 Happy"] || 0) + (moodStats["🥰 Loved"] || 0) + (moodStats["😌 Peaceful"] || 0)) / total) * 100);
  const mediaCount = allEntries.filter(e => e.mediaUrl).length;

  let message = `Your most common mood is <b>${escapeHTML(topMood?.[0] || "Unknown")}</b>.<br>`;
  message += `Your positive memory score is <b>${happyScore}%</b>.<br>`;
  message += `You saved <b>${mediaCount}</b> photo/video memories. `;

  if(happyScore >= 70){
    message += "Your diary looks very positive and emotionally healthy. 🌟";
  }else if(happyScore >= 40){
    message += "Your diary has a balanced mix of emotions. Keep writing consistently. 💙";
  }else{
    message += "Your recent memories may feel heavy. Try saving small happy moments too. 🌱";
  }

  box.innerHTML = message;
}

window.openMemoryGalleryModal=function(){
 document.getElementById('memoryGalleryModal').classList.add('active');
 filterGallery('all');
}
window.closeMemoryGalleryModal=function(){
 document.getElementById('memoryGalleryModal').classList.remove('active');
}
window.filterGallery=function(type){
 const grid=document.getElementById('galleryGrid');
 const items=(allEntries||[]).filter(e=>e.mediaUrl);
 let list=items;
 if(type==='image') list=items.filter(e=>(e.mediaType||'').startsWith('image'));
 if(type==='video') list=items.filter(e=>(e.mediaType||'').startsWith('video'));
 grid.innerHTML=list.map(e=>`<div class="gallery-item">
 ${(e.mediaType||'').startsWith('video')
 ? `<video controls src="${e.mediaUrl}"></video>`
 : `<img src="${e.mediaUrl}" onclick="openMediaViewer('${e.mediaUrl}','image')">`}
 <small>${e.title||'Memory'}</small>
 </div>`).join('') || '<div>No media memories found.</div>';
}




/* ===== THEME STORE FINAL ===== */
window.openThemeStoreModal = function(){
  $("themeStoreModal").classList.add("active");
};

window.closeThemeStoreModal = function(){
  $("themeStoreModal").classList.remove("active");
};

window.applyThemeStore = function(theme){
  const themeClasses = ["theme-galaxy","theme-royal","theme-sakura","theme-neon","theme-midnight","theme-nature"];
  document.body.classList.remove(...themeClasses);
  document.body.classList.add("theme-" + theme);
  localStorage.setItem("premiumThemeStore", theme);

  const themeMap = {
    galaxy:{primary:"#8b5cf6",accent:"#22d3ee",bg:"#09002e",lamp:"#a78bfa"},
    royal:{primary:"#facc15",accent:"#f97316",bg:"#050505",lamp:"#facc15"},
    sakura:{primary:"#fb7185",accent:"#f9a8d4",bg:"#3b1020",lamp:"#fb7185"},
    neon:{primary:"#22d3ee",accent:"#ec4899",bg:"#020617",lamp:"#22d3ee"},
    midnight:{primary:"#60a5fa",accent:"#94a3b8",bg:"#020617",lamp:"#60a5fa"},
    nature:{primary:"#22c55e",accent:"#84cc16",bg:"#052e16",lamp:"#22c55e"}
  };

  const t = themeMap[theme];
  if(t){
    localStorage.setItem("primaryColor", t.primary);
    localStorage.setItem("accentColor", t.accent);
    localStorage.setItem("bgColor", t.bg);
    localStorage.setItem("lampColor", t.lamp);
    loadCustomDesign();
    loadLampColor();
  }

  alert("Theme applied: " + theme);
};

window.resetThemeStore = function(){
  localStorage.removeItem("premiumThemeStore");
  ["theme-galaxy","theme-royal","theme-sakura","theme-neon","theme-midnight","theme-nature"].forEach(c=>document.body.classList.remove(c));
  alert("Theme reset");
};

function loadThemeStore(){
  const theme = localStorage.getItem("premiumThemeStore");
  if(theme){
    document.body.classList.add("theme-" + theme);
  }
}

loadThemeStore();




/* ===== VAULT FIX FINAL SAFE OVERRIDE ===== */
let currentVaultMode = "locked";

function vaultRealKey(){
  return "vaultPass_" + (currentUser?.uid || "guest");
}

function vaultFakeKey(){
  return "vaultFakePass_" + (currentUser?.uid || "guest");
}

function vaultLocalKey(){
  return "myDearDiaryVaultEntries_" + (currentUser?.uid || "guest");
}

function getLocalVaultEntries(){
  try{
    return JSON.parse(localStorage.getItem(vaultLocalKey()) || "[]");
  }catch(e){
    return [];
  }
}

function saveLocalVaultEntries(list){
  localStorage.setItem(vaultLocalKey(), JSON.stringify(list));
}

function updateVaultPasswordUI(){
  if(!currentUser) return;

  const hasReal = !!localStorage.getItem(vaultRealKey());
  const setup = $("vaultSetupBox");
  const unlock = $("vaultUnlockBox");

  if(setup) setup.style.display = hasReal ? "none" : "block";
  if(unlock) unlock.style.display = hasReal ? "block" : "none";

  if(!hasReal){
    if($("vaultPassword")) $("vaultPassword").value = "";
    if($("vaultFakePassword")) $("vaultFakePassword").value = "";
  }

  if($("vaultUnlockPassword")) $("vaultUnlockPassword").value = "";
}

function setVaultMode(mode){
  currentVaultMode = mode;

  const label = $("vaultModeLabel");
  const editor = $("vaultRealEditor");

  if(label){
    label.className = "vault-mode-label " + (mode === "fake" ? "fake" : mode === "real" ? "real" : "");
    label.innerText = mode === "fake"
      ? "🕶️ Fake Vault Opened — no real secrets are shown."
      : mode === "real"
        ? "🔓 Real Vault Opened"
        : "";
  }

  if(editor){
    editor.style.display = mode === "fake" ? "none" : "block";
  }
}

window.openVaultModal = function(){
  $("vaultArea")?.classList.remove("active");
  $("vaultModal")?.classList.add("active");
  currentVaultMode = "locked";
  updateVaultPasswordUI();
  setVaultMode("locked");
  removeVaultMedia();
};

window.closeVaultModal = function(){
  $("vaultModal")?.classList.remove("active");
  $("vaultArea")?.classList.remove("active");
  currentVaultMode = "locked";
};

window.saveVaultPasswords = function(){
  if(!currentUser) return alert("Login first");

  const pass = $("vaultPassword")?.value.trim() || "";
  const fake = $("vaultFakePassword")?.value.trim() || "";

  if(!pass) return alert("Enter original vault password");
  if(fake && fake === pass) return alert("Fake password must be different from original password");

  localStorage.setItem(vaultRealKey(), pass);
  if(fake) localStorage.setItem(vaultFakeKey(), fake);

  alert("Vault passwords saved");
  updateVaultPasswordUI();
};

window.unlockVault = async function(){
  if(!currentUser) return alert("Login first");

  const pass = ($("vaultUnlockPassword")?.value || $("vaultPassword")?.value || "").trim();
  const real = localStorage.getItem(vaultRealKey());
  const fake = localStorage.getItem(vaultFakeKey());

  if(!real){
    updateVaultPasswordUI();
    return alert("Set vault password first");
  }

  if(!pass) return alert("Enter vault password");

  if(fake && pass === fake){
    $("vaultArea")?.classList.add("active");
    setVaultMode("fake");
    $("vaultEntries").innerHTML = `<div class="empty">Fake vault opened. No secret memories here.</div>`;
    return;
  }

  if(pass !== real){
    return alert("Wrong password");
  }

  $("vaultArea")?.classList.add("active");
  setVaultMode("real");
  await loadVaultEntries("all");
};

window.saveVaultEntry = async function(){
  if(!currentUser) return alert("Login first");

  if(currentVaultMode !== "real"){
    return alert("Unlock real vault first");
  }

  const title = $("vaultTitle").value.trim() || "Secret Memory";
  const text = sanitizeEditorHTML(($("vaultText").innerHTML || "").trim());
  const mediaFile = $("vaultMediaFile")?.files?.[0];
  const mediaUrl = mediaFile ? await fileToDataUrl(mediaFile) : "";

  if(!stripHTML(text) && !mediaUrl) return alert("Write secret memory or add photo/video");

  const data = {
    uid: currentUser.uid,
    title,
    text,
    mediaUrl: mediaUrl || "",
    mediaType: mediaFile ? mediaFile.type : "",
    dateText: new Date().toLocaleString(),
    createdAtLocal: Date.now()
  };

  let savedToCloud = false;

  try{
    await addDoc(collection(db, "vaultEntries"), {
      ...data,
      createdAt: serverTimestamp()
    });
    savedToCloud = true;
  }catch(error){
    console.warn("Vault cloud save failed. Saving locally:", error.message);
  }

  if(!savedToCloud){
    const list = getLocalVaultEntries();
    list.push({
      id:"local_vault_" + Date.now(),
      ...data,
      localOnly:true
    });
    saveLocalVaultEntries(list);
  }

  $("vaultTitle").value = "";
  $("vaultText").innerHTML = "";
  removeVaultMedia();

  alert(savedToCloud ? "Secret saved" : "Secret saved locally");
  await loadVaultEntries("all");
};

window.loadVaultEntries = async function(filterType = "all"){
  if(!currentUser) return;

  if(currentVaultMode === "fake"){
    $("vaultEntries").innerHTML = `<div class="empty">Fake vault opened. No secret memories here.</div>`;
    return;
  }

  let list = [];

  try{
    const q = query(collection(db, "vaultEntries"), where("uid", "==", currentUser.uid));
    const snap = await getDocs(q);
    snap.forEach(d=>list.push({id:d.id, ...d.data(), cloud:true}));
  }catch(error){
    console.warn("Cloud vault load failed:", error.message);
  }

  list = list.concat(getLocalVaultEntries());

  if(filterType === "photos"){
    list = list.filter(e => (e.mediaType || "").startsWith("image"));
  }else if(filterType === "videos"){
    list = list.filter(e => (e.mediaType || "").startsWith("video"));
  }

  list.sort((a,b)=> (b.createdAt?.seconds || b.createdAtLocal || 0) - (a.createdAt?.seconds || a.createdAtLocal || 0));

  $("vaultEntries").innerHTML = list.length ? list.map(e=>`
    <div class="vault-entry vault-entry-card">
      <h3>${escapeHTML(e.title || "Secret Memory")}</h3>
      <small>${escapeHTML(e.dateText || "")}${e.localOnly ? " • Local" : ""}</small>
      ${e.text ? `<div>${e.text}</div>` : ""}
      ${renderVaultMedia(e)}
      <button class="delete-btn" onclick="deleteVaultEntry('${e.id}', '${filterType}')">Delete Secret</button>
    </div>
  `).join("") : `<div class="empty">No secret memories yet.</div>`;
};

window.deleteVaultEntry = async function(id, filterType = "all"){
  if(!confirm("Delete this secret memory?")) return;

  if(String(id).startsWith("local_vault_")){
    saveLocalVaultEntries(getLocalVaultEntries().filter(e => e.id !== id));
  }else{
    try{
      await deleteDoc(doc(db, "vaultEntries", id));
    }catch(error){
      alert("Delete failed: " + error.message);
      return;
    }
  }

  await loadVaultEntries(filterType);
};




/* ===== VAULT FINAL BEHAVIOR OVERRIDE ===== */
window.unlockVault = async function(){
  if(!currentUser) return alert("Login first");

  const pass = ($("vaultUnlockPassword")?.value || $("vaultPassword")?.value || "").trim();
  const real = localStorage.getItem(vaultRealKey());
  const fake = localStorage.getItem(vaultFakeKey());

  if(!real){
    updateVaultPasswordUI();
    return alert("Set vault password first");
  }

  if(!pass) return alert("Enter vault password");

  if(fake && pass === fake){
    $("vaultArea")?.classList.add("active");
    setVaultMode("fake");
    if($("vaultModeLabel")) $("vaultModeLabel").style.display = "none";
    if($("vaultEntries")) $("vaultEntries").innerHTML = "";
    return;
  }

  if(pass !== real){
    return alert("Wrong password");
  }

  $("vaultArea")?.classList.add("active");
  if($("vaultModeLabel")) $("vaultModeLabel").style.display = "block";
  setVaultMode("real");
  await loadVaultEntries("all");
};

window.openChangeVaultPasswordBox = function(){
  const box = $("changeVaultPasswordBox");
  if(!box) return;
  box.style.display = box.style.display === "none" ? "block" : "none";
};

window.changeVaultPassword = function(){
  if(!currentUser) return alert("Login first");

  const oldPass = $("oldVaultPassword")?.value.trim() || "";
  const newPass = $("newVaultPassword")?.value.trim() || "";
  const newFake = $("newVaultFakePassword")?.value.trim() || "";
  const real = localStorage.getItem(vaultRealKey());

  if(oldPass !== real) return alert("Old password is wrong");
  if(!newPass) return alert("Enter new original password");
  if(newFake && newFake === newPass) return alert("Fake password must be different from original password");

  localStorage.setItem(vaultRealKey(), newPass);
  if(newFake){
    localStorage.setItem(vaultFakeKey(), newFake);
  }else{
    localStorage.removeItem(vaultFakeKey());
  }

  $("oldVaultPassword").value = "";
  $("newVaultPassword").value = "";
  $("newVaultFakePassword").value = "";
  $("changeVaultPasswordBox").style.display = "none";

  alert("Vault password changed successfully");
};


window.openMemoryJourneyModal=function(){
 let first=allEntries[allEntries.length-1];
 let fav=allEntries.filter(e=>e.favorite).length;
 let pin=allEntries.filter(e=>e.pinned).length;
 let photos=allEntries.filter(e=>e.mediaType&&e.mediaType.startsWith('image')).length;
 let videos=allEntries.filter(e=>e.mediaType&&e.mediaType.startsWith('video')).length;

 let moodCount={};
 allEntries.forEach(e=>moodCount[e.mood]=(moodCount[e.mood]||0)+1);
 let topMood=Object.keys(moodCount).sort((a,b)=>moodCount[b]-moodCount[a])[0]||'None';

 document.getElementById('memoryJourneyContent').innerHTML=`
 <div class="memory-journey-grid">
 <div class="memory-box">📖 Total Memories<br><b>${allEntries.length}</b></div>
 <div class="memory-box">⭐ Favorites<br><b>${fav}</b></div>
 <div class="memory-box">📌 Pinned<br><b>${pin}</b></div>
 <div class="memory-box">😊 Top Mood<br><b>${topMood}</b></div>
 <div class="memory-box">📸 Photos<br><b>${photos}</b></div>
 <div class="memory-box">🎞 Videos<br><b>${videos}</b></div>
 <div class="memory-box">🎉 First Memory<br><b>${first?first.title:'No memories'}</b></div>
 <div class="memory-box">📅 Started<br><b>${first?first.dateText:''}</b></div>
 </div>`;
 document.getElementById('memoryJourneyModal').classList.add('active');
}
window.closeMemoryJourneyModal=function(){
 document.getElementById('memoryJourneyModal').classList.remove('active');
}



/* ===== BETTER UI / ANIMATIONS LEVEL 1 + 2 ===== */
function createPremiumParticles(){
  const box=$("premiumParticles");
  if(!box||box.dataset.ready==="true")return;
  box.dataset.ready="true";
  const count=window.innerWidth<700?18:34;
  for(let i=0;i<count;i++){
    const p=document.createElement("span");
    p.className="premium-particle";
    p.style.left=Math.random()*100+"%";
    p.style.animationDelay=(Math.random()*8)+"s";
    p.style.animationDuration=(7+Math.random()*8)+"s";
    p.style.opacity=(0.12+Math.random()*0.35).toFixed(2);
    box.appendChild(p);
  }
}
function animateCounterElement(el,target){
  if(!el)return;
  const end=Number(target||el.innerText||0);
  if(!Number.isFinite(end))return;
  const duration=650,started=performance.now();
  el.classList.remove("counter-animated"); void el.offsetWidth; el.classList.add("counter-animated");
  function step(now){
    const progress=Math.min((now-started)/duration,1);
    const eased=1-Math.pow(1-progress,3);
    el.innerText=Math.round(end*eased);
    if(progress<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
const oldRenderStatsForAnimation=window.renderStats;
if(typeof oldRenderStatsForAnimation==="function"){
  window.renderStats=function(){
    oldRenderStatsForAnimation();
    animateCounterElement($("totalCount"));
    animateCounterElement($("happyCount"));
    animateCounterElement($("favCount"));
    animateCounterElement($("pinCount"));
  };
}
function addButtonRippleEffect(){
  document.addEventListener("click",function(e){
    const btn=e.target.closest("button");
    if(!btn)return;
    const ripple=document.createElement("span");
    const rect=btn.getBoundingClientRect();
    const size=Math.max(rect.width,rect.height);
    ripple.style.position="absolute";
    ripple.style.width=ripple.style.height=size+"px";
    ripple.style.left=(e.clientX-rect.left-size/2)+"px";
    ripple.style.top=(e.clientY-rect.top-size/2)+"px";
    ripple.style.borderRadius="50%";
    ripple.style.background="rgba(255,255,255,.32)";
    ripple.style.transform="scale(0)";
    ripple.style.pointerEvents="none";
    ripple.style.animation="premiumRipple .55s ease-out forwards";
    btn.appendChild(ripple);
    setTimeout(()=>ripple.remove(),600);
  });
}
if(!document.getElementById("premiumRippleStyle")){
  const style=document.createElement("style");
  style.id="premiumRippleStyle";
  style.textContent="@keyframes premiumRipple{to{transform:scale(2.4);opacity:0}}";
  document.head.appendChild(style);
}
createPremiumParticles();
addButtonRippleEffect();




/* ===== BETTER UI / ANIMATIONS LEVEL 3 ===== */
function hidePremiumLoader(){
  const loader = $("premiumLoader");
  if(!loader) return;
  setTimeout(()=>{
    loader.classList.add("hide");
    setTimeout(()=>loader.remove(), 700);
  }, 650);
}

function setWelcomeName(){
  const banner = $("premiumWelcomeBanner");
  if(!banner || !currentUser) return;
  const name = localStorage.getItem("profileName_" + currentUser.uid) || currentUser.displayName || "friend";
  const h = banner.querySelector("h1");
  if(h) h.innerText = "Welcome back, " + name + " ✨";
}

const oldLoadProfileForWelcome = window.loadProfile;
if(typeof oldLoadProfileForWelcome === "function"){
  window.loadProfile = function(user){
    oldLoadProfileForWelcome(user);
    setWelcomeName();
  };
}

hidePremiumLoader();

setTimeout(()=>{
  setWelcomeName();
}, 1000);




/* ===== BETTER UI / ANIMATIONS LEVEL 4 - ACHIEVEMENTS ===== */
const achievementDefs = [
  {id:"first_memory", icon:"📖", title:"First Memory", desc:"Write your first diary memory.", check:()=>allEntries.length >= 1},
  {id:"ten_memories", icon:"🔟", title:"10 Memories", desc:"Save 10 diary memories.", check:()=>allEntries.length >= 10},
  {id:"fifty_memories", icon:"💎", title:"50 Memories", desc:"Save 50 diary memories.", check:()=>allEntries.length >= 50},
  {id:"hundred_memories", icon:"👑", title:"100 Memories", desc:"Save 100 diary memories.", check:()=>allEntries.length >= 100},
  {id:"first_photo", icon:"📸", title:"Photo Keeper", desc:"Save your first photo memory.", check:()=>allEntries.some(e => (e.mediaType || "").startsWith("image"))},
  {id:"first_video", icon:"🎞️", title:"Video Keeper", desc:"Save your first video memory.", check:()=>allEntries.some(e => (e.mediaType || "").startsWith("video"))},
  {id:"favorite_user", icon:"⭐", title:"Favorite Collector", desc:"Mark at least one memory as favorite.", check:()=>allEntries.some(e => e.favorite)},
  {id:"pin_user", icon:"📌", title:"Pinned Moment", desc:"Pin at least one important memory.", check:()=>allEntries.some(e => e.pinned)},
  {id:"tag_user", icon:"🏷️", title:"Tag Master", desc:"Add tags to your memories.", check:()=>allEntries.some(e => (e.tags || []).length)},
  {id:"theme_user", icon:"🎨", title:"Theme Explorer", desc:"Apply any premium theme.", check:()=>!!localStorage.getItem("premiumThemeStore")},
  {id:"backup_user", icon:"☁️", title:"Backup Ready", desc:"Use Backup & Restore to protect data.", check:()=>localStorage.getItem("backupAchievementUsed") === "yes"},
  {id:"journey_user", icon:"📖", title:"Life Story Viewer", desc:"Open Memory Journey.", check:()=>localStorage.getItem("journeyAchievementUsed") === "yes"}
];

function achievementStorageKey(){
  return "myDearDiaryAchievements_" + (currentUser?.uid || "guest");
}

function getUnlockedAchievements(){
  try{
    return JSON.parse(localStorage.getItem(achievementStorageKey()) || "[]");
  }catch(e){
    return [];
  }
}

function saveUnlockedAchievements(list){
  localStorage.setItem(achievementStorageKey(), JSON.stringify(list));
}

function checkAchievements(showToast=true){
  if(!currentUser || !Array.isArray(allEntries)) return;

  const unlocked = getUnlockedAchievements();
  let changed = false;

  achievementDefs.forEach(a=>{
    let ok = false;
    try{ ok = !!a.check(); }catch(e){ ok = false; }

    if(ok && !unlocked.includes(a.id)){
      unlocked.push(a.id);
      changed = true;
      if(showToast) showAchievementToast(a);
    }
  });

  if(changed) saveUnlockedAchievements(unlocked);
}

function showAchievementToast(a){
  const toast = $("achievementToast");
  if(!toast) return;

  toast.innerHTML = `
    <h3>🏆 Achievement Unlocked</h3>
    <p>${a.icon} <b>${escapeHTML(a.title)}</b><br>${escapeHTML(a.desc)}</p>
  `;

  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
  fireConfetti();
}

function fireConfetti(){
  const colors = ["var(--primary)","var(--accent)","#facc15","#22c55e","#fb7185","#60a5fa"];
  for(let i=0;i<34;i++){
    const c = document.createElement("span");
    c.className = "confetti-piece";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[Math.floor(Math.random()*colors.length)];
    c.style.animationDelay = Math.random() * .35 + "s";
    c.style.animationDuration = (1.3 + Math.random() * 1.3) + "s";
    c.style.transform = `rotate(${Math.random()*360}deg)`;
    document.body.appendChild(c);
    setTimeout(()=>c.remove(), 3000);
  }
}

window.openAchievementsModal = function(){
  checkAchievements(false);
  renderAchievements();
  $("achievementsModal").classList.add("active");
};

window.closeAchievementsModal = function(){
  $("achievementsModal").classList.remove("active");
};

function renderAchievements(){
  const grid = $("achievementsGrid");
  if(!grid) return;

  const unlocked = getUnlockedAchievements();

  grid.innerHTML = achievementDefs.map(a=>{
    const isUnlocked = unlocked.includes(a.id);
    return `
      <div class="achievement-card ${isUnlocked ? "unlocked" : "locked"}">
        <div class="achievement-icon">${a.icon}</div>
        <h3>${escapeHTML(a.title)}</h3>
        <p>${escapeHTML(a.desc)}</p>
        <span class="achievement-status">${isUnlocked ? "✅ Unlocked" : "🔒 Locked"}</span>
      </div>
    `;
  }).join("");
}

/* Hook achievement checks after entries load */
const oldLoadEntriesForAchievements = window.loadEntries;
if(typeof oldLoadEntriesForAchievements === "function"){
  window.loadEntries = async function(){
    await oldLoadEntriesForAchievements();
    setTimeout(()=>checkAchievements(true), 450);
  };
}

/* Mark journey opened */
const oldOpenMemoryJourneyModalForAchievements = window.openMemoryJourneyModal;
if(typeof oldOpenMemoryJourneyModalForAchievements === "function"){
  window.openMemoryJourneyModal = function(){
    localStorage.setItem("journeyAchievementUsed","yes");
    oldOpenMemoryJourneyModalForAchievements();
    setTimeout(()=>checkAchievements(true), 350);
  };
}

/* Mark theme used */
const oldApplyThemeStoreForAchievements = window.applyThemeStore;
if(typeof oldApplyThemeStoreForAchievements === "function"){
  window.applyThemeStore = function(theme){
    localStorage.setItem("premiumThemeStore", theme);
    oldApplyThemeStoreForAchievements(theme);
    setTimeout(()=>checkAchievements(true), 350);
  };
}

/* Mark backup export used */
const oldExportDiaryBackupForAchievements = window.exportDiaryBackup;
if(typeof oldExportDiaryBackupForAchievements === "function"){
  window.exportDiaryBackup = async function(){
    localStorage.setItem("backupAchievementUsed","yes");
    await oldExportDiaryBackupForAchievements();
    setTimeout(()=>checkAchievements(true), 350);
  };
}

setTimeout(()=>checkAchievements(false), 1500);




/* ===== ACHIEVEMENT REWARDS SYSTEM ===== */
const rewardDefs = [
  {
    id:"golden_theme",
    achievement:"first_memory",
    icon:"🏅",
    title:"Golden Diary Theme",
    desc:"Unlocked by First Memory. Gives your app a premium golden diary glow.",
    type:"theme",
    value:"golden"
  },
  {
    id:"aurora_theme",
    achievement:"ten_memories",
    icon:"🌌",
    title:"Aurora Theme",
    desc:"Unlocked by 10 Memories. Adds an aurora blue-purple style.",
    type:"theme",
    value:"aurora"
  },
  {
    id:"diamond_theme",
    achievement:"fifty_memories",
    icon:"💎",
    title:"Diamond Theme",
    desc:"Unlocked by 50 Memories. Adds a crystal diamond style.",
    type:"theme",
    value:"diamond"
  },
  {
    id:"legend_theme",
    achievement:"hundred_memories",
    icon:"👑",
    title:"Diary Legend Theme",
    desc:"Unlocked by 100 Memories. Adds crown-level luxury styling.",
    type:"theme",
    value:"legend"
  },
  {
    id:"photo_theme",
    achievement:"first_photo",
    icon:"📸",
    title:"Photo Frame Theme",
    desc:"Unlocked by Photo Keeper. A colorful memory-photo style.",
    type:"theme",
    value:"photo"
  },
  {
    id:"cinema_theme",
    achievement:"first_video",
    icon:"🎬",
    title:"Cinema Theme",
    desc:"Unlocked by Video Keeper. A movie-style red and gold look.",
    type:"theme",
    value:"cinema"
  },
  {
    id:"favorite_badge",
    achievement:"favorite_user",
    icon:"⭐",
    title:"Favorite Collector Badge",
    desc:"Unlocked by Favorite Collector. Shows a golden star profile badge.",
    type:"badge",
    value:"⭐ Favorite Collector"
  },
  {
    id:"pin_badge",
    achievement:"pin_user",
    icon:"📌",
    title:"Pinned Moment Badge",
    desc:"Unlocked by Pinned Moment. Shows a pinned memory profile badge.",
    type:"badge",
    value:"📌 Memory Keeper"
  },
  {
    id:"tag_badge",
    achievement:"tag_user",
    icon:"🏷️",
    title:"Tag Master Badge",
    desc:"Unlocked by Tag Master. Shows a smart organizer badge.",
    type:"badge",
    value:"🏷️ Tag Master"
  },
  {
    id:"storybook_theme",
    achievement:"journey_user",
    icon:"📖",
    title:"Story Book Theme",
    desc:"Unlocked by Life Story Viewer. A royal story-style theme.",
    type:"theme",
    value:"storybook"
  },
  {
    id:"cloud_badge",
    achievement:"backup_user",
    icon:"☁️",
    title:"Cloud Guardian Badge",
    desc:"Unlocked by Backup Ready. Shows a cloud protection badge.",
    type:"badge",
    value:"☁️ Cloud Guardian"
  }
];

function rewardUnlockedKey(){
  return "myDearDiaryRewards_" + (currentUser?.uid || "guest");
}

function activeRewardThemeKey(){
  return "myDearDiaryActiveRewardTheme_" + (currentUser?.uid || "guest");
}

function activeRewardBadgeKey(){
  return "myDearDiaryActiveRewardBadge_" + (currentUser?.uid || "guest");
}

function getUnlockedRewards(){
  try{
    return JSON.parse(localStorage.getItem(rewardUnlockedKey()) || "[]");
  }catch(e){
    return [];
  }
}

function saveUnlockedRewards(list){
  localStorage.setItem(rewardUnlockedKey(), JSON.stringify(list));
}

function syncRewardsFromAchievements(showToast=true){
  if(!currentUser) return;

  let achievementList = [];
  try{
    achievementList = JSON.parse(localStorage.getItem("myDearDiaryAchievements_" + currentUser.uid) || "[]");
  }catch(e){
    achievementList = [];
  }

  const rewards = getUnlockedRewards();
  let changed = false;

  rewardDefs.forEach(r=>{
    if(achievementList.includes(r.achievement) && !rewards.includes(r.id)){
      rewards.push(r.id);
      changed = true;
      if(showToast) showRewardToast(r);
    }
  });

  if(changed) saveUnlockedRewards(rewards);
  updateRewardProfileBadge();
}

function showRewardToast(reward){
  const toast = $("rewardToast");
  if(!toast) return;

  toast.innerHTML = `
    <h3>🎁 Reward Unlocked!</h3>
    <p>${reward.icon} <b>${escapeHTML(reward.title)}</b><br>${escapeHTML(reward.desc)}</p>
  `;

  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");

  if(typeof fireConfetti === "function") fireConfetti();
}

window.openRewardsVaultModal = function(){
  syncRewardsFromAchievements(false);
  renderRewardsVault("all");
  $("rewardsVaultModal").classList.add("active");
};

window.closeRewardsVaultModal = function(){
  $("rewardsVaultModal").classList.remove("active");
};

window.renderRewardsVault = function(filter="all"){
  const grid = $("rewardsVaultGrid");
  if(!grid) return;

  syncRewardsFromAchievements(false);

  const unlocked = getUnlockedRewards();

  let list = rewardDefs.map(r => ({...r, unlocked:unlocked.includes(r.id)}));
  if(filter === "unlocked") list = list.filter(r => r.unlocked);
  if(filter === "locked") list = list.filter(r => !r.unlocked);

  grid.innerHTML = list.length ? list.map(r => `
    <div class="reward-card ${r.unlocked ? "unlocked" : "locked"}">
      <div class="reward-icon">${r.icon}</div>
      <h3>${escapeHTML(r.title)}</h3>
      <p>${escapeHTML(r.desc)}</p>
      <span class="reward-status">${r.unlocked ? "✅ Reward Unlocked" : "🔒 Locked"}</span>
      ${r.unlocked ? renderRewardActionButton(r) : ""}
    </div>
  `).join("") : `<div class="empty">No rewards found.</div>`;
};

function renderRewardActionButton(r){
  if(r.type === "theme"){
    return `<button onclick="applyRewardTheme('${r.value}')">Apply Reward Theme</button>`;
  }
  if(r.type === "badge"){
    return `<button onclick="applyRewardBadge('${escapeHTML(r.value)}')">Use Profile Badge</button>`;
  }
  return "";
}

window.applyRewardTheme = function(theme){
  const rewardThemeClasses = [
    "reward-theme-golden","reward-theme-aurora","reward-theme-diamond","reward-theme-legend",
    "reward-theme-cinema","reward-theme-photo","reward-theme-storybook","reward-theme-cloud"
  ];

  document.body.classList.remove(...rewardThemeClasses);
  document.body.classList.add("reward-theme-" + theme);
  localStorage.setItem(activeRewardThemeKey(), theme);

  const themeMap = {
    golden:{primary:"#facc15",accent:"#f97316",bg:"#140d00",lamp:"#facc15"},
    aurora:{primary:"#22d3ee",accent:"#a855f7",bg:"#02111f",lamp:"#22d3ee"},
    diamond:{primary:"#7dd3fc",accent:"#e0f2fe",bg:"#06142e",lamp:"#bae6fd"},
    legend:{primary:"#fbbf24",accent:"#ef4444",bg:"#050505",lamp:"#facc15"},
    cinema:{primary:"#ef4444",accent:"#facc15",bg:"#100000",lamp:"#ef4444"},
    photo:{primary:"#ec4899",accent:"#22d3ee",bg:"#12051f",lamp:"#ec4899"},
    storybook:{primary:"#a855f7",accent:"#f9a8d4",bg:"#2e1065",lamp:"#c084fc"},
    cloud:{primary:"#60a5fa",accent:"#e0f2fe",bg:"#082f49",lamp:"#93c5fd"}
  };

  const t = themeMap[theme];
  if(t){
    localStorage.setItem("primaryColor", t.primary);
    localStorage.setItem("accentColor", t.accent);
    localStorage.setItem("bgColor", t.bg);
    localStorage.setItem("lampColor", t.lamp);
    loadCustomDesign();
    loadLampColor();
  }

  alert("Reward theme applied");
};

window.resetRewardTheme = function(){
  const rewardThemeClasses = [
    "reward-theme-golden","reward-theme-aurora","reward-theme-diamond","reward-theme-legend",
    "reward-theme-cinema","reward-theme-photo","reward-theme-storybook","reward-theme-cloud"
  ];
  document.body.classList.remove(...rewardThemeClasses);
  if(currentUser) localStorage.removeItem(activeRewardThemeKey());
  alert("Reward theme reset");
};

window.applyRewardBadge = function(badge){
  localStorage.setItem(activeRewardBadgeKey(), badge);
  updateRewardProfileBadge();
  alert("Profile badge applied");
};

function updateRewardProfileBadge(){
  const badgeBox = $("rewardProfileBadge");
  if(!badgeBox || !currentUser) return;

  const badge = localStorage.getItem(activeRewardBadgeKey()) || "";
  badgeBox.innerText = badge;
  badgeBox.style.display = badge ? "inline-block" : "none";
}

function loadRewardThemeAndBadge(){
  if(!currentUser) return;

  const theme = localStorage.getItem(activeRewardThemeKey());
  if(theme){
    const classes = [
      "reward-theme-golden","reward-theme-aurora","reward-theme-diamond","reward-theme-legend",
      "reward-theme-cinema","reward-theme-photo","reward-theme-storybook","reward-theme-cloud"
    ];
    document.body.classList.remove(...classes);
    document.body.classList.add("reward-theme-" + theme);
  }

  updateRewardProfileBadge();
}

/* Improve achievements list to show reward name */
const oldRenderAchievementsForRewards = window.renderAchievements;
if(typeof oldRenderAchievementsForRewards === "function"){
  window.renderAchievements = function(){
    oldRenderAchievementsForRewards();
    setTimeout(()=>{
      document.querySelectorAll(".achievement-card").forEach(card=>{
        const title = card.querySelector("h3")?.innerText || "";
        const matchingReward = rewardDefs.find(r=>{
          const a = achievementDefs.find(x => x.id === r.achievement);
          return a && a.title === title;
        });
        if(matchingReward && !card.querySelector(".achievement-reward-line")){
          const line = document.createElement("p");
          line.className = "achievement-reward-line";
          line.innerHTML = `🎁 Reward: <b>${escapeHTML(matchingReward.title)}</b>`;
          card.appendChild(line);
        }
      });
    }, 50);
  };
}

/* Hook achievement checking to unlock rewards too */
const oldCheckAchievementsForRewards = window.checkAchievements;
if(typeof oldCheckAchievementsForRewards === "function"){
  window.checkAchievements = function(showToast=true){
    oldCheckAchievementsForRewards(showToast);
    setTimeout(()=>syncRewardsFromAchievements(showToast), 120);
  };
}

/* Hook profile/load entries */
const oldLoadProfileForRewards = window.loadProfile;
if(typeof oldLoadProfileForRewards === "function"){
  window.loadProfile = function(user){
    oldLoadProfileForRewards(user);
    setTimeout(()=>{
      loadRewardThemeAndBadge();
      syncRewardsFromAchievements(false);
    }, 120);
  };
}

setTimeout(()=>{
  loadRewardThemeAndBadge();
  syncRewardsFromAchievements(false);
}, 1600);




/* ===== MEMORY STREAK SYSTEM ===== */
const streakRewardDefs = [
  {id:"bronze_writer", days:7, icon:"🥉", title:"Bronze Writer", desc:"Write for 7 days streak.", theme:"bronze"},
  {id:"silver_writer", days:30, icon:"🥈", title:"Silver Writer", desc:"Write for 30 days streak.", theme:"silver"},
  {id:"gold_writer", days:100, icon:"🥇", title:"Gold Writer", desc:"Write for 100 days streak.", theme:"goldwriter"},
  {id:"streak_legend", days:365, icon:"👑", title:"Diary Streak Legend", desc:"Write for 365 days streak.", theme:"streaklegend"}
];

function getEntryDateSet(){
  const set = new Set();
  (allEntries || []).forEach(e=>{
    if(e.dateOnly) set.add(e.dateOnly);
    else if(e.dateText){
      const d = new Date(e.dateText);
      if(!isNaN(d)) set.add(d.toISOString().split("T")[0]);
    }
  });
  return set;
}

function formatDateOnly(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function calculateMemoryStreak(){
  const dates = getEntryDateSet();
  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let current = 0;
  if(!dates.has(formatDateOnly(cursor))){
    cursor.setDate(cursor.getDate() - 1);
  }

  while(dates.has(formatDateOnly(cursor))){
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const sortedDates = Array.from(dates).sort();
  let best = 0;
  let run = 0;
  let prev = null;

  sortedDates.forEach(ds=>{
    const d = new Date(ds + "T00:00:00");
    if(prev){
      const diff = Math.round((d - prev) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    }else{
      run = 1;
    }
    best = Math.max(best, run);
    prev = d;
  });

  return {
    current,
    best,
    totalDays: dates.size,
    lastWritingDay: sortedDates[sortedDates.length-1] || "",
    dates
  };
}

function streakRewardStorageKey(){
  return "myDearDiaryStreakRewards_" + (currentUser?.uid || "guest");
}

function getUnlockedStreakRewards(){
  try{
    return JSON.parse(localStorage.getItem(streakRewardStorageKey()) || "[]");
  }catch(e){
    return [];
  }
}

function saveUnlockedStreakRewards(list){
  localStorage.setItem(streakRewardStorageKey(), JSON.stringify(list));
}

function checkStreakRewards(showToast=true){
  if(!currentUser) return;

  const streak = calculateMemoryStreak();
  const unlocked = getUnlockedStreakRewards();
  let changed = false;

  streakRewardDefs.forEach(r=>{
    if(streak.best >= r.days && !unlocked.includes(r.id)){
      unlocked.push(r.id);
      changed = true;
      if(showToast && typeof showRewardToast === "function"){
        showRewardToast({
          icon:r.icon,
          title:r.title + " Reward",
          desc:"Unlocked by reaching " + r.days + " day streak."
        });
      }
    }
  });

  if(changed) saveUnlockedStreakRewards(unlocked);
}

function renderStreakStats(){
  const streak = calculateMemoryStreak();
  if($("streakCount")) $("streakCount").innerText = streak.current;

  localStorage.setItem("currentStreak_" + (currentUser?.uid || "guest"), String(streak.current));
  localStorage.setItem("bestStreak_" + (currentUser?.uid || "guest"), String(streak.best));

  checkStreakRewards(false);
}

window.openStreakModal = function(){
  const streak = calculateMemoryStreak();
  const unlocked = getUnlockedStreakRewards();
  const nextReward = streakRewardDefs.find(r => !unlocked.includes(r.id));
  const nextDays = nextReward ? nextReward.days : 365;
  const progress = nextReward ? Math.min((streak.best / nextReward.days) * 100, 100) : 100;

  const box = $("streakContent");
  if(!box) return;

  box.innerHTML = `
    <div class="streak-hero">
      <div class="streak-fire">🔥</div>
      <div class="streak-number">${streak.current}</div>
      <h3>Current Writing Streak</h3>
      <p>${streak.current ? "Keep going. Your diary habit is growing." : "Write today to start your streak."}</p>
    </div>

    <div class="streak-grid">
      <div class="streak-box">🏆 Best Streak<b>${streak.best}</b></div>
      <div class="streak-box">📅 Writing Days<b>${streak.totalDays}</b></div>
      <div class="streak-box">🕒 Last Write<b>${streak.lastWritingDay || "None"}</b></div>
    </div>

    <h3>🎖️ Streak Rewards</h3>
    <div class="streak-progress"><span style="width:${progress}%"></span></div>
    <p class="soft-text">${nextReward ? `Next reward: ${nextReward.icon} ${nextReward.title} at ${nextReward.days} days` : "All streak rewards unlocked!"}</p>

    <div class="streak-reward-list">
      ${streakRewardDefs.map(r=>`
        <div class="streak-reward ${unlocked.includes(r.id) ? "unlocked" : "locked"}">
          <h3>${r.icon} ${r.title}</h3>
          <p>${r.desc}</p>
          <span>${unlocked.includes(r.id) ? "✅ Unlocked" : `🔒 ${streak.best}/${r.days} days`}</span>
          ${unlocked.includes(r.id) ? `<button onclick="applyStreakRewardTheme('${r.theme}')">Apply Theme</button>` : ""}
        </div>
      `).join("")}
    </div>
  `;

  $("streakModal").classList.add("active");
};

window.closeStreakModal = function(){
  $("streakModal").classList.remove("active");
};

window.applyStreakRewardTheme = function(theme){
  const classes = ["reward-theme-bronze","reward-theme-silver","reward-theme-goldwriter","reward-theme-streaklegend"];
  document.body.classList.remove(...classes);
  document.body.classList.add("reward-theme-" + theme);
  localStorage.setItem("myDearDiaryActiveStreakTheme_" + (currentUser?.uid || "guest"), theme);

  const map = {
    bronze:{primary:"#cd7f32",accent:"#f97316",bg:"#1c0a00",lamp:"#cd7f32"},
    silver:{primary:"#cbd5e1",accent:"#60a5fa",bg:"#0f172a",lamp:"#e2e8f0"},
    goldwriter:{primary:"#facc15",accent:"#f97316",bg:"#130d00",lamp:"#facc15"},
    streaklegend:{primary:"#ef4444",accent:"#facc15",bg:"#050505",lamp:"#ef4444"}
  };
  const t = map[theme];
  if(t){
    localStorage.setItem("primaryColor", t.primary);
    localStorage.setItem("accentColor", t.accent);
    localStorage.setItem("bgColor", t.bg);
    localStorage.setItem("lampColor", t.lamp);
    loadCustomDesign();
    loadLampColor();
  }
  alert("Streak reward theme applied");
};

function loadStreakRewardTheme(){
  if(!currentUser) return;
  const theme = localStorage.getItem("myDearDiaryActiveStreakTheme_" + currentUser.uid);
  if(theme){
    document.body.classList.add("reward-theme-" + theme);
  }
}

/* Hook into stats and load */
const oldRenderStatsForStreak = window.renderStats;
if(typeof oldRenderStatsForStreak === "function"){
  window.renderStats = function(){
    oldRenderStatsForStreak();
    setTimeout(renderStreakStats, 100);
  };
}

const oldLoadProfileForStreak = window.loadProfile;
if(typeof oldLoadProfileForStreak === "function"){
  window.loadProfile = function(user){
    oldLoadProfileForStreak(user);
    setTimeout(loadStreakRewardTheme, 150);
  };
}

/* Add streak data into Memory Journey if opened */
const oldOpenMemoryJourneyForStreak = window.openMemoryJourneyModal;
if(typeof oldOpenMemoryJourneyForStreak === "function"){
  window.openMemoryJourneyModal = function(){
    oldOpenMemoryJourneyForStreak();
    setTimeout(()=>{
      const content = $("memoryJourneyContent");
      if(!content || content.querySelector(".streak-journey-extra")) return;
      const streak = calculateMemoryStreak();
      content.insertAdjacentHTML("beforeend", `
        <div class="memory-box streak-journey-extra">🔥 Current Streak<br><b>${streak.current} days</b></div>
        <div class="memory-box streak-journey-extra">🏆 Best Streak<br><b>${streak.best} days</b></div>
      `);
    }, 100);
  };
}

setTimeout(()=>{
  renderStreakStats();
  loadStreakRewardTheme();
}, 1200);



/* ===== VAULT ENCRYPTION ONLY UPGRADE ===== */
let activeVaultEncryptionPassword = "";

function vaultEncBytesToBase64(buffer){
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for(let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function vaultEncBase64ToBytes(base64){
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function vaultEncRandomBase64(length){
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return vaultEncBytesToBase64(bytes);
}

async function vaultDeriveEncryptionKey(password, saltBase64){
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {name:"PBKDF2", salt:vaultEncBase64ToBytes(saltBase64), iterations:120000, hash:"SHA-256"},
    keyMaterial,
    {name:"AES-GCM", length:256},
    false,
    ["encrypt","decrypt"]
  );
}

async function encryptVaultPayload(payload, password){
  const salt = vaultEncRandomBase64(16);
  const iv = vaultEncRandomBase64(12);
  const key = await vaultDeriveEncryptionKey(password, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({name:"AES-GCM", iv:vaultEncBase64ToBytes(iv)}, key, encoded);
  return {encrypted:true, version:1, alg:"AES-GCM-256", kdf:"PBKDF2-SHA256", salt, iv, cipher:vaultEncBytesToBase64(cipher)};
}

async function decryptVaultPayload(encryptedPayload, password){
  const key = await vaultDeriveEncryptionKey(password, encryptedPayload.salt);
  const plain = await crypto.subtle.decrypt(
    {name:"AES-GCM", iv:vaultEncBase64ToBytes(encryptedPayload.iv)},
    key,
    vaultEncBase64ToBytes(encryptedPayload.cipher)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function vaultEncryptionNotice(){
  if($("vaultEncryptionNotice")) return;
  const modal = $("vaultModal")?.querySelector(".modal-card");
  if(!modal) return;
  const div = document.createElement("div");
  div.id = "vaultEncryptionNotice";
  div.className = "vault-encryption-notice";
  div.innerHTML = "🔐 Vault Encryption Active — new secrets are protected";
  const h2 = modal.querySelector("h2");
  if(h2) h2.insertAdjacentElement("afterend", div);
}

const oldUnlockVaultForEncryption = window.unlockVault;
if(typeof oldUnlockVaultForEncryption === "function"){
  window.unlockVault = async function(){
    const pass = ($("vaultUnlockPassword")?.value || $("vaultPassword")?.value || "").trim();
    await oldUnlockVaultForEncryption();
    if(currentVaultMode === "real" && pass){
      activeVaultEncryptionPassword = pass;
      vaultEncryptionNotice();
      setTimeout(()=>loadVaultEntries("all"), 150);
    }
    if(currentVaultMode === "fake"){
      activeVaultEncryptionPassword = "";
    }
  };
}

const oldSaveVaultEntryForEncryption = window.saveVaultEntry;
if(typeof oldSaveVaultEntryForEncryption === "function"){
  window.saveVaultEntry = async function(){
    if(!currentUser) return alert("Login first");
    if(currentVaultMode !== "real") return alert("Unlock real vault first");
    if(!activeVaultEncryptionPassword) return alert("Unlock vault again to enable encryption");

    const titleEl = $("vaultTitle");
    const textEl = $("vaultText");
    const fileEl = $("vaultMediaFile");
    const title = (titleEl?.value || "").trim() || "Secret Memory";
    const text = sanitizeEditorHTML((textEl?.innerHTML || "").trim());
    const mediaFile = fileEl?.files?.[0];
    const mediaUrl = mediaFile ? await fileToDataUrl(mediaFile) : "";

    if(!stripHTML(text) && !mediaUrl) return alert("Write secret memory or add photo/video");

    const plainPayload = {title, text, mediaUrl:mediaUrl || "", mediaType:mediaFile ? mediaFile.type : "", dateText:new Date().toLocaleString()};
    const encryptedPayload = await encryptVaultPayload(plainPayload, activeVaultEncryptionPassword);

    const data = {
      uid:currentUser.uid,
      encrypted:true,
      vaultData:encryptedPayload,
      createdAtLocal:Date.now(),
      dateText:plainPayload.dateText
    };

    let savedToCloud = false;
    try{
      await addDoc(collection(db, "vaultEntries"), {...data, createdAt:serverTimestamp()});
      savedToCloud = true;
    }catch(error){
      console.warn("Encrypted vault cloud save failed, saving local:", error.message);
    }

    if(!savedToCloud){
      const list = getLocalVaultEntries();
      list.push({id:"local_vault_" + Date.now(), ...data, localOnly:true});
      saveLocalVaultEntries(list);
    }

    if(titleEl) titleEl.value = "";
    if(textEl) textEl.innerHTML = "";
    if(typeof removeVaultMedia === "function") removeVaultMedia();

    alert(savedToCloud ? "Encrypted secret saved" : "Encrypted secret saved locally");
    await loadVaultEntries("all");
  };
}

async function decryptVaultEntryForSafeDisplay(entry){
  if(entry && entry.encrypted && entry.vaultData){
    try{
      const plain = await decryptVaultPayload(entry.vaultData, activeVaultEncryptionPassword);
      return {...entry, ...plain, encrypted:true};
    }catch(error){
      return {...entry, title:"🔒 Locked encrypted secret", text:"", mediaUrl:"", mediaType:"", decryptFailed:true};
    }
  }
  return entry;
}

const oldLoadVaultEntriesForEncryption = window.loadVaultEntries;
if(typeof oldLoadVaultEntriesForEncryption === "function"){
  window.loadVaultEntries = async function(filterType="all"){
    if(!currentUser) return;
    if(currentVaultMode === "fake"){
      if($("vaultEntries")) $("vaultEntries").innerHTML = "";
      return;
    }

    let list = [];
    try{
      const q = query(collection(db, "vaultEntries"), where("uid", "==", currentUser.uid));
      const snap = await getDocs(q);
      snap.forEach(d=>list.push({id:d.id, ...d.data(), cloud:true}));
    }catch(error){
      console.warn("Cloud vault load failed:", error.message);
    }

    try{ list = list.concat(getLocalVaultEntries()); }catch(error){}

    const finalList = [];
    for(const item of list) finalList.push(await decryptVaultEntryForSafeDisplay(item));

    let filtered = finalList;
    if(filterType === "photos") filtered = filtered.filter(e => (e.mediaType || "").startsWith("image"));
    else if(filterType === "videos") filtered = filtered.filter(e => (e.mediaType || "").startsWith("video"));

    filtered.sort((a,b)=> (b.createdAt?.seconds || b.createdAtLocal || 0) - (a.createdAt?.seconds || a.createdAtLocal || 0));

    if(!$("vaultEntries")) return;
    $("vaultEntries").innerHTML = filtered.length ? filtered.map(e=>`
      <div class="vault-entry vault-entry-card">
        <h3>${escapeHTML(e.title || "Secret Memory")}</h3>
        <small>${escapeHTML(e.dateText || "")}${e.localOnly ? " • Local" : ""}${e.encrypted ? " • 🔐 Encrypted" : " • Legacy"}</small>
        ${e.decryptFailed ? `<div class="empty">Cannot decrypt this secret. Unlock with original vault password.</div>` : ""}
        ${e.text ? `<div>${e.text}</div>` : ""}
        ${typeof renderVaultMedia === "function" ? renderVaultMedia(e) : ""}
        <button class="delete-btn" onclick="deleteVaultEntry('${e.id}', '${filterType}')">Delete Secret</button>
      </div>
    `).join("") : `<div class="empty">No secret memories yet.</div>`;
  };
}

const oldCloseVaultModalForEncryption = window.closeVaultModal;
if(typeof oldCloseVaultModalForEncryption === "function"){
  window.closeVaultModal = function(){
    activeVaultEncryptionPassword = "";
    oldCloseVaultModalForEncryption();
  };
}




/* ===== VAULT PASSWORD HASHING UPGRADE ===== */
/* Stores vault password as salted SHA-256 hash.
   Legacy plain vault passwords are still accepted once, then migrated to hash. */

function vaultHashSaltKey(){
  return "vaultHashSalt_" + (currentUser?.uid || "guest");
}

function vaultHashRealKey(){
  return "vaultHashReal_" + (currentUser?.uid || "guest");
}

function vaultHashFakeKey(){
  return "vaultHashFake_" + (currentUser?.uid || "guest");
}

function vaultLegacyRealKey(){
  return "vaultPass_" + (currentUser?.uid || "guest");
}

function vaultLegacyFakeKey(){
  return "vaultFakePass_" + (currentUser?.uid || "guest");
}

async function vaultSha256Base64(text){
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return vaultEncBytesToBase64(hash);
}

function vaultHashedPasswordExists(){
  return !!localStorage.getItem(vaultHashRealKey());
}

function vaultAnyPasswordExists(){
  return vaultHashedPasswordExists() || !!localStorage.getItem(vaultLegacyRealKey());
}

async function saveVaultPasswordHashes(realPass, fakePass=""){
  const salt = vaultEncRandomBase64(16);

  localStorage.setItem(vaultHashSaltKey(), salt);
  localStorage.setItem(vaultHashRealKey(), await vaultSha256Base64(realPass + ":" + salt));

  if(fakePass){
    localStorage.setItem(vaultHashFakeKey(), await vaultSha256Base64(fakePass + ":" + salt));
  }else{
    localStorage.removeItem(vaultHashFakeKey());
  }

  /* remove plain passwords after secure hash save */
  localStorage.removeItem(vaultLegacyRealKey());
  localStorage.removeItem(vaultLegacyFakeKey());
}

async function verifyVaultPasswordHashed(pass){
  const salt = localStorage.getItem(vaultHashSaltKey());
  const realHash = localStorage.getItem(vaultHashRealKey());
  const fakeHash = localStorage.getItem(vaultHashFakeKey());

  if(salt && realHash){
    const attempt = await vaultSha256Base64(pass + ":" + salt);

    if(fakeHash && attempt === fakeHash) return "fake";
    if(attempt === realHash) return "real";
    return "wrong";
  }

  /* legacy plain-password support + auto-migration */
  const legacyReal = localStorage.getItem(vaultLegacyRealKey());
  const legacyFake = localStorage.getItem(vaultLegacyFakeKey());

  if(legacyFake && pass === legacyFake) return "fake";

  if(legacyReal && pass === legacyReal){
    await saveVaultPasswordHashes(pass, legacyFake || "");
    return "real";
  }

  return "missing";
}

function updateVaultHashUI(){
  if(!currentUser) return;

  const hasPass = vaultAnyPasswordExists();
  const setup = $("vaultSetupBox");
  const unlock = $("vaultUnlockBox");

  if(setup) setup.style.display = hasPass ? "none" : "block";
  if(unlock) unlock.style.display = hasPass ? "block" : "block";

  const notice = $("vaultHashNotice");
  if(!notice){
    const modal = $("vaultModal")?.querySelector(".modal-card");
    if(modal){
      const div = document.createElement("div");
      div.id = "vaultHashNotice";
      div.className = "vault-hash-notice";
      div.innerHTML = "🔑 Vault Password Hashing Active";
      const encNotice = $("vaultEncryptionNotice") || modal.querySelector("h2");
      if(encNotice) encNotice.insertAdjacentElement("afterend", div);
    }
  }
}

/* Override password save with secure hashing */
window.saveVaultPasswords = async function(){
  if(!currentUser) return alert("Login first");

  const pass = ($("vaultPassword")?.value || "").trim();
  const fake = ($("vaultFakePassword")?.value || "").trim();

  if(!pass) return alert("Enter original vault password");
  if(fake && fake === pass) return alert("Fake password must be different from original password");

  await saveVaultPasswordHashes(pass, fake);

  if($("vaultPassword")) $("vaultPassword").value = "";
  if($("vaultFakePassword")) $("vaultFakePassword").value = "";

  updateVaultHashUI();
  alert("Vault password saved securely");
};

/* Override unlock to use hashed password, while preserving encryption active password */
window.unlockVault = async function(){
  if(!currentUser) return alert("Login first");

  updateVaultHashUI();

  const pass = ($("vaultUnlockPassword")?.value || $("vaultPassword")?.value || "").trim();

  if(!vaultAnyPasswordExists()){
    return alert("Set vault password first");
  }

  if(!pass) return alert("Enter vault password");

  const status = await verifyVaultPasswordHashed(pass);

  if(status === "fake"){
    activeVaultEncryptionPassword = "";
    $("vaultArea")?.classList.add("active");
    if(typeof setVaultMode === "function") setVaultMode("fake");
    if($("vaultModeLabel")) $("vaultModeLabel").style.display = "none";
    if($("vaultEntries")) $("vaultEntries").innerHTML = "";
    return;
  }

  if(status !== "real"){
    return alert("Wrong password");
  }

  activeVaultEncryptionPassword = pass;
  $("vaultArea")?.classList.add("active");

  if($("vaultModeLabel")) $("vaultModeLabel").style.display = "block";
  if(typeof setVaultMode === "function") setVaultMode("real");

  vaultEncryptionNotice();
  updateVaultHashUI();

  if($("vaultUnlockPassword")) $("vaultUnlockPassword").value = "";
  if($("vaultPassword")) $("vaultPassword").value = "";

  await loadVaultEntries("all");
};

/* Strengthen change password if that option exists */
window.changeVaultPassword = async function(){
  if(!currentUser) return alert("Login first");

  const oldPass = ($("oldVaultPassword")?.value || "").trim();
  const newPass = ($("newVaultPassword")?.value || "").trim();
  const newFake = ($("newVaultFakePassword")?.value || "").trim();

  const verified = await verifyVaultPasswordHashed(oldPass);

  if(verified !== "real") return alert("Old password is wrong");
  if(!newPass) return alert("Enter new original password");
  if(newFake && newFake === newPass) return alert("Fake password must be different from original password");

  await saveVaultPasswordHashes(newPass, newFake);
  activeVaultEncryptionPassword = newPass;

  if($("oldVaultPassword")) $("oldVaultPassword").value = "";
  if($("newVaultPassword")) $("newVaultPassword").value = "";
  if($("newVaultFakePassword")) $("newVaultFakePassword").value = "";
  if($("changeVaultPasswordBox")) $("changeVaultPasswordBox").style.display = "none";

  updateVaultHashUI();
  alert("Vault password changed securely");
};

const oldOpenVaultModalForHashing = window.openVaultModal;
if(typeof oldOpenVaultModalForHashing === "function"){
  window.openVaultModal = function(){
    oldOpenVaultModalForHashing();
    setTimeout(updateVaultHashUI, 80);
  };
}

setTimeout(updateVaultHashUI, 1200);




/* ===== AUTO LOCK APP SECURITY ===== */
/* Locks the visible diary app after inactivity. Default: 3 minutes. */
const AUTO_LOCK_MINUTES = 3;
let autoLockTimer = null;
let autoLockEnabled = true;
let autoLockIsLocked = false;

function autoLockStatusKey(){
  return "autoLockEnabled_" + (currentUser?.uid || "guest");
}

function autoLockLastActivityKey(){
  return "autoLockLastActivity_" + (currentUser?.uid || "guest");
}

function getAutoLockEnabled(){
  const saved = localStorage.getItem(autoLockStatusKey());
  if(saved === null) return true;
  return saved === "yes";
}

function setAutoLockEnabled(value){
  autoLockEnabled = !!value;
  localStorage.setItem(autoLockStatusKey(), autoLockEnabled ? "yes" : "no");
  updateAutoLockStatus();
  resetAutoLockTimer();
}

function updateAutoLockStatus(){
  let status = $("autoLockStatus");
  if(!status){
    status = document.createElement("div");
    status.id = "autoLockStatus";
    status.className = "auto-lock-status";
    document.body.appendChild(status);
  }

  if(!currentUser || !autoLockEnabled){
    status.style.display = "none";
    return;
  }

  status.style.display = "block";
  status.innerText = "🔒 Auto Lock: " + AUTO_LOCK_MINUTES + " min";
}

function resetAutoLockTimer(){
  if(autoLockTimer) clearTimeout(autoLockTimer);

  if(!currentUser || !autoLockEnabled || autoLockIsLocked) return;

  localStorage.setItem(autoLockLastActivityKey(), String(Date.now()));

  autoLockTimer = setTimeout(()=>{
    triggerAutoLock();
  }, AUTO_LOCK_MINUTES * 60 * 1000);
}

function triggerAutoLock(){
  if(!currentUser || !autoLockEnabled) return;

  autoLockIsLocked = true;

  /* close sensitive modals and clear vault encryption password */
  try{
    document.querySelectorAll(".modal.active").forEach(m=>m.classList.remove("active"));
  }catch(e){}

  try{
    activeVaultEncryptionPassword = "";
  }catch(e){}

  const overlay = $("autoLockOverlay");
  if(overlay) overlay.classList.add("active");
}

window.unlockAutoLock = function(){
  if(!currentUser) return;

  autoLockIsLocked = false;
  const overlay = $("autoLockOverlay");
  if(overlay) overlay.classList.remove("active");

  resetAutoLockTimer();
};

function setupAutoLockListeners(){
  ["mousemove","mousedown","keydown","touchstart","click","scroll"].forEach(evt=>{
    document.addEventListener(evt, function(){
      if(autoLockIsLocked) return;
      resetAutoLockTimer();
    }, {passive:true});
  });

  document.addEventListener("visibilitychange", function(){
    if(document.hidden){
      localStorage.setItem(autoLockLastActivityKey(), String(Date.now()));
    }else{
      const last = Number(localStorage.getItem(autoLockLastActivityKey()) || Date.now());
      const diff = Date.now() - last;
      if(currentUser && autoLockEnabled && diff >= AUTO_LOCK_MINUTES * 60 * 1000){
        triggerAutoLock();
      }else{
        resetAutoLockTimer();
      }
    }
  });
}

const oldLoadProfileForAutoLock = window.loadProfile;
if(typeof oldLoadProfileForAutoLock === "function"){
  window.loadProfile = function(user){
    oldLoadProfileForAutoLock(user);
    autoLockEnabled = getAutoLockEnabled();
    updateAutoLockStatus();
    resetAutoLockTimer();
  };
}

const oldLogoutForAutoLock = window.logout;
if(typeof oldLogoutForAutoLock === "function"){
  window.logout = async function(){
    autoLockIsLocked = false;
    if(autoLockTimer) clearTimeout(autoLockTimer);
    const overlay = $("autoLockOverlay");
    if(overlay) overlay.classList.remove("active");
    await oldLogoutForAutoLock();
  };
}

setupAutoLockListeners();
setTimeout(()=>{
  autoLockEnabled = getAutoLockEnabled();
  updateAutoLockStatus();
  resetAutoLockTimer();
}, 1200);




/* ===== WRONG PASSWORD LOCKOUT SECURITY ===== */
/* 5 wrong vault attempts = 60 seconds lockout.
   Successful unlock resets wrong attempts.
   Works with real and fake password. */

const VAULT_MAX_WRONG_ATTEMPTS = 5;
const VAULT_LOCKOUT_SECONDS = 60;
let vaultLockoutInterval = null;

function vaultWrongAttemptsKey(){
  return "vaultWrongAttempts_" + (currentUser?.uid || "guest");
}

function vaultLockoutUntilKey(){
  return "vaultLockoutUntil_" + (currentUser?.uid || "guest");
}

function getVaultWrongAttempts(){
  return Number(localStorage.getItem(vaultWrongAttemptsKey()) || "0");
}

function setVaultWrongAttempts(value){
  localStorage.setItem(vaultWrongAttemptsKey(), String(value));
}

function getVaultLockoutUntil(){
  return Number(localStorage.getItem(vaultLockoutUntilKey()) || "0");
}

function setVaultLockoutUntil(timestamp){
  localStorage.setItem(vaultLockoutUntilKey(), String(timestamp));
}

function clearVaultLockout(){
  localStorage.removeItem(vaultWrongAttemptsKey());
  localStorage.removeItem(vaultLockoutUntilKey());
  updateVaultLockoutStatus();
}

function isVaultLockedOut(){
  const until = getVaultLockoutUntil();
  return until && Date.now() < until;
}

function getVaultLockoutRemainingSeconds(){
  const until = getVaultLockoutUntil();
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function updateVaultLockoutStatus(){
  const box = $("vaultLockoutStatus");
  if(!box) return;

  box.classList.remove("show","safe","warn");

  if(isVaultLockedOut()){
    const remaining = getVaultLockoutRemainingSeconds();
    box.innerText = "⛔ Too many wrong passwords. Try again in " + remaining + "s";
    box.classList.add("show");
    return;
  }

  const attempts = getVaultWrongAttempts();

  if(attempts > 0){
    box.innerText = "⚠️ Wrong attempts: " + attempts + " / " + VAULT_MAX_WRONG_ATTEMPTS;
    box.classList.add("show","warn");
    return;
  }

  box.innerText = "";
}

function startVaultLockoutCountdown(){
  if(vaultLockoutInterval) clearInterval(vaultLockoutInterval);

  vaultLockoutInterval = setInterval(()=>{
    updateVaultLockoutStatus();

    if(!isVaultLockedOut()){
      if(vaultLockoutInterval) clearInterval(vaultLockoutInterval);
      vaultLockoutInterval = null;
      setVaultWrongAttempts(0);
      updateVaultLockoutStatus();
    }
  }, 1000);
}

function registerVaultWrongAttempt(){
  let attempts = getVaultWrongAttempts() + 1;
  setVaultWrongAttempts(attempts);

  if(attempts >= VAULT_MAX_WRONG_ATTEMPTS){
    setVaultLockoutUntil(Date.now() + VAULT_LOCKOUT_SECONDS * 1000);
    startVaultLockoutCountdown();
    updateVaultLockoutStatus();
    alert("Too many wrong passwords. Vault locked for 1 minute.");
    return;
  }

  updateVaultLockoutStatus();
  alert("Wrong password. Attempts: " + attempts + " / " + VAULT_MAX_WRONG_ATTEMPTS);
}

/* Override vault unlock with lockout guard.
   This uses existing verifyVaultPasswordHashed from password hashing upgrade. */
const oldUnlockVaultBeforeLockout = window.unlockVault;

window.unlockVault = async function(){
  if(!currentUser) return alert("Login first");

  updateVaultLockoutStatus();

  if(isVaultLockedOut()){
    startVaultLockoutCountdown();
    return alert("Vault locked. Try again in " + getVaultLockoutRemainingSeconds() + " seconds.");
  }

  const pass = ($("vaultUnlockPassword")?.value || $("vaultPassword")?.value || "").trim();

  if(!pass){
    return alert("Enter vault password");
  }

  /* If hashed verifier exists, pre-check password without calling original unlock.
     This avoids original alert firing before lockout logic. */
  if(typeof verifyVaultPasswordHashed === "function"){
    const status = await verifyVaultPasswordHashed(pass);

    if(status !== "real" && status !== "fake"){
      registerVaultWrongAttempt();
      return;
    }

    clearVaultLockout();
  }

  if(typeof oldUnlockVaultBeforeLockout === "function"){
    await oldUnlockVaultBeforeLockout();
  }
};

const oldOpenVaultModalForLockout = window.openVaultModal;
if(typeof oldOpenVaultModalForLockout === "function"){
  window.openVaultModal = function(){
    oldOpenVaultModalForLockout();
    setTimeout(()=>{
      updateVaultLockoutStatus();
      if(isVaultLockedOut()) startVaultLockoutCountdown();
    }, 120);
  };
}

setTimeout(()=>{
  updateVaultLockoutStatus();
  if(isVaultLockedOut()) startVaultLockoutCountdown();
}, 1500);




/* ===== SECURE BACKUP PASSWORD UPGRADE ===== */
/* Backup export now encrypts data with AES-GCM using a user backup password.
   Restore requires the same password. */

function backupBytesToBase64(buffer){
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for(let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function backupBase64ToBytes(base64){
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function backupRandomBase64(length){
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return backupBytesToBase64(bytes);
}

async function deriveBackupKey(password, saltBase64){
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name:"PBKDF2",
      salt:backupBase64ToBytes(saltBase64),
      iterations:150000,
      hash:"SHA-256"
    },
    keyMaterial,
    {name:"AES-GCM", length:256},
    false,
    ["encrypt","decrypt"]
  );
}

async function encryptBackupJSON(data, password){
  const salt = backupRandomBase64(16);
  const iv = backupRandomBase64(12);
  const key = await deriveBackupKey(password, salt);

  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt(
    {name:"AES-GCM", iv:backupBase64ToBytes(iv)},
    key,
    plain
  );

  return {
    app:"My Dear Diary",
    type:"encrypted-backup",
    version:2,
    alg:"AES-GCM-256",
    kdf:"PBKDF2-SHA256",
    iterations:150000,
    createdAt:new Date().toISOString(),
    salt,
    iv,
    cipher:backupBytesToBase64(cipher)
  };
}

async function decryptBackupJSON(encryptedBackup, password){
  const key = await deriveBackupKey(password, encryptedBackup.salt);
  const plain = await crypto.subtle.decrypt(
    {name:"AES-GCM", iv:backupBase64ToBytes(encryptedBackup.iv)},
    key,
    backupBase64ToBytes(encryptedBackup.cipher)
  );

  return JSON.parse(new TextDecoder().decode(plain));
}

function getBackupPassword(){
  const p = ($("backupPassword")?.value || "").trim();
  return p;
}

function downloadSecureBackupFile(data){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-dear-diary-secure-backup-" + new Date().toISOString().split("T")[0] + ".encrypted.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Override common backup export function names safely */
async function secureExportDiaryBackupCore(){
  if(!currentUser) return alert("Login first");

  const password = getBackupPassword();
  if(!password || password.length < 4){
    return alert("Enter backup password minimum 4 characters");
  }

  const backupData = {
    app:"My Dear Diary",
    version:1,
    uid:currentUser.uid,
    exportedAt:new Date().toISOString(),
    entries:allEntries || [],
    localStorage:{}
  };

  /* Save only app-related localStorage keys, excluding raw vault password legacy if any */
  Object.keys(localStorage).forEach(k=>{
    const blocked = ["vaultPass_","vaultFakePass_"];
    if(blocked.some(prefix => k.startsWith(prefix))) return;

    if(
      k.includes(currentUser.uid) ||
      k.startsWith("diary") ||
      k.startsWith("myDearDiary") ||
      k.startsWith("vault") ||
      k.startsWith("timeCapsule") ||
      k.startsWith("profile") ||
      k.startsWith("autoLock")
    ){
      backupData.localStorage[k] = localStorage.getItem(k);
    }
  });

  const encrypted = await encryptBackupJSON(backupData, password);
  downloadSecureBackupFile(encrypted);
  alert("Encrypted backup downloaded");
}

const oldExportDiaryBackupForSecurePassword = window.exportDiaryBackup;
window.exportDiaryBackup = async function(){
  return secureExportDiaryBackupCore();
};

const oldDownloadBackupForSecurePassword = window.downloadBackup;
if(typeof oldDownloadBackupForSecurePassword === "function"){
  window.downloadBackup = async function(){
    return secureExportDiaryBackupCore();
  };
}

/* Secure restore helper. Works if current restore uses file input id backupFile or restoreFile. */
async function secureRestoreBackupFromFile(file){
  if(!currentUser) return alert("Login first");
  if(!file) return alert("Choose backup file");

  const password = getBackupPassword();
  if(!password || password.length < 4){
    return alert("Enter backup password");
  }

  const raw = await file.text();
  let parsed;

  try{
    parsed = JSON.parse(raw);
  }catch(error){
    return alert("Invalid backup file");
  }

  let backupData = parsed;

  if(parsed.type === "encrypted-backup"){
    try{
      backupData = await decryptBackupJSON(parsed, password);
    }catch(error){
      return alert("Wrong backup password or corrupted file");
    }
  }else{
    if(!confirm("This looks like old unencrypted backup. Restore anyway?")) return;
  }

  if(backupData.localStorage){
    Object.keys(backupData.localStorage).forEach(k=>{
      localStorage.setItem(k, backupData.localStorage[k]);
    });
  }

  alert("Backup restored. Please refresh the app.");
}

const oldImportDiaryBackupForSecurePassword = window.importDiaryBackup;
if(typeof oldImportDiaryBackupForSecurePassword === "function"){
  window.importDiaryBackup = async function(){
    const file = $("backupFile")?.files?.[0] || $("restoreFile")?.files?.[0] || $("backupRestoreFile")?.files?.[0];
    if(file) return secureRestoreBackupFromFile(file);
    return oldImportDiaryBackupForSecurePassword();
  };
}

const oldRestoreDiaryBackupForSecurePassword = window.restoreDiaryBackup;
if(typeof oldRestoreDiaryBackupForSecurePassword === "function"){
  window.restoreDiaryBackup = async function(){
    const file = $("backupFile")?.files?.[0] || $("restoreFile")?.files?.[0] || $("backupRestoreFile")?.files?.[0];
    if(file) return secureRestoreBackupFromFile(file);
    return oldRestoreDiaryBackupForSecurePassword();
  };
}

function showSecureBackupBadge(){
  const modal = $("backupRestoreModal")?.querySelector(".modal-card");
  if(!modal || $("secureBackupBadge")) return;

  const badge = document.createElement("div");
  badge.id = "secureBackupBadge";
  badge.className = "secure-backup-badge";
  badge.innerText = "🔐 Secure Backup Encryption Active";

  const h2 = modal.querySelector("h2");
  if(h2) h2.insertAdjacentElement("afterend", badge);
}

const oldOpenBackupRestoreModalSecure = window.openBackupRestoreModal;
if(typeof oldOpenBackupRestoreModalSecure === "function"){
  window.openBackupRestoreModal = function(){
    oldOpenBackupRestoreModalSecure();
    setTimeout(showSecureBackupBadge, 80);
  };
}




/* ===== FINAL COLLAPSIBLE SUPER FEATURES MENU ===== */
window.toggleFeatureSection = function(header){
  const section = header.closest(".feature-section");
  if(!section) return;

  section.classList.toggle("open");

  const text = header.innerText.replace(/^▶\s*/,"").replace(/^▼\s*/,"");
  header.innerText = (section.classList.contains("open") ? "▼ " : "▶ ") + text;
};

const oldOpenMoreFeaturesFinalMenu = window.openMoreFeatures;
window.openMoreFeatures = function(){
  if(typeof oldOpenMoreFeaturesFinalMenu === "function"){
    oldOpenMoreFeaturesFinalMenu();
  }else{
    $("moreFeaturesModal")?.classList.add("active");
  }

  document.querySelectorAll("#moreFeaturesModal .feature-section").forEach(sec=>{
    sec.classList.remove("open");
    const h = sec.querySelector("h3");
    if(h){
      const text = h.innerText.replace(/^▶\s*/,"").replace(/^▼\s*/,"");
      h.innerText = "▶ " + text;
    }
  });
};




/* ===== PERFORMANCE PACK FINAL ===== */
/* Smooth diary scrolling: batch rendering, lazy media, debounced search */
let perfVisibleEntryCount = 20;
const PERF_ENTRY_STEP = 20;
let perfSearchTimer = null;

function perfGetFilteredEntries(){
  const search = $("searchInput")?.value.toLowerCase().trim() || "";
  const mood = $("moodFilter")?.value || "";

  return (allEntries || []).filter((entry) => {
    const hay = `${entry.title || ""} ${stripHTML(entry.text || "")} ${(entry.tags || []).join(" ")} ${entry.dateText || ""}`.toLowerCase();
    return (!search || hay.includes(search)) && (!mood || entry.mood === mood);
  });
}

function perfRenderMedia(entry){
  if(!entry || !entry.mediaUrl) return "";

  if((entry.mediaType || "").startsWith("video")){
    return `
      <div class="memory-media-card">
        <video controls preload="metadata" src="${entry.mediaUrl}" class="memory-media"></video>
      </div>
    `;
  }

  return `
    <div class="memory-media-card">
      <img loading="lazy" decoding="async" src="${entry.mediaUrl}" alt="Memory photo" class="memory-media" onclick="openMediaViewer('${entry.mediaUrl}', 'image')">
    </div>
  `;
}

function perfEntryCard(entry){
  return `
    <div class="entry-card performance-entry-card">
      <h3>${entry.pinned ? "📌 " : ""}${escapeHTML(entry.title || "Untitled Diary")} ${entry.favorite ? "⭐" : ""}</h3>
      <small>${escapeHTML(entry.dateText || "")}</small>
      <h4>${escapeHTML(entry.mood || "")}</h4>
      ${renderEntryPages(entry)}${perfRenderMedia(entry)}
      <div class="tags">${(entry.tags || []).map((tag) => `<span class="tag">#${escapeHTML(tag)}</span>`).join("")}</div>
      <div class="entry-actions">
        <button onclick="togglePin('${entry.id}', ${!entry.pinned})">${entry.pinned ? "Unpin" : "Pin"}</button>
        <button onclick="toggleFavorite('${entry.id}', ${!entry.favorite})">${entry.favorite ? "Unfavorite" : "Favorite"}</button>
        <button onclick="openEditEntryModal('${entry.id}')">Edit</button>
        <button class="delete-btn" onclick="deleteEntry('${entry.id}')">Delete</button>
      </div>
    </div>
  `;
}

window.renderEntries = function(resetLimit = true){
  if(resetLimit) perfVisibleEntryCount = 20;

  const list = perfGetFilteredEntries();

  if(!list.length){
    $("entriesList").innerHTML = `<div class="empty">No diary entries found.</div>`;
    return;
  }

  const visible = list.slice(0, perfVisibleEntryCount);

  $("entriesList").innerHTML = `
    ${visible.map(perfEntryCard).join("")}
    ${list.length > perfVisibleEntryCount ? `
      <div class="load-more-card">
        <button onclick="loadMoreDiaryEntries()">Load More Memories</button>
        <p>${perfVisibleEntryCount} / ${list.length} shown</p>
      </div>
    ` : ""}
  `;
};

window.loadMoreDiaryEntries = function(){
  perfVisibleEntryCount += PERF_ENTRY_STEP;
  renderEntries(false);
};

function setupPerformanceSearch(){
  const search = $("searchInput");
  if(search && !search.dataset.perfReady){
    search.dataset.perfReady = "yes";
    search.removeAttribute("oninput");
    search.addEventListener("input", ()=>{
      clearTimeout(perfSearchTimer);
      perfSearchTimer = setTimeout(()=>renderEntries(true), 220);
    });
  }
}

const oldLoadEntriesPerfFinal = window.loadEntries;
if(typeof oldLoadEntriesPerfFinal === "function"){
  window.loadEntries = async function(){
    await oldLoadEntriesPerfFinal();
    setupPerformanceSearch();
  };
}

setTimeout(setupPerformanceSearch, 800);




/* ===== PLAY STORE FIX: HIDE MAIN FINGERPRINT FEATURE ===== */
/* Main Super Features fingerprint popup is disabled for release.
   Vault fingerprint remains active inside Secret Vault. */
window.openFingerprintUnlock = function(){
  alert("Fingerprint unlock is available inside Secret Vault.");
};

window.openFingerprintModal = function(){
  alert("Fingerprint unlock is available inside Secret Vault.");
};
