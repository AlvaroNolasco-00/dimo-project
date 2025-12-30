from backend.database import SessionLocal, engine
from backend import models, auth
from sqlalchemy.orm import Session

def init_db():
    # Create tables
    print("Creating tables in PostgreSQL...")
    models.Base.metadata.create_all(bind=engine)
    print("Tables created.")

def create_root_user(db: Session):
    try:
        email = "alvaro_guandique@hotmail.com"
        password = "#Papelito997700"
        
        # Check if user already exists
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            print(f"User {email} already exists. Updating to Admin/Approved...")
            user.is_admin = True
            user.is_approved = True
            user.hashed_password = auth.get_password_hash(password)
        else:
            print(f"Creating Root User: {email}...")
            user = models.User(
                email=email,
                hashed_password=auth.get_password_hash(password),
                is_admin=True,
                is_approved=True
            )
            db.add(user)
        
        db.commit()
        print("Root user created/updated successfully.")
    except Exception as e:
        print(f"Error creating root user: {e}")
        db.rollback()

if __name__ == "__main__":
    # init_db() # Skipped as per user instruction (tables already created)
    db = SessionLocal()
    try:
        create_root_user(db)
    finally:
        db.close()
