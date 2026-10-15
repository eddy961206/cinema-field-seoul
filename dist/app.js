import { createPresence } from "./presence.js";
import { createCinema } from "./scene.js";
import { createFraming } from "./framing.js";
import { roomConfig, seatMetrics, seatLabelInfo } from "./model.js";
import {
  DEFAULT_MODEL,
  filterRooms,
  readState,
  stateURL,
  parseVideo,
} from "./state.js";

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
let cinema,
  framing,
  room,
  config,
  row = 8,
  seat = 19,
  currentMode = "orbit";
let textureRequest = 0,
  activeRatio = 1.43,
  activeSource = 1.43,
  initialized = false;
let player,
  apiPromise,
  videoTimeout,
  videoRequest = 0,
  playerReady = false,
  pendingVideo = null;
const response = await fetch(new URL("./catalog.json", import.meta.url));
if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
const catalogue = await response.json();
const rooms = filterRooms(catalogue.rooms);
if (!rooms.length) throw new Error("No available auditoriums");
const initialState = readState(location.search, rooms);
const comparisons = [];
let presence,
  visitors = [],
  party = initialState.party;
function updatePresence() {
  presence?.update({ party, room: room.id, row, seat, config });
}
function renderVisitors(snapshot) {
  visitors = snapshot.visitors;
  const labels = {
    connected: "실시간 연결",
    waiting: "다른 접속자 기다리는 중",
    unavailable: "연결 지연 · 다시 연결해 줘",
    offline: "인터넷 연결 끊김",
    left: "모임에서 나왔어",
  };
  const count = visitors.length;
  text("#presence-status", labels[snapshot.status]);
  text("#presence-count", `${count}명`);
  text(
    "#presence-badge",
    snapshot.status === "connected"
      ? `● 함께 ${count}명`
      : snapshot.status === "left"
        ? "모임 나감"
        : snapshot.status === "offline" || snapshot.status === "unavailable"
          ? "연결 확인 필요"
          : "나 1명 · 연결 대기",
  );
  $("#presence-badge").dataset.status = snapshot.status;
  $("#presence-list").replaceChildren(
    ...visitors.map((person) => {
      const item = document.createElement("li"),
        icon = document.createElement("span"),
        label = document.createElement("span");
      icon.className = "person-icon";
      icon.style.setProperty("--person-color", person.color);
      label.textContent = `${person.self ? "나" : "관객 " + person.id.slice(0, 4)} · ${seatLabelInfo(config, person.row, person.seat).description}`;
      item.dataset.peer = person.self ? "self" : "remote";
      item.dataset.row = person.row;
      item.dataset.seat = person.seat;
      item.append(icon, label);
      return item;
    }),
  );
  text(
    "#presence-group",
    party === "lobby" ? "상영관 공개 모임" : "이 링크의 모임",
  );
  $("#presence-retry").hidden = !["unavailable", "offline"].includes(
    snapshot.status,
  );
  text(
    "#presence-toggle",
    snapshot.status === "left" ? "다시 참여" : "모임 나가기",
  );
  cinema?.setVisitors(visitors);
  $$(".seat-dot").forEach((b) => {
    const at = visitors.filter(
      (p) => !p.self && p.row === +b.dataset.row && p.seat === +b.dataset.seat,
    );
    b.classList.toggle("has-visitor", at.length > 0);
    if (at.length) b.style.setProperty("--visitor-color", at[0].color);
    b.setAttribute(
      "aria-label",
      b.title + (at.length ? ` · 다른 접속자 ${at.length}명` : ""),
    );
  });
}
const stateNames = { seat: "좌석 시점", walk: "걸어보기", orbit: "전체 보기" };
const getGrid = (r) =>
  r.seat_map?.value?.rows?.map((x) => x.occupied_grid_columns_zero_based);
const rowCount = () => config.rowColumns?.[row - 1]?.length || config.columns;
const text = (selector, value) => {
  const node = $(selector);
  if (node.textContent !== String(value)) node.textContent = value;
};

function sourceLink(url, label) {
  const a = document.createElement("a");
  try {
    const u = new URL(url);
    if (!["https:", "http:"].includes(u.protocol))
      return document.createTextNode(label);
    a.href = u.href;
  } catch {
    return document.createTextNode(label);
  }
  a.textContent = `${label} ↗`;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
function currentState() {
  return {
    party,
    room: room.id,
    row,
    seat,
    ratio: activeRatio,
    source: activeSource,
    mode: currentMode,
    frontDistance: config.frontDistance,
    pitch: config.pitch,
    rise: config.rise,
  };
}
function syncURL() {
  if (!initialized) return;
  history.replaceState(null, "", stateURL(location.href, currentState()));
}
function fillVenues() {
  const matches = filterRooms(rooms, {
    query: $("#search").value,
    region: $("#region-filter").value,
    format: $("#format-filter").value,
  });
  $("#venue").replaceChildren(...matches.map((r) => new Option(r.name, r.id)));
  $("#venue").disabled = !matches.length;
  $("#clear-search").hidden =
    !$("#search").value &&
    !$("#region-filter").value &&
    !$("#format-filter").value;
  if (room && matches.some((r) => r.id === room.id))
    $("#venue").value = room.id;
  else if (room && matches.length) loadRoom(matches[0].id);
  text(
    "#venue-meta",
    matches.length
      ? `${matches.length}개 상영관 · 선정 목록`
      : "검색 결과가 없어. 조건을 지우면 다시 볼 수 있어.",
  );
  $("#empty-results").hidden = !!matches.length;
  $("#room-content").hidden = !matches.length;
}
function clearFilters() {
  $("#search").value = "";
  $("#region-filter").value = "";
  $("#format-filter").value = "";
  fillVenues();
}
function chooseSeat(nextRow, nextSeat, focus = false) {
  row = Math.max(1, Math.min(config.rows, nextRow));
  seat = Math.max(1, Math.min(rowCount(), nextSeat));
  updateSeat();
  if (currentMode === "seat") cinema?.sit(row, seat);
  if (focus)
    $(`.seat-dot[data-row="${row}"][data-seat="${seat}"]`)?.focus({
      preventScroll: true,
    });
}
function updateSeat() {
  seat = Math.max(1, Math.min(seat, rowCount()));
  const label = seatLabelInfo(config, row, seat);
  text("#seat-label", `${label.rowLabel}열 ${label.seatLabel}번`);
  text(
    "#seat-detail",
    label.verified
      ? "2026.08 자료에서 확인\n현재 예매표와 대조해 줘"
      : "모델 번호 · 실제 번호 미확인\nM 표기는 모델 좌석이야",
  );
  $("#row").value = row;
  $("#seat").replaceChildren(
    ...Array.from(
      { length: rowCount() },
      (_, i) =>
        new Option(
          ((info) =>
            `${info.verified ? "" : "M"}${info.seatLabel}번 · ${info.verified ? "자료 확인" : "모델"}`)(
            seatLabelInfo(config, row, i + 1),
          ),
          i + 1,
        ),
    ),
  );
  $("#seat").value = seat;
  $$(".seat-dot").forEach((b) => {
    const selected = +b.dataset.row === row && +b.dataset.seat === seat;
    b.classList.toggle("selected", selected);
    b.setAttribute("aria-pressed", String(selected));
    b.tabIndex = selected ? 0 : -1;
  });
  const m = seatMetrics(config, row, seat);
  text("#metric-distance", `${m.distance.toFixed(1)} m`);
  text("#metric-angle", `${m.horizontalAngle.toFixed(1)}°`);
  text(
    "#metric-offset",
    `${Math.abs(m.offset).toFixed(1)} m ${Math.abs(m.offset) < 0.05 ? "중앙" : m.offset < 0 ? "왼쪽" : "오른쪽"}`,
  );
  text("#selected-context", label.description);
  cinema?.selectSeat(row, seat);
  updatePresence();
  syncURL();
}
function buildMap() {
  const max = config.rowColumns
    ? Math.max(...config.rowColumns.flat()) + 1
    : config.columns;
  $("#seatmap").replaceChildren();
  for (let r = 1; r <= config.rows; r++) {
    const el = document.createElement("div");
    el.className = "seat-row";
    el.style.gridTemplateColumns = `repeat(${max}, 1fr)`;
    const columns =
      config.rowColumns?.[r - 1] ||
      Array.from({ length: config.columns }, (_, i) => i);
    for (const [i, column] of columns.entries()) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seat-dot";
      b.style.gridColumn = column + 1;
      b.dataset.row = r;
      b.dataset.seat = i + 1;
      const accessible = config.accessibleCells.some(
        (a) => a.row === r && a.column === column,
      );
      b.classList.toggle("accessible", accessible);
      const info = seatLabelInfo(config, r, i + 1);
      b.dataset.label = (info.verified ? "" : "M") + info.seatLabel;
      b.classList.toggle("verified-label", info.verified);
      b.title = `${info.description} · 앞에서 ${r}행, 왼쪽 ${i + 1}번째${accessible ? " · 휠체어 지정 위치" : ""}`;
      b.setAttribute("aria-label", b.title);
      b.onclick = () => chooseSeat(r, i + 1);
      b.onkeydown = (e) => {
        const moves = {
          ArrowLeft: [r, i],
          ArrowRight: [r, i + 2],
          ArrowUp: [r - 1, i + 1],
          ArrowDown: [r + 1, i + 1],
          Home: [r, 1],
          End: [r, columns.length],
        };
        if (moves[e.key]) {
          e.preventDefault();
          chooseSeat(...moves[e.key], true);
        }
      };
      el.append(b);
    }
    $("#seatmap").append(el);
  }
  $("#row").replaceChildren(
    ...Array.from(
      { length: config.rows },
      (_, i) =>
        new Option(
          `${seatLabelInfo(config, i + 1, 1).rowLabel}열 · 앞에서 ${i + 1}행`,
          i + 1,
        ),
    ),
  );
}
function evidenceLabel(fact) {
  if (!fact?.value) return "미확인";
  if (fact.confidence?.includes("historical")) return "과거 자료";
  if (fact.confidence?.includes("screenshot")) return "좌석표 캡처";
  if (fact.confidence?.includes("primary")) return "공식 자료";
  return "참고 자료";
}
function renderFacts() {
  const mapped = !!getGrid(room);
  const dimensions = room.screen_m.value;
  const values = [
    [
      "스크린 크기",
      dimensions
        ? `${dimensions.join(" × ")} m · ${evidenceLabel(room.screen_m)}`
        : "현행 미확인 · 모델 28 × 12 m",
    ],
    [
      "수용 인원",
      room.capacity.value
        ? `${room.capacity.value}석 · ${evidenceLabel(room.capacity)}`
        : "현행 미확인",
    ],
    [
      "좌석 배치",
      mapped
        ? `${config.rows}행 · 캡처 도식`
        : `임의 ${config.rows * config.columns}위치`,
    ],
    ["공간 실측", "없음 · 거리와 단차는 가정"],
  ];
  $("#facts").replaceChildren();
  for (const [label, value] of values) {
    const el = document.createElement("div");
    el.className = "fact";
    const title = document.createElement("span"),
      detail = document.createElement("b");
    title.textContent = label;
    detail.textContent = value;
    el.append(title, detail);
    $("#facts").append(el);
  }
  text(
    "#screen-stat",
    dimensions ? `${dimensions[0]} × ${dimensions[1]}` : "미확인",
  );
  text(
    "#capacity-stat",
    room.capacity.value ? `${room.capacity.value}` : "미확인",
  );
  text("#evidence-badge", mapped ? "캡처 도식 기반" : "개념 배치");
  const known =
    room.seat_map?.value?.seat_label_verification?.known_label_count || 0;
  text(
    "#seat-label-note",
    known
      ? `실제 표기 ${known}개 확인 · 나머지 M 표기는 모델 번호`
      : "M 표기는 모델 번호 · 실제 좌석 표기 미확인",
  );
  text(
    "#room-summary",
    room.summary || `${room.format}의 스크린과 좌석 시야를 가정 모델로 살펴봐.`,
  );
  text("#room-name", room.name);
  text("#room-region", `${room.region} · ${room.format}`);
  text(
    "#room-address",
    room.address || "주소는 공식 영화관 안내에서 확인해 줘.",
  );
  text(
    "#room-transport",
    room.transport || "교통·주차·운영시간은 공식 안내에서 확인해 줘.",
  );
  text(
    "#verification-note",
    room.verification_note ||
      "좌석 수와 치수는 자료 작성 시점의 정보야. 방문 전 공식 안내를 확인해 줘.",
  );
  text(
    "#verified-date",
    room.verified_date
      ? `방문 정보 확인 ${room.verified_date}`
      : `자료 확인 ${catalogue.checked_at?.slice(0, 10) || "미확인"}`,
  );
  text(
    "#dimension-note",
    [room.screen_m.note, room.capacity.note].filter(Boolean).join(" "),
  );
  $("#visit-links").replaceChildren();
  if (room.official_url)
    $("#visit-links").append(sourceLink(room.official_url, "공식 영화관 안내"));
  $("#visit-links").append(
    sourceLink(
      `https://map.naver.com/p/search/${encodeURIComponent(room.address || room.name)}`,
      "지도에서 찾기",
    ),
  );
  $("#sources").replaceChildren();
  const keys = [
    ...new Set([
      ...(room.screen_m.sources || []),
      ...(room.capacity.sources || []),
      ...(room.info_sources || []),
      ...(room.seat_map?.value
        ? ["wheelchair-guide", room.seat_map.value.source_url]
        : []),
    ]),
  ];
  for (const key of keys) {
    const s = catalogue.sources[key];
    if (s)
      $("#sources").append(
        sourceLink(s.url, `${s.publisher}${s.date ? " · " + s.date : ""}`),
      );
    else if (/^https?:/.test(key))
      $("#sources").append(sourceLink(key, "참조 좌석표 캡처"));
  }
  $(".notice").textContent = mapped
    ? "좌석표 캡처의 도식 배치야. 거리·단차·의자 형태는 가정이며 예매 번호와 달라."
    : "이 상영관은 개념 배치야. 실제 좌석 수·배열·거리와 일치하지 않아.";
  if (room.id === "worldtower-superplex")
    $(".notice").textContent += " 곡면 스크린은 평면으로 단순화했어.";
  $("#seatmap").setAttribute(
    "aria-label",
    mapped ? "캡처 도식 기반 모델 좌석 선택" : "임의 배치 모델 좌석 선택",
  );
}
function loadRoom(id) {
  room = rooms.find((r) => r.id === id) || rooms[0];
  config = roomConfig(room);
  row = Math.min(8, config.rows);
  seat = Math.ceil(rowCount() / 2);
  $("#venue").value = room.id;
  text("#room-title", room.name);
  text("#room-format", room.format);
  renderFacts();
  buildMap();
  resetCalibration(false);
  cinema?.setRoom(config);
  framing?.setScreen(config.screenWidth, config.screenHeight);
  setMode("orbit");
  updateSeat();
  updateVideoFit();
}
function setMode(mode) {
  currentMode = mode;
  cinema?.setMode(mode);
  $$("button[data-mode]").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  });
  $(".walk-controls").hidden = !cinema || mode !== "walk";
  $("#stage").dataset.mode = mode;
  if (mode === "walk") cinema?.focus?.();
  if (initialized && mode !== "walk") resetStick();
  syncURL();
}
function sit() {
  cinema?.sit(row, seat);
  setMode("seat");
  closePanel();
}
function resetCalibration(apply = true) {
  for (const [id, key] of [
    ["front", "frontDistance"],
    ["pitch", "pitch"],
    ["rise", "rise"],
  ]) {
    $("#" + id).value = DEFAULT_MODEL[key];
    text("#" + id + "-value", `${DEFAULT_MODEL[key]} m`);
  }
  if (apply) calibrate();
}
function calibrate() {
  Object.assign(config, {
    frontDistance: +$("#front").value,
    pitch: +$("#pitch").value,
    rise: +$("#rise").value,
  });
  for (const id of ["front", "pitch", "rise"])
    text("#" + id + "-value", `${$("#" + id).value} m`);
  cinema?.setCalibration(config);
  updateSeat();
  syncURL();
}
function restoreState(state) {
  party = state.party || party;
  clearFilters();
  loadRoom(state.room);
  for (const [id, key] of [
    ["front", "frontDistance"],
    ["pitch", "pitch"],
    ["rise", "rise"],
  ])
    $("#" + id).value = state[key];
  calibrate();
  chooseSeat(state.row, state.seat);
  framing?.setSourceRatio(state.source);
  framing?.setRatio(state.ratio);
  if (state.mode === "seat") sit();
  else setMode(state.mode);
}
function fallback(
  reason = "이 환경에서는 3D를 표시할 수 없어. 좌석표·수치 비교·화면비 학습은 계속 사용할 수 있어.",
) {
  $("#engine-error").hidden = false;
  text("#engine-error", reason);
  $("#stage").classList.add("no-webgl");
  text("#view-state", "2D 비교 모드");
  text(".scene-heading small", "3D 대신 좌석표와 수치로 비교");
  $$("button[data-mode],#sit,#look-screen,#toggle-labels,#see-seats").forEach(
    (b) => (b.disabled = true),
  );
  $(".walk-controls").hidden = true;
  if (initialized) {
    resetStick();
    updateVideoFit();
    framing?.setRatio(activeRatio);
  }
}
function renderComparisons() {
  $("#comparison-list").replaceChildren();
  $("#compare-open").disabled = !comparisons.length;
  text("#compare-count", `${comparisons.length}/3`);
  $("#comparison-empty").hidden = !!comparisons.length;
  for (const [index, item] of comparisons.entries()) {
    const el = document.createElement("li"),
      name = document.createElement("span"),
      remove = document.createElement("button");
    name.textContent = `${item.name} · ${item.label}`;
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${item.name} 비교 삭제`);
    remove.onclick = () => {
      comparisons.splice(index, 1);
      renderComparisons();
    };
    el.append(name, remove);
    $("#comparison-list").append(el);
  }
}
function addComparison() {
  const state = { ...currentState(), mode: "seat" };
  const duplicate = comparisons.some(
    (item) => JSON.stringify(item.state) === JSON.stringify(state),
  );
  if (duplicate) return announce("이미 같은 좌석과 설정을 담았어.");
  if (comparisons.length >= 3)
    return announce("최대 3개까지 비교할 수 있어. 하나를 삭제한 뒤 추가해 줘.");
  comparisons.push({
    ...state,
    state,
    name: room.name,
    label: seatLabelInfo(config, row, seat).description,
    metrics: seatMetrics(config, row, seat),
    screen: room.screen_m.value,
    capacity: room.capacity.value,
    evidence: evidenceLabel(room.screen_m),
  });
  renderComparisons();
  announce("비교 목록에 담았어. 다른 좌석이나 상영관도 추가해 봐.");
}
function openComparison() {
  const body = $("#comparison-body");
  body.replaceChildren();
  for (const item of comparisons) {
    const tr = document.createElement("tr");
    const cells = [
      item.name,
      item.label,
      item.screen
        ? `${item.screen.join(" × ")} m (${item.evidence})`
        : "미확인 · 28 × 12 m 모델",
      `${item.metrics.distance.toFixed(1)} m`,
      `${item.metrics.horizontalAngle.toFixed(1)}°`,
      `${Math.abs(item.metrics.offset).toFixed(1)} m`,
      `${item.frontDistance} / ${item.pitch} / ${item.rise} m`,
    ];
    cells.forEach((v, i) => {
      const td = document.createElement(i === 0 ? "th" : "td");
      td.textContent = v;
      if (i === 0) td.scope = "row";
      tr.append(td);
    });
    const td = document.createElement("td"),
      b = document.createElement("button");
    b.textContent = "다시 보기";
    b.onclick = () => {
      $("#compare-dialog").close();
      restoreState(item.state);
    };
    td.append(b);
    tr.append(td);
    body.append(tr);
  }
  $("#compare-dialog").showModal();
}
let announcementTimer;
function announce(message) {
  text("#announcement", message);
  $("#announcement").hidden = false;
  clearTimeout(announcementTimer);
  announcementTimer = setTimeout(
    () => ($("#announcement").hidden = true),
    4500,
  );
}
function openPanel() {
  if (!matchMedia("(max-width: 760px)").matches) return;
  $("#app").classList.add("panel-visible");
  $("#stage").inert = true;
  $("#panel-backdrop").hidden = false;
  $("#sidebar").inert = false;
  $("#sidebar").setAttribute("role", "dialog");
  $("#sidebar").setAttribute("aria-modal", "true");
  $("#search").focus();
}
function closePanel() {
  $("#app").classList.remove("panel-visible");
  $("#stage").inert = false;
  $("#panel-backdrop").hidden = true;
  $("#sidebar").removeAttribute("role");
  $("#sidebar").removeAttribute("aria-modal");
  if (matchMedia("(max-width: 760px)").matches) {
    $("#sidebar").inert = true;
    $("#panel-open").focus();
  }
}
function adaptPanel() {
  $("#sidebar").inert =
    matchMedia("(max-width: 760px)").matches &&
    !$("#app").classList.contains("panel-visible");
  if (!matchMedia("(max-width: 760px)").matches) closePanel();
}
$("#sidebar").addEventListener("keydown", (e) => {
  if (!$("#app").classList.contains("panel-visible")) return;
  if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
    e.preventDefault();
    closePanel();
  }
  if (e.key === "Tab") {
    const focusable = [
      ...$("#sidebar").querySelectorAll(
        'a[href],button:not(:disabled),input,select,summary,[tabindex="0"]',
      ),
    ].filter((el) => el.offsetParent !== null && el.tabIndex !== -1);
    const first = focusable[0],
      last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

for (const [selector, values] of [
  ["#region-filter", [...new Set(rooms.map((r) => r.region))]],
  ["#format-filter", [...new Set(rooms.map((r) => r.format))]],
])
  for (const value of values) $(selector).add(new Option(value, value));
fillVenues();
try {
  cinema = createCinema($("#scene"), {
    screenElement: $("#screen-player"),
    onSeat: (r, s) => {
      row = r;
      seat = s;
      updateSeat();
    },
    onState: (s) => {
      currentMode = s.mode;
      text("#view-state", `${stateNames[s.mode]} · 드래그로 시선 이동`);
      $("#stage").dataset.mode = s.mode;
      $("#scene").dataset.camera = JSON.stringify(s.position);
      $("#scene").dataset.layout = String(s.layoutView);
      $$("button[data-mode]").forEach((b) => {
        b.classList.toggle("active", b.dataset.mode === s.mode);
        b.setAttribute("aria-pressed", String(b.dataset.mode === s.mode));
      });
      $(".walk-controls").hidden = s.mode !== "walk";
    },
    onContextChange: ({ lost }) => {
      if (lost)
        fallback(
          "3D 연결이 잠시 끊겼어. 좌석표로 계속 비교하거나 페이지를 새로고침해 줘.",
        );
      else {
        $("#stage").classList.remove("no-webgl");
        $("#engine-error").hidden = true;
        $$(
          "button[data-mode],#sit,#look-screen,#toggle-labels,#see-seats",
        ).forEach((b) => (b.disabled = false));
        updateVideoFit();
        framing?.setRatio(activeRatio);
      }
    },
    onError: () => fallback(),
  });
} catch {
  fallback();
}
loadRoom(initialState.room);
$("#venue").onchange = (e) => loadRoom(e.target.value);
$("#search").oninput = fillVenues;
$("#region-filter").onchange = fillVenues;
$("#format-filter").onchange = fillVenues;
$("#clear-search").onclick = clearFilters;
$("#empty-reset").onclick = clearFilters;
$("#row").onchange = (e) => chooseSeat(+e.target.value, seat);
$("#seat").onchange = (e) => chooseSeat(row, +e.target.value);
$("#sit").onclick = sit;
$$("button[data-mode]").forEach(
  (b) =>
    (b.onclick = () =>
      b.dataset.mode === "seat" ? sit() : setMode(b.dataset.mode)),
);
for (const id of ["front", "pitch", "rise"]) $("#" + id).oninput = calibrate;
$("#reset-model").onclick = () => resetCalibration();
$("#panel-open").onclick = openPanel;
$("#collapse").onclick = closePanel;
$("#panel-backdrop").onclick = closePanel;
matchMedia("(max-width: 760px)").addEventListener("change", adaptPanel);
adaptPanel();
$("#look-screen").onclick = () => cinema?.lookAtScreen();
$("#see-seats").onclick = () => {
  setMode("orbit");
  cinema?.showSeatLayout();
};
$("#toggle-labels").onclick = () => {
  const show = $("#toggle-labels").getAttribute("aria-pressed") !== "true";
  $("#toggle-labels").setAttribute("aria-pressed", String(show));
  text("#toggle-labels", show ? "의자 번호 켜짐" : "의자 번호 꺼짐");
  cinema?.setLabelsVisible(show);
};
$("#add-comparison").onclick = addComparison;
$("#compare-open").onclick = openComparison;
renderComparisons();
$$("[data-preset]").forEach(
  (b) =>
    (b.onclick = () => {
      row = Math.max(1, Math.round(config.rows * +b.dataset.preset));
      chooseSeat(row, Math.ceil(rowCount() / 2));
    }),
);
$("#share-view").onclick = () => {
  $("#share-url").value = stateURL(location.href, currentState());
  text("#share-status", "상영관·좌석·화면비·공간 가정이 함께 전달돼.");
  $("#share-dialog").showModal();
};
$("#copy-share").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("#share-url").value);
    text("#share-status", "링크를 복사했어. 원하는 곳에 붙여넣어 줘.");
  } catch {
    $("#share-url").focus();
    $("#share-url").select();
    text(
      "#share-status",
      "자동 복사를 사용할 수 없어. 선택된 주소를 직접 복사해 줘.",
    );
  }
};
$$("[data-close-dialog]").forEach(
  (b) => (b.onclick = () => $("#" + b.dataset.closeDialog).close()),
);

function loadAPI() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("API load failed"));
    };
    document.head.append(script);
    setTimeout(() => {
      if (!window.YT?.Player) {
        apiPromise = null;
        reject(new Error("API timed out"));
      }
    }, 15000);
  });
  return apiPromise;
}
function status(text) {
  $("#video-status").textContent = text;
}
async function openVideo(value) {
  const request = ++videoRequest;
  const id = parseVideo(value);
  if (!id) {
    status("올바른 YouTube 주소 또는 11자리 영상 ID를 입력해 줘");
    $("#video-url").setAttribute("aria-invalid", "true");
    return;
  }
  $("#video-url").removeAttribute("aria-invalid");
  $("#youtube-link").href = `https://www.youtube.com/watch?v=${id}`;
  $("#youtube-link").hidden = false;
  $("#close-video").hidden = false;
  status("YouTube 플레이어를 불러오는 중…");
  clearTimeout(videoTimeout);
  try {
    await loadAPI();
    if (request !== videoRequest) return;
    $("#screen-player").hidden = false;
    $("#fallback-comparison").hidden = true;
    updateVideoFit();
    $("#stage-framing-note").textContent =
      "YouTube 원본 비율 유지 · 원본에 없는 장면은 복원할 수 없어";
    pendingVideo = id;
    if (player) {
      if (playerReady) player.cueVideoById(id);
    } else {
      player = new YT.Player("youtube-player", {
        host: "https://www.youtube-nocookie.com",
        videoId: id,
        width: 1280,
        height: 720,
        playerVars: {
          playsinline: 1,
          controls: 1,
          rel: 0,
          origin: location.origin,
        },
        events: {
          onReady: () => {
            playerReady = true;
            if ($("#screen-player").hidden) {
              player.stopVideo();
              return;
            }
            if (pendingVideo && pendingVideo !== id)
              player.cueVideoById(pendingVideo);
            status("스크린의 재생 버튼을 눌러 줘 · 소리는 YouTube에서 조절해");
          },
          onStateChange: (e) => {
            if ($("#screen-player").hidden) return;
            if (e.data === YT.PlayerState.PLAYING) {
              clearTimeout(videoTimeout);
              status("재생 중 · 공식 YouTube 플레이어");
            } else if (e.data === YT.PlayerState.PAUSED) status("일시 정지");
            else if (e.data === YT.PlayerState.ENDED) status("영상이 끝났어");
            else if (e.data === YT.PlayerState.CUED)
              status("스크린의 재생 버튼을 눌러 줘");
          },
          onError: (e) => {
            if ($("#screen-player").hidden) return;
            clearTimeout(videoTimeout);
            const reason =
              {
                2: "유효하지 않은 영상",
                5: "HTML5 재생 오류",
                100: "삭제되었거나 비공개인 영상",
                101: "제작자가 퍼가기를 허용하지 않은 영상",
                150: "제작자가 퍼가기를 허용하지 않은 영상",
                153: "YouTube 재생 환경 인증 오류",
              }[e.data] || "재생 제한";
            status(`${reason} · YouTube에서 열기를 이용해 줘`);
          },
        },
      });
    }
    videoTimeout = setTimeout(
      () =>
        status(
          "재생되지 않으면 영상의 로그인·연령·퍼가기 제한을 확인하거나 YouTube에서 열어 줘",
        ),
      25000,
    );
  } catch {
    if (request !== videoRequest) return;
    status(
      "이 환경에서 YouTube를 불러오지 못했어 · YouTube에서 열기를 이용해 줘",
    );
  }
}
$("#video-form").onsubmit = (e) => {
  e.preventDefault();
  openVideo($("#video-url").value);
};
$("#sample-video").onclick = () => {
  $("#video-url").value =
    "https://www.youtube.com/watch?v=" + $("#sample-select").value;
  openVideo($("#video-url").value);
};
$("#close-video").onclick = () => {
  videoRequest++;
  pendingVideo = null;
  if (playerReady) player?.stopVideo();
  $("#screen-player").hidden = true;
  $("#fallback-comparison").hidden =
    !$("#stage").classList.contains("no-webgl");
  $("#stage-framing-note").textContent =
    "설명용 1.43 원본 · 같은 좌석과 카메라 유지";
  $("#close-video").hidden = true;
  clearTimeout(videoTimeout);
  status("영상을 닫았어 · 새 YouTube 주소를 입력할 수 있어");
};

// A captured analog pointer controls movement; a second canvas pointer controls looking.
const stick = $("#move-stick"),
  knob = $("#stick-knob");
let stickPointer = null,
  stickVector = { x: 0, z: 0 },
  stickRAF = 0,
  stickTime = 0;
const stickKeys = new Set();
function setStick(x, z, visualX = 0, visualY = 0) {
  stickVector = { x, z };
  stick.dataset.vectorX = x.toFixed(4);
  stick.dataset.vectorZ = z.toFixed(4);
  stick.dataset.active = String(Math.hypot(x, z) > 0);
  knob.style.transform = `translate(${visualX}px,${visualY}px)`;
  const mag = Math.hypot(x, z);
  if (mag > Number(stick.dataset.peakMagnitude || 0)) {
    stick.dataset.peakMagnitude = mag.toFixed(4);
    stick.dataset.peakX = x.toFixed(4);
    stick.dataset.peakZ = z.toFixed(4);
  }
  $("#movement-feedback").textContent =
    mag > 0
      ? cinema
        ? "끌어당긴 방향으로 이동 중"
        : "입력 확인 · 이 브라우저는 3D 이동 불가"
      : "놓으면 정지 · 시선은 화면 드래그";
  if (mag && !stickRAF) {
    stickTime = performance.now();
    stickRAF = requestAnimationFrame(moveStick);
  }
}
function moveStick(t) {
  const dt = Math.min(0.05, (t - stickTime) / 1000 || 0);
  stickTime = t;
  cinema?.move(stickVector.x * dt * 2.3, stickVector.z * dt * 2.3);
  if (Math.hypot(stickVector.x, stickVector.z) > 0)
    stickRAF = requestAnimationFrame(moveStick);
  else stickRAF = 0;
}
function resetStick() {
  stickPointer = null;
  stickKeys.clear();
  setStick(0, 0);
  if (stickRAF) cancelAnimationFrame(stickRAF);
  stickRAF = 0;
}
function updateStickPointer(e) {
  const r = stick.getBoundingClientRect(),
    radius = Math.max(20, (r.width - knob.offsetWidth) / 2 - 6);
  const dx = e.clientX - r.left - r.width / 2,
    dy = e.clientY - r.top - r.height / 2,
    len = Math.hypot(dx, dy),
    normal = Math.min(1, len / radius),
    magnitude = normal <= 0.14 ? 0 : (normal - 0.14) / 0.86;
  const unitX = len ? dx / len : 0,
    unitY = len ? dy / len : 0;
  setStick(
    unitX * magnitude,
    -unitY * magnitude,
    unitX * Math.min(len, radius),
    unitY * Math.min(len, radius),
  );
}
stick.addEventListener("pointerdown", (e) => {
  if (stickPointer !== null) return;
  e.preventDefault();
  e.stopPropagation();
  stickPointer = e.pointerId;
  stick.dataset.peakMagnitude = "0";
  stick.dataset.peakX = "0";
  stick.dataset.peakZ = "0";
  stick.setPointerCapture(e.pointerId);
  updateStickPointer(e);
});
stick.addEventListener("pointermove", (e) => {
  if (e.pointerId !== stickPointer) return;
  e.preventDefault();
  e.stopPropagation();
  updateStickPointer(e);
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  stick.addEventListener(type, (e) => {
    if (e.pointerId !== stickPointer) return;
    e.stopPropagation();
    resetStick();
  });
function keyboardStick() {
  const x =
    Number(stickKeys.has("d") || stickKeys.has("arrowright")) -
    Number(stickKeys.has("a") || stickKeys.has("arrowleft"));
  const z =
    Number(stickKeys.has("w") || stickKeys.has("arrowup")) -
    Number(stickKeys.has("s") || stickKeys.has("arrowdown"));
  const length = Math.max(1, Math.hypot(x, z));
  setStick(x / length, z / length, (x / length) * 30, (-z / length) * 30);
}
stick.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (
    ![
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ].includes(key)
  )
    return;
  e.preventDefault();
  e.stopPropagation();
  stickKeys.add(key);
  keyboardStick();
});
stick.addEventListener("keyup", (e) => {
  e.preventDefault();
  e.stopPropagation();
  stickKeys.delete(e.key.toLowerCase());
  keyboardStick();
});
stick.addEventListener("blur", resetStick);
window.addEventListener("blur", resetStick);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resetStick();
});
setStick(0, 0);
function updateVideoFit() {
  if (!config) return;
  const screenRatio = config.screenWidth / config.screenHeight;
  if ($("#stage").classList.contains("no-webgl")) {
    for (const el of [$("#screen-player"), $("#fallback-comparison")]) {
      el.style.width = `min(80%,${screenRatio * 38}vh)`;
      el.style.left = "50%";
      el.style.transform = "translateX(-50%)";
      el.style.aspectRatio = String(screenRatio);
      el.style.maxHeight = "none";
    }
  }
  if (!$("#stage").classList.contains("no-webgl")) {
    for (const el of [$("#screen-player"), $("#fallback-comparison")]) {
      el.style.removeProperty("max-height");
      el.style.removeProperty("aspect-ratio");
    }
  }
  const w = activeRatio > screenRatio ? 100 : (100 * activeRatio) / screenRatio;
  const h = activeRatio > screenRatio ? (100 * screenRatio) / activeRatio : 100;
  Object.assign($("#video-frame").style, {
    width: w + "%",
    height: h + "%",
    left: (100 - w) / 2 + "%",
    top: (100 - h) / 2 + "%",
  });
}
function applyScreenContent(url, meta) {
  activeRatio = meta.ratio;
  activeSource = meta.sourceRatio;
  syncURL();
  $$("[data-stage-ratio]").forEach((b) =>
    b.setAttribute(
      "aria-pressed",
      String(+b.dataset.stageRatio === activeRatio),
    ),
  );
  updateVideoFit();
  const request = ++textureRequest;
  const img = new Image();
  img.onload = () => {
    if (request !== textureRequest || !config) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1800;
    canvas.height = Math.round(
      (1800 * config.screenHeight) / config.screenWidth,
    );
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(
      canvas.width / img.width,
      canvas.height / img.height,
    );
    const w = img.width * scale,
      h = img.height * scale;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    const fitted = canvas.toDataURL("image/png");
    cinema?.setScreenImage(fitted);
    $("#fallback-comparison").src = fitted;
    $("#fallback-comparison").style.aspectRatio = String(
      config.screenWidth / config.screenHeight,
    );
    $("#fallback-comparison").hidden =
      !$("#stage").classList.contains("no-webgl") ||
      !$("#screen-player").hidden;
  };
  img.src = url;
}
$$("[data-stage-ratio]").forEach(
  (b) => (b.onclick = () => framing.setRatio(+b.dataset.stageRatio)),
);
$("#show-comparison").onclick = () => {
  videoRequest++;
  if (playerReady) player.stopVideo();
  $("#screen-player").hidden = true;
  $("#close-video").hidden = true;
  clearTimeout(videoTimeout);
  $("#fallback-comparison").hidden =
    !$("#stage").classList.contains("no-webgl");
  $("#stage-framing-note").textContent =
    "설명용 1.43 원본 · 같은 좌석과 카메라 유지";
  status("직접 만든 설명용 비교 장면이야");
};

framing = createFraming($("#framing-content"), {
  onTexture: applyScreenContent,
});
framing.setScreen(config.screenWidth, config.screenHeight);
$("#open-framing").onclick = () => $("#framing-dialog").showModal();
$("#close-framing").onclick = () => $("#framing-dialog").close();
initialized = true;
restoreState(initialState);
presence = createPresence({ onChange: renderVisitors });
updatePresence();
$("#presence-toggle").onclick = () => presence.toggle();
$("#presence-retry").onclick = () => presence.retry();
$("#new-party").onclick = () => {
  party = crypto.randomUUID().replaceAll("-", "");
  updatePresence();
  syncURL();
  $("#share-view").click();
};
$("#presence-badge").onclick = () => {
  openPanel();
  $("#presence-panel").scrollIntoView({ block: "center" });
};
$("#startup-status").hidden = true;
window.addEventListener("popstate", () =>
  restoreState(readState(location.search, rooms)),
);
window.addEventListener("pagehide", () => resetStick());
$("#zoom-map").onclick = () => {
  const expanded = $("#seatmap-scroll").classList.toggle("expanded");
  $("#zoom-map").setAttribute("aria-pressed", String(expanded));
  text("#zoom-map", expanded ? "전체 좌석표" : "좌석표 확대");
  $(".seat-dot.selected")?.scrollIntoView({
    block: "nearest",
    inline: "center",
  });
};
