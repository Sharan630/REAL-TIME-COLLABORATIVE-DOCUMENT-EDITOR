import React, { useState, useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

function App() {
  const [documents, setDocuments] = useState([]);
  const [currentDocument, setCurrentDocument] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const editorRef = useRef(null);
  const quillInstance = useRef(null);
  const ws = useRef(null);

  useEffect(() => {
    fetch('http://localhost:5000/list-documents')
      .then(res => res.json())
      .then(setDocuments);
  }, []);

  useEffect(() => {
    if (currentDocument && editorRef.current) {
      if (!quillInstance.current) {
        quillInstance.current = new Quill(editorRef.current, { theme: 'snow' });
      }
      quillInstance.current.setText(currentDocument.content || '');

      ws.current = new WebSocket(`ws://localhost:5000?documentId=${currentDocument.id}`);

      ws.current.onmessage = (event) => {
        const { content } = JSON.parse(event.data);
        quillInstance.current.setText(content);
      };

      quillInstance.current.on('text-change', () => {
        const content = quillInstance.current.getText();
        ws.current.send(JSON.stringify({ documentId: currentDocument.id, content }));
      });

      return () => {
        ws.current.close();
      };
    }
  }, [currentDocument]);

  const createNewDocument = async () => {
    const res = await fetch('http://localhost:5000/create-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      console.error('Failed to create document');
      return;
    }

    const doc = await res.json();
    setDocuments(prevDocs => [...prevDocs, doc]);
    setCurrentDocument(doc);
  };

  const deleteDocument = async (id) => {
    const res = await fetch(`http://localhost:5000/delete-document/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      console.error('Failed to delete document');
      return;
    }

    setDocuments(prevDocs => prevDocs.filter(doc => doc.id !== id));

    if (currentDocument?.id === id) {
      setCurrentDocument(null);
    }
  };

  const saveDocument = async () => {
    if (currentDocument) {
      const content = quillInstance.current.getText();
      await fetch('http://localhost:5000/save-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: currentDocument.id, content }),
      });
      alert('Document saved successfully!');
    }
  };

  const downloadPDF = (documentId) => {
    window.open(`http://localhost:5000/download-pdf/${documentId}`, '_blank');
  };

  const startRename = (doc) => {
    setIsRenaming(doc.id);
    setNewTitle(doc.title);
  };

  const renameDocument = async (id) => {
    const res = await fetch(`http://localhost:5000/rename-document/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });

    if (!res.ok) {
      console.error('Failed to rename document');
      return;
    }

    setDocuments(prevDocs => prevDocs.map(doc => (doc.id === id ? { ...doc, title: newTitle } : doc)));
    setIsRenaming(false);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>DocuSync : Real-Time Document Editor</h1>

      <nav style={styles.navbar}>
        <button style={styles.navButton} onClick={createNewDocument}>➕ New Document</button>
        <button style={styles.navButton} onClick={saveDocument}>💾 Save Document</button>
        <button style={styles.navButton} onClick={() => downloadPDF(currentDocument?.id)}>📄 Save as PDF</button>
        <button style={styles.navButton} onClick={() => window.location.reload()}>🔄 Refresh</button>
      </nav>

      <div style={styles.contentWrapper}>
        <div style={styles.docList}>
          {documents.map(doc => (
            <div key={doc.id} style={styles.docItem}>
              {isRenaming === doc.id ? (
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onBlur={() => renameDocument(doc.id)}
                  onKeyDown={(e) => e.key === 'Enter' && renameDocument(doc.id)}
                  autoFocus
                  style={styles.input}
                />
              ) : (
                <span onClick={() => setCurrentDocument(doc)} style={styles.docTitle}>{doc.title}</span>
              )}

              <div style={styles.actionButtons}>
                <button style={styles.renameButton} onClick={() => startRename(doc)}>✏️ Rename</button>
                <button style={styles.deleteButton} onClick={() => deleteDocument(doc.id)}>🗑️ Delete</button>
              </div>
            </div>
          ))}
        </div>

        {currentDocument && <div ref={editorRef} style={styles.editor} />}
      </div>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: 'Arial, sans-serif',
    background: 'linear-gradient(to right,rgb(148, 151, 208), #8f94fb)',
    minHeight: '100vh',
    padding: '20px',
    color: 'white',
  },
  navbar: {
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    margin: '20px 0',
  },
  navButton: {
    padding: '12px 24px',
    fontSize: '1.1rem',
    cursor: 'pointer',
    borderRadius: '12px',
    background: 'skyblue',
    color: 'white',
    transition: 'background 0.3s',
  },
  header: {
    textAlign: 'center',
    fontSize: '3.5rem',
    marginBottom: '20px',
  },
  contentWrapper: {
    display: 'flex',
    gap: '20px',
  },
  docList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    width: '300px',
  },
  docItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: 'skyblue',
    borderRadius: '12px',
    transition: 'background 0.3s',
  },
  docTitle: {
    cursor: 'pointer',
    flexGrow: 1,
  },
  actionButtons: {
    display: 'flex',
    gap: '10px',
  },
  input: {
    padding: '5px',
    borderRadius: '8px',
    border: 'none',
  },
  editor: {
    flexGrow: 1,
    height: '500px',
    background: 'black',
    borderRadius: '12px',
    padding: '10px',
  },
};

export default App;
