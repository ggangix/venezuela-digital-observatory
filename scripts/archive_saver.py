import requests

"""
Wayback Machine Integration Script
This script submits URLs to the Internet Archive's 'Save Page Now' service.
Target API: https://web.archive.org/save/
"""

def save_url_to_archive(url):
    """
    Submits a URL to the Internet Archive's 'Save Page Now' service.
    """
    save_url = f"https://web.archive.org/save/{url}"
    headers = {
        "User-Agent": "VenezuelaDigitalObservatory/1.0 (Research Project; +mailto:contact@venezueladigitalobservatory.com)"
    }
    
    print(f"Attempting to save: {url}...")
    try:
        # We use a POST request as it's more reliable for the save service, 
        # specifically capturing errors and headers properly.
        # Sometimes a simple GET to /save/{url} works but POST is preferred for automation.
        response = requests.post(save_url, headers=headers)
        
        if response.status_code == 200:
            print(f"✅ Successfully saved: {url}")
            # The URL of the saved snapshot is usually in the Content-Location header 
            # or we can construct it.
            return True
        elif response.status_code == 429:
            print(f"⚠️ Rate limit exceeded for {url}. Try again later.")
            return False
        elif response.status_code == 403:
            print(f"❌ Forbidden (403): The site might block crawlers or the archive service.")
            return False
        else:
            print(f"❌ Failed to save {url}. Status: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error saving {url}: {e}")
        return False

if __name__ == "__main__":
    # Example usage
    # target_url = "http://example.com"
    # save_url_to_archive(target_url)
    pass
