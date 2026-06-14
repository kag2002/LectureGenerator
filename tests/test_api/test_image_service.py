import unittest
from unittest.mock import patch, MagicMock
from src.services.image_service import fetch_unsplash_image_url, process_markdown_images

class TestImageService(unittest.TestCase):
    @patch('src.services.image_service.requests.get')
    @patch('src.services.image_service.os.getenv')
    def test_fetch_unsplash_image_url_success(self, mock_getenv, mock_get):
        mock_getenv.return_value = "fake_access_key"
        
        # Mock API response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": [
                {
                    "urls": {
                        "regular": "https://images.unsplash.com/photo-123456"
                    }
                }
            ]
        }
        mock_get.return_value = mock_response
        
        url = fetch_unsplash_image_url("computer")
        self.assertTrue(url.startswith("https://images.unsplash.com/photo-123456"))
        self.assertIn("auto=format", url)
        self.assertIn("w=800", url)
        mock_get.assert_called_once()
        
    @patch('src.services.image_service.requests.get')
    @patch('src.services.image_service.os.getenv')
    def test_fetch_unsplash_image_url_no_results(self, mock_getenv, mock_get):
        mock_getenv.return_value = "fake_access_key"
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"results": []}
        mock_get.return_value = mock_response
        
        url = fetch_unsplash_image_url("nonexistent_query")
        self.assertEqual(url, "https://images.unsplash.com/photo-placeholder")
        
    @patch('src.services.image_service.fetch_unsplash_image_url')
    def test_process_markdown_images(self, mock_fetch):
        mock_fetch.return_value = "https://images.unsplash.com/photo-resolved"
        
        md_content = """# Slide 1
Some bullet point.
![business meeting](https://images.unsplash.com/photo-placeholder)
Another text.
"""
        processed = process_markdown_images(md_content)
        self.assertIn("![business meeting](https://images.unsplash.com/photo-resolved)", processed)
        self.assertNotIn("photo-placeholder", processed)
        mock_fetch.assert_called_once_with("business meeting")
        
    @patch('src.services.image_service.fetch_unsplash_image_url')
    def test_process_markdown_images_real_unsplash_url(self, mock_fetch):
        # Even if LLM outputs a real Unsplash URL, we want to replace it to avoid duplicates!
        mock_fetch.return_value = "https://images.unsplash.com/photo-new-resolved"
        
        md_content = """# Slide 1
![business discussion](https://images.unsplash.com/photo-1517245386807-bb43f82c33c4)
"""
        processed = process_markdown_images(md_content)
        self.assertIn("![business discussion](https://images.unsplash.com/photo-new-resolved)", processed)
        mock_fetch.assert_called_once_with("business discussion")
