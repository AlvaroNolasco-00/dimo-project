from backend.database import engine
from sqlalchemy import text

def run_sql_file(filename):
    with engine.connect() as connection:
        with open(filename, 'r') as file:
            sql_statements = file.read()
            # Split by semicolon to handle multiple statements if any, though usually execute handles it or text() 
            # text() with connect() usually handles the whole block.
            # But let's wrap in transaction
            trans = connection.begin()
            try:
                connection.execute(text(sql_statements))
                trans.commit()
                print(f"Successfully executed {filename}")
            except Exception as e:
                trans.rollback()
                print(f"Error executing {filename}: {e}")

if __name__ == "__main__":
    run_sql_file("backend/create_order_item_details.sql")
