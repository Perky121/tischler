/* Region Picker — pure JS, no React, no bundler */
const { ipcRenderer } = require("electron");

const selEl = document.getElementById("selection");
const confirmEl = document.getElementById("confirm-btn");
const btnOk = document.getElementById("btn-ok");
const btnCancel = document.getElementById("btn-cancel");

let startX = 0, startY = 0;
let curX = 0, curY = 0;
let isDragging = false;
let hasSelection = false;

function getRect() {
  const x = Math.min(startX, curX);
  const y = Math.min(startY, curY);
  const w = Math.abs(curX - startX);
  const h = Math.abs(curY - startY);
  return { x, y, width: w, height: h };
}

function updateSelection() {
  const { x, y, width, height } = getRect();
  selEl.style.left = x + "px";
  selEl.style.top = y + "px";
  selEl.style.width = width + "px";
  selEl.style.height = height + "px";
  selEl.classList.toggle("hidden", width < 5 || height < 5);

  // Position confirm buttons below selection
  if (width >= 5 && height >= 5) {
    const btnY = Math.min(y + height + 10, window.innerHeight - 50);
    confirmEl.style.left = x + "px";
    confirmEl.style.top = btnY + "px";
  }
}

document.addEventListener("mousedown", (e) => {
  if (e.target === btnOk || e.target === btnCancel) return;
  isDragging = true;
  hasSelection = false;
  confirmEl.classList.add("hidden");
  startX = e.clientX;
  startY = e.clientY;
  curX = e.clientX;
  curY = e.clientY;
  selEl.classList.add("hidden");
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  curX = e.clientX;
  curY = e.clientY;
  updateSelection();
});

document.addEventListener("mouseup", (e) => {
  if (!isDragging) return;
  isDragging = false;
  curX = e.clientX;
  curY = e.clientY;
  updateSelection();

  const { width, height } = getRect();
  if (width >= 20 && height >= 20) {
    hasSelection = true;
    confirmEl.classList.remove("hidden");
  }
});

function confirm() {
  if (!hasSelection) return;
  const rect = getRect();
  // Clamp to screen bounds and enforce minimum size
  const safeX = Math.max(0, Math.min(rect.x, window.innerWidth - 20));
  const safeY = Math.max(0, Math.min(rect.y, window.innerHeight - 20));
  const safeW = Math.max(20, Math.min(rect.width, window.innerWidth - safeX));
  const safeH = Math.max(20, Math.min(rect.height, window.innerHeight - safeY));
  // Send raw logical (DIP) coordinates — main.js will apply scaleFactor via Electron screen API
  ipcRenderer.send("region-picker-selected", {
    dipX: Math.round(safeX),
    dipY: Math.round(safeY),
    dipWidth: Math.round(safeW),
    dipHeight: Math.round(safeH),
  });
}

function cancel() {
  ipcRenderer.send("region-picker-cancelled");
}

btnOk.addEventListener("click", confirm);
btnCancel.addEventListener("click", cancel);

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && hasSelection) confirm();
  if (e.key === "Escape") cancel();
});
