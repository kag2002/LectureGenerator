import { useEffect } from 'react';

export const useDirtyState = (isDirty: boolean, onSave?: () => Promise<boolean> | boolean) => {
  // Đồng bộ trạng thái dirty cục bộ lên window để App.tsx kiểm tra toàn cục
  useEffect(() => {
    (window as any).isDirty = isDirty;
    if (onSave) {
      (window as any).dirtySaveCallback = onSave;
    } else {
      delete (window as any).dirtySaveCallback;
    }

    // Phát sự kiện thông báo thay đổi trạng thái dirty
    window.dispatchEvent(new CustomEvent('ui-dirty-state-changed', { detail: { isDirty } }));

    return () => {
      (window as any).isDirty = false;
      delete (window as any).dirtySaveCallback;
      window.dispatchEvent(new CustomEvent('ui-dirty-state-changed', { detail: { isDirty: false } }));
    };
  }, [isDirty, onSave]);

  // Chặn F5 hoặc tắt tab bằng beforeunload mặc định của trình duyệt
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'Thầy/Cô có các chỉnh sửa chưa lưu trên giao diện. Bấm tải lại trang sẽ làm mất các thay đổi này.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);
};
