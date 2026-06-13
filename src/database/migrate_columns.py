import os
import sqlite3

db_paths = ["./lecture_generator.db", "./backend/lecture_generator.db"]

for path in db_paths:
    if not os.path.exists(path):
        continue
    print(f"Migrating database at: {path}")
    conn = sqlite3.connect(path)
    cursor = conn.cursor()

    # 1. Alter table chat_messages (add parent_id)
    try:
        cursor.execute(
            "ALTER TABLE chat_messages ADD COLUMN parent_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL"
        )
        print("Added parent_id to chat_messages")
    except sqlite3.OperationalError as e:
        print(f"chat_messages parent_id: {e}")

    # 2. Alter table chat_sessions (add active_leaf_id)
    try:
        cursor.execute("ALTER TABLE chat_sessions ADD COLUMN active_leaf_id INTEGER")
        print("Added active_leaf_id to chat_sessions")
    except sqlite3.OperationalError as e:
        print(f"chat_sessions active_leaf_id: {e}")

    # 3. Alter table chapters (add is_active and chat_message_id)
    try:
        cursor.execute("ALTER TABLE chapters ADD COLUMN is_active BOOLEAN DEFAULT 1")
        print("Added is_active to chapters")
    except sqlite3.OperationalError as e:
        print(f"chapters is_active: {e}")

    try:
        cursor.execute(
            "ALTER TABLE chapters ADD COLUMN chat_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL"
        )
        print("Added chat_message_id to chapters")
    except sqlite3.OperationalError as e:
        print(f"chapters chat_message_id: {e}")

    # 4. Alter table chapter_materials (add is_active)
    try:
        cursor.execute("ALTER TABLE chapter_materials ADD COLUMN is_active BOOLEAN DEFAULT 1")
        print("Added is_active to chapter_materials")
    except sqlite3.OperationalError as e:
        print(f"chapter_materials is_active: {e}")

    # 5. Alter table questions (add chat_message_id)
    try:
        cursor.execute(
            "ALTER TABLE questions ADD COLUMN chat_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL"
        )
        print("Added chat_message_id to questions")
    except sqlite3.OperationalError as e:
        print(f"questions chat_message_id: {e}")

    conn.commit()
    conn.close()
    print("Migration finished for this path.")
