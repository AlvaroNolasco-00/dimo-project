
import sqlite3
import os

db_path = "/Users/alvaronolasco/Documents/Projects/dimo-project/backend/sql_app.db"

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET is_approved = 1 WHERE email = 'test@example.com'")
    conn.commit()
    print("User test@example.com approved.")
    conn.close()
else:
    print(f"Database not found at {db_path}")
