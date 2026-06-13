from sqlalchemy.orm import Session

from src.database.models import Chapter, ChapterMaterial, ChatMessage, Question


def get_descendant_message_ids(db: Session, message_id: int) -> list[int]:
    """Recurse down the chat tree to get all descendant message IDs."""
    descendants = []
    children = db.query(ChatMessage).filter(ChatMessage.parent_id == message_id).all()
    for child in children:
        descendants.append(child.id)
        descendants.extend(get_descendant_message_ids(db, child.id))
    return descendants


def reconcile_state(db: Session, edit_message_id: int, action: str):
    """
    Reconciles database resources (questions, chapters) when branching occurs.
    action: "archive", "keep", "overwrite"
    """
    # Get all descendants of the message being edited (including the message itself)
    descendant_ids = get_descendant_message_ids(db, edit_message_id)
    descendant_ids.append(edit_message_id)

    if action == "keep":
        return

    if action == "archive":
        # Soft-archive chapters
        db.query(Chapter).filter(Chapter.chat_message_id.in_(descendant_ids)).update(
            {"is_active": False}, synchronize_session=False
        )
        # Soft-archive materials
        db.query(ChapterMaterial).filter(
            ChapterMaterial.chapter_id.in_(db.query(Chapter.id).filter(Chapter.chat_message_id.in_(descendant_ids)))
        ).update({"is_active": False}, synchronize_session=False)
        # Soft-archive questions
        db.query(Question).filter(Question.chat_message_id.in_(descendant_ids)).update(
            {"is_active": False}, synchronize_session=False
        )
        db.commit()

    elif action == "overwrite":
        # Delete questions
        db.query(Question).filter(Question.chat_message_id.in_(descendant_ids)).delete(synchronize_session=False)
        # Delete materials
        db.query(ChapterMaterial).filter(
            ChapterMaterial.chapter_id.in_(db.query(Chapter.id).filter(Chapter.chat_message_id.in_(descendant_ids)))
        ).delete(synchronize_session=False)
        # Delete chapters
        db.query(Chapter).filter(Chapter.chat_message_id.in_(descendant_ids)).delete(synchronize_session=False)
        db.commit()
