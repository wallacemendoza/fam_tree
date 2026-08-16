#!/usr/bin/env python3
"""Parse the Mendoza family tree GEDCOM export into structured JSON
for the static site (individuals.json)."""
import json
import re
from collections import defaultdict

GEDCOM_PATH = "Mendoza Family Tree.ged"

def parse_lines(path):
    records = []  # list of (level, tag, xref, value)
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.rstrip("\n").rstrip("\r")
            if not line.strip():
                continue
            m = re.match(r"^(\d+)\s+(@[^@]+@\s+)?(\S+)(\s+(.*))?$", line)
            if not m:
                continue
            level = int(m.group(1))
            xref = m.group(2).strip() if m.group(2) else None
            tag = m.group(3)
            value = m.group(5) or ""
            records.append((level, tag, xref, value))
    return records


def build_tree(records):
    """Turn flat (level, tag, xref, value) records into a nested tree of
    dicts: {tag, xref, value, children: [...]}"""
    root = {"tag": "ROOT", "level": -1, "children": []}
    stack = [root]
    for level, tag, xref, value in records:
        node = {"tag": tag, "xref": xref, "value": value, "level": level, "children": []}
        while len(stack) > level + 1:
            stack.pop()
        stack[-1]["children"].append(node)
        stack.append(node)
    return root["children"]


def find(node, tag):
    for c in node["children"]:
        if c["tag"] == tag:
            return c
    return None


def find_all(node, tag):
    return [c for c in node["children"] if c["tag"] == tag]


def get_val(node, tag):
    c = find(node, tag)
    return c["value"] if c else None


def parse_date(node):
    d = find(node, "DATE")
    return d["value"] if d else None


def parse_place(node):
    p = find(node, "PLAC")
    return p["value"] if p else None


def parse_event(node, tag):
    e = find(node, tag)
    if not e:
        return None
    return {"date": parse_date(e), "place": parse_place(e)}


def main():
    top = build_tree(parse_lines(GEDCOM_PATH))

    individuals = {}
    families = {}

    for node in top:
        if node["tag"] == "INDI":
            xref = node["xref"]
            name_node = find(node, "NAME")
            full_name = name_node["value"].replace("/", "").strip() if name_node else "Unknown"
            given = get_val(name_node, "GIVN") if name_node else None
            surn = get_val(name_node, "SURN") if name_node else None
            sex = get_val(node, "SEX")
            birt = parse_event(node, "BIRT")
            deat = parse_event(node, "DEAT")
            famc = [c["value"] for c in find_all(node, "FAMC")]
            fams = [c["value"] for c in find_all(node, "FAMS")]
            notes = [c["value"] for c in find_all(node, "NOTE") if c["value"]]
            resi = [{"date": parse_date(c), "place": parse_place(c)} for c in find_all(node, "RESI")]

            individuals[xref] = {
                "id": xref,
                "name": full_name,
                "given": given,
                "surname": surn,
                "sex": sex,
                "birth": birt,
                "death": deat,
                "famc": famc,
                "fams": fams,
                "notes": notes,
                "residences": resi,
            }
        elif node["tag"] == "FAM":
            xref = node["xref"]
            husb = get_val(node, "HUSB")
            wife = get_val(node, "WIFE")
            chil = [c["value"] for c in find_all(node, "CHIL")]
            marr = parse_event(node, "MARR")
            div = find(node, "DIV") is not None
            families[xref] = {
                "id": xref,
                "husb": husb,
                "wife": wife,
                "children": chil,
                "marriage": marr,
                "divorced": div,
            }

    # cross-link: for each individual add spouse names & parent names for convenience
    def name_of(pid):
        return individuals[pid]["name"] if pid in individuals else None

    for fid, fam in families.items():
        fam["husb_name"] = name_of(fam["husb"]) if fam["husb"] else None
        fam["wife_name"] = name_of(fam["wife"]) if fam["wife"] else None

    out = {"individuals": individuals, "families": families}
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"Parsed {len(individuals)} individuals and {len(families)} families -> data.json")


if __name__ == "__main__":
    main()
