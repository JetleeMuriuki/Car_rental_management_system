const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const router = express.Router();


// Login route
router.post('/auth/login', (req, res) => {
    // Get login credentials from request body
    const { email, password } = req.body;
    
    // SQL query to find user
    const sql = 'SELECT * FROM customers WHERE email = ? AND password = ?';
    
    // Execute query with user credentials
    db.query(sql, [email, password], (err, results) => {
        if (err) {
            return res.status(400).json({ error: 'Login failed', details: err.message });
        }
        
        if (results.length > 0) {
            res.status(200).json({ message: 'Login successful' });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

module.exports = router;