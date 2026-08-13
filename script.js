// IndexedDB configuration for victory song storage
const dbName = "ScoreboardDB";
const storeName = "AudioStore";
const DEFAULT_VICTORY_SRC = "assets/VICTORY.mp3";
const HISTORY_LS_KEY = "scoreboard_history";
const SETTINGS_LS_KEY = "scoreboard_settings";
const HISTORY_ASSET_PATH = "assets/history.json";

const DEFAULT_SETTINGS = {
    resetScoreOnWin: false,
    resetWinsOnReset: false
};

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };
        request.onsuccess = function(e) {
            resolve(e.target.result);
        };
        request.onerror = function(e) {
            reject(e.target.error);
        };
    });
}

async function saveAudioBlob(blob, team) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(blob, `victory_sound_${team}`);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function loadAudioBlob(team) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(`victory_sound_${team}`);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteAudioBlob(team) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(`victory_sound_${team}`);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function revokeObjectUrlIfNeeded(url) {
    if (url && typeof url === "string" && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
    }
}

function parseStoredInt(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
}

// Preloaded song state
let objectUrls = {
    A: null,
    B: null
};
let songTitles = {
    A: "VICTORY",
    B: "VICTORY"
};

let settings = { ...DEFAULT_SETTINGS };
let historyEntries = [];

// Global handles for fade-out timers
let fadeInterval = null;
let stopTimeout = null;

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_LS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            settings = { ...DEFAULT_SETTINGS, ...parsed };
        }
    } catch (err) {
        console.warn("Failed to parse settings:", err);
        settings = { ...DEFAULT_SETTINGS };
    }
    const resetScoreOnWinEl = document.getElementById("optResetScoreOnWin");
    if (resetScoreOnWinEl) resetScoreOnWinEl.checked = !!settings.resetScoreOnWin;
    const resetWinsOnResetEl = document.getElementById("optResetWinsOnReset");
    if (resetWinsOnResetEl) resetWinsOnResetEl.checked = !!settings.resetWinsOnReset;
}

function saveSettingsFromUi() {
    const resetScoreOnWinEl = document.getElementById("optResetScoreOnWin");
    const resetWinsOnResetEl = document.getElementById("optResetWinsOnReset");
    settings.resetScoreOnWin = !!(resetScoreOnWinEl && resetScoreOnWinEl.checked);
    settings.resetWinsOnReset = !!(resetWinsOnResetEl && resetWinsOnResetEl.checked);
    localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(settings));
    showToast("설정이 저장되었습니다.");
}

function loadHistoryFromStorage() {
    try {
        const raw = localStorage.getItem(HISTORY_LS_KEY);
        if (raw === null) {
            historyEntries = null;
            return;
        }
        historyEntries = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(historyEntries)) historyEntries = [];
    } catch (err) {
        console.warn("Failed to parse history:", err);
        historyEntries = [];
    }
}

function persistHistory() {
    if (!Array.isArray(historyEntries)) historyEntries = [];
    localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(historyEntries));
    renderHistoryList();
}

async function tryLoadHistoryFromAssets() {
    // Only seed from assets on first visit (no localStorage key yet).
    // After Clear, key exists as [] — do not revive old assets/history.json.
    if (localStorage.getItem(HISTORY_LS_KEY) !== null) {
        if (!Array.isArray(historyEntries)) historyEntries = [];
        return;
    }
    historyEntries = [];
    try {
        const res = await fetch(HISTORY_ASSET_PATH, { cache: "no-store" });
        if (!res.ok) {
            persistHistory();
            return;
        }
        const data = await res.json();
        if (Array.isArray(data)) {
            historyEntries = data;
        } else if (data && Array.isArray(data.entries)) {
            historyEntries = data.entries;
        }
        persistHistory();
    } catch (err) {
        persistHistory();
        // file:// or missing assets/history.json — ignore
    }
}

function formatHistoryTime(iso) {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (err) {
        return iso;
    }
}

function updateHistorySeriesBanner() {
    const aEl = document.getElementById("historySetA");
    const bEl = document.getElementById("historySetB");
    const winsA = parseStoredInt(document.getElementById("winsA")?.innerText);
    const winsB = parseStoredInt(document.getElementById("winsB")?.innerText);
    if (aEl) aEl.innerText = String(winsA);
    if (bEl) bEl.innerText = String(winsB);
}

function renderHistoryList() {
    const list = document.getElementById("historyList");
    const countEl = document.getElementById("historyCount");
    const badge = document.getElementById("historyFabBadge");
    const entries = Array.isArray(historyEntries) ? historyEntries : [];
    const count = entries.length;

    updateHistorySeriesBanner();

    if (countEl) countEl.innerText = String(count);
    if (badge) {
        if (count > 0) {
            badge.hidden = false;
            badge.innerText = count > 99 ? "99+" : String(count);
        } else {
            badge.hidden = true;
        }
    }

    if (!list) return;

    if (!count) {
        list.innerHTML = '<div class="history-empty">아직 기록이 없습니다. WINS +1 하면 여기에 쌓입니다.</div>';
        return;
    }

    const rows = [...entries].reverse().map((entry) => {
        const winner = entry.team === "B" ? "B" : "A";
        const nameA = entry.nameA || (winner === "A" ? entry.name : null) || "Team A";
        const nameB = entry.nameB || (winner === "B" ? entry.name : null) || "Team B";
        const scoreA = entry.scoreA ?? 0;
        const scoreB = entry.scoreB ?? 0;
        const aWon = winner === "A";
        const bWon = winner === "B";

        return `
            <article class="history-match ${aWon ? "winner-a" : "winner-b"}">
                <div class="hm-row">
                    <div class="hm-player left ${aWon ? "is-win" : "is-loss"}">
                        <span class="hm-result">${aWon ? "승" : "패"}</span>
                        <span class="song-team team-a-tag">A</span>
                        <span class="hm-name">${escapeHtml(nameA)}</span>
                    </div>
                    <div class="hm-score" title="게임 스코어">
                        <span>${escapeHtml(String(scoreA))}</span><i>:</i><span>${escapeHtml(String(scoreB))}</span>
                    </div>
                    <div class="hm-player right ${bWon ? "is-win" : "is-loss"}">
                        <span class="hm-name">${escapeHtml(nameB)}</span>
                        <span class="song-team team-b-tag">B</span>
                        <span class="hm-result">${bWon ? "승" : "패"}</span>
                    </div>
                </div>
                <time class="hm-time">${escapeHtml(formatHistoryTime(entry.at))}</time>
            </article>
        `;
    }).join("");
    list.innerHTML = rows;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function appendWinHistory(team) {
    const nameA = document.getElementById("nameA").innerText.trim();
    const nameB = document.getElementById("nameB").innerText.trim();
    const winsA = parseStoredInt(document.getElementById("winsA").innerText);
    const winsB = parseStoredInt(document.getElementById("winsB").innerText);
    const entry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        at: new Date().toISOString(),
        team,
        name: team === "B" ? nameB : nameA,
        nameA,
        nameB,
        winsAfter: team === "B" ? winsB : winsA,
        winsA,
        winsB,
        scoreA: parseStoredInt(document.getElementById("scoreA").innerText),
        scoreB: parseStoredInt(document.getElementById("scoreB").innerText)
    };
    if (!Array.isArray(historyEntries)) historyEntries = [];
    historyEntries.push(entry);
    persistHistory();
}

function exportHistoryJson() {
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: historyEntries
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "history.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("history.json 저장됨 — assets/ 폴더에 넣어 두면 됩니다.");
}

function triggerHistoryImport() {
    document.getElementById("historyImportPicker").click();
}

async function handleHistoryImport(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);
        let entries = [];
        if (Array.isArray(data)) entries = data;
        else if (data && Array.isArray(data.entries)) entries = data.entries;
        else throw new Error("Invalid history JSON");

        historyEntries = entries;
        persistHistory();
        showToast(`히스토리 ${entries.length}건을 불러왔습니다.`);
    } catch (err) {
        console.error(err);
        showToast("히스토리 JSON을 읽지 못했습니다.");
    }
}

function clearHistory() {
    if (!Array.isArray(historyEntries) || !historyEntries.length) {
        showToast("지울 히스토리가 없습니다.");
        return;
    }
    openConfirm({
        title: "CLEAR HISTORY",
        message: "승리 히스토리를 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.",
        okText: "삭제",
        cancelText: "취소",
        icon: "🗑️"
    }).then((ok) => {
        if (!ok) return;
        historyEntries = [];
        persistHistory();
        showToast("히스토리를 비웠습니다.");
    });
}

let confirmResolver = null;

function openConfirm({ title, message, okText = "확인", cancelText = "취소", icon = "⚠️" } = {}) {
    const overlay = document.getElementById("confirmOverlay");
    const titleEl = document.getElementById("confirmTitle");
    const msgEl = document.getElementById("confirmMessage");
    const okBtn = document.getElementById("confirmOkBtn");
    const cancelBtn = document.getElementById("confirmCancelBtn");
    const iconEl = overlay ? overlay.querySelector(".confirm-icon") : null;

    if (titleEl) titleEl.innerText = title || "CONFIRM";
    if (msgEl) msgEl.innerText = message || "";
    if (okBtn) okBtn.innerText = okText;
    if (cancelBtn) cancelBtn.innerText = cancelText;
    if (iconEl) iconEl.innerText = icon;

    return new Promise((resolve) => {
        confirmResolver = resolve;
        if (overlay) overlay.classList.add("open");
        if (okBtn) okBtn.focus();
    });
}

function resolveConfirm(result) {
    const overlay = document.getElementById("confirmOverlay");
    if (overlay) overlay.classList.remove("open");
    const resolve = confirmResolver;
    confirmResolver = null;
    if (typeof resolve === "function") resolve(!!result);
}

function onConfirmOverlayClick(event) {
    if (event.target === event.currentTarget) resolveConfirm(false);
}

function updateSongTitleLabels() {
    const a = document.getElementById("songTitleA");
    const b = document.getElementById("songTitleB");
    if (a) a.innerText = songTitles.A || "VICTORY";
    if (b) b.innerText = songTitles.B || "VICTORY";
}

async function loadVictorySongSources() {
    const defaultTitle = "VICTORY";

    for (let team of ['A', 'B']) {
        const storedTitle = localStorage.getItem(`scoreboard_song_title_${team}`);
        songTitles[team] = storedTitle ? storedTitle.replace(/\.[^/.]+$/, "") : defaultTitle;

        try {
            const blob = storedTitle ? await loadAudioBlob(team) : null;
            const previous = objectUrls[team];
            if (blob) {
                objectUrls[team] = URL.createObjectURL(blob);
            } else {
                objectUrls[team] = DEFAULT_VICTORY_SRC;
            }
            if (previous && previous !== objectUrls[team]) {
                revokeObjectUrlIfNeeded(previous);
            }
        } catch (err) {
            console.error(`Failed to load song for Team ${team}:`, err);
            const previous = objectUrls[team];
            objectUrls[team] = DEFAULT_VICTORY_SRC;
            revokeObjectUrlIfNeeded(previous);
        }
    }
    updateSongTitleLabels();
}

let activeTeamUpload = null;

function triggerFilePicker(team) {
    activeTeamUpload = team;
    document.getElementById("audioFilePicker").click();
}

async function handleAudioUpload(event) {
    const file = event.target.files[0];
    const team = activeTeamUpload;
    activeTeamUpload = null;

    if (!file || !team) {
        event.target.value = "";
        return;
    }

    try {
        await saveAudioBlob(file, team);
        localStorage.setItem(`scoreboard_song_title_${team}`, file.name);
        await loadVictorySongSources();
        const playerName = document.getElementById(`name${team}`).innerText;
        showToast(`'${playerName}'의 승리 음악이 변경되었습니다.`);
    } catch (err) {
        console.error("Failed to save victory audio file:", err);
        showToast("오디오 파일 저장에 실패했습니다.");
    }

    event.target.value = "";
}

async function resetVictorySong(team) {
    try {
        localStorage.removeItem(`scoreboard_song_title_${team}`);
        await deleteAudioBlob(team);
        await loadVictorySongSources();
        showToast(`Team ${team} 승리곡을 기본(VICTORY)으로 되돌렸습니다.`);
    } catch (err) {
        console.error(err);
        showToast("기본 곡 복원에 실패했습니다.");
    }
}

function openSettings() {
    closeHistory();
    const overlay = document.getElementById("settingsOverlay");
    if (!overlay) return;
    loadSettings();
    updateSongTitleLabels();
    overlay.classList.add("open");
}

function closeSettings() {
    const overlay = document.getElementById("settingsOverlay");
    if (overlay) overlay.classList.remove("open");
}

function onSettingsOverlayClick(event) {
    if (event.target === event.currentTarget) closeSettings();
}

function openHistory() {
    closeSettings();
    const overlay = document.getElementById("historyOverlay");
    if (!overlay) return;
    renderHistoryList();
    overlay.classList.add("open");
}

function closeHistory() {
    const overlay = document.getElementById("historyOverlay");
    if (overlay) overlay.classList.remove("open");
}

function onHistoryOverlayClick(event) {
    if (event.target === event.currentTarget) closeHistory();
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        const confirmOpen = document.getElementById("confirmOverlay")?.classList.contains("open");
        if (confirmOpen) {
            resolveConfirm(false);
            return;
        }
        closeHistory();
        closeSettings();
    }
});

// Check local storage for persistent scores/names
window.onload = async function() {
    const nameA = localStorage.getItem('scoreboard_nameA') || '이름 입력해주세요...';
    const nameB = localStorage.getItem('scoreboard_nameB') || '이름 입력해주세요...';
    document.getElementById('nameA').innerText = nameA;
    document.getElementById('nameB').innerText = nameB;

    document.getElementById('winsA').innerText = parseStoredInt(localStorage.getItem('scoreboard_winsA'));
    document.getElementById('winsB').innerText = parseStoredInt(localStorage.getItem('scoreboard_winsB'));
    document.getElementById('scoreA').innerText = parseStoredInt(localStorage.getItem('scoreboard_scoreA'));
    document.getElementById('scoreB').innerText = parseStoredInt(localStorage.getItem('scoreboard_scoreB'));

    loadSettings();
    loadHistoryFromStorage();
    await tryLoadHistoryFromAssets();
    renderHistoryList();
    await loadVictorySongSources();
};

// Score Actions
function increaseScore(team) {
    const scoreElement = document.getElementById(`score${team}`);
    let score = parseStoredInt(scoreElement.innerText);
    score++;
    scoreElement.innerText = score;
    localStorage.setItem(`scoreboard_score${team}`, score);
    triggerPulse(scoreElement);
}

function triggerPulse(element) {
    element.classList.remove('pop');
    void element.offsetWidth;
    element.classList.add('pop');
}

function decreaseScore(team) {
    const scoreElement = document.getElementById(`score${team}`);
    let score = parseStoredInt(scoreElement.innerText);
    if (score > 0) {
        score--;
        scoreElement.innerText = score;
        localStorage.setItem(`scoreboard_score${team}`, score);
        triggerPulse(scoreElement);
    }
}

// Wins Actions
function increaseWins(team) {
    const winsElement = document.getElementById(`wins${team}`);
    const winsBadge = document.getElementById(`wins${team}Container`);
    let wins = parseStoredInt(winsElement.innerText);
    wins++;
    winsElement.innerText = wins;
    localStorage.setItem(`scoreboard_wins${team}`, wins);
    if (winsBadge) triggerPulse(winsBadge);

    appendWinHistory(team);

    if (settings.resetScoreOnWin) {
        document.getElementById("scoreA").innerText = 0;
        document.getElementById("scoreB").innerText = 0;
        localStorage.setItem('scoreboard_scoreA', '0');
        localStorage.setItem('scoreboard_scoreB', '0');
    }

    playVictoryMusic(team);
}

function playVictoryMusic(team) {
    const audio = document.getElementById("trophySound");
    const musicWidget = document.getElementById("musicWidget");

    if (fadeInterval) clearInterval(fadeInterval);
    if (stopTimeout) clearTimeout(stopTimeout);

    audio.volume = 1.0;
    audio.src = objectUrls[team] || DEFAULT_VICTORY_SRC;
    audio.currentTime = 0;

    const titleElements = document.getElementsByClassName("music-title");
    if (titleElements.length > 0) {
        titleElements[0].innerText = songTitles[team];
    }

    audio.onerror = function() {
        console.log("Victory audio failed to load or is missing. Silencing.");
        stopMusic();
    };

    audio.play().then(() => {
        musicWidget.style.display = "flex";

        const playDuration = 30000;
        const fadeDuration = 3000;
        const fadeStepTime = 100;

        stopTimeout = setTimeout(() => {
            let steps = fadeDuration / fadeStepTime;
            let volumeStep = 1.0 / steps;

            fadeInterval = setInterval(() => {
                if (audio.volume > volumeStep) {
                    audio.volume -= volumeStep;
                } else {
                    audio.volume = 0;
                    clearInterval(fadeInterval);
                    fadeInterval = null;
                    stopMusic();
                }
            }, fadeStepTime);
        }, playDuration - fadeDuration);

        audio.onended = function() {
            stopMusic();
        };
    }).catch(err => {
        console.log("Audio play blocked or file not found:", err);
        stopMusic();
    });
}

function decreaseWins(team) {
    const winsElement = document.getElementById(`wins${team}`);
    const winsBadge = document.getElementById(`wins${team}Container`);
    let wins = parseStoredInt(winsElement.innerText);
    if (wins > 0) {
        wins--;
        winsElement.innerText = wins;
        localStorage.setItem(`scoreboard_wins${team}`, wins);
        if (winsBadge) triggerPulse(winsBadge);
    }
}

function resetScores() {
    stopMusic();
    document.getElementById("scoreA").innerText = 0;
    document.getElementById("scoreB").innerText = 0;
    localStorage.setItem('scoreboard_scoreA', '0');
    localStorage.setItem('scoreboard_scoreB', '0');
    triggerPulse(document.getElementById("scoreA"));
    triggerPulse(document.getElementById("scoreB"));

    if (settings.resetWinsOnReset) {
        document.getElementById("winsA").innerText = 0;
        document.getElementById("winsB").innerText = 0;
        localStorage.setItem('scoreboard_winsA', '0');
        localStorage.setItem('scoreboard_winsB', '0');
        const badgeA = document.getElementById("winsAContainer");
        const badgeB = document.getElementById("winsBContainer");
        if (badgeA) triggerPulse(badgeA);
        if (badgeB) triggerPulse(badgeB);
    }
}

function stopMusic() {
    const audio = document.getElementById("trophySound");
    const musicWidget = document.getElementById("musicWidget");

    if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
    }
    if (stopTimeout) {
        clearTimeout(stopTimeout);
        stopTimeout = null;
    }

    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1.0;
    musicWidget.style.display = "none";
}

function saveName(team) {
    const nameElement = document.getElementById(`name${team}`);
    let name = nameElement.innerText.trim();
    if (name === "" || name === "이름 입력해주세요...") {
        name = '이름 입력해주세요...';
        nameElement.innerText = name;
    }
    localStorage.setItem(`scoreboard_name${team}`, name);
}

function handleNameKey(event, team) {
    if (event.key === 'Enter') {
        event.preventDefault();
        event.target.blur();
    }
}

let toastTimeout = null;
function showToast(message) {
    const toast = document.getElementById("toastNotification");
    const toastMsg = document.getElementById("toastMessage");

    toastMsg.innerText = message;

    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toast.classList.remove("show");
        void toast.offsetWidth;
    }

    toast.classList.add("show");

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
        toastTimeout = null;
    }, 3500);
}
