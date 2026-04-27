# 🚀 Guia de Deploy — Chatbot Ponto Certo (Netlify)

## Como funciona

```
Cliente WhatsApp → Uazapi → webhook Netlify → OpenAI → Uazapi → Cliente recebe resposta
```

**Custo total: ~R$34/mês** (R$29 Uazapi + ~R$5 OpenAI + R$0 Netlify)

---

## Passo 1: Criar chave da OpenAI (5 min)

1. Acesse [platform.openai.com](https://platform.openai.com)
2. Crie conta (pode usar Google)
3. Vá em **API Keys** → **Create new secret key**
4. Copie a chave (começa com `sk-...`) — guarde ela!
5. Adicione crédito: **Settings → Billing → Add payment** (R$5-10 já basta)

---

## Passo 2: Deploy na Netlify (10 min)

### 2.1 — Subir no GitHub

No PowerShell, rode esses comandos:

```powershell
cd "c:\Users\Matheus\Documents\ponto certo\server"
git init
git add .
git commit -m "Chatbot Ponto Certo Informatica"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/ponto-certo-chatbot.git
git push -u origin main
```

> Troque `SEU_USUARIO` pelo seu nome de usuário do GitHub.
> Se o repositório não existir, crie em github.com → New repository → nome: `ponto-certo-chatbot`

### 2.2 — Conectar na Netlify

1. Acesse [app.netlify.com](https://app.netlify.com)
2. Clique em **Add new site** → **Import an existing project**
3. Escolha **GitHub** → selecione `ponto-certo-chatbot`
4. Configuração do build:
   - **Build command**: `npm install`
   - **Publish directory**: `public`
5. Clique em **Deploy site**

### 2.3 — Configurar Variáveis de Ambiente

1. Na Netlify, vá em **Site settings** → **Environment variables**
2. Adicione essas variáveis:

| Variável | Valor |
|----------|-------|
| `UAZAPI_URL` | `https://meunumero.uazapi.com` |
| `UAZAPI_TOKEN` | `490403d2-f019-4ab7-b9ba-55f7c44cf3a4` |
| `OPENAI_API_KEY` | `sk-sua-chave-da-openai` |
| `OPENAI_MODEL` | `gpt-4o-mini` |

3. Após adicionar, faça um **redeploy**: Deploys → Trigger deploy → Deploy site

### 2.4 — URL do Webhook

Após o deploy, sua URL do webhook será:
```
https://SEU-SITE.netlify.app/.netlify/functions/webhook
```

Copie essa URL! Você vai precisar no próximo passo.

---

## Passo 3: Configurar Webhook na Uazapi (2 min)

1. No painel da Uazapi, clique em **Configurar Webhook**
2. Preencha:

| Campo | Valor |
|-------|-------|
| **Habilitado** | ✅ Ligar (toggle pra direita) |
| **URL** | `https://SEU-SITE.netlify.app/.netlify/functions/webhook` |
| **Escutar eventos** | `messages` |
| **Excluir dos eventos** | `wasSentByApi` |

3. Clique em **Salvar**

---

## Passo 4: Conectar WhatsApp na Uazapi (1 min)

1. No painel da Uazapi, clique em **Conectar**
2. Escaneie o QR Code com o WhatsApp da loja **(22) 98817-9813**
3. Aguarde o status mudar para **connected** ✅

---

## Passo 5: Testar! 🎉

De OUTRO celular, mande mensagem pro WhatsApp da loja:

| Teste | Mensagem | Resposta esperada |
|-------|----------|-------------------|
| Saudação | "Oi" | Bom dia/tarde/noite + menu |
| Compra | "Quero comprar um notebook" | Pergunta preferências |
| Manutenção | "Meu celular não liga" | Pede marca/modelo |
| Preço | "Quanto custa formatar?" | Orçamento grátis |
| Localização | "Onde fica a loja?" | Endereço + horário |
| Troca | "Vocês aceitam troca?" | Sim, com avaliação |
| Domicílio | "Vão na minha casa?" | Não, só na loja |
| Fora tema | "Qual o resultado do jogo?" | Redireciona educadamente |

---

## 💰 Custos

| Serviço | Custo | Limite |
|---------|-------|--------|
| **Netlify** | GRÁTIS | 125.000 chamadas/mês |
| **Uazapi** | R$29/mês | Mensagens ilimitadas |
| **OpenAI** (gpt-4o-mini) | ~R$5/mês | ~500 convesas/mês |
| **TOTAL** | **~R$34/mês** | ✅ |

---

## ⚠️ Observações

### Netlify Functions
- **Não dorme!** Diferente do Render, responde instantaneamente sempre
- Limite free: 125.000 invocações/mês (mais que suficiente)
- Timeout: 10 segundos (OpenAI responde em 2-4s normalmente)

### Sem histórico de conversa
- Cada mensagem é processada independentemente
- A IA não "lembra" mensagens anteriores na mesma conversa
- Pra 95% dos casos de uma loja isso é suficiente
- Se quiser adicionar memória depois, podemos usar Upstash Redis (grátis)
