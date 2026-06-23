import hashlib
import logging
import os
import re
import urllib.parse
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
        response = requests.get(url, params=params, headers=headers, timeout=1.5)
        if response.status_code == 200:
            data = response.json()
            results = data.get("results", [])
            if results:
                img_url = results[0]["urls"]["regular"]
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


def fetch_pexels_image_url(keyword: str) -> str | None:
    """Calls Pexels API to retrieve a landscape image URL."""
    api_key = os.getenv("PEXELS_API_KEY")
    if not api_key:
        return None
    try:
        url = "https://api.pexels.com/v1/search"
        params = {"query": keyword, "per_page": 1, "orientation": "landscape"}
        headers = {"Authorization": api_key}
        response = requests.get(url, params=params, headers=headers, timeout=1.5)
        if response.status_code == 200:
            data = response.json()
            photos = data.get("photos", [])
            if photos:
                return photos[0]["src"]["large"]
    except Exception as e:
        logger.error(f"Pexels search failed: {e}")
    return None


def fetch_pixabay_image_url(keyword: str) -> str | None:
    """Calls Pixabay API to retrieve a horizontal image URL."""
    api_key = os.getenv("PIXABAY_API_KEY")
    if not api_key:
        return None
    try:
        url = "https://pixabay.com/api/"
        params = {
            "key": api_key,
            "q": urllib.parse.quote_plus(keyword),
            "per_page": 3,
            "orientation": "horizontal",
            "image_type": "photo"
        }
        response = requests.get(url, params=params, timeout=1.5)
        if response.status_code == 200:
            data = response.json()
            hits = data.get("hits", [])
            if hits:
                return hits[0]["webformatURL"]
    except Exception as e:
        logger.error(f"Pixabay search failed: {e}")
    return None


def fetch_stock_image_url(keyword: str) -> str:
    """Pipeline fallback image search: Unsplash -> Pexels -> Pixabay -> Fallback URL"""
    # 1. Unsplash
    try:
        url = fetch_unsplash_image_url(keyword)
        if url and url != "https://images.unsplash.com/photo-placeholder":
            return url
    except Exception as e:
        logger.warning(f"Unsplash pipeline step failed: {e}")

    # 2. Pexels
    try:
        url = fetch_pexels_image_url(keyword)
        if url:
            logger.info(f"Fallback to Pexels succeeded for: '{keyword}'")
            return url
    except Exception as e:
        logger.warning(f"Pexels pipeline step failed: {e}")

    # 3. Pixabay
    try:
        url = fetch_pixabay_image_url(keyword)
        if url:
            logger.info(f"Fallback to Pixabay succeeded for: '{keyword}'")
            return url
    except Exception as e:
        logger.warning(f"Pixabay pipeline step failed: {e}")

    return "https://images.unsplash.com/photo-placeholder"


def generate_ai_illustration(keyword: str, theme: str = "default") -> str:
    """
    Generates a visual illustration prompt for DALL-E 3 matching slide theme colors,
    downloads and caches the image in static uploads.
    """
    prompt = f"isometric vector academic illustration of {keyword}, {theme} color scheme, clean educational graphic, professional school style"
    prompt_hash = hashlib.md5(prompt.encode("utf-8")).hexdigest()
    filename = f"{prompt_hash}.png"
    
    relative_path = f"/static/uploads/ai_images/{filename}"
    filepath = os.path.join("static", "uploads", "ai_images", filename)
    
    if os.path.exists(filepath):
        logger.info(f"Using cached AI image for prompt: '{prompt}'")
        return relative_path

    try:
        from openai import OpenAI
        client = OpenAI() # automatically reads OPENAI_API_KEY
        
        logger.info(f"Generating AI image via DALL-E 3 for prompt: '{prompt}'")
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )
        image_url = response.data[0].url
        
        # Download generated image content
        img_response = requests.get(image_url, timeout=15)
        if img_response.status_code == 200:
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, "wb") as f:
                f.write(img_response.content)
            logger.info(f"AI image successfully generated and saved to {filepath}")
            return relative_path
        else:
            logger.error(f"Failed to download generated AI image: {img_response.status_code}")
    except Exception as e:
        logger.error(f"Error calling DALL-E 3 API: {e}")

    return "https://images.unsplash.com/photo-placeholder"


def process_markdown_images(md_content: str) -> str:
    """
    Scans the markdown content for slide image placeholders:
    ![keyword](https://images.unsplash.com/photo-placeholder)
    or other unsplash placeholder URLs, and replaces them with dynamic URLs from pipeline.
    """
    if not md_content:
        return md_content

    pattern = r"!\[(.*?)\]\((https://images\.unsplash\.com/photo-placeholder|https://images\.unsplash\.com/photo-[a-zA-Z0-9\-\?\&\=\_\%\.]+)\)"
    matches = re.findall(pattern, md_content)
    if not matches:
        return md_content

    processed_content = md_content
    keyword_cache = {}

    for alt_text, full_url in matches:
        clean_keyword = alt_text.strip()
        if not clean_keyword:
            continue

        if clean_keyword not in keyword_cache:
            img_url = fetch_stock_image_url(clean_keyword)
            keyword_cache[clean_keyword] = img_url
        else:
            img_url = keyword_cache[clean_keyword]

        if img_url and img_url != "https://images.unsplash.com/photo-placeholder":
            placeholder = f"![{alt_text}]({full_url})"
            processed_content = processed_content.replace(placeholder, f"![{alt_text}]({img_url})")
            logger.info(f"Replaced slide image placeholder '{alt_text}' with dynamic URL: {img_url}")

    return processed_content
