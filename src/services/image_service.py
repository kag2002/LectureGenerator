import logging
import os
import re

import requests

logger = logging.getLogger(__name__)


def fetch_unsplash_image_url(keyword: str) -> str:
    """
    Calls Unsplash search photos API with the given keyword.
    Returns the URL of the first matching photo, or a fallback placeholder URL.
    """
    access_key = os.getenv("UNSPLASH_ACCESS_KEY")
    if not access_key:
        logger.warning("UNSPLASH_ACCESS_KEY is not configured in .env. Falling back to placeholder.")
        return "https://images.unsplash.com/photo-placeholder"

    try:
        url = "https://api.unsplash.com/search/photos"
        params = {"query": keyword, "per_page": 1, "orientation": "landscape"}
        headers = {"Authorization": f"Client-ID {access_key}"}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            results = data.get("results", [])
            if results:
                # Use raw/regular size (fits slide screens beautifully)
                img_url = results[0]["urls"]["regular"]
                # Append optimization parameters for fast loading
                if "?" in img_url:
                    img_url += "&auto=format&fit=crop&w=800&q=75"
                else:
                    img_url += "?auto=format&fit=crop&w=800&q=75"
                return img_url
            else:
                logger.info(f"No Unsplash image found for query: {keyword}")
        else:
            logger.error(f"Unsplash API error: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Exception while searching image on Unsplash: {str(e)}")

    return "https://images.unsplash.com/photo-placeholder"


def process_markdown_images(md_content: str) -> str:
    """
    Scans the markdown content for slide image placeholders:
    ![keyword](https://images.unsplash.com/photo-placeholder)
    or other unsplash placeholder URLs, and replaces them with dynamic Unsplash URLs.
    """
    if not md_content:
        return md_content

    # Pattern 1: Matches any unsplash placeholder pattern or direct unsplash URL that we want to replace dynamically
    # E.g. ![business meeting](https://images.unsplash.com/photo-placeholder)
    # E.g. ![business meeting](https://images.unsplash.com/photo-1517245386807-bb43f82c33c4) -> we can replace this too to make it dynamic and prevent repetitions
    pattern = r"!\[(.*?)\]\((https://images\.unsplash\.com/photo-placeholder|https://images\.unsplash\.com/photo-[a-zA-Z0-9\-\?\&\=\_\%\.]+)\)"
    matches = re.findall(pattern, md_content)
    if not matches:
        return md_content

    processed_content = md_content
    # Cache keywords to avoid duplicate requests for the same keyword in the same lesson
    keyword_cache = {}

    for alt_text, full_url in matches:
        clean_keyword = alt_text.strip()
        if not clean_keyword:
            continue

        # If it's a real Unsplash URL and we haven't seen it yet, we could keep it,
        # but to prevent repetitions (since LLM outputs same IDs), we force dynamic search for Unsplash URLs!
        if clean_keyword not in keyword_cache:
            img_url = fetch_unsplash_image_url(clean_keyword)
            keyword_cache[clean_keyword] = img_url
        else:
            img_url = keyword_cache[clean_keyword]

        # Replaces only if a valid Unsplash URL was found, otherwise keep original
        if img_url and img_url != "https://images.unsplash.com/photo-placeholder":
            placeholder = f"![{alt_text}]({full_url})"
            processed_content = processed_content.replace(placeholder, f"![{alt_text}]({img_url})")
            logger.info(f"Replaced slide image placeholder '{alt_text}' with dynamic URL: {img_url}")

    return processed_content
