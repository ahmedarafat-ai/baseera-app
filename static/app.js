let allSurahs = [];
let currentSurahData = null;
let currentSurahNumber = 1;
let currentUser = null;
let authMode = 'login';

let score = parseInt(localStorage.getItem('baseera_score')) || 0;
let bookmarks = JSON.parse(localStorage.getItem('baseera_bookmarks')) || [];
let lastRead = JSON.parse(localStorage.getItem('baseera_last_read')) || {
    surah_num: 1,
    surah_name: 'سورة الفاتحة',
    ayah_num: 1
};

// ١. فحص حالة تسجيل الدخول عند فتح الموقع
async function checkAuthSession() {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.user) {
        applyUserData(data.user);
    } else {
        updateUIProgress();
    }
}

function applyUserData(user) {
    currentUser = user;
    score = user.score;
    bookmarks = user.bookmarks || [];
    lastRead = {
        surah_num: user.last_surah_num || 1,
        surah_name: user.last_surah_name || 'سورة الفاتحة',
        ayah_num: user.last_ayah_num || 1
    };

    document.getElementById('auth-btn').innerText = `👤 ${user.full_name}`;
    document.getElementById('welcome-user-text').innerText = `👋 أهلاً بك يا ${user.full_name}!`;
    updateUIProgress();
}

function updateUIProgress() {
    document.getElementById('user-score').innerText = score;
    document.getElementById('last-read-label').innerText = `${lastRead.surah_name} - الآية ${lastRead.ayah_num}`;
}

async function syncProgressToServer() {
    localStorage.setItem('baseera_score', score);
    localStorage.setItem('baseera_bookmarks', JSON.stringify(bookmarks));
    localStorage.setItem('baseera_last_read', JSON.stringify(lastRead));
    updateUIProgress();

    if (currentUser) {
        await fetch('/api/user/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                score: score,
                last_surah_num: lastRead.surah_num,
                last_surah_name: lastRead.surah_name,
                last_ayah_num: lastRead.ayah_num,
                bookmarks: bookmarks
            })
        });
    }
}

// ٢. نافذة تسجيل الدخول وإنشاء الحساب
function openAuthModal() {
    document.getElementById('auth-modal').style.display = 'flex';
    if (currentUser) {
        document.getElementById('logged-out-view').style.display = 'none';
        document.getElementById('logged-in-view').style.display = 'block';
        document.getElementById('profile-name').innerText = `مرحباً، ${currentUser.full_name} (@${currentUser.username})`;
    } else {
        document.getElementById('logged-out-view').style.display = 'block';
        document.getElementById('logged-in-view').style.display = 'none';
    }
}

function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

function toggleAuthMode(mode) {
    authMode = mode;
    document.getElementById('tab-login-btn').classList.toggle('active', mode === 'login');
    document.getElementById('tab-reg-btn').classList.toggle('active', mode === 'register');
    document.getElementById('full-name-group').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('auth-error').innerText = '';
}

async function submitAuth() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const full_name = document.getElementById('auth-fullname').value.trim();
    const errBox = document.getElementById('auth-error');

    const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, full_name })
    });
    const data = await res.json();

    if (!res.ok) {
        errBox.innerText = data.error || 'حدث خطأ، حاول مرة أخرى';
        return;
    }

    applyUserData(data.user);
    closeAuthModal();
    loadSurahDetails(lastRead.surah_num, lastRead.ayah_num);
}

async function logoutUser() {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    document.getElementById('auth-btn').innerText = '👤 دخول / حساب جديد';
    document.getElementById('welcome-user-text').innerText = '👋 أهلاً بك في منصة بصيرة!';
    closeAuthModal();
}

// ٣. استكمال القراءة وحفظ مكان التوقف
function markLastRead(surahNum, surahName, ayahNum) {
    lastRead = { surah_num: surahNum, surah_name: surahName, ayah_num: ayahNum };
    syncProgressToServer();
    renderAyahs(currentSurahData.ayahs);
}

async function resumeLastReading() {
    switchTab('quran-tab');
    await loadSurahDetails(lastRead.surah_num, lastRead.ayah_num);
}

// ٤. التنقل بين التبويبات وتحميل السور
function switchTab(tabId, btnElement) {
    document.querySelectorAll('.tab-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if (btnElement) {
        document.querySelectorAll('.tab-btn, .mob-nav-btn').forEach(btn => btn.classList.remove('active'));
        btnElement.classList.add('active');
    }
    if (tabId === 'bookmarks-tab') renderBookmarks();
}

async function fetchSurahs() {
    await checkAuthSession();
    const res = await fetch('/api/surahs');
    allSurahs = await res.json();
    renderSurahList(allSurahs);
    populateQuizSelect(allSurahs);
    loadSurahDetails(lastRead.surah_num, lastRead.ayah_num);
}

function renderSurahList(surahs) {
    const list = document.getElementById('surah-list');
    list.innerHTML = surahs.map(s => `
        <div class="surah-item ${s.number === currentSurahNumber ? 'active' : ''}" onclick="loadSurahDetails(${s.number}, 1)">
            <div>
                <span class="surah-num">${s.number}</span>
                <strong>${s.name}</strong>
            </div>
            <small>${s.numberOfAyahs} آية</small>
        </div>
    `).join('');
}

function populateQuizSelect(surahs) {
    const select = document.getElementById('quiz-surah-select');
    select.innerHTML = surahs.map(s => `<option value="${s.number}">${s.number}. ${s.name}</option>`).join('');
}

document.getElementById('surah-search').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    const filtered = allSurahs.filter(s => s.name.includes(q) || s.englishName.toLowerCase().includes(q.toLowerCase()));
    renderSurahList(filtered);
});

async function loadSurahDetails(surahNumber, targetAyah = 1) {
    currentSurahNumber = surahNumber;
    renderSurahList(allSurahs);

    const container = document.getElementById('ayahs-container');
    container.innerHTML = '<div class="loader">⏳ جاري جلب الآيات والتفسير الميسر...</div>';

    const res = await fetch(`/api/surah/${surahNumber}`);
    currentSurahData = await res.json();

    document.getElementById('current-surah-name').innerText = currentSurahData.name;
    document.getElementById('current-surah-meta').innerText = `${currentSurahData.revelationType} • عدد آياتها ${currentSurahData.numberOfAyahs}`;
    document.getElementById('quiz-surah-select').value = surahNumber;

    // تحديث آخر سورة فتحها المستخدم تلقائياً
    lastRead.surah_num = currentSurahData.number;
    lastRead.surah_name = currentSurahData.name;
    if (targetAyah === 1) lastRead.ayah_num = 1;
    syncProgressToServer();

    renderAyahs(currentSurahData.ayahs);

    if (targetAyah > 1) {
        setTimeout(() => {
            const el = document.getElementById(`ayah-box-${targetAyah}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    }
}

function renderAyahs(ayahs) {
    const container = document.getElementById('ayahs-container');
    container.innerHTML = ayahs.map(a => {
        const isLastStop = (lastRead.surah_num === currentSurahData.number && lastRead.ayah_num === a.number);
        return `
        <div id="ayah-box-${a.number}" class="ayah-card ${isLastStop ? 'saved-stop' : ''}">
            <div class="ayah-top-bar">
                <span class="ayah-badge">الآية ${a.number} ${isLastStop ? '📍 (توقفت هنا)' : ''}</span>
                <div class="ayah-actions">
                    <button onclick="markLastRead(${currentSurahData.number}, '${currentSurahData.name}', ${a.number})">📍 وقفت هنا</button>
                    <button onclick="playAyahAudio('${a.audio}', '${currentSurahData.name} - آية ${a.number}')">🔊 استماع</button>
                    <button onclick="toggleBookmark(${currentSurahData.number}, '${currentSurahData.name}', ${a.number})">🔖 حفظ</button>
                </div>
            </div>
            <p class="quran-text">﴿ ${a.text} ﴾</p>
            <div class="tafseer-box">
                <strong>📚 التفسير الميسر:</strong> ${a.tafseer}
            </div>
        </div>
    `}).join('');
}

document.getElementById('ayah-filter').addEventListener('input', (e) => {
    if (!currentSurahData) return;
    const q = e.target.value.trim();
    const filtered = currentSurahData.ayahs.filter(a => a.text.includes(q) || a.tafseer.includes(q));
    renderAyahs(filtered);
});

// ٥. الصوتيات والمحفوظات
function playAyahAudio(audioUrl, title) {
    const bar = document.getElementById('audio-player-bar');
    const player = document.getElementById('quran-audio');
    document.getElementById('audio-title').innerText = title;
    player.src = audioUrl;
    bar.style.display = 'flex';
    player.play();
}

function closeAudio() {
    document.getElementById('quran-audio').pause();
    document.getElementById('audio-player-bar').style.display = 'none';
}

function toggleBookmark(surahNum, surahName, ayahNum) {
    const ayahObj = currentSurahData.ayahs.find(a => a.number === ayahNum);
    const id = `${surahNum}:${ayahNum}`;
    const exists = bookmarks.find(b => b.id === id);

    if (exists) {
        bookmarks = bookmarks.filter(b => b.id !== id);
        alert('تمت إزالة الآية من المحفوظات');
    } else {
        bookmarks.push({ id, surahName, ayahNum, text: ayahObj.text, tafseer: ayahObj.tafseer });
        alert('✅ تم حفظ الآية في حسابك!');
    }
    syncProgressToServer();
}

function renderBookmarks() {
    const container = document.getElementById('bookmarks-container');
    if (bookmarks.length === 0) {
        container.innerHTML = '<p>لا توجد آيات محفوظة حتى الآن.</p>';
        return;
    }
    container.innerHTML = bookmarks.map(b => `
        <div class="ayah-card">
            <div class="ayah-top-bar">
                <span class="ayah-badge">${b.surahName} - آية ${b.ayahNum}</span>
                <button onclick="removeBookmark('${b.id}')" style="background:#fee2e2;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;">🗑 حذف</button>
            </div>
            <p class="quran-text">﴿ ${b.text} ﴾</p>
            <div class="tafseer-box"><strong>التفسير:</strong> ${b.tafseer}</div>
        </div>
    `).join('');
}

function removeBookmark(id) {
    bookmarks = bookmarks.filter(b => b.id !== id);
    syncProgressToServer();
    renderBookmarks();
}

// ٦. الاختبارات والمساعد الذكي
function startQuizFromCurrentSurah() {
    document.getElementById('quiz-surah-select').value = currentSurahNumber;
    switchTab('quiz-tab');
    loadDynamicQuiz();
}

async function loadDynamicQuiz() {
    const surahNum = document.getElementById('quiz-surah-select').value || 1;
    const container = document.getElementById('quiz-questions-container');
    container.innerHTML = '<div class="loader">⏳ جاري توليد أسئلة ذكية من تفسير السورة...</div>';

    const res = await fetch(`/api/quiz/${surahNum}`);
    const data = await res.json();

    if (data.error) {
        container.innerHTML = `<p>${data.error}</p>`;
        return;
    }

    container.innerHTML = data.questions.map((q, qIdx) => `
        <div class="quiz-card">
            <h4>سؤال ${qIdx + 1}: ${q.question}</h4>
            <div>
                ${q.options.map((opt, oIdx) => `
                    <button class="quiz-option" onclick="checkQuizOption(this, ${oIdx}, ${q.correct_index})">
                        ﴿ ${opt} ﴾
                    </button>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function checkQuizOption(btn, selectedIdx, correctIdx) {
    const parent = btn.parentElement;
    const allBtns = parent.querySelectorAll('.quiz-option');
    allBtns.forEach(b => b.disabled = true);

    if (selectedIdx === correctIdx) {
        btn.classList.add('correct');
        btn.innerHTML += ' ✅ (+10 نقاط)';
        score += 10;
        syncProgressToServer();
    } else {
        btn.classList.add('wrong');
        btn.innerHTML += ' ❌';
        allBtns[correctIdx].classList.add('correct');
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    appendChatMsg(text, 'user-msg');
    input.value = '';

    const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, surah_number: currentSurahNumber })
    });
    const data = await res.json();
    appendChatMsg(data.reply, 'bot-msg');
}

function sendQuickPrompt(promptText) {
    document.getElementById('chat-input').value = promptText;
    sendMessage();
}

function appendChatMsg(text, className) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${className}`;
    div.innerText = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// ٧. بوابة تحميل وتثبيت التطبيق (PWA Install)
let deferredPrompt = null;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

function openInstallModal() {
    document.getElementById('install-modal').style.display = 'flex';
}

function closeInstallModal() {
    document.getElementById('install-modal').style.display = 'none';
}

document.getElementById('direct-install-btn').addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        closeInstallModal();
    } else {
        alert('التطبيق مثبت بالفعل على جهازك، أو يمكنك تثبيته من أيقونة الشاشة 📥 في أعلى شريط عنوان المتصفح!');
    }
});

fetchSurahs();