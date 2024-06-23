require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// PostgreSQL setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.json());

// Route to handle root
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Selamat Datang Kawan...' });
});

// Route to handle file uploads and saving metadata
app.post('/certificate', upload.single('image'), async (req, res) => {
    const { title, provider, date, link } = req.body;
    const file = req.file;

    if (!title || !file) {
        return res.status(400).json({ error: 'Title and image are required' });
    }

    try {
        // Upload image to Supabase storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('images')
            .upload(`public/${file.originalname}`, file.buffer, {
                contentType: file.mimetype
            });

        if (uploadError) {
            throw uploadError;
        }

        const publicURL = `${supabaseUrl}/storage/v1/object/public/images/public/${file.originalname}`;

        // Insert metadata into the PostgreSQL database
        const result = await pool.query(
            'INSERT INTO certificates (title, provider, date, link, image) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [title, provider, date, link, publicURL]
        );

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Route to get all certificates
app.get('/certificates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM certificates');
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to get a single certificate by ID
app.get('/certificate/:id', async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query('SELECT * FROM certificates WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to update a certificate by ID
app.put('/certificate/:id', upload.single('image'), async (req, res) => {
    const id = req.params.id;
    const { title, provider, date, link } = req.body;
    const file = req.file;

    try {
        let publicURL = null;

        if (file) {
            // Upload image to Supabase storage
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('images')
                .upload(`public/${file.originalname}`, file.buffer, {
                    contentType: file.mimetype
                });

            if (uploadError) {
                throw uploadError;
            }

            publicURL = `${supabaseUrl}/storage/v1/object/public/images/public/${file.originalname}`;
        }

        // Update metadata in the PostgreSQL database
        const query = `
            UPDATE certificates 
            SET title = $1, provider = $2, date = $3, link = $4, image = COALESCE($5, image) 
            WHERE id = $6 
            RETURNING *`;
        const values = [title, provider, date, link, publicURL, id];

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to delete a certificate by ID
app.delete('/certificate/:id', async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query('DELETE FROM certificates WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to filter certificates by provider
app.get('/certificates/provider/:provider', async (req, res) => {
    const provider = req.params.provider;

    try {
        const result = await pool.query('SELECT * FROM certificates WHERE provider = $1', [provider]);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to filter certificates by oldest date first 
app.get('/certificates/oldest', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM certificates ORDER BY date ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to filter certificates by newest date
app.get('/certificates/newest', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM certificates ORDER BY date DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
