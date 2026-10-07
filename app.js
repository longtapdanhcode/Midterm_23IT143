/**
 * ==============================================================================
 * DỰ ÁN: QUẢN LÝ SÁCH (MIDTERM_23IT143)
 * Tác giả: Lê Bảo Long - MSSV: 23IT143
 * Module: app.js - Server chính (Express.js, Routing, Business Logic)
 * ==============================================================================
 * 
 * Các tiêu chí kỹ thuật đáp ứng:
 * 1. Phân tách Đa luồng Mongoose:
 *    - Luồng ĐỌC (ReadBook): Chỉ dùng find() hiển thị danh sách sách từ MONGO_URI_READ.
 *    - Luồng GHI (WriteBook): Dùng tạo mới và save() dữ liệu sách qua MONGO_URI_WRITE.
 * 2. Stateless Mongo Session:
 *    - Lưu trữ session tập trung vào MongoDB Atlas (DB_23IT143) qua connect-mongo.
 * 3. Logic nghiệp vụ cá nhân hóa theo MSSV (23IT143):
 *    - Bộ lọc mã: Mã sách BẮT BUỘC bắt đầu bằng "143" (3 số cuối MSSV).
 *    - Chữ số cuối MSSV: 3 -> Thuế VAT: (3 + 4)% = 7% (theo quy chế đề thi mới).
 *    - Công thức tính: finalPrice = Math.round(basePrice * (1 + 7 / 100)).
 * 4. Giao diện Handlebars Dashboard hiện đại:
 *    - Bootstrap 5.3, Bootstrap Icons, font Google Plus Jakarta Sans.
 *    - Real-time Preview tính giá sau thuế ngay trên form.
 *    - Footer chứa Họ tên: Lê Bảo Long, MSSV: 23IT143, Thuế suất áp dụng: 7%.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { engine } = require('express-handlebars');

// Import cấu hình Đa luồng Database (Mongoose)
const { ReadBook, WriteBook, readConnection, writeConnection } = require('./db');

// Import cấu hình Stateless Session (connect-mongo)
const { sessionMiddleware, flashMessageMiddleware } = require('./session');

const app = express();
const PORT = process.env.PORT || 3000;

// ==============================================================================
// 1. CẤU HÌNH THÔNG TIN SINH VIÊN & HẰNG SỐ NGHIỆP VỤ (PERSONALIZATION)
// ==============================================================================
const LAST_DIGIT = 3; // Chữ số cuối cùng của MSSV 23IT143
const VAT_RATE = (isNaN(LAST_DIGIT) ? 0 : LAST_DIGIT) + 4; // (3 + 4)% = 7%

const STUDENT_INFO = {
  name: 'Lê Bảo Long',
  mssv: '23IT143',
  codePrefixRequired: '143', // 3 ký tự cuối MSSV 23IT143
  lastDigitMssv: LAST_DIGIT,
  vatRate: VAT_RATE,          // 7% theo công thức đề thi mới
};

// ==============================================================================
// 2. CẤU HÌNH TEMPLATE ENGINE (EXPRESS-HANDLEBARS)
// ==============================================================================
app.engine(
  'hbs',
  engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    helpers: {
      // Helper so sánh 2 giá trị
      eq: (a, b) => a === b,
      // Helper cộng 1 cho số thứ tự (index)
      addOne: (index) => Number(index) + 1,
      // Helper định dạng tiền tệ Việt Nam (VNĐ)
      formatVND: (amount) => {
        if (typeof amount !== 'number') return amount;
        return new Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(amount);
      },
      // Helper định dạng thời gian thân thiện
      formatDate: (date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' +
               d.toLocaleDateString('vi-VN');
      },
    },
  })
);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// ==============================================================================
// 3. MIDDLEWARE HỆ THỐNG
// ==============================================================================
// Parse body từ form HTML và JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Stateless Session Middleware qua MongoDB Atlas
app.use(sessionMiddleware);

// Flash Message Middleware (lấy flash message từ session đưa vào res.locals)
app.use(flashMessageMiddleware);

// Gắn thông tin sinh viên vào res.locals để mọi view (đặc biệt là Footer & KPI) đều truy cập được
app.use((req, res, next) => {
  res.locals.studentInfo = STUDENT_INFO;
  next();
});

// ==============================================================================
// 4. ROUTING & CONTROLLER LOGIC
// ==============================================================================

/**
 * @route   GET /
 * @desc    Hiển thị giao diện quản lý sách
 * @access  Public
 * @flow    Sử dụng LUỒNG ĐỌC (ReadBook) để query danh sách sách từ database
 */
app.get('/', async (req, res, next) => {
  try {
    // --------------------------------------------------------------------------
    // LUỒNG ĐỌC: Sử dụng ReadBook model gắn với MONGO_URI_READ
    // --------------------------------------------------------------------------
    const books = await ReadBook.find()
      .sort({ createdAt: -1 })
      .lean(); // .lean() giúp tối ưu bộ nhớ, trả về plain Javascript Object cho Handlebars

    res.render('index', {
      title: 'Hệ Thống Quản Lý Sách - Cloud Architecture',
      books,
      totalBooks: books.length,
    });
  } catch (error) {
    console.error('❌ [READ CONTROLLER ERROR] Lỗi khi truy vấn danh sách sách:', error);
    next(error);
  }
});

/**
 * @route   POST /books
 * @desc    Xử lý thêm mới sách với xác thực MSSV & tính thuế VAT 7% tự động
 * @access  Public
 * @flow    Sử dụng LUỒNG GHI (WriteBook) để lưu vào database
 */
app.post('/books', async (req, res) => {
  try {
    let { code, title, basePrice } = req.body;

    // Chuẩn hóa dữ liệu đầu vào
    code = (code || '').trim();
    title = (title || '').trim();
    const parsedBasePrice = parseFloat(basePrice);

    // 1. Kiểm tra tính hợp lệ cơ bản
    if (!code || !title || isNaN(parsedBasePrice) || parsedBasePrice <= 0) {
      req.setFlash('danger', 'Vui lòng điền đầy đủ và chính xác tất cả các trường thông tin!');
      return res.redirect('/');
    }

    // --------------------------------------------------------------------------
    // 2. BỘ LỌC MÃ SÁCH THEO MSSV (Cá nhân hóa):
    //    3 số cuối MSSV 23IT143 là "143". Mã sách bắt buộc phải bắt đầu bằng "143".
    // --------------------------------------------------------------------------
    if (!code.startsWith(STUDENT_INFO.codePrefixRequired)) {
      req.setFlash(
        'danger',
        `Mã sách không hợp lệ! Theo quy chế bài thi, mã sách bắt buộc phải bắt đầu bằng "${STUDENT_INFO.codePrefixRequired}" (3 ký tự cuối MSSV của ${STUDENT_INFO.name} - ${STUDENT_INFO.mssv}).`
      );
      return res.redirect('/');
    }

    // --------------------------------------------------------------------------
    // 3. TÍNH THUẾ VAT ĐỘNG & TỔNG GIÁ SAU THUẾ:
    //    Công thức mới: VAT = (Chữ số cuối MSSV + 4)% = (3 + 4)% = 7%.
    //    finalPrice = Math.round(basePrice * (1 + 7 / 100))
    // --------------------------------------------------------------------------
    const vatRate = STUDENT_INFO.vatRate; // 7%
    const finalPrice = Math.round(parsedBasePrice * (1 + 7 / 100));

    // --------------------------------------------------------------------------
    // 4. LUỒNG GHI: Sử dụng WriteBook model gắn với MONGO_URI_WRITE
    // --------------------------------------------------------------------------
    const newBook = new WriteBook({
      code,
      title,
      basePrice: parsedBasePrice,
      vatRate,
      finalPrice,
      createdAt: new Date(),
    });

    // Thực hiện lưu trữ dữ liệu thông qua luồng Ghi
    await newBook.save();

    // Lưu thông báo thành công vào Stateless Mongo Session
    req.setFlash(
      'success',
      `Thêm sách "${title}" (Mã: ${code}) thành công! Đã áp dụng mức thuế VAT ${vatRate}% (Giá sau thuế: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(finalPrice)}).`
    );

    return res.redirect('/');
  } catch (error) {
    console.error('❌ [WRITE CONTROLLER ERROR] Lỗi khi lưu sách mới:', error);
    req.setFlash('danger', `Đã xảy ra lỗi hệ thống khi lưu sách: ${error.message}`);
    return res.redirect('/');
  }
});

// ==============================================================================
// 5. XỬ LÝ LỖI TOÀN CỤC (GLOBAL ERROR HANDLER - DEVOPS STANDARD)
// ==============================================================================
// 404 Route Not Found
app.use((req, res) => {
  res.status(404).render('index', {
    title: '404 - Không tìm thấy trang',
    books: [],
    totalBooks: 0,
    flash: {
      type: 'danger',
      message: 'Đường dẫn yêu cầu không tồn tại trên máy chủ!',
    },
  });
});

// 500 Internal Server Error
app.use((err, req, res, next) => {
  console.error('🔥 [CRITICAL SERVER ERROR]:', err);
  res.status(500).send(`
    <div style="font-family: sans-serif; padding: 40px; text-align: center;">
      <h1 style="color: #dc2626;">500 - Lỗi Máy Chủ Nội Bộ</h1>
      <p style="color: #4b5563;">Hệ thống gặp sự cố trong quá trình xử lý yêu cầu.</p>
      <pre style="background: #f3f4f6; padding: 15px; border-radius: 8px; display: inline-block; text-align: left; color: #b91c1c;">${err.message}</pre>
      <div style="margin-top: 20px;">
        <a href="/" style="color: #2563eb; text-decoration: none; font-weight: bold;">Quay lại trang chủ</a>
      </div>
    </div>
  `);
});

// ==============================================================================
// 6. KHỞI CHẠY MÁY CHỦ & QUẢN TRỊ VÒNG ĐỜI (GRACEFUL SHUTDOWN)
// ==============================================================================
const server = app.listen(PORT, () => {
  console.log('================================================================');
  console.log(`🚀 Máy chủ Quản Lý Sách đang chạy tại: http://localhost:${PORT}`);
  console.log(`👤 Sinh viên: ${STUDENT_INFO.name} | MSSV: ${STUDENT_INFO.mssv}`);
  console.log(`📈 Tiêu chuẩn VAT: ${STUDENT_INFO.vatRate}% (Đề thi mới) | Bộ lọc mã: "${STUDENT_INFO.codePrefixRequired}"`);
  console.log('================================================================');
});

// Graceful Shutdown cho Cloud DevOps (K8s / Docker SIGTERM)
const handleShutdown = async (signal) => {
  console.log(`\n🛑 Nhận tín hiệu ${signal}. Đang đóng các kết nối an toàn...`);
  server.close(async () => {
    try {
      await readConnection.close();
      console.log('🔒 Đã đóng luồng kết nối ĐỌC (Read Connection).');
      await writeConnection.close();
      console.log('🔒 Đã đóng luồng kết nối GHI (Write Connection).');
      console.log('🏁 Máy chủ đã tắt hoàn toàn!');
      process.exit(0);
    } catch (err) {
      console.error('❌ Lỗi khi đóng kết nối:', err);
      process.exit(1);
    }
  });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
