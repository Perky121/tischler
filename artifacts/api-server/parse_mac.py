#!/usr/bin/env python3
"""
MegaTischler .mac file parser.
Extracts formula knowledge from .mac files and outputs knowledge_base.json.
"""

import sys
import os
import re
import json
import argparse
from collections import defaultdict


SYNTAX_RULES = [
    "Decimal separator is COMMA not dot: 0,5 not 0.5",
    "Parent parameter: [.W] = one level up",
    "Root parameter: [....W] = four dots = root level",
    "Child navigation: [...PoliceP.Polica.W]",
    "Conditional: if(condition;true;false)",
    "Multi-conditional: ifelse(c1;v1;c2;v2;default)",
    "Functions: cos(), sin(), tan(), neg()",
    "String concatenation with + operator",
    "Parameter references use square brackets: [W], [D], [H]",
    "Arithmetic operators: +, -, *, /",
    "Comparison operators: <, >, <=, >=, =, <>",
    "Logical operators: and(), or(), not()",
    "Round function: round(value;decimals)",
    "Integer function: int(value)",
    "Minimum/Maximum: min(a;b), max(a;b)",
    "Absolute value: abs(value)",
    "Square root: sqrt(value)",
]


def extract_xml_blocks(content):
    """Extract all relevant XML blocks from file content."""
    blocks = []
    # Look for MaterialItem, PartItem, DimItem, VarItem blocks
    patterns = [
        r'<MaterialItem[^>]*>.*?</MaterialItem>',
        r'<PartItem[^>]*>.*?</PartItem>',
        r'<DimItem[^>]*>.*?</DimItem>',
        r'<VarItem[^>]*>.*?</VarItem>',
        r'<Parameter[^>]*>.*?</Parameter>',
        r'<Formula[^>]*>.*?</Formula>',
    ]
    for pattern in patterns:
        found = re.findall(pattern, content, re.DOTALL | re.IGNORECASE)
        blocks.extend(found)
    return blocks


def extract_field(block, field_name):
    """Extract a specific field value from an XML block."""
    # Try attribute form: Name="value"
    attr_match = re.search(rf'{field_name}="([^"]*)"', block, re.IGNORECASE)
    if attr_match:
        return attr_match.group(1).strip()
    # Try element form: <Name>value</Name>
    elem_match = re.search(rf'<{field_name}[^>]*>(.*?)</{field_name}>', block, re.DOTALL | re.IGNORECASE)
    if elem_match:
        return elem_match.group(1).strip()
    return None


def looks_like_formula(value):
    """Check if a value looks like a MegaTischler formula (not just a plain number or empty)."""
    if not value or not value.strip():
        return False
    v = value.strip()
    # Plain number - not a formula
    if re.match(r'^-?\d+([,\.]\d+)?$', v):
        return False
    # Has formula-like content
    formula_indicators = ['[', 'if(', 'ifelse(', 'cos(', 'sin(', 'tan(', 'neg(', '+', '-', '*', '/', 'round(', 'int(', 'sqrt(', 'abs(', 'min(', 'max(']
    return any(ind in v for ind in formula_indicators)


def parse_mac_file(filepath):
    """Parse a single .mac file and extract formulas and parameters."""
    formulas = []
    parameters = []
    
    try:
        with open(filepath, 'rb') as f:
            raw = f.read()
        
        # Check for encryption marker and truncate if found
        enc_marker = b'MTSXENC'
        if enc_marker in raw:
            raw = raw[:raw.index(enc_marker)]
        
        content = raw.decode('latin-1', errors='replace')
        filename = os.path.basename(filepath)
        
        blocks = extract_xml_blocks(content)
        
        param_values = defaultdict(list)
        
        for block in blocks:
            name = extract_field(block, 'Name')
            value = extract_field(block, 'Value')
            formula = extract_field(block, 'Formula')
            description = extract_field(block, 'Description') or extract_field(block, 'Desc') or ''
            
            # Extract formulas
            if formula and looks_like_formula(formula):
                formulas.append({
                    'formula': formula,
                    'source': filename
                })
            
            if value and looks_like_formula(value):
                formulas.append({
                    'formula': value,
                    'source': filename
                })
            
            # Collect parameter info
            if name and name.strip():
                name = name.strip()
                if value and value.strip() and not looks_like_formula(value):
                    param_values[name].append({
                        'description': description,
                        'value': value.strip()
                    })
        
        # Also do a raw regex pass for formula-like content
        # Look for patterns like [W], [D], [H] references in attribute values
        raw_formulas = re.findall(r'(?:Formula|Value|Expression)="([^"]*\[[^\]]*\][^"]*)"', content, re.IGNORECASE)
        for f in raw_formulas:
            if looks_like_formula(f) and {'formula': f, 'source': filename} not in formulas:
                formulas.append({'formula': f, 'source': filename})
        
        # Build parameters list
        for pname, entries in param_values.items():
            typical_values = list(set(e['value'] for e in entries if e['value']))[:5]
            desc = next((e['description'] for e in entries if e['description']), '')
            parameters.append({
                'name': pname,
                'description': desc,
                'typical_values': typical_values
            })
        
    except Exception as e:
        print(f"Warning: Error parsing {filepath}: {e}", file=sys.stderr)
    
    return formulas, parameters


def parse_folder(folder_path):
    """Parse all .mac files in a folder."""
    all_formulas = []
    all_parameters = {}
    files_processed = 0
    
    mac_files = []
    for root, dirs, files in os.walk(folder_path):
        for fname in files:
            if fname.lower().endswith('.mac'):
                mac_files.append(os.path.join(root, fname))
    
    for filepath in mac_files:
        formulas, parameters = parse_mac_file(filepath)
        all_formulas.extend(formulas)
        files_processed += 1
        
        for param in parameters:
            pname = param['name']
            if pname not in all_parameters:
                all_parameters[pname] = {
                    'name': pname,
                    'description': param['description'],
                    'typical_values': param['typical_values']
                }
            else:
                # Merge typical values
                existing = set(all_parameters[pname]['typical_values'])
                for v in param['typical_values']:
                    existing.add(v)
                all_parameters[pname]['typical_values'] = list(existing)[:10]
                if not all_parameters[pname]['description'] and param['description']:
                    all_parameters[pname]['description'] = param['description']
    
    # Deduplicate formulas
    seen = set()
    unique_formulas = []
    for f in all_formulas:
        key = f['formula'].strip()
        if key not in seen:
            seen.add(key)
            unique_formulas.append(f)
    
    return {
        'formulas': unique_formulas,
        'parameters': list(all_parameters.values()),
        'syntax_rules': SYNTAX_RULES,
        '_meta': {
            'files_processed': files_processed
        }
    }


def parse_single_file(filepath):
    """Parse a single .mac file."""
    formulas, parameters = parse_mac_file(filepath)
    
    # Deduplicate
    seen = set()
    unique_formulas = []
    for f in formulas:
        key = f['formula'].strip()
        if key not in seen:
            seen.add(key)
            unique_formulas.append(f)
    
    param_map = {}
    for p in parameters:
        if p['name'] not in param_map:
            param_map[p['name']] = p
    
    return {
        'formulas': unique_formulas,
        'parameters': list(param_map.values()),
        'syntax_rules': SYNTAX_RULES,
        '_meta': {
            'files_processed': 1
        }
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Parse MegaTischler .mac files')
    parser.add_argument('input', help='Path to .mac file or folder containing .mac files')
    parser.add_argument('--output', '-o', default='knowledge_base.json', help='Output JSON file path')
    parser.add_argument('--merge', action='store_true', help='Merge with existing knowledge base')
    args = parser.parse_args()
    
    if os.path.isdir(args.input):
        result = parse_folder(args.input)
    elif os.path.isfile(args.input) and args.input.lower().endswith('.mac'):
        result = parse_single_file(args.input)
    else:
        print(f"Error: {args.input} is not a .mac file or directory", file=sys.stderr)
        sys.exit(1)
    
    # Merge with existing if requested
    if args.merge and os.path.exists(args.output):
        try:
            with open(args.output, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            
            # Merge formulas (deduplicate)
            existing_formulas = {f['formula'] for f in existing.get('formulas', [])}
            for formula in result['formulas']:
                if formula['formula'] not in existing_formulas:
                    existing['formulas'].append(formula)
                    existing_formulas.add(formula['formula'])
            
            # Merge parameters
            existing_params = {p['name']: p for p in existing.get('parameters', [])}
            for param in result['parameters']:
                if param['name'] not in existing_params:
                    existing_params[param['name']] = param
                else:
                    ev = set(existing_params[param['name']]['typical_values'])
                    for v in param['typical_values']:
                        ev.add(v)
                    existing_params[param['name']]['typical_values'] = list(ev)[:10]
            
            existing['parameters'] = list(existing_params.values())
            existing['_meta'] = result['_meta']
            result = existing
        except Exception as e:
            print(f"Warning: Could not merge with existing: {e}", file=sys.stderr)
    
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    meta = result.get('_meta', {})
    print(json.dumps({
        'success': True,
        'formulas': len(result['formulas']),
        'parameters': len(result['parameters']),
        'files': meta.get('files_processed', 0),
        'output': args.output
    }))
