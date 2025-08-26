const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const multer = require('multer'); // For file uploads to server
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bcrypt = require('bcrypt');
const cors = require('cors');
require('dotenv').config();

// Create express app
const app = express();
const port = 3000;
const SECRET_KEY = process.env.JWTSECRET || 'your_secret_key';



// Create MySQL connection
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',   
  password: '',   
  database: 'your_database_name', // Replace with your database name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0

});

//cors middleware
app.use(cors({
  origin: 'http://127.0.0.1:5500',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// Enable parsing JSON
app.use(express.json());

// Ensure 'images' directory exists
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'images'); // Save to 'images' folder
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Save with timestamp
  }
});

// Filter for image files only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Multer instance
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // Max 5MB
});

// Serve images statically
app.use('/images', express.static(path.join(__dirname, 'images')));


//Safaricom API credentials
const consumerKey = 'your_consumer_key';
const consumerSecret = 'your_consumer_secret';
const shortCode = 'your_paybill/till';
const passkey = 'your_passkey'; // From Safaricom
const callbackUrl = 'ngrok_url'; // ngrok URL for local testing

// Get access token
async function getOAuthToken() {
  const url = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const { data } = await axios.get(url, {
    headers: {
      Authorization: `Basic ${auth}`
    }
  });

  return data.access_token;
}

// Payment route for mpesa
app.post('/pay', async (req, res) => {
  try {
    const { phone, amount } = req.body;

    const accessToken = await getOAuthToken();

    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');

    const payload = {
      BusinessShortCode: 174379,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: 100,
      PartyA: 'phone number',
      PartyB: 174379, //safaricom test paybill number
      PhoneNumber: 'phone number', 
      CallBackURL: 'ngrok_url',
      AccountReference: "company_name",
      TransactionDesc: "Car Booking Payment"
    };

    const response = await axios.post("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Payment initiation failed.');
  }
});


// Route to fetch cars for users
app.get('/cars', async (req, res) => {
  try {
      const [rows] = await pool.query('SELECT id, name, price, type, image FROM cars');
      res.json(rows);
  } catch (error) {
      console.error('Failed to fetch cars:', error);
      res.status(500).json({ error: 'Failed to fetch cars' });
  }
});

//Booking for users
app.post('/bookings', async (req, res) => {
  try {
    const { name, email, phone, car_id, start_date, end_date, total_price, status } = req.body;

    // Check or create customer
    let [existingUser] = await pool.query('SELECT id FROM customers WHERE email = ?', [email]);
    let customer_id;

    if (existingUser.length > 0) {
      customer_id = existingUser[0].id;
    } else {
      const [newUser] = await pool.query(
        'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)',
        [name, email, phone]
      );
      customer_id = newUser.insertId;
    }

    // Insert booking
    const [booking] = await pool.query(
      `INSERT INTO bookings (customer_id, car_id, start_date, end_date, total_price, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customer_id, car_id, start_date, end_date, total_price, status]
    );

    res.status(201).json({ message: "Booking created", bookingId: booking.insertId });

  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

// Authentication Middleware for JWT
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) return res.sendStatus(401);
  
  const token = authHeader.split(' ')[1];
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ error: 'Admin access required' });
};


// Routes
//Signup
app.post('/auth/signup', async (req, res) => {
  const { email, password, gender, idNumber } = req.body;

  // Validation
  if (!email || !password || !gender || !idNumber) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if email exists
    const [rows] = await pool.query('SELECT email FROM customers WHERE email = ?', [email]);
    if (rows.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const [result] = await pool.execute(
      'INSERT INTO customers (email, password, gender, idNumber, role) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, gender, idNumber, 'user']
    );

    res.status(201).json({ 
      message: 'Signup successful',
      user: { email, gender, role: 'user' }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      error: error.code === 'ER_DUP_ENTRY' 
        ? 'Email already exists' 
        : 'Server error during signup' 
    });
  }
});

//Login
app.post('/auth/login', async (req, res) => {
  try {
    const [users] = await pool.query('SELECT * FROM customers WHERE email = ?', [req.body.email]);
    
    if (!users.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = users[0];
    const valid = await bcrypt.compare(req.body.password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      SECRET_KEY,
      { expiresIn: '1h' }
    );

    res.json({ 
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role || 'user'
      },
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

//authentication verification
app.get('/auth/verify', authenticateJWT, (req, res) => {
  try {
    res.json({ 
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(401).json({ error: 'Session verification failed' });
  }
});

// Dashboard Statistics
app.get('/admin/dashboard', authenticateJWT, isAdmin, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT COUNT(*) AS count FROM customers');
    const [cars] = await pool.query('SELECT COUNT(*) AS count FROM cars');
    const [bookings] = await pool.query('SELECT COUNT(*) AS count FROM bookings WHERE status != "cancelled"');
    
    res.json({
      users: users[0].count,
      cars: cars[0].count,
      bookings: bookings[0].count,
      revenue: bookings[0].count * 1000
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// Cars Management (CRUD)
// Get all cars
app.get('/admin/cars', authenticateJWT, isAdmin, async (req, res) => {
  try {
    const [cars] = await pool.query('SELECT * FROM cars WHERE status = "available"');
    res.json(cars);
  } catch (err) {
    console.error('Get cars error:', err);
    res.status(500).json({ error: 'Failed to fetch cars' });
  }
});

// Add a new car
app.post('/admin/cars', upload.single('image'), async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);

    const { name, price } = req.body;
    const imageFile = req.file;

    if (!name || !price || !imageFile) {
      return res.status(400).json({ message: 'Missing fields!' });
    }

    const imageUrl = `/images/${imageFile.filename}`;

    const [result] = await pool.execute(
      'INSERT INTO cars (name, image, price) VALUES (?, ?, ?)',
      [name, imageUrl, price]
    );

    res.status(201).json({ message: 'Car added successfully' });
  } catch (error) {
    console.error('Error adding car:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a car
app.put('/admin/cars/:id', authenticateJWT, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { model, price_per_day, image_url } = req.body;

    const [result] = await pool.execute(
      'UPDATE cars SET model = ?, price_per_day = ?, image_url = ? WHERE id = ?',
      [model, price_per_day, image_url, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Car not found' });
    }

    res.json({ message: 'Car updated successfully' });
  } catch (err) {
    console.error('Update car error:', err);
    res.status(500).json({ error: 'Failed to update car' });
  }
});

// Delete a car
app.delete('/admin/cars/:id', authenticateJWT, isAdmin, async (req, res) => {
  const { id } = req.params;
  const [result] = await pool.execute('DELETE FROM cars WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Car not found' });
  }
  res.json({ message: 'Car deleted successfully' });
});

// Bookings Management
app.get('/admin/bookings', authenticateJWT, isAdmin, async (req, res) => {
  try {
    const [bookings] = await pool.query(`
      SELECT 
        b.id,
        c.id AS customer_id,
        car.name AS car_name,
        b.start_date,
        b.end_date,
        b.total_price,
        b.status
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN cars car ON b.car_id = car.id
      ORDER BY id DESC
    `);
    res.json(bookings);
  } catch (err) {
    console.error('Get bookings error:', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Delete a booking
app.delete('/admin/bookings/:id', authenticateJWT, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM bookings WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ message: 'Booking deleted successfully' });
  } catch (err) {
    console.error('Delete booking error:', err);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Users Management
app.get('/admin/users', authenticateJWT, isAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT id, email, idNumber, role 
      FROM customers 
      ORDER BY id ASC
    `);
    res.json(users);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update User Role
app.put('/admin/users/:id/role', authenticateJWT, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    const [result] = await pool.execute(
      'UPDATE customers SET role = ? WHERE id = ?',
      [role, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'Role updated successfully',
      userId: id,
      newRole: role
    });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete a user
app.delete('/admin/users/:id', authenticateJWT, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM customers WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});