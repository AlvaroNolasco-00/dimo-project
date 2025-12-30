import requests
import time

BASE_URL = "http://localhost:8000/api"
ADMIN_EMAIL = "alvaro_guandique@hotmail.com"
ADMIN_PASSWORD = "#Papelito997700"

def test_auth_flow():
    print("Step 1: Registering Admin User (Skipped - Admin already exists)...")
    
    print("\nStep 2: Logging in as Admin...")
    login_data = {"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    resp = requests.post(f"{BASE_URL}/auth/login", data=login_data)
    if resp.status_code != 200:
        print(f"Admin Login Failed: {resp.status_code} - {resp.text}")
        return
    admin_token = resp.json().get("access_token")
    print(f"Admin Login: {resp.status_code} (Token received)")

    print("\nStep 3: Registering a regular user...")
    # Use a random email to avoid collision if run multiple times
    user_email = f"user_{int(time.time())}@example.com"
    user_data = {"email": user_email, "password": "password123"}
    resp = requests.post(f"{BASE_URL}/auth/register", data=user_data)
    print(f"User Register: {resp.status_code} - {resp.json()}")

    print("\nStep 4: Logging in as unapproved user...")
    login_data = {"username": user_email, "password": "password123"}
    resp = requests.post(f"{BASE_URL}/auth/login", data=login_data)
    user_token = resp.json().get("access_token")
    print(f"User Login: {resp.status_code}")

    print("\nStep 5: Accessing protected endpoint as unapproved user (should fail)...")
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    is_approved = resp.json().get('is_approved')
    print(f"Auth Me (unapproved): {resp.status_code} - Approved: {is_approved}")
    
    # Try an image processing endpoint (should return 403)
    resp = requests.post(f"{BASE_URL}/remove-background", headers=headers)
    print(f"Protected Image Endpoint (unapproved): {resp.status_code}")

    print("\nStep 6: Listing users as admin...")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.get(f"{BASE_URL}/admin/users", headers=admin_headers)
    
    if resp.status_code != 200:
         print(f"Failed to list users: {resp.status_code} - {resp.text}")
         return

    users = resp.json()
    print(f"Users list: Found {len(users)} users")
    
    target_user = next((u for u in users if u['email'] == user_email), None)
    
    if target_user:
        print(f"\nStep 7: Approving user {target_user['email']} as admin...")
        resp = requests.post(f"{BASE_URL}/admin/approve/{target_user['id']}", headers=admin_headers)
        print(f"Approve user: {resp.status_code} - {resp.json()}")

        print("\nStep 8: Verifying user is now approved...")
        resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        print(f"Auth Me (now approved): {resp.status_code} - Approved: {resp.json().get('is_approved')}")
    else:
        print("Error: Could not find the registered user to approve.")

if __name__ == "__main__":
    try:
        test_auth_flow()
    except Exception as e:
        print(f"Error: {e}")
        print("Make sure the backend is running at http://localhost:8000")
