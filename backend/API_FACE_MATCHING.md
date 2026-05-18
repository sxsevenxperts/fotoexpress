# API de Correspondência Facial - Face Matching

## Visão Geral

A API de correspondência facial permite encontrar fotos da mesma pessoa em diferentes galerias e eventos usando detecção de face com Google Cloud Vision e algoritmos de similaridade.

## Fluxo de Funcionamento

1. **Upload de Foto** → POST `/api/galleries/:id/photos`
2. **Detecção Facial Automática** → Extrai embeddings de landmarks (background)
3. **Correspondência Facial Automática** → Encontra fotos similares (background)
4. **Consulta de Resultados** → GET `/api/faces/:photo_id/*`

---

## Endpoints

### 1. Fotos Similares (Top 50)
```
GET /api/faces/:photo_id/similar
```

**Parâmetros:**
- `photo_id` (path): ID da foto
- `threshold` (query, opcional): Mínimo de similaridade (padrão: 0.85, range: 0-1)

**Autenticação:** Requerida (authMiddleware)

**Cache:** Sim (5 minutos)

**Resposta (200):**
```json
{
  "photoId": 123,
  "threshold": 0.85,
  "sourceConfidence": 0.95,
  "matchCount": 42,
  "matches": [
    {
      "matchPhotoId": 456,
      "galleryId": 10,
      "similarity": 0.923,
      "confidenceProduct": 0.912,
      "finalScore": 0.918,
      "sourceFaceIndex": 0,
      "matchFaceIndex": 0
    }
  ]
}
```

---

### 2. Fotos de Uma Pessoa (Com Detalhes)
```
GET /api/faces/:photo_id/person-photos
```

**Parâmetros:**
- `photo_id` (path): ID da foto
- `threshold` (query, opcional): Mínimo de similaridade (padrão: 0.85)

**Autenticação:** Requerida

**Resposta (200):**
```json
{
  "sourcePhoto": {
    "id": 123,
    "gallery_id": 10,
    "file_url": "https://...",
    "thumbnail_url": "https://...",
    "uploaded_at": "2026-05-14T10:30:00Z"
  },
  "totalMatches": 42,
  "averageSimilarity": 0.891,
  "matches": [
    {
      "id": 456,
      "gallery_id": 11,
      "file_url": "https://...",
      "thumbnail_url": "https://...",
      "gallery_title": "Casamento João & Maria",
      "finalScore": 0.918
    }
  ]
}
```

---

### 3. Matches Armazenados
```
GET /api/faces/:photo_id/matches
```

**Resposta (200):**
```json
{
  "photoId": 123,
  "matchCount": 42,
  "matches": [
    {
      "photo_id": 456,
      "gallery_id": 11,
      "file_url": "https://...",
      "thumbnail_url": "https://...",
      "similarity_score": 0.918,
      "matched_at": "2026-05-14T11:00:00Z"
    }
  ]
}
```

---

### 4. Estatísticas de Detecção
```
GET /api/faces/:photo_id/stats
```

**Resposta (200):**
```json
{
  "photoId": 123,
  "faceCount": 3,
  "confidenceScore": 0.953,
  "detectionTimestamp": "2026-05-14T10:31:00Z",
  "totalMatches": 42
}
```

---

## Algoritmo de Scoring

**Final Score = (Cosine Similarity × 0.7) + (Confidence Product × 0.3)**

- Similarity: Compara embeddings de landmarks normalizados
- Confidence: Produto da confiança dos dois rostos
- Threshold: 0.85 por padrão (encontra matches muito confiáveis)

---

## Fluxo de Upload (Automático)

```
1. POST /api/galleries/:id/photos
   └─ Retorna 201 imediatamente
   
2. Background: detectFacesInPhoto()
   └─ Extrai embeddings e armazena
   
3. Background: findSimilarFaces(photoId, 0.85)
   └─ Encontra e armazena matches
```

---

## Limites

| Item | Limite |
|------|--------|
| Faces por foto | 100 |
| Matches retornados | Top 50 |
| Threshold padrão | 0.85 |
| Cache | 5 minutos |

