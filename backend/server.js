require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { WebSocketServer } = require('ws');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'valdocs',
  password: 'sharan630',
  port: 5432,
});

const wss = new WebSocketServer({ noServer: true });

const clients = new Map();

function broadcast(documentId, message) {
  clients.forEach((ws, id) => {
    if (id === documentId && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

wss.on('connection', (ws, req) => {
  const { documentId } = req;
  clients.set(documentId, ws);

  ws.on('message', async (data) => {
    const { documentId, content } = JSON.parse(data);

    try {
      await pool.query(
        'UPDATE documents SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [content, documentId]
      );
      broadcast(documentId, { documentId, content });
    } catch (err) {
      console.error('Error saving document:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(documentId);
  });
});

app.get('/check-auth', async (req, res) => {
  const user = { id: 1, email: 'user@example.com', name: 'John Doe' };
  res.json({ authenticated: true, user });
});

app.get('/list-documents', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/create-document', async (req, res) => {
  try {
    const result = await pool.query(
      'INSERT INTO documents (title, owner_id, content) VALUES ($1, $2, $3) RETURNING *',
      ['Untitled Document', 1, '']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating document:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/save-document', async (req, res) => {
  const { documentId, content } = req.body;
  try {
    await pool.query(
      'UPDATE documents SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [content, documentId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving document:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/update-title/:id', async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  try {
    await pool.query('UPDATE documents SET title = $1 WHERE id = $2', [title, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating title:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/delete-document/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ success: true, message: 'Document deleted' });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/download-pdf/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('SELECT title, content FROM documents WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { title, content } = result.rows[0];

    res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/ /g, '_')}.pdf"`);
    res.setHeader('Content-Type', 'application/pdf');

    const doc = new PDFDocument();
    doc.pipe(res);

    doc.fontSize(20).text(title, { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(content);

    doc.end();
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const server = app.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const documentId = url.searchParams.get('documentId');

  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.documentId = documentId;
    wss.emit('connection', ws, { documentId });
  });
});
