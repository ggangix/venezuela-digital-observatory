import dns.resolver
import json
import sys
import time
from typing import Dict, Any

# Configuración del resolver para evitar bloqueos infinitos
resolver = dns.resolver.Resolver()
resolver.timeout = 5.0      # Tiempo máximo de espera total
resolver.lifetime = 5.0     # Tiempo de vida de la consulta
# Forzar uso de DNS públicos (Google y Cloudflare) para evitar bloqueos locales/corporativos
resolver.nameservers = ['8.8.8.8', '1.1.1.1']

def check_mx_record(domain: str) -> Dict[str, Any]:
    """Verifica si el dominio tiene servidores de correo (MX) configurados."""
    try:
        answers = resolver.resolve(domain, 'MX')
        records = [r.exchange.to_text().strip('.') for r in answers]
        return {
            "has_mx": True,
            "records": records
        }
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.exception.Timeout):
        return {"has_mx": False, "records": []}
    except Exception as e:
        return {"has_mx": False, "error": str(e)}

def check_spf_record(domain: str) -> Dict[str, Any]:
    """Busca registros TXT que contengan la configuración SPF."""
    try:
        answers = resolver.resolve(domain, 'TXT')
        spf_record = None
        for rdata in answers:
            # Los registros TXT pueden venir en varios strings, se unen
            txt_string = b"".join(rdata.strings).decode("utf-8")
            if "v=spf1" in txt_string:
                spf_record = txt_string
                break
        
        return {
            "has_spf": spf_record is not None,
            "record": spf_record
        }
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.exception.Timeout):
        return {"has_spf": False, "record": None}
    except Exception as e:
        return {"has_spf": False, "error": str(e)}

def check_dmarc_record(domain: str) -> Dict[str, Any]:
    """Busca el registro DMARC en el subdominio _dmarc."""
    dmarc_domain = f"_dmarc.{domain}"
    try:
        answers = resolver.resolve(dmarc_domain, 'TXT')
        dmarc_record = None
        for rdata in answers:
            txt_string = b"".join(rdata.strings).decode("utf-8")
            if "v=DMARC1" in txt_string: # El protocolo debe empezar así
                dmarc_record = txt_string
                break
        
        return {
            "has_dmarc": dmarc_record is not None,
            "record": dmarc_record
        }
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.exception.Timeout):
        return {"has_dmarc": False, "record": None}
    except Exception as e:
        return {"has_dmarc": False, "error": str(e)}

def analyze_domain_security(domain: str) -> Dict[str, Any]:
    """Función principal que agrupa todas las verificaciones."""
    print(f"Analizando seguridad para: {domain}...")
    return {
        "domain": domain,
        "mx": check_mx_record(domain),
        "spf": check_spf_record(domain),
        "dmarc": check_dmarc_record(domain),
        "timestamp": time.time()
    }

# --- Bloque de ejecución principal ---
if __name__ == "__main__":
    # TODO: En el futuro, esto leerá tu archivo data/domains.json real.
    # Por ahora, usamos una lista de prueba para verificar que funciona.
    test_domains = [
        "cne.gob.ve",      # Ejemplo real
        "saime.gob.ve",    # Ejemplo real
        "google.com",      # Control positivo (debería tener todo)
        "dominio-falso-123.gob.ve" # Control negativo
    ]

    results = []
    for dom in test_domains:
        results.append(analyze_domain_security(dom))

    # Guardamos el resultado en el directorio público del dashboard
    # Calculamos la ruta absoluta basada en la ubicación de este script
    import os
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir) # Subimos un nivel desde scripts/
    
    output_dir = os.path.join(project_root, "dashboard", "public", "data")
    output_file = os.path.join(output_dir, "security_results.json")
    
    # Asegurar que el directorio existe
    os.makedirs(output_dir, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=4, ensure_ascii=False)
    
    print(f"\nAnálisis completado. Resultados guardados en {output_file}")
