/* Mendoza Family Registry — client app.
   Vanilla JS, hash-routed, reads pre-computed JSON. No build step. */

(function () {
  "use strict";

  const view = document.getElementById("view");
  let DATA = null; // data.json (individuals, families)
  let TREE = null; // tree.json (nodes with gen/x, edges)

  const X_SPACING = 200;
  const ROW_HEIGHT = 160;
  const CARD_W = 176;
  const TOP_PAD = 30;
  const LEFT_PAD = 70;

  function fmtYear(dateStr) {
    if (!dateStr) return null;
    const m = dateStr.match(/\d{4}/);
    return m ? m[0] : dateStr;
  }

  function fmtDate(evt) {
    if (!evt) return null;
    const parts = [];
    if (evt.date) parts.push(evt.date);
    if (evt.place) parts.push(evt.place);
    return parts.join(" — ") || null;
  }

  function lifeSpan(person) {
    const b = person.birth ? fmtYear(person.birth.date) : null;
    const d = person.death ? fmtYear(person.death.date) : null;
    if (b && d) return `${b}–${d}`;
    if (b) return `b. ${b}`;
    if (d) return `d. ${d}`;
    return "dates unknown";
  }

  function personById(id) {
    return DATA.individuals[id];
  }

  function familyById(id) {
    return DATA.families[id];
  }

  // ---------------- Router ----------------

  function route() {
    const hash = window.location.hash || "#/tree";
    const parts = hash.replace(/^#\//, "").split("/");
    document.querySelectorAll(".nav-link").forEach((a) => a.classList.remove("active"));

    if (parts[0] === "person" && parts[1]) {
      renderProfile(parts[1]);
    } else if (parts[0] === "index") {
      document.querySelector('[data-nav="index"]').classList.add("active");
      renderIndex();
    } else {
      document.querySelector('[data-nav="tree"]').classList.add("active");
      renderTree();
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", route);

  // ---------------- Tree view ----------------

  function renderTree() {
    const nodes = TREE.nodes;
    const maxGen = TREE.maxGen;
    const maxX = Math.max(...nodes.map((n) => n.x));
    const width = LEFT_PAD + (maxX + 1) * X_SPACING + 40;
    const height = TOP_PAD + (maxGen + 1) * ROW_HEIGHT + 40;

    let genLabels = "";
    for (let g = 0; g <= maxGen; g++) {
      genLabels += `<div class="gen-label" style="top:${TOP_PAD + g * ROW_HEIGHT + 4}px;">Gen ${g + 1}</div>`;
    }

    let cardsHtml = "";
    const nodeById = {};
    nodes.forEach((n) => (nodeById[n.id] = n));

    nodes.forEach((n) => {
      const left = LEFT_PAD + n.x * X_SPACING;
      const top = TOP_PAD + n.gen * ROW_HEIGHT;
      const sexClass = n.sex === "M" ? "male" : n.sex === "F" ? "female" : "";
      const span = lifeSpanFromNode(n);
      cardsHtml += `<div class="person-card ${sexClass}" style="left:${left}px; top:${top}px; width:${CARD_W}px;" data-id="${n.id}">
        <p class="pc-name">${n.name}</p>
        <p class="pc-dates">${span}</p>
      </div>`;
    });

    // build SVG line layer
    let lines = "";
    TREE.edges.spouse.forEach((e) => {
      const a = nodeById[e.a], b = nodeById[e.b];
      if (!a || !b) return;
      const y = TOP_PAD + a.gen * ROW_HEIGHT + 30;
      const x1 = LEFT_PAD + a.x * X_SPACING + CARD_W;
      const x2 = LEFT_PAD + b.x * X_SPACING;
      lines += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="edge-spouse" />`;
    });

    TREE.edges.parentChild.forEach((e) => {
      const child = nodeById[e.child];
      if (!child || e.parentMidX === null || e.parentMidX === undefined) return;
      const parentY = TOP_PAD + e.parentGen * ROW_HEIGHT + 30;
      const parentX = LEFT_PAD + e.parentMidX * X_SPACING + CARD_W / 2;
      const childX = LEFT_PAD + child.x * X_SPACING + CARD_W / 2;
      const childY = TOP_PAD + child.gen * ROW_HEIGHT;
      const midY = (parentY + childY) / 2;
      lines += `<path d="M ${parentX} ${parentY} V ${midY} H ${childX} V ${childY}" class="edge-parent" />`;
    });

    view.innerHTML = `
      <div class="tree-scroll">
        <div class="tree-canvas" style="width:${width}px; height:${height}px;">
          <svg class="lines" width="${width}" height="${height}">
            ${lines}
          </svg>
          ${genLabels}
          ${cardsHtml}
        </div>
      </div>
      <style>
        .edge-spouse { stroke: var(--stamp-red-dim); stroke-width: 2; }
        .edge-parent { stroke: var(--brass-dim); stroke-width: 1.5; fill: none; }
      </style>
    `;

    view.querySelectorAll(".person-card").forEach((card) => {
      card.addEventListener("click", () => {
        window.location.hash = `#/person/${card.dataset.id}`;
      });
    });
  }

  function lifeSpanFromNode(n) {
    const b = n.birth ? fmtYear(n.birth.date) : null;
    const d = n.death ? fmtYear(n.death.date) : null;
    if (b && d) return `${b}–${d}`;
    if (b) return `b. ${b}`;
    if (d) return `d. ${d}`;
    return "&mdash;";
  }

  // ---------------- Index view ----------------

  function renderIndex() {
    const people = Object.values(DATA.individuals).sort((a, b) =>
      (a.surname || "").localeCompare(b.surname || "") || a.name.localeCompare(b.name)
    );
    const cards = people
      .map((p) => {
        const sexClass = p.sex === "M" ? "male" : p.sex === "F" ? "female" : "";
        return `<div class="index-card ${sexClass}" data-id="${p.id}">
          <p class="ic-name">${p.name}</p>
          <p class="ic-dates">${lifeSpan(p)}</p>
        </div>`;
      })
      .join("");
    view.innerHTML = `<div class="index-grid">${cards}</div>`;
    view.querySelectorAll(".index-card").forEach((card) => {
      card.addEventListener("click", () => {
        window.location.hash = `#/person/${card.dataset.id}`;
      });
    });
  }

  // ---------------- Profile view ----------------

  function renderProfile(id) {
    const person = personById(id);
    if (!person) {
      view.innerHTML = `<div class="empty-state">No record found for that person.</div>`;
      return;
    }

    const birthYear = person.birth ? fmtYear(person.birth.date) : null;
    const deathYear = person.death ? fmtYear(person.death.date) : null;

    // parents
    let parentsHtml = "";
    (person.famc || []).forEach((fid) => {
      const f = familyById(fid);
      if (!f) return;
      [f.husb, f.wife].forEach((pid) => {
        if (pid && personById(pid)) {
          parentsHtml += `<a class="chip" href="#/person/${pid}">${personById(pid).name}</a>`;
        }
      });
    });

    // spouses + children grouped by family
    let unionsHtml = "";
    (person.fams || []).forEach((fid) => {
      const f = familyById(fid);
      if (!f) return;
      const spouseId = f.husb === id ? f.wife : f.husb;
      const spouse = spouseId ? personById(spouseId) : null;
      const spouseChip = spouse
        ? `<a class="chip" href="#/person/${spouseId}">${spouse.name}</a>`
        : `<span class="chip">(unrecorded)</span>`;
      const marrLine = f.marriage ? `<p class="note-block">Married ${fmtDate(f.marriage) || ""}${f.divorced ? " · later divorced" : ""}</p>` : (f.divorced ? `<p class="note-block">Divorced</p>` : "");
      const kids = (f.children || [])
        .filter((cid) => personById(cid))
        .map((cid) => `<a class="chip" href="#/person/${cid}">${personById(cid).name}</a>`)
        .join("");
      unionsHtml += `
        <div class="profile-section">
          <h3>Union</h3>
          <div class="chip-list">${spouseChip}</div>
          ${marrLine}
          ${kids ? `<p class="field-label" style="margin-top:10px;">Children</p><div class="chip-list" style="margin-top:6px;">${kids}</div>` : ""}
        </div>`;
    });

    const notesHtml = (person.notes || [])
      .filter(Boolean)
      .map((n) => `<p class="note-block">${n}</p>`)
      .join("");

    const residencesHtml = (person.residences || [])
      .filter((r) => r.date || r.place)
      .map((r) => `<div class="field-row"><span class="field-label">Residence</span><span class="field-value">${[r.date, r.place].filter(Boolean).join(" — ")}</span></div>`)
      .join("");

    view.innerHTML = `
      <a href="#/tree" class="back-link">&larr; Back to tree</a>
      <div class="profile">
        <div class="profile-header">
          <div>
            <h2>${person.name}</h2>
            <p class="profile-sub">${person.sex === "M" ? "Male" : person.sex === "F" ? "Female" : "Sex unrecorded"} &middot; ${lifeSpan(person)}</p>
          </div>
          <div class="stamp">
            <span>
              ${birthYear ? `<span class="stamp-year">${birthYear}</span>REGISTRO` : "SEM<br>DATA"}
            </span>
          </div>
        </div>

        <div class="profile-section">
          <h3>Vital Record</h3>
          ${person.birth ? `<div class="field-row"><span class="field-label">Born</span><span class="field-value">${fmtDate(person.birth)}</span></div>` : ""}
          ${person.death ? `<div class="field-row"><span class="field-label">Died</span><span class="field-value">${fmtDate(person.death)}</span></div>` : ""}
          ${residencesHtml}
          ${!person.birth && !person.death && !residencesHtml ? `<p class="note-block">No vital details recorded.</p>` : ""}
        </div>

        ${parentsHtml ? `<div class="profile-section"><h3>Parents</h3><div class="chip-list">${parentsHtml}</div></div>` : ""}

        ${unionsHtml || ""}

        ${notesHtml ? `<div class="profile-section"><h3>Notes</h3>${notesHtml}</div>` : ""}
      </div>
    `;
  }

  // ---------------- Search ----------------

  function setupSearch() {
    const input = document.getElementById("search-input");
    const results = document.getElementById("search-results");

    function doSearch() {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        results.hidden = true;
        results.innerHTML = "";
        return;
      }
      const matches = Object.values(DATA.individuals)
        .filter((p) => p.name.toLowerCase().includes(q))
        .slice(0, 12);
      results.innerHTML = matches.length
        ? matches.map((p) => `<a href="#/person/${p.id}">${p.name} <span style="color:var(--text-soft); font-size:12px;">(${lifeSpan(p)})</span></a>`).join("")
        : `<div class="sr-empty">No matches</div>`;
      results.hidden = false;
    }

    input.addEventListener("input", doSearch);
    input.addEventListener("focus", doSearch);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-wrap")) results.hidden = true;
    });
    results.addEventListener("click", () => {
      results.hidden = true;
      input.value = "";
    });
  }

  // ---------------- Boot ----------------

  Promise.all([
    fetch("data/data.json").then((r) => r.json()),
    fetch("data/tree.json").then((r) => r.json()),
  ])
    .then(([data, tree]) => {
      DATA = data;
      TREE = tree;
      setupSearch();
      route();
    })
    .catch((err) => {
      view.innerHTML = `<div class="empty-state">Could not load family records.<br>${err}</div>`;
      console.error(err);
    });
})();
