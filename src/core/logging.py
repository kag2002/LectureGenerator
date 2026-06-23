import json
import logging

from src.config import get_settings


class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "filename": record.filename,
            "line_number": record.lineno
        }
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_record, ensure_ascii=False)

def setup_production_logging():
    """Đổi log format sang JSON ở môi trường production."""
    settings = get_settings()
    if settings.app_env == "production":
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.INFO)

        # Remove old handlers
        for handler in list(root_logger.handlers):
            root_logger.removeHandler(handler)

        # Add new console handler with JsonFormatter
        ch = logging.StreamHandler()
        ch.setFormatter(JsonFormatter())
        root_logger.addHandler(ch)
        print("[LOGGING] Custom structured JSON logs enabled for production.")
