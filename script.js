// ============================================================
//  Stop-and-Wait ARQ  — full simulation
//  Scenarios: Successful | ACK Lost | Data Lost
// ============================================================

// ── Timer ──────────────────────────────────────────────────
class ARQTimer {
  constructor(durationInSeconds, displayId, progressBarId, onTimeoutCallback) {
    this.duration = durationInSeconds * 1000;
    this.remainingTime = this.duration;
    this.timerId = null;
    this.displayEl = document.getElementById(displayId);
    this.progressBarEl = document.getElementById(progressBarId);
    this.onTimeout = onTimeoutCallback;
  }
  start() {
    this.stop();
    this.remainingTime = this.duration;
    const tick = 100;
    this.timerId = setInterval(() => {
      this.remainingTime -= tick;
      if (this.remainingTime <= 0) {
        this.remainingTime = 0;
        this.updateUI();
        this.stop();
        if (this.onTimeout) this.onTimeout();
      } else {
        this.updateUI();
      }
    }, tick);
  }
  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
  reset() {
    this.stop();
    this.remainingTime = this.duration;
    this.updateUI();
  }
  updateUI() {
    const s = (this.remainingTime / 1000).toFixed(1);
    this.displayEl.textContent = `${s}s`;
    const pct = (this.remainingTime / this.duration) * 100;
    this.progressBarEl.style.width = `${pct}%`;
    // colour the bar red→yellow→green as time shrinks
    const g = Math.round((pct / 100) * 200);
    const r = Math.round(200 - (pct / 100) * 140);
    this.progressBarEl.style.background = `rgb(${r},${g},40)`;
  }
}

// ── DOM refs ───────────────────────────────────────────────
const senderContainer = document.querySelector(".sender");
const receiverContainer = document.querySelector(".receiver");
const channelArea = document.getElementById("channelArea");
const logBody = document.getElementById("logBody");
const senderSeqNum = document.getElementById("senderSeqNum");
const receiverSeqNum = document.getElementById("receiverSeqNum");

const btnSucc = document.querySelector(".succ-trans");
const btnAckLost = document.querySelector(".ack-lost");
const btnDataLost = document.querySelector(".data-lost");
const btnReset = document.querySelector(".reset");

// ── State ──────────────────────────────────────────────────
const TOTAL_PACKETS = 5;
const min_duration = 1500;
let senderSeq = 0; // which packet number sender is waiting ACK for (0-based, mod 2)
let receiverSeq = 0; // which packet number receiver expects next
let currentPkt = 0; // index into the packets array (0..TOTAL_PACKETS-1)
let busy = false;

// ── Helpers ────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg, type = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const now = new Date();
  entry.textContent = `[${now.toLocaleTimeString()}] ${msg}`;
  logBody.prepend(entry); // newest on top
}

function updateSeqDisplay() {
  senderSeqNum.textContent = senderSeq % 2;
  receiverSeqNum.textContent = receiverSeq % 2;
}

function setButtons(disabled) {
  [btnSucc, btnAckLost, btnDataLost].forEach((b) => (b.disabled = disabled));
}

// ── Build grid cells ───────────────────────────────────────
const senderCells = [];
const receiverCells = [];

for (let i = 0; i < TOTAL_PACKETS; i++) {
  // Sender cell
  const sc = document.createElement("div");
  sc.classList.add("array-cell", "sender-cell", `s-cell-${i}`);
  sc.setAttribute("data-index", i);
  sc.textContent = `PKT-${i}`;
  senderContainer.appendChild(sc);
  senderCells.push(sc);

  // Receiver cell
  const rc = document.createElement("div");
  rc.classList.add("array-cell", "receiver-cell", `r-cell-${i}`);
  rc.setAttribute("data-index", i);
  rc.textContent = "—";
  receiverContainer.appendChild(rc);
  receiverCells.push(rc);
}

// ── Timer (with timeout → retransmit logic) ────────────────
const senderTimer = new ARQTimer(
  10,
  "timerDisplay",
  "progressBar",
  async () => {
    if (currentPkt >= TOTAL_PACKETS) return;
    log(
      `TIMEOUT — retransmitting PKT-${currentPkt} (seq=${senderSeq % 2})`,
      "timeout",
    );
    senderCells[currentPkt].classList.add("state-timeout");
    await sleep(400);
    senderCells[currentPkt].classList.remove("state-timeout");
    senderTimer.start(); // restart timer for retransmit indication (UI only; user picks scenario)
  },
);

// ── Channel animation helpers ──────────────────────────────
/**
 * Animate a flying element across the channel.
 * direction: "right" (sender→receiver) or "left" (receiver→sender)
 * top: vertical position in px inside channelArea
 * label, type: "pkt" | "ack" | "lost"
 * Returns a promise that resolves when animation ends.
 */
function flyPacket({
  label,
  type,
  direction,
  topPx,
  durationMs = min_duration,
}) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = `flying-packet ${type}`;
    el.textContent = label;

    const chW = channelArea.offsetWidth;
    const pktW = 80; // matches CSS

    const startX = direction === "right" ? -pktW : chW;
    const endX = direction === "right" ? chW : -pktW;

    el.style.top = `${topPx}px`;
    el.style.left = `${startX}px`;
    el.style.transition = `left ${durationMs}ms linear`;

    channelArea.appendChild(el);

    // Force reflow before starting transition
    void el.offsetWidth;
    el.style.left = `${endX}px`;

    setTimeout(() => {
      el.remove();
      resolve();
    }, durationMs + 50);
  });
}

/**
 * Animate a packet being sent (right), then disappear mid-way (lost).
 */
function flyPacketLost({
  label,
  topPx,
  direction = "left",
  durationMs = min_duration,
}) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = `flying-packet lost`;
    el.textContent = label;

    const chW = channelArea.offsetWidth;
    const midX = chW / 2 - 40;

    el.style.top = `${topPx}px`;
    el.style[direction] = `-80px`;
    el.style.transition = `${direction} ${durationMs}ms linear, opacity 0.5s ease`;

    channelArea.appendChild(el);
    void el.offsetWidth;
    el.style[direction] = `${midX}px`;

    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => {
        el.remove();
        resolve();
      }, 500);
    }, durationMs);
  });
}

// Row y-position: use the sender cell's center inside the channel area
function getRowTop(index) {
  const chRect = channelArea.getBoundingClientRect();
  const scRect = senderCells[index].getBoundingClientRect();
  const center = scRect.top + scRect.height / 2 - chRect.top;
  return Math.max(10, center - 18); // 18 = half of packet height (36px)
}

// ── Core ARQ scenarios ─────────────────────────────────────

/**
 * Successful Transmission for the current packet.
 * PKT travels right → receiver stores → ACK travels left → sender advances.
 */
async function doSuccessfulTransmission() {
  if (currentPkt >= TOTAL_PACKETS) {
    log("All packets delivered!", "success");
    return;
  }
  setButtons(true);

  const i = currentPkt;
  const seq = senderSeq % 2;

  log(`Sending PKT-${i} [seq=${seq}]`, "info");
  senderCells[i].classList.add("state-waiting");
  senderCells[i].textContent = `PKT-${i} [seq=${seq}] →`;
  senderTimer.start();

  // Packet travels sender → receiver
  const topPx = getRowTop(i);
  await flyPacket({
    label: `PKT-${i} [${seq}]`,
    type: "pkt",
    direction: "right",
    topPx,
  });

  // Receiver gets the packet
  receiverCells[i].classList.add("state-received");
  receiverCells[i].textContent = `✓ PKT-${i}`;
  log(`Receiver got PKT-${i} [seq=${seq}] — sending ACK-${seq}`, "success");
  receiverSeq = receiverSeq + 1;
  updateSeqDisplay();

  await sleep(400);

  // ACK travels receiver → sender
  await flyPacket({
    label: `ACK-${seq}`,
    type: "ack",
    direction: "left",
    topPx,
    durationMs: min_duration,
  });

  // Sender receives ACK
  senderTimer.stop();
  senderCells[i].classList.remove("state-waiting");
  senderCells[i].classList.add("state-acked");
  senderCells[i].textContent = `✓ PKT-${i} ACKed`;
  senderSeq = senderSeq + 1;
  updateSeqDisplay();
  log(`ACK-${seq} received — PKT-${i} confirmed`, "success");

  currentPkt++;
  if (currentPkt >= TOTAL_PACKETS) {
    log("All packets successfully delivered!", "success");
    senderTimer.reset();
    setButtons(false);
    [btnSucc, btnAckLost, btnDataLost].forEach((b) => (b.disabled = true));
    return;
  }
  setButtons(false);
}

/*
 * ACK Lost scenario.
 */
async function doAckLost() {
  if (currentPkt >= TOTAL_PACKETS) {
    log("All packets delivered!", "success");
    return;
  }
  setButtons(true);

  const i = currentPkt;
  const seq = senderSeq % 2;

  log(`Sending PKT-${i} [seq=${seq}]`, "info");
  senderCells[i].classList.add("state-waiting");
  senderCells[i].textContent = `PKT-${i} [seq=${seq}] →`;
  senderTimer.start();

  const topPx = getRowTop(i);

  // Packet travels → receiver gets it
  await flyPacket({
    label: `PKT-${i} [${seq}]`,
    type: "pkt",
    direction: "right",
    topPx,
  });
  receiverCells[i].classList.add("state-received");
  receiverCells[i].textContent = `✓ PKT-${i}`;
  log(`Receiver got PKT-${i} — sending ACK-${seq} (will be lost)`, "info");

  await sleep(400);

  // ACK starts but gets lost midway
  const ackLostPromise = flyPacketLost({
    label: `ACK-${seq}`,
    topPx,
    direction: "right",
    durationMs: 700,
  });
  await ackLostPromise;
  log(`ACK-${seq} LOST in transit!`, "error");

  // Wait for timer timeout
  await new Promise((resolve) => {
    const orig = senderTimer.onTimeout;
    senderTimer.onTimeout = async () => {
      senderTimer.stop();
      log(`TIMEOUT — no ACK received for PKT-${i}`, "timeout");
      senderCells[i].classList.add("state-timeout");
      await sleep(400);
      senderCells[i].classList.remove("state-timeout");
      resolve();
    };
    // If timer already fired, resolve immediately; else let it run
    if (senderTimer.timerId === null) resolve();
  });

  // Retransmit same packet
  log(`RETRANSMITTING PKT-${i} [seq=${seq}]`, "timeout");
  senderCells[i].textContent = `↺ PKT-${i} [seq=${seq}]`;
  senderTimer.start();
  await flyPacket({
    label: `PKT-${i}[${seq}]`,
    type: "pkt",
    direction: "right",
    topPx,
    durationMs: min_duration,
  });

  // Receiver: detects duplicate by seq number, sends ACK again
  log(
    `Receiver got duplicate PKT-${i} [seq=${seq}] — re-sending ACK-${seq}`,
    "info",
  );
  receiverCells[i].textContent = `✓ PKT-${i} (dup ok)`;

  await sleep(300);

  // ACK comes back successfully
  senderTimer.stop();
  await flyPacket({
    label: `ACK-${seq}`,
    type: "ack",
    direction: "left",
    topPx,
    durationMs: min_duration,
  });

  senderCells[i].classList.remove("state-waiting");
  senderCells[i].classList.add("state-acked");
  senderCells[i].textContent = `✓ PKT-${i} ACKed`;
  senderSeq = senderSeq + 1;
  receiverSeq = receiverSeq + 1;
  updateSeqDisplay();
  log(`ACK-${seq} received (retry) — PKT-${i} confirmed`, "success");

  currentPkt++;
  if (currentPkt >= TOTAL_PACKETS) {
    log("All packets successfully delivered!", "success");
    senderTimer.reset();
    [btnSucc, btnAckLost, btnDataLost].forEach((b) => (b.disabled = true));
    return;
  }
  setButtons(false);
}

/**
 * Data Lost scenario.
 * PKT is sent but gets lost mid-way → receiver never gets it
 * → sender times out → retransmit → success this time.
 */
async function doDataLost() {
  if (currentPkt >= TOTAL_PACKETS) {
    log("All packets delivered! 🎉", "success");
    return;
  }
  setButtons(true);

  const i = currentPkt;
  const seq = senderSeq % 2;

  log(`Sending PKT-${i} [seq=${seq}] (will be lost)`, "info");
  senderCells[i].classList.add("state-waiting");
  senderCells[i].textContent = `PKT-${i} [seq=${seq}] →`;
  senderTimer.start();

  const topPx = getRowTop(i);

  // Packet gets lost mid-channel
  await flyPacketLost({ label: `PKT-${i}[${seq}]`, topPx, durationMs: 800 });
  log(`PKT-${i} LOST in transit! Receiver never saw it.`, "error");
  senderCells[i].classList.add("state-lost");

  // Receiver does nothing — show "waiting"
  receiverCells[i].textContent = "⌛ waiting…";

  // Wait for timeout
  await new Promise((resolve) => {
    senderTimer.onTimeout = async () => {
      senderTimer.stop();
      log(`TIMEOUT — no ACK for PKT-${i}, data was lost`, "timeout");
      senderCells[i].classList.remove("state-lost");
      senderCells[i].classList.add("state-timeout");
      await sleep(400);
      senderCells[i].classList.remove("state-timeout", "state-waiting");
      resolve();
    };
    if (senderTimer.timerId === null) resolve();
  });

  // Retransmit
  log(`RETRANSMITTING PKT-${i} [seq=${seq}]`, "timeout");
  senderCells[i].classList.add("state-waiting");
  senderCells[i].textContent = `↺ PKT-${i} [seq=${seq}]`;
  senderTimer.start();

  // This time it succeeds
  await flyPacket({
    label: `PKT-${i}[${seq}]`,
    type: "pkt",
    direction: "right",
    topPx,
    durationMs: min_duration,
  });

  senderTimer.stop();
  receiverCells[i].classList.add("state-received");
  receiverCells[i].textContent = `✓ PKT-${i}`;
  receiverSeq = receiverSeq + 1;
  updateSeqDisplay();
  log(
    `Receiver got PKT-${i} [seq=${seq}] (retry) — sending ACK-${seq}`,
    "success",
  );

  await sleep(300);

  await flyPacket({
    label: `ACK-${seq}`,
    type: "ack",
    direction: "left",
    topPx,
    durationMs: min_duration,
  });

  senderCells[i].classList.remove("state-waiting");
  senderCells[i].classList.add("state-acked");
  senderCells[i].textContent = `✓ PKT-${i} ACKed`;
  senderSeq = senderSeq + 1;
  updateSeqDisplay();
  log(`ACK-${seq} received — PKT-${i} confirmed`, "success");

  currentPkt++;
  if (currentPkt >= TOTAL_PACKETS) {
    log("All packets successfully delivered!", "success");
    senderTimer.reset();
    [btnSucc, btnAckLost, btnDataLost].forEach((b) => (b.disabled = true));
    return;
  }
  setButtons(false);
}

// ── Button listeners ───────────────────────────────────────
btnSucc.addEventListener("click", () => doSuccessfulTransmission());
btnAckLost.addEventListener("click", () => doAckLost());
btnDataLost.addEventListener("click", () => doDataLost());
btnReset.addEventListener("click", () => location.reload());

// ── Init ───────────────────────────────────────────────────
updateSeqDisplay();
log("Ready. Choose a transmission scenario.", "info");
