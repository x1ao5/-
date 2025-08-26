// ========= 可調參數 =========
const PW_PATH = "./passwords.json";              // passwords.json 與 index.html 同層
const CASE_INSENSITIVE = false;                  // 忽略大小寫就改 true
const USED_KEY = "x5_gift_used_passwords_v3";    // 本機一次性標記 key

// 轉盤獎項：label / weight / img(可留空) / prize(新增：彈窗內容)
// prize = { type: "text" | "image", content: "文字或圖片URL", title?: "自訂標題" }
const SEGMENTS = [
  {
    label: "BTC",
    weight: 0,
    img: "",
    prize: { type: "image", content: "", title: "" }
  },
  {
    label: "ETH",
    weight: 0,
    img: "",
    prize: { type: "text", content: "", title: "Coffee Time" }
  },
  {
    label: "SOL",
    weight: 0,
    img: "",
    prize: { type: "text", content: "", title: "Lucky Day" }
  },
  {
    label: "ADA",
    weight: 3,
    img: "https://i.ibb.co/dsxdwW5j/image.jpg",
    prize: { type: "image", content: "https://i.ibb.co/dsxdwW5j/image.jpg", title: "GB6TW4WE" }
  }
];

const SPIN_SECONDS = 6;   // 動畫秒數
const MIN_TURNS = 8;      // 最少旋轉圈數
// ===========================

let validPasswords = [];
let passwordsReady = false;
let unlockedPassword = null;   // 成功解鎖的密碼
let hasSpun = false;

const norm = (s) => (CASE_INSENSITIVE ? String(s).trim().toLowerCase() : String(s).trim());

// ---- 本機一次性紀錄（不顯示、不提供清空按鈕）----
function getUsedSet() {
  try {
    const raw = localStorage.getItem(USED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(arr);
  } catch { return new Set(); }
}
function addUsedPassword(pw) {
  const s = getUsedSet();
  s.add(norm(pw));
  localStorage.setItem(USED_KEY, JSON.stringify(Array.from(s)));
}
function hasUsedPassword(pw) {
  return getUsedSet().has(norm(pw));
}

// ---- DOM ----
const giftBtn = document.getElementById("gift-button");
const modal = document.getElementById("gift-modal");
const closeBtn = document.querySelector(".close");
const checkPasswordBtn = document.getElementById("check-password");
const passwordInput = document.getElementById("gift-password");
const passwordError = document.getElementById("password-error");
const passwordStage = document.getElementById("password-stage");
const wheelStage = document.getElementById("wheel-stage");
const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const spinBtn = document.getElementById("spin");
const result = document.getElementById("result");

// 載入提示
let loadingHint = document.getElementById("pw-loading-hint");
if (!loadingHint) {
  loadingHint = document.createElement("p");
  loadingHint.id = "pw-loading-hint";
  loadingHint.style.color = "#aaa";
  loadingHint.style.marginTop = "8px";
  loadingHint.textContent = "正在載入密碼清單…";
  passwordStage.appendChild(loadingHint);
}
checkPasswordBtn.disabled = true;
passwordInput.disabled = true;

// ---- 載入 JSON 密碼 ----
async function loadPasswords() {
  try {
    const res = await fetch(`${PW_PATH}?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    validPasswords = Array.isArray(data.validPasswords) ? data.validPasswords : [];
    passwordsReady = true;
    checkPasswordBtn.disabled = false;
    passwordInput.disabled = false;
    loadingHint.style.display = "none";
  } catch (err) {
    console.error("載入 passwords.json 失敗：", err);
    loadingHint.textContent = "密碼系統暫時不可用，請稍後再試。";
    if (location.protocol === "file:") {
      console.warn("用 file:// 開啟會擋 fetch，請用本機伺服器或部署到主機。");
    }
  }
}

// ---- 事件 ----
giftBtn.onclick = () => { modal.style.display = "block"; };
closeBtn.onclick = () => { modal.style.display = "none"; resetModal(); };
window.onclick = (e) => { if (e.target === modal) { modal.style.display = "none"; } };

checkPasswordBtn.onclick = () => {
  if (!passwordsReady) {
    passwordError.textContent = "系統尚未載入完成，請稍候再試。";
    passwordError.style.display = "block";
    return;
  }
  const input = passwordInput.value;
  const ok = validPasswords.some(pw => norm(pw) === norm(input));
  if (!ok) {
    passwordError.textContent = "密碼錯誤 ❌";
    passwordError.style.display = "block";
    return;
  }
  if (hasUsedPassword(input)) {
    passwordError.textContent = "這組密碼已使用過，不能再次抽獎。";
    passwordError.style.display = "block";
    return;
  }
  unlockedPassword = input;
  passwordError.style.display = "none";
  passwordStage.style.display = "none";
  wheelStage.style.display = "block";
};

// ---- 權重抽選 ----
function weightedPick(items) {
  const total = items.reduce((s,i)=> s + Math.max(0, i.weight||0), 0);
  if (total <= 0) return 0;
  let r = Math.random() * total;
  for (let i=0;i<items.length;i++){
    const w = Math.max(0, items[i].weight||0);
    if (r < w) return i;
    r -= w;
  }
  return items.length - 1;
}

// ---- 圖片預載 ----
const loadedImgs = new Map();
function preloadImages() {
  const urls = SEGMENTS.map(s => s.img).filter(Boolean);
  const tasks = urls.map(url => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { loadedImgs.set(url, img); resolve(); };
    img.onerror = () => resolve();
    img.src = url;
  }));
  return Promise.all(tasks);
}

// ---- 繪製輪盤（含圖片/文字）----
function drawWheel() {
  const N = SEGMENTS.length;
  const angle = (2 * Math.PI) / N;
  const cx = 150, cy = 150, R = 150;

  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif";

  for (let i=0;i<N;i++){
    // 底色
    ctx.beginPath();
    ctx.fillStyle = i % 2 === 0 ? "#6C5CE7" : "#00B894";
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, i*angle, (i+1)*angle);
    ctx.closePath();
    ctx.fill();

    // 內容
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(i*angle + angle/2);

    const seg = SEGMENTS[i];
    if (seg.img && loadedImgs.has(seg.img)) {
      const img = loadedImgs.get(seg.img);
      const size = 56;    // 圖片大小可調
      const r = 95;       // 放置半徑可調
      // 讓圖片保持正立：再反向旋轉
      ctx.save();
      ctx.rotate(- (i*angle + angle/2));
      ctx.drawImage(img, cx - size/2, cy - r - size/2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillText(seg.label, 80, 0);
    }
    ctx.restore();
  }
}

function resetWheelRotation() {
  canvas.style.transition = "none";
  canvas.style.transform = "rotate(0deg)";
  hasSpun = false;
  unlockedPassword = null;
  result.textContent = "";
}

// ---- 旋轉並精準停在中獎區 ----
spinBtn.onclick = () => {
  if (hasSpun) return;
  if (!unlockedPassword) return;

  spinBtn.disabled = true;
  hasSpun = true;

  const index = weightedPick(SEGMENTS);
  const N = SEGMENTS.length;
  const segDeg = 360 / N;

  // 指針在畫布上方（你的 CSS 指針是朝上），所以加 180 做對準
  const targetCenter = (index + 0.5) * segDeg + 180;
  const jitter = (Math.random() - 0.5) * (segDeg * 0.6);
  const finalTarget = targetCenter + jitter;
  const extraTurns = MIN_TURNS + Math.floor(Math.random()*2); // 2~3圈
  const finalDeg = extraTurns * 360 + finalTarget;

  canvas.style.transition = `transform ${SPIN_SECONDS}s ease-out`;
  canvas.style.transform = `rotate(${finalDeg}deg)`;

  setTimeout(() => {
    const seg = SEGMENTS[index];
    result.innerText = "結果: " + seg.label;

    // 一次性：標記這組密碼已使用
    addUsedPassword(unlockedPassword);

    // ✅ 抽中後彈出自訂禮物
    showPrizePopup(seg);
  }, SPIN_SECONDS*1000);
};

function resetModal() {
  passwordInput.value = "";
  passwordStage.style.display = "block";
  wheelStage.style.display = "none";
  passwordError.style.display = "none";
  spinBtn.disabled = false;
  resetWheelRotation();
}

// ---- 顯示自訂獎品彈窗（動態建立，不用改 HTML）----
function showPrizePopup(segment) {
  const p = segment.prize || { type: "text", content: `🎉 恭喜抽中：${segment.label}`, title: "恭喜得獎" };

  // 遮罩
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.6)";
  overlay.style.zIndex = "4000";
  overlay.addEventListener("click", () => document.body.removeChild(overlay));

  // 卡片
  const card = document.createElement("div");
  card.style.width = "min(90vw, 420px)";
  card.style.background = "#111";
  card.style.border = "1px solid #333";
  card.style.borderRadius = "12px";
  card.style.color = "#fff";
  card.style.position = "absolute";
  card.style.left = "50%";
  card.style.top = "50%";
  card.style.transform = "translate(-50%, -50%)";
  card.style.padding = "20px";
  card.style.textAlign = "center";
  card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)";
  card.addEventListener("click", (e) => e.stopPropagation()); // 避免冒泡關閉

  const title = document.createElement("h3");
  title.textContent = `🎁 ${p.title || segment.label}`;
  title.style.margin = "0 0 12px";

  const contentWrap = document.createElement("div");
  contentWrap.style.minHeight = "120px";
  contentWrap.style.display = "flex";
  contentWrap.style.alignItems = "center";
  contentWrap.style.justifyContent = "center";
  contentWrap.style.padding = "8px";

  if (p.type === "image") {
    const img = document.createElement("img");
    img.src = p.content;
    img.alt = p.title || segment.label;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "300px";
    img.style.borderRadius = "8px";
    img.loading = "lazy";
    contentWrap.appendChild(img);
  } else {
    const text = document.createElement("p");
    text.textContent = p.content;
    text.style.fontSize = "16px";
    text.style.color = "rgba(255,255,255,.9)";
    text.style.lineHeight = "1.6";
    contentWrap.appendChild(text);
  }

  const btn = document.createElement("button");
  btn.textContent = "收下禮物 ✅";
  btn.style.marginTop = "16px";
  btn.style.background = "linear-gradient(90deg,#1b1b1b,#3a3a3a)";
  btn.style.color = "#fff";
  btn.style.border = "1px solid #444";
  btn.style.borderRadius = "10px";
  btn.style.padding = "10px 16px";
  btn.style.cursor = "pointer";
  btn.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  card.appendChild(title);
  card.appendChild(contentWrap);
  card.appendChild(btn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// ---- 啟動 ----
(async function init(){
  await preloadImages();
  drawWheel();
  loadPasswords();
})();
