import sys
import os
from sqlalchemy import text
from backend.core.database import engine

# Add the project root to sys.path so we can import backend modules if needed,
# though here we just use the engine.
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

def run_sql_file(file_path):
    print(f"--- Running migration: {os.path.basename(file_path)} ---")
    if not os.path.exists(file_path):
        print(f"Warning: File {file_path} not found. Skipping.")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        # PostgreSQL doesn't like running multiple statements with BEGIN/COMMIT in one go
        # if they are already wrapped in a transaction or if the library handles it specially.
        # However, for these scripts which are idempotent, we'll try to execute the whole block.
        sql = f.read()
        
    try:
        with engine.connect() as connection:
            # We use execution_options(isolation_level="AUTOCOMMIT") because some scripts 
            # like the master migration already have BEGIN/COMMIT blocks.
            connection.execution_options(isolation_level="AUTOCOMMIT").execute(text(sql))
        print(f"Successfully applied {os.path.basename(file_path)}")
    except Exception as e:
        print(f"Error applying {os.path.basename(file_path)}: {e}")
        # We don't exit(1) here to allow other migrations to try, 
        # but in a real production environment we might want to stop.

if __name__ == "__main__":
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sql_dir = os.path.join(base_path, "sql")
    
    # List of migrations to run in order
    # Note: Using names that were identified as new or critical for recent features
    migrations = [
        "master_migration_20260406.sql",
        "create_processing_audit_log.sql",
    ]
    
    for migration in migrations:
        run_sql_file(os.path.join(sql_dir, migration))

    print("\n--- All migrations finished ---")
