# DỰ ÁN QUẢN LÝ SÁCH - BÀI THI GIỮA KỲ (YÊU CẦU 2)
### Chuyên ngành: Backend Engineering & Cloud DevOps
### Sinh viên thực hiện: Lê Bảo Long
### MSSV: 23IT143

---

## 1. Tổng quan Kiến trúc Hệ thống

Ứng dụng được thiết kế theo tiêu chuẩn **Cloud-Native & Production-Ready**:
- **Mô hình CQRS ở cấp độ Database (Read/Write Separation):** Phân tách độc lập kết nối ĐỌC (`MONGO_URI_READ`) và kết nối GHI (`MONGO_URI_WRITE`) thông qua `mongoose.createConnection()`.
- **Stateless Session Management:** Tuân thủ nguyên lý Twelve-Factor App, không lưu trữ Session trên RAM (`MemoryStore`), mà lưu trữ tập trung trên MongoDB Atlas thông qua `connect-mongo` (`MongoStore.create()`).
- **Personalized Business Logic:**
  - Bộ lọc mã sách: Trích xuất 3 số cuối MSSV `23IT143` là `"143"`. Mã sách bắt buộc phải có tiền tố `"143"`.
  - Thuế VAT động: Số cuối MSSV là `3` $\rightarrow$ `VAT = (3 + 4)% = 7%`. Tự động tính giá sau thuế `finalPrice = Math.round(basePrice * 1.07)`.
- **Server-Side Rendering (SSR):** Giao diện tương tác chuẩn responsive xây dựng bằng `express-handlebars` với Footer hiển thị đầy đủ thông tin sinh viên và thuế VAT theo yêu cầu.

---

## 2. Cấu trúc Thư mục

```text
Midterm_23IT143/
├── .env                  # Cấu hình biến môi trường cục bộ
├── .env.example          # Mẫu cấu hình môi trường chuẩn
├── package.json          # Danh sách dependencies và scripts
├── db.js                 # Quản lý 2 kết nối MongoDB & 2 Models (ReadBook, WriteBook)
├── session.js            # Cấu hình Stateless Session lưu trữ trên MongoDB Atlas
├── app.js                # Server Express, routing, controller và graceful shutdown
└── views/
    ├── layouts/
    │   └── main.hbs      # Layout chính chứa Header và Footer bắt buộc
    └── index.hbs         # Form nhập liệu, banner trạng thái và bảng danh sách sách
```

---

## 3. Danh sách Thư viện Cài đặt

```bash
npm install express mongoose express-session connect-mongo express-handlebars dotenv
```

---

## 4. Hướng dẫn Chạy Ứng dụng

1. Tạo file cấu hình môi trường `.env`:
   ```bash
   cp .env.example .env
   ```
   *Điền chuỗi kết nối MongoDB Atlas thực tế vào `MONGO_URI_READ` và `MONGO_URI_WRITE`.*

2. Chạy ứng dụng:
   ```bash
   # Môi trường chạy chính thức
   npm start

   # Môi trường phát triển (tự reload khi sửa code)
   npm run dev
   ```

3. Truy cập ứng dụng tại:
   `http://localhost:3000`
