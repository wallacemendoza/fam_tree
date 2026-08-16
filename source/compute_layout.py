#!/usr/bin/env python3
"""Assign a generation (row) and an x-order to every individual so the
tree can be drawn as a layered graph, then write tree.json for the site."""
import json
from collections import defaultdict, deque

data = json.load(open("data.json", encoding="utf-8"))
ind = data["individuals"]
fam = data["families"]

# ---------- 1. Generation assignment (BFS across the whole connected graph) ----------
gen = {}
start = next(iter(ind))  # any individual; graph is connected
gen[start] = 0
q = deque([start])
while q:
    pid = q.popleft()
    g = gen[pid]
    p = ind[pid]
    # spouses: same generation
    for fid in p["fams"]:
        f = fam[fid]
        for spouse in (f["husb"], f["wife"]):
            if spouse and spouse != pid and spouse not in gen:
                gen[spouse] = g
                q.append(spouse)
        # children: generation + 1
        for c in f["children"]:
            if c not in gen:
                gen[c] = g + 1
                q.append(c)
    # parents: generation - 1
    for fid in p["famc"]:
        f = fam[fid]
        for parent in (f["husb"], f["wife"]):
            if parent and parent not in gen:
                gen[parent] = g - 1
                q.append(parent)

missing = [i for i in ind if i not in gen]
for m in missing:
    gen[m] = 0  # isolated fallback (shouldn't happen with this dataset)

min_gen = min(gen.values())
for k in gen:
    gen[k] -= min_gen  # normalize so earliest generation = 0

max_gen = max(gen.values())

# ---------- 2. Group into generation rows ----------
rows = defaultdict(list)
for pid, g in gen.items():
    rows[g].append(pid)

# ---------- 3. Initial x-order: keep spouse pairs adjacent, seed via BFS order ----------
order_seen = list(gen.keys())  # BFS insertion order approximates relatedness
seen_rank = {pid: i for i, pid in enumerate(order_seen)}

x = {}  # pid -> float x position (order index within its row, spacing applied later)

for g in range(0, max_gen + 1):
    members = rows[g]
    # cluster spouse pairs: use each family once per couple, else standalone
    placed = set()
    clusters = []  # list of lists of pids (couple together, or single)
    for pid in sorted(members, key=lambda p: seen_rank[p]):
        if pid in placed:
            continue
        person = ind[pid]
        partner = None
        for fid in person["fams"]:
            f = fam[fid]
            other = f["wife"] if f["husb"] == pid else (f["husb"] if f["wife"] == pid else None)
            if other and gen.get(other) == g and other not in placed:
                partner = other
                break
        if partner:
            clusters.append([pid, partner])
            placed.add(pid)
            placed.add(partner)
        else:
            clusters.append([pid])
            placed.add(pid)
    rows[g] = clusters  # replace with clustered form

# ---------- 4. Barycenter ordering passes (top-down then bottom-up), a few iterations ----------
def cluster_key_for_row(g):
    return rows[g]

def child_family_ids_of_cluster(cluster):
    """All family ids where this cluster's member(s) are spouse(s)."""
    fids = set()
    for pid in cluster:
        fids.update(ind[pid]["fams"])
    return fids

def parent_family_ids_of_cluster(cluster):
    fids = set()
    for pid in cluster:
        fids.update(ind[pid]["famc"])
    return fids

# assign initial cluster order index per row
cluster_order = {}
for g in range(0, max_gen + 1):
    for i, cl in enumerate(rows[g]):
        cluster_order[tuple(cl)] = i

def cluster_of(pid, g):
    for cl in rows[g]:
        if pid in cl:
            return cl
    return None

for iteration in range(4):
    direction = range(1, max_gen + 1) if iteration % 2 == 0 else range(max_gen - 1, -1, -1)
    for g in direction:
        neighbor_gen = g - 1 if iteration % 2 == 0 else g + 1
        if neighbor_gen < 0 or neighbor_gen > max_gen:
            continue
        scored = []
        for cl in rows[g]:
            neighbor_positions = []
            fids = parent_family_ids_of_cluster(cl) if iteration % 2 == 0 else child_family_ids_of_cluster(cl)
            for fid in fids:
                f = fam[fid]
                related_people = (f["husb"], f["wife"]) if iteration % 2 == 0 else f["children"]
                for rp in (related_people if isinstance(related_people, list) else [x for x in related_people if x]):
                    if rp and gen.get(rp) == neighbor_gen:
                        ncl = cluster_of(rp, neighbor_gen)
                        if ncl:
                            neighbor_positions.append(cluster_order[tuple(ncl)])
            bary = sum(neighbor_positions) / len(neighbor_positions) if neighbor_positions else cluster_order[tuple(cl)]
            scored.append((bary, cluster_order[tuple(cl)], cl))
        scored.sort(key=lambda t: (t[0], t[1]))
        rows[g] = [cl for _, _, cl in scored]
        for i, cl in enumerate(rows[g]):
            cluster_order[tuple(cl)] = i

# ---------- 5. Final x assignment (spacing = 1 unit per person slot) ----------
SPACING = 1.0
for g in range(0, max_gen + 1):
    cursor = 0.0
    for cl in rows[g]:
        for pid in cl:
            x[pid] = cursor
            cursor += SPACING
        cursor += 0.15  # small gap after each cluster (couple or single)

# ---------- 6. Build output nodes + edges ----------
nodes = []
for pid, person in ind.items():
    nodes.append({
        "id": pid,
        "name": person["name"],
        "given": person["given"],
        "surname": person["surname"],
        "sex": person["sex"],
        "gen": gen[pid],
        "x": round(x[pid], 3),
        "birth": person["birth"],
        "death": person["death"],
    })

edges = {"spouse": [], "parentChild": []}
for fid, f in fam.items():
    if f["husb"] and f["wife"]:
        edges["spouse"].append({"a": f["husb"], "b": f["wife"], "famId": fid})
    parents = [p for p in (f["husb"], f["wife"]) if p]
    if parents:
        mid_x = sum(x[p] for p in parents) / len(parents)
        mid_gen = gen[parents[0]]
    else:
        mid_x, mid_gen = None, None
    for c in f["children"]:
        if c in ind:
            edges["parentChild"].append({
                "famId": fid,
                "parents": parents,
                "parentMidX": mid_x,
                "parentGen": mid_gen,
                "child": c,
            })

out = {"nodes": nodes, "edges": edges, "maxGen": max_gen}
json.dump(out, open("tree.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print(f"Wrote tree.json: {len(nodes)} nodes, {len(edges['spouse'])} spouse edges, {len(edges['parentChild'])} parent-child edges, {max_gen+1} generations")
