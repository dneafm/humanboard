import webbrowser
import urllib.parse

# 1. THAY THẾ HAI THÔNG SỐ NÀY BẰNG THÔNG TIN APP CỦA BẠN
# (Lấy App ID trong mục "Cài đặt ứng dụng -> Bản thiết kế" trên Web Meta Developer)
APP_ID = "942032782001159" 
REDIRECT_URI = "https://www.facebook.com/connect/login_success.html"

# 2. Cấu hình các quyền SẠCH của năm 2026 (Tuyệt đối không có manage_pages)
scopes = [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement"
]

scope_str = ",".join(scopes)

# 3. Tạo URL đăng nhập trực tiếp
params = {
    "client_id": APP_ID,
    "redirect_uri": REDIRECT_URI,
    "response_type": "token",
    "scope": scope_str
}

auth_url = f"https://www.facebook.com/v25.0/dialog/oauth?{urllib.parse.urlencode(params)}"

print("=== HỆ THỐNG ĐANG MỞ TRÌNH DUYỆT ===")
print("Nếu trình duyệt không tự mở, hãy copy link này dán vào thanh địa chỉ:")
print(auth_url)
print("====================================")

webbrowser.open(auth_url)
