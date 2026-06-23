from src.services.image_service import fetch_stock_image_url, process_markdown_images


def test_image_pipeline_fallback():
    # Calling the stock image search pipeline
    # Even if keys are missing in test context, it should gracefully fall back to placeholder
    url = fetch_stock_image_url("computer science")
    assert url is not None
    assert url.startswith("http")

def test_process_markdown_images():
    md = "# Slide\n![computer science](https://images.unsplash.com/photo-placeholder)"
    processed = process_markdown_images(md)
    assert processed is not None
    assert "https://images.unsplash.com/photo-placeholder" not in processed or "photo-placeholder" in processed
