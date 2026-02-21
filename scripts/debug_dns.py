import dns.resolver

print("--- DNS Debug Info ---")
res = dns.resolver.Resolver()
print(f"Configured Nameservers: {res.nameservers}")

domain = "google.com"
print(f"\nAttempting to resolve MX for {domain}...")

try:
    answers = res.resolve(domain, 'MX')
    print("Success! Records found:")
    for r in answers:
        print(f" - {r.exchange.to_text()}")
except Exception as e:
    print(f"FAILURE: {type(e).__name__}")
    print(f"Message: {str(e)}")
