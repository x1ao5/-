// ========= 可調參數 =========
const PW_PATH = "./passwords.json";              // passwords.json 與 index.html 同層
const CASE_INSENSITIVE = false;                  // 忽略大小寫就改 true
const USED_KEY = "x5_gift_used_passwords_v2";    // 本機紀錄 key

// 轉盤獎項：可放 label / weight / img(可選)
// 換成你的圖片網址（建議 64~96px 正方形 PNG），或留空用文字
const SEGMENTS = [
  { label: "BTC", weight: 0, img: "" },
  { label: "ETH", weight: 0, img: "https://i.ibb.co/6NqS9mC/gift.png" },
  { label: "SOL", weight: 0, img: "https://i.ibb.co/Hqf9QnB/cake.png" },
  { label: "ADA", weight: 4, img: "" }
];

// 動畫秒數、最少轉幾圈
const SPIN_SECONDS = 6;
const MIN_TURNS = 3;
// ===========================

let validPasswords = [];
let passwordsReady = false;
let unlockedPassword = null;   // 成功解鎖的密碼
let hasSpun = false;
let currentRotation = 0;

// DOM
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
const viewUsedBtn = document.getElementById("view-used");
const clearUsedBtn = document.getElementById("clear-used");

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

// 工具
const norm = (s) => (CASE_INSENSITIVE ? String(s).trim().toLowerCase() : String(s).trim());
function getUsedLog() {
  try {
    const raw = localStorage.getItem(USED_KEY);
    return raw ? JSON.parse(raw) : []; // [{pw: "xxx", ts: 1700000000000}]
  } catch { return []; }
}
function setUsedLog(list) {
  localStorage.setItem(USED_KEY, JSON.stringify(list));
}
function addUsedPassword(pw) {
  const list = getUsedLog();
  const npw = norm(pw);
  if (!list.some(x => x.pw === npw)) {
    list.push({ pw: npw, ts: Date.now() });
    setUsedLog(list);
  }
}
function hasUsedPassword(pw) {
  const npw = norm(pw);
  return getUsedLog().some(x => x.pw === npw);
}

// 載入密碼
async function loadPasswords() {
  try {
    const res = await fetch(`${PW_PATH}?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    validPasswords = Array.isArray(data.validPasswords) ? data.validPasswords : [];
    passwordsReady = true;
    console.log("Loaded passwords:", validPasswords);
    checkPasswordBtn.disabled = false;
    passwordInput.disabled = false;
    loadingHint.style.display = "none";
  } catch (err) {
    console.error("載入 passwords.json 失敗：", err);
    loadingHint.textContent = "密碼系統暫時不可用，請稍後再試。";
    if (location.protocol === "file:") {
      console.warn("你正用 file:// 開啟，請用本機伺服器或部署主機。");
    }
  }
}

// 事件
giftBtn.onclick = () => { modal.style.display = "block"; };
closeBtn.onclick = () => {
  modal.style.display = "none";
  resetModal();
};
window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

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
  passwordStage.style.display = "none";
  wheelStage.style.display = "block";
  passwordError.style.display = "none";
};

viewUsedBtn.onclick = () => {
  const list = getUsedLog();
  if (!list.length) { alert("尚無已使用紀錄（此紀錄僅存在本機瀏覽器）。"); return; }
  const lines = list
    .map(x => {
      const d = new Date(x.ts);
      const ts = d.toLocaleString();
      return `密碼：${x.pw} ；時間：${ts}`;
    })
    .join("\n");
  alert(lines);
};

clearUsedBtn.onclick = () => {
  if (confirm("確定要清空本機抽獎紀錄？（僅影響此瀏覽器）")) {
    setUsedLog([]);
    alert("已清空。");
  }
};

// 權重挑選
function weightedPick(items) {
  const total = items.reduce((s,i)=> s + Math.max(0, i.weight||0), 0);
  if (total <= 0) return 0;
  let r = Math.random() * total;
  for (let i=0;i<items.length;i++){
    const w = Math.max(0, items[i].weight||0);
    if (r < w) return i;
    r -= w;
  }
  return items.length-1;
}

// 圖片預載
const loadedImgs = new Map();
function preloadImages() {
  const urls = SEGMENTS.map(s => s.img).filter(Boolean);
  const tasks = urls.map(url => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // 盡量避免 taint（不轉檔也沒差）
    img.onload = () => { loadedImgs.set(url, img); resolve(); };
    img.onerror = () => resolve(); // 失敗就當沒圖
    img.src = url;
  }));
  return Promise.all(tasks);
}

// 繪製輪盤（文字＋圖片）
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
    const imgUrl = seg.img;
    if (imgUrl && loadedImgs.has(imgUrl)) {
      const img = loadedImgs.get(imgUrl);
      const size = 56;               // 圖片大小
      const r = 95;                  // 圖片放置半徑
      // 讓圖片保持正立：先反向旋轉
      ctx.save();
      ctx.rotate(- (i*angle + angle/2));
      ctx.drawImage(img, cx - size/2, cy - r - size/2, size, size);
      ctx.restore();
    } else {
      // 無圖就顯示文字
      ctx.fillStyle = "#fff";
      ctx.fillText(seg.label, 80, 0);
    }
    ctx.restore();
  }
}

function resetWheelRotation() {
  currentRotation = 0;
  canvas.style.transition = "none";
  canvas.style.transform = "rotate(0deg)";
}

spinBtn.onclick = () => {
  if (hasSpun) return;
  if (!unlockedPassword) return;
  spinBtn.disabled = true;
  hasSpun = true;

  const index = weightedPick(SEGMENTS);
  const N = SEGMENTS.length;
  const segDeg = 360 / N;
  const targetCenter = (index + 0.5) * segDeg;
  const jitter = (Math.random() - 0.5) * (segDeg * 0.6);
  const finalTarget = targetCenter + jitter;
  const extraTurns = MIN_TURNS + Math.floor(Math.random()*2); // 2~3圈
  const finalDeg = extraTurns * 360 + finalTarget;

  canvas.style.transition = `transform ${SPIN_SECONDS}s ease-out`;
  canvas.style.transform = `rotate(${finalDeg}deg)`;

  setTimeout(() => {
    currentRotation = finalDeg % 360;
    result.innerText = "結果: " + SEGMENTS[index].label;
    // 標記密碼已使用
    addUsedPassword(unlockedPassword);
  }, SPIN_SECONDS*1000);
};

function resetModal() {
  passwordInput.value = "";
  passwordError.style.display = "none";
  passwordStage.style.display = "block";
  wheelStage.style.display = "none";
  unlockedPassword = null;
  hasSpun = false;
  spinBtn.disabled = false;
  result.textContent = "";
  resetWheelRotation();
}

// 啟動
(async function init(){
  await preloadImages();
  drawWheel();
  loadPasswords();
})();

