import asyncio


class AsyncTaskManager:
    def __init__(self):
        # Lưu trữ các task theo key: ví dụ "chat_{session_id}" hoặc "material_{chapter_id}"
        self.active_tasks: dict[str, asyncio.Task] = {}

    def register_task(self, key: str, task: asyncio.Task):
        """Đăng ký một tác vụ asyncio đang chạy."""
        self.active_tasks[key] = task
        print(f"[TASK MANAGER] Đã đăng ký tác vụ cho khóa: {key}")

    def unregister_task(self, key: str):
        """Hủy đăng ký một tác vụ khi đã hoàn thành hoặc gặp lỗi."""
        self.active_tasks.pop(key, None)
        print(f"[TASK MANAGER] Đã xóa đăng ký tác vụ cho khóa: {key}")

    def cancel_task(self, key: str) -> bool:
        """Gửi tín hiệu hủy tới tác vụ đang chạy."""
        task = self.active_tasks.get(key)
        if task and not task.done():
            task.cancel()
            print(f"[TASK MANAGER] Đã phát lệnh HỦY tác vụ cho khóa: {key}")
            return True
        print(f"[TASK MANAGER] Không tìm thấy tác vụ đang chạy cho khóa: {key} hoặc tác vụ đã kết thúc.")
        return False


# Global instance để các router gọi chung
task_manager = AsyncTaskManager()
