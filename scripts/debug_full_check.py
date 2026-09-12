import dns.resolver

resolver = dns.resolver.Resolver()
resolver.timeout = 5.0
resolver.lifetime = 5.0

print(f"Nameservers: {resolver.nameservers}")

domain = "google.com"

print(f"\n--- Checking MX for {domain} ---")
try:
    answers = resolver.resolve(domain, 'MX')
    print([r.exchange.to_text() for r in answers])
except Exception as e:
    print(f"MX FAILED: {e}")

print(f"\n--- Checking SPF (TXT) for {domain} ---")
try:
    answers = resolver.resolve(domain, 'TXT')
    found = False
    for rdata in answers:
        txt = b"".join(rdata.strings).decode("utf-8")
        if "v=spf1" in txt:
            print(f"SPF FOUND: {txt}")
            found = True
    if not found:
        print("SPF NOT FOUND in TXT records")
except Exception as e:
    print(f"SPF FAILED: {e}")

print(f"\n--- Checking DMARC (TXT) for _dmarc.{domain} ---")
try:
    answers = resolver.resolve(f"_dmarc.{domain}", 'TXT')
    found = False
    for rdata in answers:
        txt = b"".join(rdata.strings).decode("utf-8")
        if "v=DMARC1" in txt:
            print(f"DMARC FOUND: {txt}")
            found = True
    if not found:
        print("DMARC NOT FOUND in TXT records")
except Exception as e:
    print(f"DMARC FAILED: {e}")
