from archive_saver import save_url_to_archive
import time

def test_archive_save():
    # Use a dummy example URL that is safe to save (or repeatedly save)
    # Note: Frequent saving of the same URL might trigger 429
    url_to_test = "http://example.com"
    
    print(f"Testing Archive Saver with: {url_to_test}")
    success = save_url_to_archive(url_to_test)
    
    if success:
        print("Test Passed: URL submitted successfully.")
    else:
        print("Test Failed (or Rate Limited). Check output details.")

if __name__ == "__main__":
    test_archive_save()
