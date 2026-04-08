/**
 * ============================================
 *  CHATBOT PONTO CERTO INFORMÁTICA
 *  Netlify Function: Uazapi Webhook → OpenAI → WhatsApp
 * ============================================
 */

const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// MEMÓRIA DE CONVERSA
// Usa Netlify Blobs via API REST (mais confiável que o SDK)
// Fallback: memória em processo (funciona enquanto a instância estiver quente)
// ============================================
const TEMPO_EXPIRACAO_MIN = 30;
const MAX_MENSAGENS = 20;

// Memória in-process (funciona entre invocações na mesma instância quente)
const memoriaLocal = new Map();

async function carregarHistorico(phone) {
    try {
        // Tenta carregar da memória local primeiro
        const local = memoriaLocal.get(phone);
        if (local) {
            const minutosPassados = (Date.now() - (local.ultimaMensagem || 0)) / 60000;
            if (minutosPassados > TEMPO_EXPIRACAO_MIN) {
                console.log(`🕐 Sessão expirada para ${phone} (${Math.round(minutosPassados)}min)`);
                memoriaLocal.delete(phone);
                return [];
            }
            console.log(`💾 Histórico LOCAL carregado: ${local.historico.length} msgs`);
            return local.historico || [];
        }

        // Tenta Netlify Blobs via SDK (pode falhar em alguns ambientes)
        try {
            const { getStore } = require('@netlify/blobs');
            const store = getStore('conversas');
            const dados = await store.get(phone);
            if (dados) {
                const sessao = JSON.parse(dados);
                const minutosPassados = (Date.now() - (sessao.ultimaMensagem || 0)) / 60000;
                if (minutosPassados <= TEMPO_EXPIRACAO_MIN) {
                    console.log(`💾 Histórico BLOBS carregado: ${sessao.historico.length} msgs`);
                    // Cache local também
                    memoriaLocal.set(phone, sessao);
                    return sessao.historico || [];
                }
            }
        } catch (blobErr) {
            console.warn('⚠️ Blobs indisponível, usando memória local:', blobErr.message);
        }

        return [];
    } catch (e) {
        console.warn('⚠️ Erro ao carregar histórico:', e.message);
        return [];
    }
}

async function salvarHistorico(phone, historico) {
    const sessao = {
        historico: historico.slice(-MAX_MENSAGENS),
        ultimaMensagem: Date.now(),
    };

    // Sempre salva na memória local (instantâneo)
    memoriaLocal.set(phone, sessao);
    console.log(`💾 Histórico LOCAL salvo: ${sessao.historico.length} msgs`);

    // Tenta salvar nos Blobs também (persistência)
    try {
        const { getStore } = require('@netlify/blobs');
        const store = getStore('conversas');
        await store.set(phone, JSON.stringify(sessao));
        console.log(`💾 Histórico BLOBS salvo`);
    } catch (blobErr) {
        console.warn('⚠️ Blobs save falhou (usando só memória local):', blobErr.message);
    }
}

// ============================================
// PROMPT DE SISTEMA
// ============================================
function getSystemPrompt() {
    return `Você é o Matheus, assistente de atendimento da Ponto Certo Informática pelo WhatsApp.
Aja como um humano prestativo, rápido e 100% focado em resolver o problema do cliente de forma informal mas educada.

REGRAS ESTritas DE MENSAGENS NO WHATSAPP:
1. NUNCA (JAMAIS) inicie a mensagem se apresentando como um robô. Se o cliente disser "oi" ou "boa noite", responda como humano: "Oi, como posso te ajudar hoje?" ou "Boa noite! Em que posso ajudar?".
2. NUNCA envie listas enormes de opções a menos que o cliente pergunte "o que vocês fazem?".
3. VÁ DIRETO AO PONTO. Se o cliente estiver falando de um defeito (ex: "tela quebrou", "17 pro"), APENAS continue o atendimento: pergunte o modelo exato, o nome do cliente ou o que houve, para adiantar o orçamento.
4. Mantenha as mensagens super curtas (1 a 2 parágrafos pequenos, parecendo uma mensagem de WhatsApp real).
5. NUNCA prometa preços ou prazos exatos (avise que precisa de avaliação do técnico na loja).
6. Se não souber responder, diga "Vou confirmar isso com o técnico e já te aviso!".
7. Use emojis de forma muito natural e moderada (tipo 😊 ou 👍).

SOBRE A LOJA:
- Nome: Ponto Certo Informática
- Serviços: Venda de novos/seminovos, Manutenção de celulares e computadores, Venda de periféricos e acessórios. O orçamento é grátis.
- Horário: Seg-Sex (08:30-18:30) | Sáb (09:00-12:00)
- Endereço: Av. Venâncio Pereira Veloso, 76 - 04 - Centro, Bom Jardim - RJ
- Falar com Humano: "Vou pedir para um vendedor te chamar aqui, um momento!"

SEJA BREVE E CONTINUE O ASSUNTO. NÃO FAÇA APRESENTAÇÕES REPETIDAS.`;
}


// ============================================
// ENVIAR MENSAGEM VIA UAZAPI
// ============================================
async function sendWhatsAppMessage(phone, message) {
    const response = await fetch(`${process.env.UAZAPI_URL}/send/text`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'token': process.env.UAZAPI_TOKEN,
        },
        body: JSON.stringify({
            number: phone,
            text: message,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Uazapi error ${response.status}: ${errorText}`);
    }

    return await response.json();
}

// ============================================
// NETLIFY FUNCTION HANDLER
// Parser baseado no MataFome (produção comprovada)
// ============================================
exports.handler = async (event) => {
    // Só aceita POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'ok', message: 'Chatbot Ponto Certo ativo!' }),
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');

        // DEBUG: Log completo do payload da Uazapi
        console.log('📦 PAYLOAD COMPLETO:', JSON.stringify(body, null, 2));
        console.log('📦 CHAVES DO BODY:', Object.keys(body));

        // ================================================================
        // PARSER UNIVERSAL UAZAPI — 3 formatos comprovados
        // Copiado do MataFome (webhookBotPedidos) que funciona em produção
        // ================================================================
        let telefone = '';
        let mensagemTexto = '';
        let fromMe = false;

        if (body.BaseUrl) {
            // ═══ FORMATO A — meunumero.uazapi.com (formato principal) ═══
            const msgArr = body.messages || (body.message ? [body.message] : []);
            const msg = msgArr[0] || {};

            telefone = msg?.key?.remoteJid
                || msg?.remoteJid
                || body?.phone
                || body?.sender
                || body?.from
                || body?.chat?.phone
                || body?.chat?.number
                || '';

            mensagemTexto = msg?.message?.conversation
                || msg?.message?.extendedTextMessage?.text
                || msg?.text || msg?.body
                || body?.text || body?.body || body?.content || '';

            fromMe = msg?.key?.fromMe ?? msg?.fromMe ?? body?.fromMe ?? false;

            console.log('📋 FORMATO A (BaseUrl) detectado');

        } else if (body?.event === 'messages.upsert' || body?.data?.key) {
            // ═══ FORMATO B — evento messages.upsert com wrapper data ═══
            const msgData = body.data || {};

            telefone = msgData?.key?.remoteJid || '';
            mensagemTexto = msgData?.message?.conversation
                || msgData?.message?.extendedTextMessage?.text || '';
            fromMe = msgData?.key?.fromMe || false;

            console.log('📋 FORMATO B (data.key / messages.upsert) detectado');

        } else if (body?.key?.remoteJid) {
            // ═══ FORMATO C — Baileys legado direto ═══
            telefone = body.key.remoteJid;
            mensagemTexto = body?.message?.conversation
                || body?.message?.extendedTextMessage?.text || '';
            fromMe = body.key.fromMe || false;

            console.log('📋 FORMATO C (key.remoteJid legado) detectado');

        } else {
            // ═══ FORMATO DESCONHECIDO — tenta extrair qualquer coisa ═══
            telefone = body?.from || body?.phone || body?.number || body?.sender || '';
            mensagemTexto = body?.text || body?.message || body?.body || body?.msg || '';
            fromMe = body?.fromMe === true;

            console.log('📋 FORMATO DESCONHECIDO — tentando fallback');
        }

        // Limpar telefone: remover @s.whatsapp.net, @c.us, e caracteres não numéricos
        telefone = String(telefone).replace(/@[\w.]+/g, '').replace(/[^0-9]/g, '');
        mensagemTexto = String(mensagemTexto || '').trim();

        // Detectar grupo
        const isGroup = String(body?.key?.remoteJid || body?.data?.key?.remoteJid || '').includes('@g.us');

        console.log(`🔍 PARSED: fromMe=${fromMe}, telefone=${telefone}, texto="${mensagemTexto}", isGroup=${isGroup}`);

        // Ignorar: mensagens próprias, grupos, sem telefone/texto
        if (fromMe) {
            console.log('⏭️ IGNORADO: fromMe=true (mensagem do próprio bot)');
            return { statusCode: 200, body: JSON.stringify({ status: 'ignored', reason: 'fromMe' }) };
        }

        if (isGroup) {
            console.log('⏭️ IGNORADO: mensagem de grupo');
            return { statusCode: 200, body: JSON.stringify({ status: 'ignored', reason: 'group' }) };
        }

        if (!telefone || telefone.length < 8) {
            console.log(`⏭️ IGNORADO: telefone inválido (${telefone})`);
            return { statusCode: 200, body: JSON.stringify({ status: 'ignored', reason: 'no_phone' }) };
        }

        if (!mensagemTexto) {
            console.log('⏭️ IGNORADO: sem texto');
            return { statusCode: 200, body: JSON.stringify({ status: 'ignored', reason: 'no_text' }) };
        }

        // Garantir formato do telefone para envio (com 55)
        const phoneFinal = telefone.startsWith('55') ? telefone : `55${telefone}`;
        const pushName = body?.pushName || body?.data?.pushName || 'Cliente';

        console.log(`📩 ${pushName} (${phoneFinal}): ${mensagemTexto}`);

        // Carregar histórico da conversa
        const historico = await carregarHistorico(phoneFinal);
        console.log(`💾 Histórico carregado: ${historico.length} mensagens anteriores`);

        // Montar mensagens para OpenAI (system + histórico + nova mensagem)
        const messagesParaIA = [
            { role: 'system', content: getSystemPrompt() },
            ...historico,
            { role: 'user', content: historico.length === 0
                ? `O nome do cliente é ${pushName}. A mensagem dele é: ${mensagemTexto}`
                : mensagemTexto
            },
        ];

        // Processa com OpenAI (com contexto da conversa)
        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: messagesParaIA,
            max_tokens: 500,
            temperature: 0.7,
        });

        const reply = completion.choices[0]?.message?.content
            || 'Desculpe, tive um problema técnico. Pode repetir? 😊';

        console.log(`🤖 Resposta: ${reply.substring(0, 100)}...`);

        // Salvar histórico atualizado (mensagem do cliente + resposta do bot)
        const novoHistorico = [
            ...historico,
            { role: 'user', content: historico.length === 0
                ? `O nome do cliente é ${pushName}. A mensagem dele é: ${mensagemTexto}`
                : mensagemTexto
            },
            { role: 'assistant', content: reply },
        ];
        await salvarHistorico(phoneFinal, novoHistorico);
        console.log(`💾 Histórico salvo: ${novoHistorico.length} mensagens`);

        // Envia resposta no WhatsApp
        await sendWhatsAppMessage(phoneFinal, reply);

        console.log(`✅ Mensagem enviada para ${phoneFinal}`);

        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'ok' }),
        };

    } catch (error) {
        console.error('❌ Erro:', error.message);
        console.error('❌ Stack:', error.stack);
        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'error', message: error.message }),
        };
    }
};
