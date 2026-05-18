# Testes da API de Face Matching

## Setup

**URL Base:** `http://localhost:5000`

**Header Comum:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

---

## 1. Upload de Foto (Trigger da Detecção)

### Requisição
```bash
curl -X POST http://localhost:5000/api/galleries/10/photos \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_url": "https://example.com/photo1.jpg",
    "thumbnail_url": "https://example.com/thumb1.jpg",
    "width": 1920,
    "height": 1080,
    "tags": "wedding,people"
  }'
```

### Resposta Esperada (201)
```json
{
  "id": 123,
  "gallery_id": 10,
  "file_url": "https://example.com/photo1.jpg",
  "thumbnail_url": "https://example.com/thumb1.jpg",
  "width": 1920,
  "height": 1080,
  "order_index": 0,
  "tags": "wedding,people",
  "uploaded_at": "2026-05-14T14:30:00Z"
}
```

⚠️ **Importante:** Neste momento:
- Face detection começou em background
- Face matching será acionado após detecção completar
- **Aguarde ~5-10 segundos** antes de consultar os endpoints

---

## 2. Verificar Estatísticas de Detecção

Verifica se face detection já completou e quantos rostos foram encontrados.

### Requisição
```bash
curl -X GET http://localhost:5000/api/faces/123/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Resposta Esperada (200)
```json
{
  "photoId": 123,
  "faceCount": 2,
  "confidenceScore": 0.943,
  "detectionTimestamp": "2026-05-14T14:30:15Z",
  "totalMatches": 0
}
```

**Interpretação:**
- `faceCount`: 2 rostos detectados
- `confidenceScore`: 94.3% de confiança média
- `totalMatches`: 0 (ainda nenhuma foto similar encontrada - ou não há outras fotos)

---

## 3. Fotos Similares (Raw Scores)

Retorna top 50 matches com scores detalhados.

### Requisição
```bash
curl -X GET http://localhost:5000/api/faces/123/similar \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Resposta Esperada (200)
```json
{
  "photoId": 123,
  "threshold": 0.85,
  "sourceConfidence": 0.943,
  "matchCount": 3,
  "matches": [
    {
      "matchPhotoId": 456,
      "galleryId": 11,
      "similarity": 0.891,
      "confidenceProduct": 0.878,
      "finalScore": 0.885,
      "sourceFaceIndex": 0,
      "matchFaceIndex": 0
    },
    {
      "matchPhotoId": 789,
      "galleryId": 12,
      "similarity": 0.834,
      "confidenceProduct": 0.821,
      "finalScore": 0.829,
      "sourceFaceIndex": 0,
      "matchFaceIndex": 1
    }
  ]
}
```

**Interpretação:**
- `finalScore`: Pontuação final = (0.891 × 0.7) + (0.878 × 0.3) = 0.885
- Foto #456 é a melhor correspondência (88.5% similitude)
- Foto #789 também tem boa correspondência (82.9%)

---

## 4. Todas as Fotos da Pessoa (Com Detalhes)

Retorna dados completos de todas as fotos de uma pessoa em diferentes galerias.

### Requisição
```bash
curl -X GET http://localhost:5000/api/faces/123/person-photos \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Resposta Esperada (200)
```json
{
  "sourcePhoto": {
    "id": 123,
    "gallery_id": 10,
    "file_url": "https://example.com/photo1.jpg",
    "thumbnail_url": "https://example.com/thumb1.jpg",
    "uploaded_at": "2026-05-14T14:30:00Z"
  },
  "totalMatches": 3,
  "averageSimilarity": 0.868,
  "matches": [
    {
      "id": 456,
      "gallery_id": 11,
      "file_url": "https://example.com/photo2.jpg",
      "thumbnail_url": "https://example.com/thumb2.jpg",
      "width": 1920,
      "height": 1080,
      "uploaded_at": "2026-05-13T10:15:00Z",
      "gallery_title": "Casamento João & Maria",
      "face_count": 2,
      "finalScore": 0.885
    },
    {
      "id": 789,
      "gallery_id": 12,
      "file_url": "https://example.com/photo3.jpg",
      "thumbnail_url": "https://example.com/thumb3.jpg",
      "gallery_title": "Festa de Aniversário",
      "finalScore": 0.829
    }
  ]
}
```

---

## 5. Com Threshold Customizado

Buscar com diferentes níveis de rigor.

### Requisição (Menos rigoroso - 75%)
```bash
curl -X GET "http://localhost:5000/api/faces/123/person-photos?threshold=0.75" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Requisição (Muito rigoroso - 95%)
```bash
curl -X GET "http://localhost:5000/api/faces/123/person-photos?threshold=0.95" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Efeito:**
- threshold=0.75 → Retorna MAIS fotos (menos exigente)
- threshold=0.95 → Retorna MENOS fotos (muito confiável)

---

## 6. Matches Armazenados (Do Banco)

Retorna matches previamente calculados e persistidos.

### Requisição
```bash
curl -X GET http://localhost:5000/api/faces/123/matches \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Resposta Esperada (200)
```json
{
  "photoId": 123,
  "matchCount": 3,
  "matches": [
    {
      "photo_id": 456,
      "gallery_id": 11,
      "file_url": "https://example.com/photo2.jpg",
      "thumbnail_url": "https://example.com/thumb2.jpg",
      "similarity_score": 0.885,
      "source_face_index": 0,
      "match_face_index": 0,
      "matched_at": "2026-05-14T14:30:20Z"
    }
  ]
}
```

---

## 7. Erro - Foto Não Encontrada

### Requisição
```bash
curl -X GET http://localhost:5000/api/faces/99999/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Resposta Esperada (404)
```json
{
  "error": {
    "message": "Photo not found or face detection not completed",
    "status": 404
  }
}
```

---

## 8. Erro - Sem Autenticação

### Requisição
```bash
curl -X GET http://localhost:5000/api/faces/123/stats
```

### Resposta Esperada (401)
```json
{
  "error": "Unauthorized"
}
```

---

## Checklist de Testes

- [ ] **Upload** - Foto inserida com sucesso (photo_id retornado)
- [ ] **Aguardar** - 5-10 segundos para face detection completar
- [ ] **Stats** - Retorna faceCount > 0
- [ ] **Similar** - Retorna matches (se houver outras fotos)
- [ ] **Person Photos** - Retorna sourcePhoto + matches
- [ ] **Matches** - Retorna stored matches do banco
- [ ] **Threshold** - Modificar threshold e verificar resultados mudam
- [ ] **Erro 404** - Photo inexistente retorna 404
- [ ] **Erro 401** - Sem token retorna 401
- [ ] **Cache** - Segunda requisição é mais rápida

---

## Teste Prático Completo

### Cenário: Cliente busca todas as fotos dele

1. **Cliente faz upload de 1 foto dele:**
   ```bash
   POST /api/galleries/10/photos
   → Retorna photo_id = 123
   ```

2. **Sistema detecta rosto automaticamente** (background)
   - Face detection extracts embeddings
   - Face matching procura outras fotos similares

3. **Cliente consulta depois:**
   ```bash
   GET /api/faces/123/person-photos
   → Retorna todas as fotos dele em diferentes eventos
   ```

4. **Cliente consegue ver/comprar:**
   - Fotos da mesma pessoa em múltiplas galerias
   - Scores de confiança de cada match
   - URLs para preview/compra

---

## Debugging

### Se não encontra matches (matchCount = 0):

1. Verificar se há outras fotos no banco
   ```bash
   GET /api/galleries/11 → ver se tem fotos
   ```

2. Verificar se detecção completou
   ```bash
   GET /api/faces/123/stats → faceCount > 0?
   ```

3. Tentar com threshold mais baixo
   ```bash
   GET /api/faces/123/similar?threshold=0.75
   ```

4. Verificar logs do servidor
   - `Background face detection failed:`
   - `Background face matching failed:`

### Se demora muito:

- Face detection demora ~3-5 segundos por foto
- Face matching demora mais com muitas fotos no banco
- Aguarde até 30 segundos na primeira vez
- Queries subsequentes usam cache (rápidas)

