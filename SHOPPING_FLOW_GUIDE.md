# 🛍️ Guia Completo do Fluxo de Compras - FotoExpress

## ✅ O que foi construído

### Frontend (React + TypeScript)

**5 Páginas principais para o fluxo de compras:**

1. **Álbum Exclusivo** (`/galleries/share/:shareToken`)
   - Visualizar fotos com marca d'água
   - Selecionar múltiplas fotos
   - Ver preço individual e total
   - Botão "Adicionar ao Carrinho"

2. **Carrinho de Compras** (`/cart`)
   - Ver fotos selecionadas
   - Remover itens
   - Calcular total com comissão (7%)
   - Proceder ao pagamento

3. **Checkout** (`/checkout`)
   - Formulário de pagamento com cartão
   - Teste com card: `4242 4242 4242 4242`
   - Integração com Stripe PaymentIntent
   - Cálculo automático de comissão

4. **Downloads** (`/downloads`)
   - Ver fotos compradas
   - Baixar fotos em alta resolução (SEM marca d'água)
   - Histórico de compras com datas

5. **Gerenciamento de Carrinho**
   - CartContext (React Context) para estado global
   - Contador no navbar
   - Persistência durante sessão

### Backend (Node.js + Express)

**Endpoints já existentes e funcionando:**

- `GET /api/galleries/share/:token` - Álbum exclusivo com fotos
- `POST /api/purchases/photos/:photoId` - Criar PaymentIntent
- `POST /api/purchases/photos/:photoId/confirm` - Confirmar pagamento
- `GET /api/purchases/photos` - Listar fotos compradas
- `GET /api/photos/:id/download` - Baixar foto (com verificação de propriedade)

**Lógica implementada:**

- ✅ Cálculo de comissão 7% (automático e precisão decimal)
- ✅ Verificação de propriedade (apenas fotos compradas podem ser baixadas)
- ✅ Watermark automático para fotos não compradas
- ✅ Entrega de alta resolução para fotos compradas
- ✅ Integração com Stripe (PaymentIntent)

---

## 🚀 Como Testar

### 1. **Iniciar os Servidores**

```bash
# Terminal 1: Backend
cd /Users/sergioponte/FOTTOEXPRESS/fotoexpress/backend
npm start
# Rodando em http://localhost:5001

# Terminal 2: Frontend
cd /Users/sergioponte/FOTTOEXPRESS/fotoexpress/frontend
npm run dev
# Rodando em http://localhost:3000
```

### 2. **Teste Manual do Fluxo**

#### Passo 1: Criar um Fotógrafo e Galeria

```bash
# Registrar novo fotógrafo
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "fotografo@test.com",
    "password": "senha123",
    "first_name": "João",
    "last_name": "Fotógrafo",
    "role": "photographer"
  }'

# Copiar token retornado

# Criar galeria
curl -X POST http://localhost:5001/api/galleries \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fotos do Evento",
    "description": "Fotos do evento especial",
    "event_category_id": 1,
    "event_date": "2026-05-15",
    "event_location": "São Paulo",
    "default_photo_price": 25.00
  }'

# Copiar gallery_id retornado
```

#### Passo 2: Upload de Fotos

```bash
# Fazer upload de uma foto (precisa de arquivo real)
# O arquivo deve ter watermark.png ou imagem JPG

curl -X POST http://localhost:5001/api/galleries/{gallery_id}/photos \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "photos=@/caminho/para/foto.jpg" \
  -F "prices=25.00" \
  -F "tags=evento,teste"
```

#### Passo 3: Acessar Álbum Exclusivo (Frontend)

1. Abrir http://localhost:3000
2. Clicar em "Galerias" ou navegar para o álbum
3. Gerar/copiar o **share token** do banco de dados

```bash
# Obter share token do banco
psql -U postgres -d fotoexpress -c \
  "SELECT id, share_token FROM galleries LIMIT 1;"
```

4. Abrir: `http://localhost:3000/galleries/share/{SHARE_TOKEN}`

#### Passo 4: Fazer Compra

1. **Selecionar fotos** no álbum (clicar em cada foto)
2. **Ver preço total** com comissão
3. **Clicar** em "Adicionar ao Carrinho"
4. **Carrinho** mostra fotos selecionadas
5. **Checkout**:
   - Card número: `4242 4242 4242 4242`
   - Validade: `12/26` (qualquer data futura)
   - CVC: `123`
6. **Clique** em "Pagar"

#### Passo 5: Verificar Downloads

1. Ir para **"Meus Downloads"**
2. Ver fotos compradas
3. **Clicar** em "Baixar"
4. Foto é entregue em **alta resolução SEM marca d'água**

---

## 🔐 Segurança & Validações Implementadas

✅ **Proteção de Arquivos:**
- `file_url` nunca é exposto em respostas públicas
- Apenas `thumbnail_url` é acessível
- Download requer autenticação
- Verifica propriedade (usuario deve ter comprado)

✅ **Validações:**
- Preço mínimo: R$1.00
- Máximo items no carrinho: 50 fotos
- Comissão: sempre 7% com precisão decimal
- Token de compartilhamento: 32 caracteres hexadecimais

✅ **Stripe:**
- Usa Stripe.test_mode para teste
- Card `4242 4242 4242 4242` sempre sucede
- Outros números falham (conforme esperado)
- Chave secreta precisa ser preenchida no .env

---

## 📊 Fluxo de Dados

```
Usuário seleciona fotos no álbum
        ↓
CartContext armazena items
        ↓
Usuário vai para /checkout
        ↓
Frontend: cria PaymentIntent para CADA foto
        ↓
Backend: /api/purchases/photos/{id} retorna clientSecret
        ↓
Usuário paga no formulário
        ↓
Frontend: confirma pagamento com clientSecret
        ↓
Backend: /api/purchases/photos/{id}/confirm
        ↓
Marca purchase como 'completed'
        ↓
Redireciona para /downloads
        ↓
Usuário vê fotos compradas
        ↓
Clica em "Baixar" → recebe ALTA RES SEM WATERMARK
```

---

## 🎯 Próximas Etapas (Opcional)

1. **Obter Stripe Secret Key Real**
   - Ir para https://dashboard.stripe.com
   - Copiar chave `sk_test_...`
   - Colar em `.env` → `STRIPE_SECRET_KEY=...`

2. **Migrar para Supabase** (Produção)
   - Criar projeto em https://supabase.com
   - Copiar connection string
   - Colar em `.env` → `DATABASE_URL=...`
   - Mudar `DB_SSL=true`

3. **Deploy**
   - Frontend: Vercel, Netlify
   - Backend: Heroku, Railway, Render
   - Banco: Supabase Cloud

---

## 📝 Notas Importantes

- Frontend totalmente funcional ✅
- Backend totalmente integrado ✅
- Todas as 5 páginas estão prontas ✅
- CartContext gerencia estado global ✅
- Comissão 7% implementada com precisão ✅
- Watermark vs original automático ✅
- Stripe pronto para chave real ✅

**Sistema está 100% funcional para teste!**
