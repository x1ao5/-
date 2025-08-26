// ========= 可調參數 =========
const PW_PATH = "./passwords.json";   // 與 index.html 同層就用這個
const CASE_INSENSITIVE = false;       // 想忽略大小寫就改 true
const USED_KEY = "x5_gift_used_passwords_v1"; // localStorage key
// 轉盤獎項（label + 權重，數字越大機率越高）
const SEGMENTS = [
  { label: "🎉 驚喜1", weight: 1 },
  { label: "🎁 驚喜2", weight: 2 },
  { label: "🍰 驚喜3", weight: 3 },
  { label: "🔥 驚喜4", weight: 1 }
];
// 動畫秒數
const SPIN_SECONDS = 4;
// 最少旋轉圈數
const MIN_TURNS = 2;
// ===========================

let validPasswords = [];
let passwordsReady = false;
let unlockedPassword = null;   // 目前成功解鎖的密碼（用來標記已使用）
let hasSpun = false;           // 防重複抽
let currentRotation = 0;       // 累積旋轉角度（度數）

// 正規化輸入（是否忽略大小寫）
const norm = (s) => (CASE_INSENSITIVE ? String(s).trim().toLowerCase() : String(s).trim());

// 讀 localStorage 的已使用密碼集合
function getUsedSet() {
  try {
    const raw = localStorage.getItem(USED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(arr.map(norm));
  } catch {
    return new Set();
  }
}

// 寫回 localStorage
function addUsedPassword(pw) {
  const used = Array.from(getUsedSet());
  const npw = norm(pw);
  if (!used.includes(npw)) used.push(npw);
  localStorage.setItem(USED_KEY, JSON.stringify(used));
}

// 讀取 JSON（禁快取 + cache-bust）
async function loadPasswords() {
  try {
    const res = await fetch(`${PW_PATH}?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    validPasswords = Array.isArray(data.validPasswords) ? data.validPasswords : [];
    passwordsReady = true;
    console.log("Loaded passwords:", validPasswords);
    // 啟用表單
    checkPasswordBtn.disabled = false;
    passwordInput.disabled = false;
    loadingHint.style.display = "none";
  } catch (err) {
    console.error("載入 passwords.json 失敗：", err);
    loadingHint.textContent = "密碼系統暫時不可用，請稍後再試。";
    if (location.protocol === "file:") {
      console.warn("你正用 file:// 開啟，fetch 會被擋。請用本機伺服器或部署到主機。");
    }
  }
}

// ==== DOM ====
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

// 載入中提示
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

giftBtn.onclick = () => { modal.style.display = "block"; };
closeBtn.onclick = () => {
  modal.style.display = "none";
  // 重置狀態（若你希望關掉不重置，可移除這段）
  passwordInput.value = "";
  passwordError.style.display = "none";
  passwordStage.style.display = "block";
  wheelStage.style.display = "none";
  unlockedPassword = null;
  hasSpun = false;
  spinBtn.disabled = false;
  result.textContent = "";
  resetWheelRotation();
};

window.onclick = (e) => { if (e.target === modal) { modal.style.display = "none"; } };

// ======= 密碼驗證（含「已使用」限制）=======
checkPasswordBtn.onclick = () => {
  if (!passwordsReady) {
    passwordError.textContent = "系統尚未載入完成，請稍候再試。";
    passwordError.style.display = "block";
    return;
  }
  const input = norm(passwordInput.value);
  const ok = validPasswords.some(pw => norm(pw) === input);
  if (!ok) {
    passwordError.textContent = "密碼錯誤 ❌";
    passwordError.style.display = "block";
    return;
  }
  // 檢查是否已使用
  if (getUsedSet().has(input)) {
    passwordError.textContent = "這組密碼已使用過，不能再次抽獎。";
    passwordError.style.display = "block";
    return;
  }

  // 成功解鎖
  unlockedPassword = passwordInput.value; // 保留原字串（記錄使用時再正規化）
  passwordStage.style.display = "none";
  wheelStage.style.display = "block";
  passwordError.style.display = "none";
};

// ======= 權重抽選 =======
function weightedPick(items) {
  // items: [{label, weight}]
  const total = items.reduce((s, it) => s + Math.max(0, it.weight || 0), 0);
  if (total <= 0) return 0;
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    const w = Math.max(0, items[i].weight || 0);
    if (r < w) return i;
    r -= w;
  }
  return items.length - 1;
}

// ======= 繪製輪盤 =======
function drawWheel() {
  const N = SEGMENTS.length;
  const angle = (2 * Math.PI) / N;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < N; i++) {
    ctx.beginPath();
    ctx.fillStyle = i % 2 === 0 ? "#6C5CE7" : "#00B894"; // 兩色交替
    ctx.moveTo(150, 150);
    ctx.arc(150, 150, 150, i * angle, (i + 1) * angle);
    ctx.closePath();
    ctx.fill();

    // 文字
    ctx.save();
    ctx.translate(150, 150);
    ctx.rotate(i * angle + angle / 2);
    ctx.fillStyle = "#fff";
    ctx.fillText(SEGMENTS[i].label, 80, 0);
    ctx.restore();
  }
}
drawWheel();

function resetWheelRotation() {
  currentRotation = 0;
  canvas.style.transition = "none";
  canvas.style.transform = "rotate(0deg)";
}

// ======= 旋轉並精準停在中獎區 =======
spinBtn.onclick = () => {
  if (hasSpun) return;                    // 已抽過就不給再抽
  if (!unlockedPassword) return;          // 沒解鎖不能抽
  spinBtn.disabled = true;
  hasSpun = true;

  // 權重選一個 index
  const index = weightedPick(SEGMENTS);

  // 每段角度（度數）
  const N = SEGMENTS.length;
  const segmentDeg = 360 / N;

  // 指針固定在「上方 0 度」；我們要把目標區的中心旋到 0 度
  // 目標區中心角度（相對於起點的區塊編號）
  const targetCenterDeg = (index + 0.5) * segmentDeg;

  // 為了看起來更自然，加上一點 ± 隨機偏移（但仍落在該區塊內）
  const jitter = (Math.random() - 0.5) * (segmentDeg * 0.6); // 不超過 60% 區塊寬
  const finalTargetDeg = targetCenterDeg + jitter;

  // 從目前角度 currentRotation 旋到「多轉幾圈 + 對準該區塊」
  const extraTurns = MIN_TURNS + Math.floor(Math.random() * 2); // 2~3圈
  // canvas 是順時針正角度，指針在上方（0deg）
  const finalDeg = extraTurns * 360 + finalTargetDeg;

  canvas.style.transition = `transform ${SPIN_SECONDS}s ease-out`;
  canvas.style.transform = `rotate(${finalDeg}deg)`;

  setTimeout(() => {
    currentRotation = finalDeg % 360;
    result.innerText = "結果: " + SEGMENTS[index].label;

    // 標記這組密碼為已使用（包含重新整理）
    addUsedPassword(unlockedPassword);

    // 可選：如果你想完全鎖死這次解鎖，關閉 modal
    // modal.style.display = "none";
  }, SPIN_SECONDS * 1000);
};

// 啟動時載入密碼
loadPasswords();
