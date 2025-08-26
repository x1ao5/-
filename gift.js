// ========= 可調參數 =========
const PW_PATH = "./passwords.json";      // passwords.json 路徑（放同資料夾就用這個）
const CASE_INSENSITIVE = false;          // 若想忽略大小寫，改成 true
// ===========================

let validPasswords = [];
let passwordsReady = false;

// 小工具：正規化輸入
const norm = (s) => (CASE_INSENSITIVE ? String(s).trim().toLowerCase() : String(s).trim());

// 讀取 JSON（禁快取 + cache-bust）
async function loadPasswords() {
  try {
    const res = await fetch(`${PW_PATH}?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    validPasswords = Array.isArray(data.validPasswords) ? data.validPasswords : [];
    passwordsReady = true;
    console.log("Loaded passwords:", validPasswords);
    // 啟用按鈕
    checkPasswordBtn.disabled = false;
    passwordInput.disabled = false;
    loadingHint.style.display = "none";
  } catch (err) {
    console.error("載入 passwords.json 失敗：", err);
    loadingHint.textContent = "密碼系統暫時不可用，請稍後再試。";
    // 若是在 file:// 環境，提醒需要用本機伺服器或正式主機
    if (location.protocol === "file:") {
      console.warn("你正用 file:// 開啟，fetch 會被擋。請用本機伺服器（例如 VSCode Live Server）或部署到網站。");
    }
  }
}

// 抓 DOM
const giftBtn = document.getElementById("gift-button");
const modal = document.getElementById("gift-modal");
const closeBtn = document.querySelector(".close");
const checkPasswordBtn = document.getElementById("check-password");
const passwordInput = document.getElementById("gift-password");
const passwordError = document.getElementById("password-error");
const passwordStage = document.getElementById("password-stage");
const wheelStage = document.getElementById("wheel-stage");

// 載入中提示（加在密碼區塊內）
let loadingHint = document.getElementById("pw-loading-hint");
if (!loadingHint) {
  loadingHint = document.createElement("p");
  loadingHint.id = "pw-loading-hint";
  loadingHint.style.color = "#aaa";
  loadingHint.style.marginTop = "8px";
  loadingHint.textContent = "正在載入密碼清單…";
  passwordStage.appendChild(loadingHint);
}
// 一開始先鎖按鈕
checkPasswordBtn.disabled = true;
passwordInput.disabled = true;

// 事件
giftBtn.onclick = () => { modal.style.display = "block"; };
closeBtn.onclick = () => { modal.style.display = "none"; passwordInput.value = ""; passwordError.style.display = "none"; };
window.onclick = (e) => { if (e.target === modal) { modal.style.display = "none"; } };

// 驗證密碼
checkPasswordBtn.onclick = () => {
  if (!passwordsReady) {
    passwordError.textContent = "系統尚未載入完成，請稍候 1 秒再試。";
    passwordError.style.display = "block";
    return;
  }
  const input = norm(passwordInput.value);
  const ok = validPasswords.some(pw => norm(pw) === input);
  if (ok) {
    passwordStage.style.display = "none";
    wheelStage.style.display = "block";
    passwordError.style.display = "none";
  } else {
    passwordError.textContent = "密碼錯誤 ❌";
    passwordError.style.display = "block";
  }
};

// 轉盤
const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const segments = ["🎉 驚喜1", "🎁 驚喜2", "🍰 驚喜3", "🔥 驚喜4"];
const spinBtn = document.getElementById("spin");
const result = document.getElementById("result");

function drawWheel() {
  const angle = 2 * Math.PI / segments.length;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < segments.length; i++) {
    ctx.beginPath();
    ctx.fillStyle = i % 2 === 0 ? "#ff6384" : "#36a2eb";
    ctx.moveTo(150, 150);
    ctx.arc(150, 150, 150, i * angle, (i + 1) * angle);
    ctx.fill();
    ctx.save();
    ctx.translate(150, 150);
    ctx.rotate(i * angle + angle / 2);
    ctx.fillStyle = "#fff";
    ctx.fillText(segments[i], 80, 0);
    ctx.restore();
  }
}
drawWheel();

spinBtn.onclick = () => {
  let spinAngle = Math.random() * 360 + 720; // 至少轉兩圈
  canvas.style.transition = "transform 4s ease-out";
  canvas.style.transform = `rotate(${spinAngle}deg)`;
  setTimeout(() => {
    const index = Math.floor(((360 - (spinAngle % 360)) / (360 / segments.length)) % segments.length);
    result.innerText = "結果: " + segments[index];
    canvas.style.transition = "none"; // 重設
  }, 4000);
};

// 啟動時載入密碼
loadPasswords();
