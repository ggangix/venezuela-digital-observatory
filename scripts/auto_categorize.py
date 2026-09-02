import json
import os
import sys

# Configuration
INPUT_FILE = os.path.join(os.path.dirname(__file__), '../data/whois_gobve.json')
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), '../data/domains_categorized.json')

# Taxonomy and Rules
CATEGORIES = {
    "Educación": ["univ", "ucv", "ula", "luz", "une", "colegio", "biblioteca", "academia", "educacion", "escuela"],
    "Gobernación/Alcaldía": ["alcaldia", "gobernacion", "municipio", "estado-"],
    "Salud": ["hospital", "ivss", "salud", "farmacia", "medico", "clinica"],
    "Seguridad": ["policia", "cicpc", "ejercito", "armada", "guardia", "seguridad", "defensa"],
    "Economía y Finanzas": ["banco", "tesoro", "seniat", "finanzas", "bcv", "hacienda", "tributtari"],
    "Servicios y Trámites": ["saime", "saren", "intt", "corpoelec", "cantv", "hidro", "gas", "transporte"],
    "Poderes Públicos": ["cne", "tsj", "asambleanacional", "presidencia", "fiscalia", "contraloria", "defensoria"]
}

def load_data(filepath):
    """Loads JSON data from the specified filepath."""
    if not os.path.exists(filepath):
        print(f"Error: File not found at {filepath}")
        sys.exit(1)
        
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def determine_category(text):
    """Determines the category based on keywords found in the text."""
    text_lower = text.lower()
    for category, keywords in CATEGORIES.items():
        for keyword in keywords:
            if keyword in text_lower:
                return category
    return None

def categorize_domains(data):
    """Iterates through domains and assigns categorization."""
    
    # Handle different data structures (List of strings, List of objects, or Dict with 'domains' key)
    domains_list = []
    metadata = {}
    
    if isinstance(data, dict):
        if "domains" in data:
            domains_list = data["domains"]
            metadata = {k:v for k,v in data.items() if k != "domains"}
        else:
            # Assuming the dict values might be the domains or it's a structural issue
            print("Warning: JSON is a dict but has no 'domains' key. Trying to parse as list if possible.")
            return None, None
    elif isinstance(data, list):
        domains_list = data
    else:
        print("Error: Unknown JSON structure.")
        sys.exit(1)

    stats = {cat: 0 for cat in CATEGORIES.keys()}
    stats["Uncategorized"] = 0
    total_processed = 0

    categorized_list = []

    for item in domains_list:
        total_processed += 1
        
        # Normalize item to object if it's a string
        if isinstance(item, str):
            domain_obj = {"domain": item, "category": None}
        else:
            domain_obj = item
            
        current_cat = domain_obj.get("category")
        
        # Skip if already manually categorized (and not Uncategorized)
        if current_cat and current_cat != "Uncategorized":
            if current_cat in stats:
                stats[current_cat] += 1
            else:
                stats[current_cat] = stats.get(current_cat, 0) + 1
            categorized_list.append(domain_obj)
            continue

        # Try to find category from 'org' first (more accurate), then 'domain'
        domain_name = domain_obj.get("domain", "")
        org_name = domain_obj.get("org", "")
        
        # Combined text search for broader matching
        search_text = f"{domain_name} {org_name}"
        
        found_cat = determine_category(search_text)
        
        if found_cat:
            domain_obj["category"] = found_cat
            stats[found_cat] += 1
        else:
            domain_obj["category"] = "Uncategorized"
            stats["Uncategorized"] += 1
            
        categorized_list.append(domain_obj)

    # Reconstruct output structure
    if metadata:
        output_data = metadata
        output_data["domains"] = categorized_list
    else:
        output_data = categorized_list
        
    return output_data, stats, total_processed

def main():
    print(f"Reading data from: {INPUT_FILE}")
    data = load_data(INPUT_FILE)
    
    output_data, stats, total = categorize_domains(data)
    
    # Save results
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
        
    print(f"\nSuccessfully created: {OUTPUT_FILE}")
    print("\n--- Categorization Report ---")
    print(f"Total Domains Processed: {total}")
    print("-" * 30)
    for category, count in sorted(stats.items(), key=lambda item: item[1], reverse=True):
        print(f"{category}: {count}")
    print("-" * 30)

if __name__ == "__main__":
    main()
