import secrets

import requests
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from src.auth import create_access_token, get_password_hash, verify_password
from src.config import get_settings
from src.database.models import User
from src.database.session import get_db
from src.models.schemas import GoogleLoginRequest, TokenResponse, UserLogin, UserRegister

settings = get_settings()

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(user_data: UserRegister, db: Session = Depends(get_db)) -> dict[str, any]:
    """Đăng ký tài khoản giảng viên mới và trả về access token."""
    # Kiểm tra xem email đã được đăng ký chưa
    db_user = db.query(User).filter(User.email == user_data.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email đã tồn tại trên hệ thống.")

    # Tạo user mới
    hashed_password = get_password_hash(user_data.password)
    admin_list = [e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()]
    if not admin_list and settings.app_env != "production":
        role = "admin" if "admin" in user_data.email.lower() else "user"
    else:
        role = "admin" if user_data.email.lower() in admin_list else "user"
    new_user = User(email=user_data.email, password_hash=hashed_password, full_name=user_data.full_name, role=role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Tạo JWT token
    access_token = create_access_token(data={"sub": new_user.email})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": new_user.id, "email": new_user.email, "full_name": new_user.full_name, "role": new_user.role},
    }


# 1. Đăng nhập qua JSON payload (cho axios frontend gửi dễ dàng)
@router.post("/login", response_model=TokenResponse)
def login_json(user_data: UserLogin, db: Session = Depends(get_db)) -> dict[str, any]:
    """Đăng nhập bằng email và mật khẩu (dạng JSON) và trả về access token."""
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email hoặc mật khẩu không chính xác.")

    access_token = create_access_token(data={"sub": user.email})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role or "user"},
    }


# 1b. Đăng nhập bằng Google ID Token
@router.post("/google", response_model=TokenResponse)
def login_google(login_data: GoogleLoginRequest, db: Session = Depends(get_db)) -> dict[str, any]:
    """Đăng nhập bằng tài khoản Google (Xác thực Google ID Token và đăng ký nếu cần)."""
    id_token = login_data.id_token
    if not id_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thiếu Google ID Token."
        )

    try:
        response = requests.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}",
            timeout=10
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Không thể kết nối tới Google API để xác thực: {str(e)}"
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID Token không hợp lệ hoặc đã hết hạn."
        )

    token_info = response.json()

    # Kiểm tra client ID nếu cấu hình được thiết lập
    client_id = settings.google_client_id
    if client_id:
        token_aud = token_info.get("aud")
        if token_aud != client_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google Client ID không khớp với cấu hình hệ thống."
            )

    email = token_info.get("email")
    email_verified = token_info.get("email_verified")
    full_name = token_info.get("name") or (email.split("@")[0] if email else "Google User")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không lấy được email từ tài khoản Google."
        )

    # Đảm bảo email đã được xác minh trên Google
    if email_verified not in [True, "true"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản Google chưa xác minh email."
        )

    # Kiểm tra xem user đã tồn tại chưa
    user = db.query(User).filter(User.email == email).first()

    if not user:
        # Đăng ký tài khoản mới tự động
        random_password = secrets.token_urlsafe(32)
        hashed_password = get_password_hash(random_password)
        admin_list = [e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()]
        if not admin_list and settings.app_env != "production":
            role = "admin" if "admin" in email.lower() else "user"
        else:
            role = "admin" if email.lower() in admin_list else "user"
        user = User(
            email=email,
            password_hash=hashed_password,
            full_name=full_name,
            role=role
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    access_token = create_access_token(data={"sub": user.email})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role or "user"
        }
    }


# 2. Đăng nhập qua Form URL-encoded (cho Swagger UI thử nghiệm)
@router.post("/login-form", include_in_schema=False)
def login_form(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> dict[str, str]:
    """Đăng nhập bằng form URL-encoded hỗ trợ công cụ Swagger UI thử nghiệm."""
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email hoặc mật khẩu không chính xác.")

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}
