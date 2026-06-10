#!/usr/bin/env python3
"""
MegaTischler .mac file parser.
Extracts formula knowledge from .mac files and outputs knowledge_base.json.

Handles tags: <Formula>, <ParFloat>, <ParEnum>, <ParString>, <ParInt>,
              <MaterialItem>, <PartItem>, <DimItem>, <VarItem>
"""

import sys
import os
import re
import json
import argparse
from collections import defaultdict


SYNTAX_RULES = [
    "Decimalni separator je ZAREZ ne točka: 0,5 a ne 0.5",
    "Roditeljski parametar: [.W] = jedan nivo gore",
    "Korijenski parametar: [....W] = četiri točke = root razina",
    "Navigacija prema djetetu: [...PoliceP.Polica.W]",
    "Uvjet: if(uvjet;istina;laž)",
    "Višestruki uvjet: ifelse(u1;v1;u2;v2;zadano)",
    "Funkcije: cos(), sin(), tan(), neg()",
    "Spajanje stringova s + operatorom",
    "Reference parametara u uglatim zagradama: [W], [D], [H]",
    "Aritmetički operatori: +, -, *, /",
    "Operatori usporedbe: <, >, <=, >=, =, <>",
    "Logički operatori: and(), or(), not()",
    "Zaokruživanje: round(vrijednost;decimale)",
    "Cijeli broj: int(vrijednost)",
    "Min/Max: min(a;b), max(a;b)",
    "Apsolutna vrijednost: abs(vrijednost)",
    "Kvadratni korijen: sqrt(vrijednost)",
]

# Tags that contain parameter definitions in MegaTischler .mac files
PARAM_TAGS = [
    "ParFloat", "ParEnum", "ParString", "ParInt", "ParBool",
    "Parameter", "DimItem", "VarItem",
]

# Tags that may contain formula definitions
FORMULA_TAGS = [
    "Formula", "Expression", "MaterialItem", "PartItem",
]

# All tags to extract
ALL_TAGS = PARAM_TAGS + FORMULA_TAGS + ["Value", "Condition"]


def unescape_xml(text):
    """Decode XML entities. &amp; must be decoded last."""
    if not text:
        return text
    return (
        text.replace('&lt;', '<')
            .replace('&gt;', '>')
            .replace('&quot;', '"')
            .replace('&apos;', "'")
            .replace('&#39;', "'")
            .replace('&amp;', '&')
    )


def extract_all_blocks(content):
    """Extract XML blocks for all relevant tag types."""
    blocks = []
    for tag in ALL_TAGS:
        # Self-closing and pair tags
        found = re.findall(
            rf'<{tag}(?:\s[^>]*)?>(?:.*?)</{tag}>|<{tag}(?:\s[^>]*)?/>',
            content,
            re.DOTALL | re.IGNORECASE,
        )
        for block in found:
            blocks.append((tag, block))

    # Also extract root-level attribute blocks from common parent tags
    for tag in ["MaterialItem", "PartItem", "DimItem", "VarItem"]:
        found = re.findall(
            rf'<{tag}[^>]*>.*?</{tag}>',
            content,
            re.DOTALL | re.IGNORECASE,
        )
        for block in found:
            blocks.append((tag, block))

    return blocks


def get_attr(block, attr):
    """Extract attribute value from XML block (XML entities decoded)."""
    m = re.search(rf'\b{attr}="([^"]*)"', block, re.IGNORECASE)
    if m:
        return unescape_xml(m.group(1).strip())
    m = re.search(rf"\b{attr}='([^']*)'", block, re.IGNORECASE)
    if m:
        return unescape_xml(m.group(1).strip())
    return None


def get_inner(block, tag):
    """Extract inner text of a child tag (XML entities decoded)."""
    m = re.search(rf'<{tag}[^>]*>(.*?)</{tag}>', block, re.DOTALL | re.IGNORECASE)
    if m:
        return unescape_xml(m.group(1).strip())
    return None


def is_formula(value):
    """Return True if value looks like a parametric formula (not a plain number/string)."""
    if not value:
        return False
    v = value.strip()
    if not v:
        return False
    # Plain integer or decimal (comma or dot) — not a formula
    if re.match(r'^-?\d+([,\.]\d+)?$', v):
        return False
    # Formula indicators
    indicators = [
        '[', 'if(', 'ifelse(', 'cos(', 'sin(', 'tan(', 'neg(',
        'round(', 'int(', 'sqrt(', 'abs(', 'min(', 'max(',
        'and(', 'or(', 'not(',
    ]
    # Also catch arithmetic expressions involving references
    has_ref = bool(re.search(r'\[[\w\.]+\]', v))
    has_op = any(c in v for c in ['+', '*', '/', '-']) and len(v) > 3
    return any(ind in v for ind in indicators) or has_ref or (has_op and '[' not in v and len(v) > 6)


def parse_mac_file(filepath):
    """Parse a single .mac file, return (formulas, parameters)."""
    formulas = []
    params_map = {}  # name → {description, typical_values}

    try:
        with open(filepath, 'rb') as f:
            raw = f.read()

        # Skip encrypted section
        enc_marker = b'MTSXENC'
        if enc_marker in raw:
            raw = raw[:raw.index(enc_marker)]

        content = raw.decode('latin-1', errors='replace')
        source = os.path.basename(filepath)

        blocks = extract_all_blocks(content)

        for tag, block in blocks:
            name = get_attr(block, 'Name') or get_attr(block, 'name')
            value = get_attr(block, 'Value') or get_attr(block, 'value') or get_inner(block, 'Value')
            formula = get_attr(block, 'Formula') or get_attr(block, 'formula') or get_inner(block, 'Formula')
            desc = (
                get_attr(block, 'Description') or
                get_attr(block, 'Desc') or
                get_attr(block, 'description') or
                get_inner(block, 'Description') or
                ''
            )

            # Collect formulas
            for candidate in [formula, value]:
                if candidate and is_formula(candidate):
                    formulas.append({'formula': candidate.strip(), 'source': source})

            # Collect parameters (non-formula values)
            if name and name.strip():
                n = name.strip()
                val_str = None
                if value and not is_formula(value):
                    val_str = value.strip()
                if n not in params_map:
                    params_map[n] = {'name': n, 'description': desc or '', 'typical_values': []}
                if val_str and val_str not in params_map[n]['typical_values']:
                    params_map[n]['typical_values'].append(val_str)
                if desc and not params_map[n]['description']:
                    params_map[n]['description'] = desc

        # Also do a raw regex sweep for formula attributes we might have missed
        raw_formulas = re.findall(
            r'(?:Formula|Expression|Condition)="([^"]{4,})"',
            content,
            re.IGNORECASE,
        )
        for f in raw_formulas:
            f = unescape_xml(f)
            if is_formula(f):
                formulas.append({'formula': f.strip(), 'source': source})

        # Sweep for name+value attribute pairs in any tag (any order, various attr names)
        name_attrs = r'(?:Name|VarName|Ident|ParName|ID)'
        for m in re.finditer(
            rf'<\w+[^>]*\b{name_attrs}="([^"]+)"[^>]*\bValue="([^"]*)"', content, re.IGNORECASE
        ):
            n, v = unescape_xml(m.group(1).strip()), unescape_xml(m.group(2).strip())
            if n and v and not is_formula(v):
                if n not in params_map:
                    params_map[n] = {'name': n, 'description': '', 'typical_values': []}
                if v not in params_map[n]['typical_values']:
                    params_map[n]['typical_values'].append(v)

        # Same sweep with reversed attribute order (Value before Name)
        for m in re.finditer(
            rf'<\w+[^>]*\bValue="([^"]*)"[^>]*\b{name_attrs}="([^"]+)"', content, re.IGNORECASE
        ):
            v, n = unescape_xml(m.group(1).strip()), unescape_xml(m.group(2).strip())
            if n and v and not is_formula(v):
                if n not in params_map:
                    params_map[n] = {'name': n, 'description': '', 'typical_values': []}
                if v not in params_map[n]['typical_values']:
                    params_map[n]['typical_values'].append(v)

        # Child-tag style: <ParFloat><Name>X</Name><Value>5</Value></ParFloat>
        for m in re.finditer(
            r'<Name>([^<]+)</Name>\s*<Value>([^<]*)</Value>', content, re.IGNORECASE
        ):
            n, v = unescape_xml(m.group(1).strip()), unescape_xml(m.group(2).strip())
            if n and v and not is_formula(v):
                if n not in params_map:
                    params_map[n] = {'name': n, 'description': '', 'typical_values': []}
                if v not in params_map[n]['typical_values']:
                    params_map[n]['typical_values'].append(v)

    except Exception as e:
        print(f"Upozorenje: Greška pri parsiranju {filepath}: {e}", file=sys.stderr)

    # Deduplicate formulas
    seen = set()
    unique = []
    for f in formulas:
        k = f['formula']
        if k not in seen:
            seen.add(k)
            unique.append(f)

    # Trim typical values
    for p in params_map.values():
        p['typical_values'] = p['typical_values'][:10]

    return unique, list(params_map.values())


def derive_params_from_formulas(kb):
    """Extract parameter names referenced in formulas ([W], [.GLU], [...Child.Sub.W])
    and add any that aren't already in the parameter catalog, sorted by frequency."""
    freq = defaultdict(int)
    for f in kb.get('formulas', []):
        # Matches [W], [.W], [....W], [...PoliceP.Polica.W] — take the LAST segment as param name
        for m in re.finditer(r'\[\.{0,4}([A-Za-z0-9_\.]+)\]', f.get('formula', '')):
            ref = m.group(1)
            name = ref.split('.')[-1].strip()
            if name and re.match(r'^[A-Za-z][A-Za-z0-9_]*$', name):
                freq[name] += 1

    existing_names = {p['name'] for p in kb.get('parameters', [])}
    derived = []
    for name, count in sorted(freq.items(), key=lambda x: -x[1]):
        if name not in existing_names:
            derived.append({
                'name': name,
                'description': f'koristi se u {count} formula',
                'typical_values': [],
            })

    kb.setdefault('parameters', []).extend(derived)

    # Sort whole catalog: defined params (with values) first, then derived by frequency
    def sort_key(p):
        has_values = bool(p.get('typical_values'))
        return (0 if has_values else 1, -freq.get(p['name'], 0))

    kb['parameters'].sort(key=sort_key)


def merge_into(existing, new_formulas, new_params):
    """Merge new data into existing knowledge base dict in-place."""
    # Merge formulas
    known_f = {f['formula'] for f in existing.get('formulas', [])}
    for f in new_formulas:
        if f['formula'] not in known_f:
            existing.setdefault('formulas', []).append(f)
            known_f.add(f['formula'])

    # Merge parameters
    known_p = {p['name']: p for p in existing.get('parameters', [])}
    for p in new_params:
        if p['name'] not in known_p:
            known_p[p['name']] = p
        else:
            ev = set(known_p[p['name']]['typical_values'])
            for v in p['typical_values']:
                ev.add(v)
            known_p[p['name']]['typical_values'] = list(ev)[:10]
            if not known_p[p['name']]['description'] and p['description']:
                known_p[p['name']]['description'] = p['description']
    existing['parameters'] = list(known_p.values())


def parse_single(filepath):
    formulas, params = parse_mac_file(filepath)
    return {
        'formulas': formulas,
        'parameters': params,
        'syntax_rules': SYNTAX_RULES,
        '_meta': {'files_processed': 1},
    }


def parse_folder(folder):
    mac_files = []
    for root, _dirs, files in os.walk(folder):
        for fname in files:
            if fname.lower().endswith('.mac'):
                mac_files.append(os.path.join(root, fname))

    base = {'formulas': [], 'parameters': [], 'syntax_rules': SYNTAX_RULES, '_meta': {'files_processed': 0}}
    for fp in mac_files:
        f, p = parse_mac_file(fp)
        merge_into(base, f, p)
        base['_meta']['files_processed'] += 1
    return base


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Parsira MegaTischler .mac datoteke')
    parser.add_argument('input', help='Putanja do .mac datoteke ili mape')
    parser.add_argument('--output', '-o', default='knowledge_base.json', help='Izlazna JSON datoteka')
    parser.add_argument('--merge', action='store_true', help='Spoji s postojećom bazom znanja')
    args = parser.parse_args()

    if os.path.isdir(args.input):
        result = parse_folder(args.input)
    elif os.path.isfile(args.input) and args.input.lower().endswith('.mac'):
        result = parse_single(args.input)
    else:
        print(f"Greška: {args.input} nije .mac datoteka ni mapa", file=sys.stderr)
        sys.exit(1)

    if args.merge and os.path.exists(args.output):
        try:
            with open(args.output, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            # Drop previously derived (formula-reference) params so they get recomputed
            existing['parameters'] = [
                p for p in existing.get('parameters', [])
                if not p.get('description', '').startswith('koristi se u ')
            ]
            merge_into(existing, result['formulas'], result['parameters'])
            existing.setdefault('syntax_rules', SYNTAX_RULES)
            prev_files = existing.get('_meta', {}).get('files_processed', 0)
            existing['_meta'] = {'files_processed': prev_files + result['_meta']['files_processed']}
            result = existing
        except Exception as e:
            print(f"Upozorenje: Ne mogu spojiti s postojećom bazom: {e}", file=sys.stderr)

    derive_params_from_formulas(result)

    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    meta = result.get('_meta', {})
    print(json.dumps({
        'success': True,
        'formulas': len(result['formulas']),
        'parameters': len(result['parameters']),
        'files': meta.get('files_processed', 0),
        'output': args.output,
    }))
