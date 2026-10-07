/**
 * ==============================================================================
 * DỰ ÁN: QUẢN LÝ SÁCH (MIDTERM_23IT143)
 * Tác giả: Lê Bảo Long - MSSV: 23IT143
 * Module: db.js - Quản lý Đa luồng kết nối MongoDB (Mongoose Multi-Connection)
 * ==============================================================================
 * 
 * Kiến trúc Cloud/DevOps:
 * - Tách biệt kết nối ĐỌC (Read) và GHI (Write) chuẩn Command Query Responsibility
 *   Segregation (CQRS) ở mức database.
 * - Sử dụng mongoose.createConnection() độc lập thay vì mongoose.connect() mặc định.
 * - Thiết lập Connection Pooling tối ưu cho môi trường Production/Cloud.
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Kiểm tra biến môi trường bắt buộc
const MONGO_URI_READ = process.env.MONGO_URI_READ;
const MONGO_URI_WRITE = process.env.MONGO_URI_WRITE;

if (!MONGO_URI_READ || !MONGO_URI_WRITE) {
  console.error('[DATABASE CRITICAL ERROR] Thiếu biến môi trường MONGO_URI_READ hoặc MONGO_URI_WRITE!');
  process.exit(1);
}

// Cấu hình Pool Connection theo tiêu chuẩn Cloud DevOps
const connectionOptions = {
  maxPoolSize: 10,               // Tối đa 10 kết nối đồng thời cho mỗi luồng
  minPoolSize: 2,                // Duy trì tối thiểu 2 kết nối sẵn sàng
  serverSelectionTimeoutMS: 5000,// Timeout sau 5 giây nếu không kết nối được replica
  socketTimeoutMS: 45000,        // Đóng socket sau 45s không phản hồi
  autoIndex: process.env.NODE_ENV !== 'production', // Tắt autoIndex trên production để tối ưu hiệu năng
};

// ==============================================================================
// 1. KHỞI TẠO LUỒNG KẾT NỐI ĐỌC (READ CONNECTION)
// ==============================================================================
const readConnection = mongoose.createConnection(MONGO_URI_READ, connectionOptions);

readConnection.on('connected', () => {
  console.log('✅ [MongoDB READ] Đã kết nối thành công tới luồng ĐỌC (Read Stream)');
});

readConnection.on('error', (err) => {
  console.error('❌ [MongoDB READ ERROR] Lỗi kết nối luồng ĐỌC:', err.message);
});

readConnection.on('disconnected', () => {
  console.warn('⚠️ [MongoDB READ WARNING] Mất kết nối luồng ĐỌC!');
});

// ==============================================================================
// 2. KHỞI TẠO LUỒNG KẾT NỐI GHI (WRITE CONNECTION)
// ==============================================================================
const writeConnection = mongoose.createConnection(MONGO_URI_WRITE, connectionOptions);

writeConnection.on('connected', () => {
  console.log('✅ [MongoDB WRITE] Đã kết nối thành công tới luồng GHI (Write Stream)');
});

writeConnection.on('error', (err) => {
  console.error('❌ [MongoDB WRITE ERROR] Lỗi kết nối luồng GHI:', err.message);
});

writeConnection.on('disconnected', () => {
  console.warn('⚠️ [MongoDB WRITE WARNING] Mất kết nối luồng GHI!');
});

// ==============================================================================
// 3. ĐỊNH NGHĨA SCHEMA QUẢN LÝ SÁCH
// ==============================================================================
const bookSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Mã sách là bắt buộc'],
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Tên sách là bắt buộc'],
      trim: true,
    },
    basePrice: {
      type: Number,
      required: [true, 'Giá gốc là bắt buộc'],
      min: [0, 'Giá gốc không được nhỏ hơn 0'],
    },
    vatRate: {
      type: Number,
      required: true,
      default: 7, // VAT cố định theo MSSV 23IT143: (3 + 4)% = 7%
    },
    finalPrice: {
      type: Number,
      required: [true, 'Giá sau thuế là bắt buộc'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'books', // Dùng chung collection 'books'
    versionKey: false,
  }
);

// ==============================================================================
// 4. MAPPING MODEL RIÊNG BIỆT CHO TỪNG LUỒNG
// ==============================================================================

/**
 * Model ReadBook:
 * Gắn với readConnection, chỉ phục vụ các thao tác truy vấn (find, findOne, aggregate)
 */
const ReadBook = readConnection.model('Book', bookSchema);

/**
 * Model WriteBook:
 * Gắn với writeConnection, chuyên phục vụ ghi dữ liệu (save, create, update, delete)
 */
const WriteBook = writeConnection.model('Book', bookSchema);

// Export các kết nối và models để sử dụng trong ứng dụng
module.exports = {
  readConnection,
  writeConnection,
  ReadBook,
  WriteBook,
};
