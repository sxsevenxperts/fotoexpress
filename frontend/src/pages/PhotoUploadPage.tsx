import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './PhotoUploadPage.css';

type Status = 'pending' | 'uploading' | 'done' | 'error';
type OCRStatus = 'idle' | 'scanning' | 'done';

interface QueueItem {
  id: string;
  file: File;
  preview: string;
  price: string;
  bib: string;
  status: Status;
  progress: number;
  error?: string;
  ocrStatus: OCRStatus;
  ocrDetected?: string;
}

// Carrega Tesseract sob demanda — só baixa o ~2MB se o fotógrafo subir fotos.
let tesseractPromise: Promise<any> | null = null;
async function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import('tesseract.js');
  }
  return tesseractPromise;
}

// Extrai o "número do peito" mais provável: maior número de 1-5 dígitos
// detectado na imagem (BIBs costumam ser maiores que cronometragem).
async function detectBibNumber(dataUrl: string): Promise<string | null> {
  try {
    const Tesseract = await loadTesseract();
    const { data } = await Tesseract.recognize(dataUrl, 'eng', {
      tessedit_char_whitelist: '0123456789'
    } as any);

    const matches = (data.text || '').match(/\b\d{1,5}\b/g) || [];
    if (matches.length === 0) return null;

    // Prefere o mais longo (>= 2 dígitos é mais provável BIB do que rotações isoladas).
    matches.sort((a: string, b: string) => b.length - a.length);
    return matches[0];
  } catch (e) {
    console.warn('OCR failed', e);
    return null;
  }
}

const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function PhotoUploadPage() {
  const { galleryId } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [batchPrice, setBatchPrice] = useState('25.00');
  const [batchBib, setBatchBib] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const addFiles = async (files: FileList | File[]) => {
    const items: QueueItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const preview = await readFileAsDataURL(file);
      items.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        file,
        preview,
        price: batchPrice,
        bib: '',
        status: 'pending',
        progress: 0,
        ocrStatus: 'idle'
      });
    }
    setQueue((q) => [...q, ...items]);

    // OCR em background — não bloqueia upload.
    items.forEach(async (item) => {
      updateItem(item.id, { ocrStatus: 'scanning' });
      const detected = await detectBibNumber(item.preview);
      setQueue((q) =>
        q.map((it) =>
          it.id === item.id
            ? {
                ...it,
                ocrStatus: 'done',
                ocrDetected: detected || undefined,
                bib: it.bib || detected || ''
              }
            : it
        )
      );
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    setQueue((q) => q.filter((it) => it.id !== id));
  };

  const applyBatch = () => {
    setQueue((q) =>
      q.map((it) => ({
        ...it,
        price: batchPrice || it.price,
        bib: batchBib || it.bib
      }))
    );
  };

  const uploadOne = async (item: QueueItem) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Não autenticado');
    const headers = { Authorization: `Bearer ${token}` };

    updateItem(item.id, { status: 'uploading', progress: 20 });

    const uploadRes = await axios.post(
      '/api/uploads/photo',
      { image: item.preview, filename: item.file.name },
      { headers }
    );
    updateItem(item.id, { progress: 60 });

    const tags: string[] = [];
    if (item.bib.trim()) tags.push(`bib:${item.bib.trim()}`);

    await axios.post(
      `/api/galleries/${galleryId}/photos`,
      {
        file_url: uploadRes.data.file_url,
        thumbnail_url: uploadRes.data.thumbnail_url,
        width: uploadRes.data.width,
        height: uploadRes.data.height,
        price: parseFloat(item.price) || 0,
        tags
      },
      { headers }
    );
    updateItem(item.id, { status: 'done', progress: 100 });
  };

  const handleUploadAll = async () => {
    setUploading(true);
    for (const item of queue) {
      if (item.status === 'done') continue;
      try {
        await uploadOne(item);
      } catch (err: any) {
        updateItem(item.id, {
          status: 'error',
          progress: 0,
          error: err.response?.data?.error || err.message
        });
      }
    }
    setUploading(false);
  };

  const pendingCount = queue.filter((q) => q.status === 'pending').length;
  const doneCount = queue.filter((q) => q.status === 'done').length;

  return (
    <div className="upload-container">
      <h1>📤 Upload de fotos</h1>
      <p className="upload-subtitle">
        Arraste suas fotos abaixo ou selecione do dispositivo. Defina preço e número do peito em lote.
      </p>

      <div
        className={`dropzone ${dragOver ? 'dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="dropzone-icon">📸</div>
        <h3>Arraste fotos aqui</h3>
        <p>ou clique para selecionar — JPG, PNG até 20MB cada</p>
        <span className="dropzone-btn">Selecionar fotos</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {queue.length > 0 && (
        <>
          <div className="batch-controls">
            <div className="batch-field">
              <label>Preço padrão (R$)</label>
              <input
                type="number"
                step="0.01"
                value={batchPrice}
                onChange={(e) => setBatchPrice(e.target.value)}
              />
            </div>
            <div className="batch-field">
              <label>Nº do peito padrão (opcional)</label>
              <input
                type="text"
                placeholder="Ex: 1234"
                value={batchBib}
                onChange={(e) => setBatchBib(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button className="batch-apply" onClick={applyBatch}>
              Aplicar a todas
            </button>
          </div>

          <div className="upload-queue">
            {queue.map((item) => (
              <div key={item.id} className="queue-item">
                <div className="queue-thumb">
                  <img src={item.preview} alt={item.file.name} />
                  {item.status !== 'uploading' && (
                    <button className="queue-remove" onClick={() => removeItem(item.id)}>✕</button>
                  )}
                  <span className={`queue-status ${item.status}`}>
                    {item.status === 'pending' && 'Aguardando'}
                    {item.status === 'uploading' && `${item.progress}%`}
                    {item.status === 'done' && '✓ Pronto'}
                    {item.status === 'error' && '✕ Erro'}
                  </span>
                  {item.status === 'uploading' && (
                    <div className="queue-progress" style={{ width: `${item.progress}%` }} />
                  )}
                </div>
                <div className="queue-fields">
                  <span className="queue-name">{item.file.name}</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Preço"
                    value={item.price}
                    onChange={(e) => updateItem(item.id, { price: e.target.value })}
                  />
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder={item.ocrStatus === 'scanning' ? '🔍 Detectando...' : 'Nº do peito'}
                      value={item.bib}
                      onChange={(e) => updateItem(item.id, { bib: e.target.value.replace(/\D/g, '') })}
                      style={{ width: '100%' }}
                    />
                    {item.ocrDetected && item.bib === item.ocrDetected && (
                      <span style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '0.7rem',
                        color: 'var(--color-primary)',
                        fontWeight: 700
                      }}>✨ OCR</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="upload-footer">
            <div className="upload-footer-info">
              <strong>{queue.length} foto{queue.length !== 1 ? 's' : ''}</strong>
              <span>
                {doneCount} enviadas · {pendingCount} pendentes
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="upload-submit"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                onClick={() => navigate(`/galleries/${galleryId}/manage`)}
              >
                Voltar
              </button>
              <button
                className="upload-submit"
                onClick={handleUploadAll}
                disabled={uploading || pendingCount === 0}
              >
                {uploading ? 'Enviando...' : `Enviar ${pendingCount} foto${pendingCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
