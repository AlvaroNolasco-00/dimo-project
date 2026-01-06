from backend.database import SessionLocal
from backend.models import OrderState

db = SessionLocal()
count = db.query(OrderState).count()
print(f"Order States Count: {count}")
if count == 0:
    print("WARNING: Table is empty.")
else:
    print("Table has data.")
db.close()
