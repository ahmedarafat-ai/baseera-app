from flask import Flask, render_template, jsonify, request, send_from_directory, session
import requests
import random
import sqlite3
import os
import json
from werkzeug.security import generate_password_hash, check_password_hash
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)
app.secret_key = 'baseera_ahmed_arafat_secret_key_2026'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'baseera_users.db')

# إنشاء قاعدة البيانات لحسابات المستخدمين وحفظ تقدمهم
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            last_surah_num INTEGER DEFAULT 1,
            last_surah_name TEXT DEFAULT 'سورة الفاتحة',
            last_ayah_num INTEGER DEFAULT 1,
            bookmarks TEXT DEFAULT '[]'
        )
    ''')
    conn.commit()
    conn.close()

init_db()

SURAHS_CACHE = []
SURAH_DETAILS_CACHE = {}

ISLAMIC_KNOWLEDGE_BASE = [
    {
        "keywords": "ضيق حزن هم غم كرب اكتئاب خوف قلق مستقبل",
        "title": "علاج الضيق والقلق في القرآن",
        "ayah": "﴿ الَّذِينَ آمَنُوا وَتَطْمَئِنُّ قُلُوبُهُم بِذِكْرِ اللَّهِ ۗ أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ ﴾ [الرعد: 28]",
        "advice": "القلق يزول باليقين بأن الله يدبر الأمر. ردد دعاء يونس عليه السلام: (لَا إِلَٰهَ إِلَّا أَنتَ سُبْحَانَكَ إِنِّي كُنتُ مِنَ الظَّالِمِينَ)، واستعن بالصلاة والذكر."
    },
    {
        "keywords": "رزق فقر مال شغل عمل وظيفة ديون غنى بركة",
        "title": "مفاتيح الرزق والبركة",
        "ayah": "﴿ وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا * وَيَرْزُقْهُ مِنْ حَيْثُ لَا يَحْتَسِبُ ﴾ [الطلاق: 2-3]",
        "advice": "أعظم أسباب جلب الرزق في القرآن: تقوى الله، كثرة الاستغفار (سورة نوح: 10-12)، التوكل على الله مع السعي، وصلة الرحم."
    },
    {
        "keywords": "ذنب معصية توبة مغفرة تقصير رجوع ندم",
        "title": "سعة رحمة الله وقبول التوبة",
        "ayah": "﴿ قُلْ يَا عِبَادِيَ الَّذِينَ أَسْرَفُوا عَلَىٰ أَنفُسِهِمْ لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ ۚ إِنَّ اللَّهَ يَغْفِرُ الذُّنُوبَ جَمِيعًا ﴾ [الزمر: 53]",
        "advice": "مهما عظم ذنبك فعفو الله أعظم. أخلص النية، اترك الذنب، وأتبع السيئة الحسنة تمحها، فالله يفرح بتوبة عبده."
    },
    {
        "keywords": "صبر ابتلاء مرض فقد امتحان مصيبة تحمل",
        "title": "فضل الصبر عند الابتلاء",
        "ayah": "﴿ إِنَّمَا يُوَفَّى الصَّابِرُونَ أَجْرَهُم بِغَيْرِ حِسَابٍ ﴾ [الزمر: 10]",
        "advice": "الابتلاء رفعة للدرجات وتكفير للسيئات، وما بعد العسر إلا يسرين كما وعد الله في سورة الشرح: (فَإِنَّ مَعَ الْعُسْرِ يُسْرًا * إِنَّ مَعَ الْعُسْرِ يُسْرًا)."
    },
    {
        "keywords": "مذاكرة علم نجاح توفيق دراسة فهم نسيان",
        "title": "طلب العلم والتوفيق والفهم",
        "ayah": "﴿ وَقُل رَّبِّ زِدْنِي عِلْمًا ﴾ [طه: 114]",
        "advice": "ابدأ باسم الله، واستعن بدعاء: (اللهم علمنا ما ينفعنا وانفعنا بما علمتنا وزدنا علماً)، واحرص على تقوى الله وصفاء الذهن."
    }
]

@app.route('/')
def index():
    return render_template('index.html')

# --- APIs الحسابات وتسجيل الدخول وحفظ التقدم ---

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username', '').strip().lower()
    full_name = data.get('full_name', '').strip()
    password = data.get('password', '').strip()

    if not username or not full_name or not password:
        return jsonify({"error": "يرجى ملء جميع الحقول"}), 400

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    try:
        c.execute(
            "INSERT INTO users (username, full_name, password_hash) VALUES (?, ?, ?)",
            (username, full_name, generate_password_hash(password))
        )
        conn.commit()
        user_id = c.lastrowid
        session['user_id'] = user_id
        return jsonify({
            "message": "تم إنشاء الحساب بنجاح",
            "user": {
                "username": username,
                "full_name": full_name,
                "score": 0,
                "last_surah_num": 1,
                "last_surah_name": "سورة الفاتحة",
                "last_ayah_num": 1,
                "bookmarks": []
            }
        })
    except sqlite3.IntegrityError:
        return jsonify({"error": "اسم المستخدم مسجل بالفعل، اختر اسماً آخر"}), 400
    finally:
        conn.close()

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username', '').strip().lower()
    password = data.get('password', '').strip()

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, username, full_name, password_hash, score, last_surah_num, last_surah_name, last_ayah_num, bookmarks FROM users WHERE username = ?", (username,))
    row = c.fetchone()
    conn.close()

    if row and check_password_hash(row[3], password):
        session['user_id'] = row[0]
        return jsonify({
            "user": {
                "username": row[1],
                "full_name": row[2],
                "score": row[4],
                "last_surah_num": row[5],
                "last_surah_name": row[6],
                "last_ayah_num": row[7],
                "bookmarks": json.loads(row[8])
            }
        })
    return jsonify({"error": "اسم المستخدم أو كلمة المرور غير صحيحة"}), 401

@app.route('/api/auth/me', methods=['GET'])
def current_user():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"user": None})

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT username, full_name, score, last_surah_num, last_surah_name, last_ayah_num, bookmarks FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        return jsonify({"user": None})

    return jsonify({
        "user": {
            "username": row[0],
            "full_name": row[1],
            "score": row[2],
            "last_surah_num": row[3],
            "last_surah_name": row[4],
            "last_ayah_num": row[5],
            "bookmarks": json.loads(row[6])
        }
    })

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({"message": "تم تسجيل الخروج"})

@app.route('/api/user/sync', methods=['POST'])
def sync_user_progress():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "guest"})

    data = request.get_json()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    if 'score' in data:
        c.execute("UPDATE users SET score = ? WHERE id = ?", (data['score'], user_id))
    if 'last_surah_num' in data and 'last_surah_name' in data:
        c.execute(
            "UPDATE users SET last_surah_num = ?, last_surah_name = ?, last_ayah_num = ? WHERE id = ?",
            (data['last_surah_num'], data['last_surah_name'], data.get('last_ayah_num', 1), user_id)
        )
    if 'bookmarks' in data:
        c.execute("UPDATE users SET bookmarks = ? WHERE id = ?", (json.dumps(data['bookmarks'], ensure_ascii=False), user_id))

    conn.commit()
    conn.close()
    return jsonify({"status": "synced"})

# --- APIs القرآن والاختبارات والمساعد الذكي ---

@app.route('/api/surahs', methods=['GET'])
def get_surahs():
    global SURAHS_CACHE
    if not SURAHS_CACHE:
        try:
            res = requests.get('https://api.alquran.cloud/v1/surah', timeout=10)
            if res.status_code == 200:
                SURAHS_CACHE = res.json()['data']
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify(SURAHS_CACHE)

@app.route('/api/surah/<int:surah_number>', methods=['GET'])
def get_surah_details(surah_number):
    if surah_number in SURAH_DETAILS_CACHE:
        return jsonify(SURAH_DETAILS_CACHE[surah_number])
    
    try:
        url = f'https://api.alquran.cloud/v1/surah/{surah_number}/editions/quran-uthmani,ar.muyassar,ar.alafasy'
        res = requests.get(url, timeout=15)
        if res.status_code == 200:
            editions = res.json()['data']
            uthmani, tafseer, audio = editions[0], editions[1], editions[2]
            
            ayahs = []
            for i in range(len(uthmani['ayahs'])):
                ayahs.append({
                    "number": uthmani['ayahs'][i]['numberInSurah'],
                    "text": uthmani['ayahs'][i]['text'],
                    "tafseer": tafseer['ayahs'][i]['text'],
                    "audio": audio['ayahs'][i]['audio']
                })
                
            surah_data = {
                "number": uthmani['number'],
                "name": uthmani['name'],
                "englishName": uthmani['englishName'],
                "revelationType": "مكية" if uthmani['revelationType'] == 'Meccan' else "مدنية",
                "numberOfAyahs": uthmani['numberOfAyahs'],
                "ayahs": ayahs
            }
            SURAH_DETAILS_CACHE[surah_number] = surah_data
            return jsonify(surah_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/quiz/<int:surah_number>', methods=['GET'])
def generate_quiz(surah_number):
    if surah_number not in SURAH_DETAILS_CACHE:
        get_surah_details(surah_number)
        
    surah = SURAH_DETAILS_CACHE.get(surah_number)
    if not surah or len(surah['ayahs']) < 3:
        return jsonify({"error": "لا توجد آيات كافية لتوليد اختبار"}), 400
        
    ayahs = surah['ayahs']
    questions = []
    selected_ayahs = random.sample(ayahs, min(5, len(ayahs)))
    
    for target in selected_ayahs:
        other_ayahs = [a for a in ayahs if a['number'] != target['number']]
        distractors = random.sample(other_ayahs, min(2, len(other_ayahs)))
        options = [target['text']] + [d['text'] for d in distractors]
        random.shuffle(options)
        
        questions.append({
            "question": f"أي من الآيات التالية يوافق هذا التفسير: «{target['tafseer']}»؟",
            "options": options,
            "correct_index": options.index(target['text'])
        })
        
    return jsonify({"surah_name": surah['name'], "questions": questions})

@app.route('/api/assistant', methods=['POST'])
def ai_assistant():
    req = request.get_json()
    user_query = req.get('query', '').strip()
    current_surah = req.get('surah_number', 1)
    
    if not user_query:
        return jsonify({"reply": "من فضلك اكتب سؤالك أو ما تشعر به."})
        
    docs = [item['keywords'] + " " + item['title'] + " " + item['advice'] for item in ISLAMIC_KNOWLEDGE_BASE]
    vectorizer = TfidfVectorizer()
    tfidf_matrix = vectorizer.fit_transform(docs + [user_query])
    similarities = cosine_similarity(tfidf_matrix[-1], tfidf_matrix[:-1])[0]
    best_match_idx = similarities.argmax()
    
    if similarities[best_match_idx] > 0.12:
        match = ISLAMIC_KNOWLEDGE_BASE[best_match_idx]
        return jsonify({"reply": f"🌿 **{match['title']}**\n\n📖 يقول الله تعالى:\n{match['ayah']}\n\n💡 **إرشاد تدبري:**\n{match['advice']}"})
        
    if current_surah not in SURAH_DETAILS_CACHE:
        get_surah_details(current_surah)
        
    surah = SURAH_DETAILS_CACHE.get(current_surah)
    if surah:
        ayah_docs = [a['text'] + " " + a['tafseer'] for a in surah['ayahs']]
        vec2 = TfidfVectorizer()
        mat2 = vec2.fit_transform(ayah_docs + [user_query])
        sims2 = cosine_similarity(mat2[-1], mat2[:-1])[0]
        best_ayah_idx = sims2.argmax()
        
        if sims2[best_ayah_idx] > 0.08:
            ayah = surah['ayahs'][best_ayah_idx]
            return jsonify({"reply": f"🔍 **أقرب آية لسؤالك في {surah['name']} (آية {ayah['number']}):**\n\n﴿ {ayah['text']} ﴾\n\n📚 **التفسير الميسر:**\n{ayah['tafseer']}"})
            
    return jsonify({"reply": "جرب أن تكتب كلمة مفتاحية أوضح (مثل: الصبر، الرزق، الضيق، التوبة، العلم) أو اسأل عن كلمة داخل السورة الحالية."})

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/sw.js')
def service_worker():
    return send_from_directory('static', 'sw.js')

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)