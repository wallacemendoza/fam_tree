/* Mendoza Family Registry — client app.
   Vanilla JS, hash-routed, reads pre-computed JSON. No build step. */

(function () {
  "use strict";

  const view = document.getElementById("view");
  let DATA = null; // data.json (individuals, families)
  let TREE = null; // tree.json (nodes with gen/x, edges)

  const X_SPACING = 236;
  const ROW_HEIGHT = 190;
  const CARD_W = 204;
  const CARD_H = 82;
  const TOP_PAD = 86;
  const LEFT_PAD = 210;
  const MIN_SCALE = 0.22;
  const MAX_SCALE = 2;
  const collapsedBranches = new Set();
  let focusedPersonId = null;

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

  function getAncestors(personId) {
    const ancestors = new Set([personId]);
    const queue = [personId];
    while (queue.length > 0) {
      const currentId = queue.shift();
      // Find all parent-child relationships where currentId is the child
      TREE.edges.parentChild.forEach((edge) => {
        if (edge.child === currentId) {
          // This edge shows the parents of currentId
          edge.parents.forEach((parentId) => {
            if (!ancestors.has(parentId)) {
              ancestors.add(parentId);
              queue.push(parentId);
            }
          });
        }
      });
    }
    return ancestors;
  }

  // Two-color system: blue gradient for male, pink gradient for female,
  // neutral gray gradient when sex is unrecorded.
  function avatarGradient(sex) {
    if (sex === "M") return "linear-gradient(135deg, #38bdf8, #6366f1)";
    if (sex === "F") return "linear-gradient(135deg, #f472b6, #d946ef)";
    return "linear-gradient(135deg, #6b7280, #4b5563)";
  }

  function initialsOf(person) {
    return (person.given || person.name).split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
  }

  function familyById(id) {
    return DATA.families[id];
  }

  // ---------------- Router ----------------

  function route() {
    const hash = window.location.hash || "#/tree";
    const parts = hash.replace(/^#\//, "").split("/");
    document.querySelectorAll(".nav-link").forEach((a) => a.classList.remove("active"));

    document.body.classList.toggle("tree-route", parts[0] === "tree" || !parts[0]);
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
    const allNodes = TREE.nodes;
    const childrenByParent = new Map();
    TREE.edges.parentChild.forEach((edge) => {
      edge.parents.forEach((parentId) => {
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, new Set());
        childrenByParent.get(parentId).add(edge.child);
      });
    });

    const hiddenIds = new Set();
    function hideDescendants(id) {
      (childrenByParent.get(id) || []).forEach((childId) => {
        if (hiddenIds.has(childId)) return;
        hiddenIds.add(childId);
        hideDescendants(childId);
      });
    }
    collapsedBranches.forEach(hideDescendants);

    if (focusedPersonId) {
      const ancestorIds = getAncestors(focusedPersonId);
      allNodes.forEach((node) => {
        if (!ancestorIds.has(node.id)) hiddenIds.add(node.id);
      });
    }

    const nodes = allNodes.filter((node) => !hiddenIds.has(node.id));
    const maxGen = TREE.maxGen;
    const minGen = Math.min(...nodes.map((n) => n.gen));
    const maxGenVisible = Math.max(...nodes.map((n) => n.gen));

    // If a person is focused, reorganize visible nodes into a compact layout
    if (focusedPersonId) {
      const nodesByGen = {};
      nodes.forEach(n => {
        if (!nodesByGen[n.gen]) nodesByGen[n.gen] = [];
        nodesByGen[n.gen].push(n);
      });

      Object.keys(nodesByGen).forEach(gen => {
        nodesByGen[gen].forEach((n, idx) => {
          n.x = idx * 1.0;
        });
      });
    }

    const maxX = Math.max(0, ...nodes.map((n) => n.x));
    const width = LEFT_PAD + (maxX + 1) * X_SPACING + 100;
    const height = TOP_PAD + (maxGenVisible - minGen + 1) * ROW_HEIGHT + 100;

    let genLabels = "";
    for (let g = minGen; g <= maxGenVisible; g++) {
      const top = TOP_PAD + (g - minGen) * ROW_HEIGHT + 28;
      genLabels += `<div class="gen-label" style="top:${top}px;"><span>${String(Math.abs(g)).padStart(2, "0")}</span> Generation${g < 0 ? " (Ancestors)" : ""}</div>`;
    }

    let cardsHtml = "";
    const nodeById = {};
    nodes.forEach((n) => (nodeById[n.id] = n));

    nodes.forEach((n) => {
      const left = LEFT_PAD + n.x * X_SPACING;
      const top = TOP_PAD + n.gen * ROW_HEIGHT;
      const sexClass = n.sex === "M" ? "male" : n.sex === "F" ? "female" : "";
      const span = lifeSpanFromNode(n);
      const hasChildren = childrenByParent.has(n.id);
      const isCollapsed = collapsedBranches.has(n.id);
      const initials = initialsOf(n);
      cardsHtml += `<article class="person-card ${sexClass}" style="left:${left}px; top:${top}px; width:${CARD_W}px;" data-id="${n.id}" tabindex="0" role="button" aria-label="Open ${n.name}">
        <div class="pc-avatar" aria-hidden="true" style="background:${avatarGradient(n.sex)};">${initials}</div>
        <div class="pc-copy"><p class="pc-name">${n.name}</p><p class="pc-dates">${span}</p></div>
        ${hasChildren ? `<button class="branch-toggle" type="button" aria-label="${isCollapsed ? "Expand" : "Collapse"} descendants" aria-expanded="${!isCollapsed}">${isCollapsed ? "+" : "-"}</button>` : ""}
      </article>`;
    });

    // build SVG line layer
    let lines = `<defs>
      <linearGradient id="gradSpouse" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#f472b6" /><stop offset="1" stop-color="#8b5cf6" />
      </linearGradient>
      <linearGradient id="gradParent" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8b5cf6" /><stop offset="1" stop-color="#22d3ee" />
      </linearGradient>
    </defs>`;
    TREE.edges.spouse.forEach((e) => {
      const a = nodeById[e.a], b = nodeById[e.b];
      if (!a || !b) return;
      const y = TOP_PAD + a.gen * ROW_HEIGHT + CARD_H / 2;
      const x1 = LEFT_PAD + a.x * X_SPACING + CARD_W;
      const x2 = LEFT_PAD + b.x * X_SPACING;
      lines += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="edge-spouse" />`;
    });

    // Parent -> child connectors: drawn as a V — one curve from EACH actual
    // parent down to a shared junction, then one curve from the junction to
    // the child. A single line from a computed "midpoint" can visually land
    // on top of an unrelated card when a parent has more than one marriage
    // (their two spouses can be far apart in the row); tracing two lines
    // back to two named cards removes that ambiguity.
    TREE.edges.parentChild.forEach((e) => {
      const child = nodeById[e.child];
      if (!child) return;
      const presentParents = e.parents.map((id) => nodeById[id]).filter(Boolean);
      if (presentParents.length === 0) return;

      const parentRowY = TOP_PAD + presentParents[0].gen * ROW_HEIGHT + CARD_H;
      const childX = LEFT_PAD + child.x * X_SPACING + CARD_W / 2;
      const childY = TOP_PAD + child.gen * ROW_HEIGHT;
      const parentXs = presentParents.map((p) => LEFT_PAD + p.x * X_SPACING + CARD_W / 2);
      const junctionX = parentXs.reduce((a, b) => a + b, 0) / parentXs.length;
      const junctionY = parentRowY + (childY - parentRowY) * 0.4;
      const isAdopted = e.adoptionStatus === "adopted";
      const edgeClass = isAdopted ? "edge-parent edge-adopted" : "edge-parent";

      parentXs.forEach((px) => {
        const midY = parentRowY + (junctionY - parentRowY) * 0.55;
        lines += `<path d="M ${px} ${parentRowY} C ${px} ${midY}, ${junctionX} ${midY}, ${junctionX} ${junctionY}" class="${edgeClass}" />`;
      });
      const childMidY = junctionY + (childY - junctionY) * 0.6;
      lines += `<path d="M ${junctionX} ${junctionY} C ${junctionX} ${childMidY}, ${childX} ${childMidY}, ${childX} ${childY}" class="${edgeClass}" />`;
      lines += `<circle cx="${junctionX}" cy="${junctionY}" r="3" class="edge-junction${isAdopted ? " edge-adopted" : ""}" />`;
    });

    view.innerHTML = `
      <section class="tree-workspace" aria-label="Interactive family tree">
        <div class="tree-toolbar">
          <div class="tree-heading"><span class="tree-kicker">Family lineage</span><strong>${nodes.length}</strong> of ${allNodes.length} people</div>
          <div class="zoom-controls" aria-label="Canvas controls">
            <button type="button" data-action="zoom-out" title="Zoom out" aria-label="Zoom out">-</button>
            <output class="zoom-level" aria-live="polite">100%</output>
            <button type="button" data-action="zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
            <button type="button" class="fit-button" data-action="fit" title="Fit tree to screen">Fit</button>
            ${focusedPersonId ? `<button type="button" data-action="clear-focus" title="Show all people" style="margin-left:12px;">✕ Clear filter</button>` : ""}
          </div>
        </div>
        <div class="tree-viewport">
          <div class="gen-rail" aria-hidden="true">${genLabels}</div>
          <div class="tree-canvas" style="width:${width}px; height:${height}px;">
          <svg class="lines" width="${width}" height="${height}" aria-hidden="true">
            ${lines}
          </svg>
          ${cardsHtml}
          </div>
        </div>
        <div class="canvas-hint">Drag to move <span></span> Scroll to zoom</div>
        <aside class="person-drawer" aria-live="polite" aria-label="Person details"></aside>
      </section>
    `;

    const focusNode = allNodes.find((node) => node.id === "@I152503363274@") || nodes[Math.floor(nodes.length / 2)];
    setupTreeInteraction({ width, height, focusNode });
  }

  function setupTreeInteraction(bounds) {
    const workspace = view.querySelector(".tree-workspace");
    const viewport = view.querySelector(".tree-viewport");
    const canvas = view.querySelector(".tree-canvas");
    const rail = view.querySelector(".gen-rail");
    const zoomOutput = view.querySelector(".zoom-level");
    const drawer = view.querySelector(".person-drawer");
    let transform = { x: 0, y: 0, scale: 1 };
    let pointer = null;
    let moved = false;

    function applyTransform(animate) {
      canvas.classList.toggle("is-animating", Boolean(animate));
      canvas.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
      if (rail) rail.style.transform = `translate3d(0, ${transform.y}px, 0) scale(${transform.scale})`;
      zoomOutput.value = `${Math.round(transform.scale * 100)}%`;
      zoomOutput.textContent = zoomOutput.value;
      if (animate) window.setTimeout(() => canvas.classList.remove("is-animating"), 320);
    }

    function fitTree(animate = true) {
      const rect = viewport.getBoundingClientRect();
      const padding = rect.width < 600 ? 28 : 72;
      const scale = Math.min((rect.width - padding * 2) / bounds.width, (rect.height - padding * 2) / bounds.height, 1.05);
      transform.scale = Math.max(MIN_SCALE, scale);
      transform.x = (rect.width - bounds.width * transform.scale) / 2;
      transform.y = (rect.height - bounds.height * transform.scale) / 2;
      applyTransform(animate);
    }

    function centerTree(animate = true) {
      const rect = viewport.getBoundingClientRect();
      transform.scale = rect.width < 700 ? 0.64 : 0.76;
      const focusX = LEFT_PAD + bounds.focusNode.x * X_SPACING + CARD_W / 2;
      transform.x = rect.width / 2 - focusX * transform.scale;
      transform.y = Math.max(12, Math.min(30, rect.height * 0.025));
      applyTransform(animate);
    }

    function zoomAt(nextScale, clientX, clientY, animate = false) {
      const rect = viewport.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
      const worldX = (px - transform.x) / transform.scale;
      const worldY = (py - transform.y) / transform.scale;
      transform.x = px - worldX * scale;
      transform.y = py - worldY * scale;
      transform.scale = scale;
      applyTransform(animate);
    }

    viewport.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y, target: event.target };
      moved = false;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("is-panning");
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      moved = moved || Math.abs(dx) + Math.abs(dy) > 5;
      transform.x = pointer.tx + dx;
      transform.y = pointer.ty + dy;
      applyTransform(false);
    });
    function endPan(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const wasMoved = moved;
      const originTarget = pointer.target;
      pointer = null;
      viewport.classList.remove("is-panning");
      // Pointer capture (set above) retargets the native 'click' event away
      // from the card, so tap/click selection is resolved right here using
      // the element that was actually under the pointer at pointerdown.
      if (wasMoved || !originTarget) return;
      const card = originTarget.closest(".person-card");
      if (!card) return;
      selectTreePerson(card.dataset.id, drawer);
      renderTree();
      fitTree();
      canvas.querySelectorAll(".person-card").forEach((item) => item.classList.toggle("selected", item === card));
    }
    viewport.addEventListener("pointerup", endPan);
    viewport.addEventListener("pointercancel", endPan);
    viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoomAt(transform.scale * Math.exp(-event.deltaY * 0.0013), event.clientX, event.clientY);
    }, { passive: false });

    workspace.querySelector(".zoom-controls").addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.action;
      const rect = viewport.getBoundingClientRect();
      if (action === "fit") fitTree();
      if (action === "zoom-in") zoomAt(transform.scale * 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2, true);
      if (action === "zoom-out") zoomAt(transform.scale / 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2, true);
      if (action === "clear-focus") {
        focusedPersonId = null;
        renderTree();
        fitTree();
      }
    });

    // Branch-toggle buttons are excluded from pointer capture above (they're
    // real <button> elements), so a normal 'click' still fires for them.
    canvas.addEventListener("click", (event) => {
      const toggle = event.target.closest(".branch-toggle");
      if (!toggle) return;
      const card = event.target.closest(".person-card");
      if (!card) return;
      collapsedBranches.has(card.dataset.id) ? collapsedBranches.delete(card.dataset.id) : collapsedBranches.add(card.dataset.id);
      renderTree();
    });
    canvas.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && event.target.matches(".person-card")) {
        event.preventDefault();
        selectTreePerson(event.target.dataset.id, drawer);
        renderTree();
      }
    });
    drawer.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-drawer]")) drawer.classList.remove("open");
    });
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => fitTree(), 120);
    }, { once: true });
    requestAnimationFrame(() => centerTree(false));
  }

  function selectTreePerson(id, drawer) {
    focusedPersonId = id;
    const person = personById(id);
    if (!person) return;
    const parentNames = (person.famc || []).flatMap((fid) => {
      const family = familyById(fid);
      return family ? [family.husb, family.wife].filter(Boolean).map((pid) => personById(pid)?.name).filter(Boolean) : [];
    });
    const relatives = (person.fams || []).reduce((count, fid) => count + (familyById(fid)?.children.length || 0), 0);
    drawer.innerHTML = `<button class="drawer-close" type="button" data-close-drawer aria-label="Close details">x</button>
      <div class="drawer-avatar" style="background:${avatarGradient(person.sex)};">${initialsOf(person)}</div>
      <p class="drawer-label">Family record</p><h2>${person.name}</h2><p class="drawer-lifespan">${lifeSpan(person)}</p>
      ${person.birth ? `<div class="drawer-field"><span>Born</span><strong>${fmtDate(person.birth)}</strong></div>` : ""}
      ${person.death ? `<div class="drawer-field"><span>Died</span><strong>${fmtDate(person.death)}</strong></div>` : ""}
      ${parentNames.length ? `<div class="drawer-field"><span>Parents</span><strong>${parentNames.join(" & ")}</strong></div>` : ""}
      ${relatives ? `<div class="drawer-field"><span>Children</span><strong>${relatives}</strong></div>` : ""}
      <a class="drawer-profile-link" href="#/person/${id}">View complete record <span aria-hidden="true">-&gt;</span></a>`;
    drawer.classList.add("open");
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
          <div class="ic-avatar" style="background:${avatarGradient(p.sex)};">${initialsOf(p)}</div>
          <div class="ic-copy"><p class="ic-name">${p.name}</p><p class="ic-dates">${lifeSpan(p)}</p></div>
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
    let partnersHtml = "";
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
      partnersHtml += `
        <div class="profile-section">
          <h3>Partner</h3>
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
          <div class="stamp" style="background:${avatarGradient(person.sex)};">
            <span>
              ${birthYear ? `<span class="stamp-year">${birthYear}</span>BORN` : "NO<br>DATE"}
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

        ${partnersHtml || ""}

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
