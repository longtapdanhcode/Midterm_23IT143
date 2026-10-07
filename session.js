/**
 * ==============================================================================
 * DỰ ÁN: QUẢN LÝ SÁCH (MIDTERM_23IT143)
 * Tác giả: Lê Bảo Long - MSSV: 23IT143
 * Module: session.js - Kiến trúc Stateless Session với MongoStore (connect-mongo)
 * ==============================================================================
 * 
 * Kiến trúc Cloud/DevOps:
 * - KHÔNG sử dụng MemoryStore vì vi phạm nguyên lý Twelve-Factor App & Cloud-Native.
 * - Khi scale ngang (Horizontal Pod Autoscaling / Multiple Instances đằng sau Load Balancer),
 *   Stateless Session đảm bảo tính nhất quán (Consistent Session State) trên toàn cụm.
 * - Phiên làm việc (Session) được lưu trực tiếp vào MongoDB Atlas tập trung qua
 *   kết nối Ghi (MONGO_URI_WRITE).
 */

require('dotenv').config();
const session = require('express-session');
const MongoStore = require('connect-mongo');

const MONGO_URI_WRITE = process.env.MONGO_URI_WRITE;
const SESSION_SECRET = process.env.SESSION_SECRET || 'LeBaoLong_23IT143_Default_Secret';

if (!MONGO_URI_WRITE) {
  console.error('[SESSION CRITICAL ERROR] Thiếu biến môi trường MONGO_URI_WRITE để khởi tạo Session Store!');
  process.exit(1);
}

// ==============================================================================
// 1. CẤU HÌNH MONGO STORE CHO SESSION TẬP TRUNG
// ==============================================================================
const sessionStore = MongoStore.create({
  mongoUrl: MONGO_URI_WRITE,
  collectionName: 'sessions',      // Tên collection lưu trữ phiên
  ttl: 24 * 60 * 60,               // Thời gian sống: 1 ngày (tính bằng giây)
  autoRemove: 'native',            // Tận dụng TTL Index native của MongoDB để tự hủy phiên hết hạn
  touchAfter: 24 * 3600,           // Không cập nhật lại session vào DB nếu chưa đổi dữ liệu (giảm I/O)
});

sessionStore.on('error', (error) => {
  console.error('❌ [MONGO SESSION STORE ERROR] Lỗi lưu trữ Session:', error);
});

// ==============================================================================
// 2. CẤU HÌNH EXPRESS-SESSION MIDDLEWARE
// ==============================================================================
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,                   // Không lưu lại nếu session không thay đổi
  saveUninitialized: false,        // Chỉ tạo session khi có dữ liệu được ghi (tiết kiệm DB)
  store: sessionStore,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,   // Hạn dùng cookie: 24 giờ
    httpOnly: true,                // Ngăn chặn tấn công XSS đọc cookie qua JavaScript
    sameSite: 'lax',               // Phòng chống tấn công CSRF
    secure: process.env.NODE_ENV === 'production', // Kích hoạt secure flag khi chạy HTTPS thực tế
  },
});

// ==============================================================================
// 3. FLASH MESSAGE MIDDLEWARE
// ==============================================================================
/**
 * Middleware xử lý Flash Notification:
 * Lấy thông báo từ session để truyền ra view template (res.locals),
 * sau đó xóa khỏi session để thông báo chỉ hiển thị đúng 1 lần (Stateless Flash).
 */
const flashMessageMiddleware = (req, res, next) => {
  // Gắn helper function vào request để controller dễ dàng gọi
  req.setFlash = (type, message) => {
    req.session.flash = {
      type,       // 'success' | 'danger' | 'warning' | 'info'
      message,
    };
  };

  // Nếu session có flash message, chuyển sang res.locals để Handlebars render
  if (req.session && req.session.flash) {
    res.locals.flash = req.session.flash;
    delete req.session.flash; // Xóa ngay sau khi đọc
  } else {
    res.locals.flash = null;
  }

  next();
};

module.exports = {
  sessionMiddleware,
  flashMessageMiddleware,
};
