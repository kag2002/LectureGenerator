from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from src.auth import create_access_token, get_password_hash, verify_password
from src.database.models import User
from src.database.session import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


@router.post("/register", response_model=TokenResponse)
def register(user_data: UserRegister, db: Session = Depends(get_db)) -> dict[str, any]:
    """Đăng ký tài khoản giảng viên mới và trả về access token."""
    # Kiểm tra xem email đã được đăng ký chưa
    db_user = db.query(User).filter(User.email == user_data.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email đã tồn tại trên hệ thống.")

    # Tạo user mới
    hashed_password = get_password_hash(user_data.password)
    new_user = User(email=user_data.email, password_hash=hashed_password, full_name=user_data.full_name)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Tạo JWT token
    access_token = create_access_token(data={"sub": new_user.email})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": new_user.id, "email": new_user.email, "full_name": new_user.full_name},
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
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name},
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
