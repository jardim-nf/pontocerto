/**
 * ============================================
 *  CHATBOT PONTO CERTO INFORMÁTICA
 *  Netlify Function: Uazapi Webhook → OpenAI → WhatsApp
 *  Suporte: Texto + Áudio (até 2 minutos)
 * ============================================
 */

const OpenAI = require('openai');
const { Readable } = require('stream');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// CONFIGURAÇÃO DE ÁUDIO
// ============================================
const MAX_AUDIO_SECONDS = 120; // 2 minutos

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

SEJA BREVE E CONTINUE O ASSUNTO. NÃO FAÇA APRESENTAÇÕES REPETIDAS.

ÁUDIOS:
Você também entende áudios do cliente (até 2 minutos). O áudio será transcrito e a transcrição chegará como [TRANSCRIÇÃO DE ÁUDIO: ...]. Responda normalmente como se o cliente tivesse digitado aquela mensagem. Não mencione que foi um áudio a menos que não faça sentido.`;
}



// ============================================
// FUNÇÕES DE ÁUDIO
// ============================================

/**
 * Baixa o áudio da mensagem via API da Uazapi
 * Tenta múltiplas estratégias de download
 */
async function downloadAudioFromUazapi(messageId, mediaUrl) {
    // ═══ ESTRATÉGIA 1: Uazapi getBase64 ═══
    try {
        const url = `${process.env.UAZAPI_URL}/chat/getBase64`;
        console.log(`🎵 Tentativa 1 - getBase64: ${url} (msgId: ${messageId})`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': process.env.UAZAPI_TOKEN,
            },
            body: JSON.stringify({ messageId }),
        });

        if (response.ok) {
            const data = await response.json();
            const base64Data = data.base64 || data.data || data.result;
            if (base64Data) {
                console.log('✅ Áudio baixado via getBase64');
                const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
                return Buffer.from(cleanBase64, 'base64');
            }
        }
        console.warn('⚠️ getBase64 não retornou dados');
    } catch (e) {
        console.warn('⚠️ getBase64 falhou:', e.message);
    }

    // ═══ ESTRATÉGIA 2: Uazapi downloadMediaMessage ═══
    try {
        const url = `${process.env.UAZAPI_URL}/chat/downloadMediaMessage`;
        console.log(`🎵 Tentativa 2 - downloadMediaMessage: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': process.env.UAZAPI_TOKEN,
            },
            body: JSON.stringify({ messageId }),
        });

        if (response.ok) {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('json')) {
                const data = await response.json();
                const base64Data = data.base64 || data.data || data.result;
                if (base64Data) {
                    console.log('✅ Áudio baixado via downloadMediaMessage (json)');
                    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
                    return Buffer.from(cleanBase64, 'base64');
                }
            } else {
                // Retornou o binário direto
                const arrayBuffer = await response.arrayBuffer();
                if (arrayBuffer.byteLength > 0) {
                    console.log('✅ Áudio baixado via downloadMediaMessage (binary)');
                    return Buffer.from(arrayBuffer);
                }
            }
        }
        console.warn('⚠️ downloadMediaMessage não retornou dados');
    } catch (e) {
        console.warn('⚠️ downloadMediaMessage falhou:', e.message);
    }

    // ═══ ESTRATÉGIA 3: URL direta do WhatsApp (último recurso) ═══
    if (mediaUrl) {
        try {
            console.log(`🎵 Tentativa 3 - URL direta: ${mediaUrl.substring(0, 60)}...`);
            const response = await fetch(mediaUrl);
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                if (arrayBuffer.byteLength > 0) {
                    console.log('✅ Áudio baixado via URL direta');
                    return Buffer.from(arrayBuffer);
                }
            }
        } catch (e) {
            console.warn('⚠️ URL direta falhou:', e.message);
        }
    }

    throw new Error('Todas as estratégias de download falharam');
}

/**
 * Transcreve um buffer de áudio usando OpenAI Whisper
 */
async function transcribeAudio(audioBuffer) {
    console.log(`🎤 Transcrevendo áudio (${Math.round(audioBuffer.length / 1024)}KB)...`);

    // Cria um File-like object para o SDK da OpenAI
    const file = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });

    const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: file,
        language: 'pt',
    });

    console.log(`✅ Transcrição: "${transcription.text.substring(0, 100)}..."`);
    return transcription.text;
}

/**
 * Detecta se a mensagem contém áudio e extrai metadados
 * Baseado no payload REAL da Uazapi (testado em produção)
 */
function detectAudioMessage(body) {
    // ═══ FORMATO A — BaseUrl (meunumero.uazapi.com) ═══
    // Payload real: body.message.messageType === "AudioMessage"
    // Dados do áudio: body.message.content { seconds, mimetype, URL, ... }
    // ID da mensagem: body.message.messageid
    if (body.BaseUrl) {
        const msg = body.message || {};
        if (msg.messageType === 'AudioMessage' || msg.mediaType === 'ptt' || msg.mediaType === 'audio') {
            const content = msg.content || {};
            return {
                isAudio: true,
                duration: content.seconds || 0,
                messageId: msg.messageid || msg.id || '',
                mimetype: content.mimetype || 'audio/ogg; codecs=opus',
                mediaUrl: content.URL || '',
            };
        }
    }

    // ═══ FORMATO B — event messages.upsert ═══
    if (body?.event === 'messages.upsert' || body?.data?.key) {
        const msgData = body.data || {};
        const audioMsg = msgData?.message?.audioMessage;
        if (audioMsg) {
            return {
                isAudio: true,
                duration: audioMsg.seconds || 0,
                messageId: msgData?.key?.id || '',
                mimetype: audioMsg.mimetype || 'audio/ogg',
            };
        }
    }

    // ═══ FORMATO C — Baileys legado ═══
    if (body?.key?.remoteJid) {
        const audioMsg = body?.message?.audioMessage;
        if (audioMsg) {
            return {
                isAudio: true,
                duration: audioMsg.seconds || 0,
                messageId: body?.key?.id || '',
                mimetype: audioMsg.mimetype || 'audio/ogg',
            };
        }
    }


    return { isAudio: false };
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

        // ================================================================
        // PROCESSAMENTO DE ÁUDIO
        // ================================================================
        const audioInfo = detectAudioMessage(body);

        if (audioInfo.isAudio) {
            console.log(`🎵 ÁUDIO detectado: ${audioInfo.duration}s, msgId=${audioInfo.messageId}`);

            // Verificar limite de 2 minutos
            if (audioInfo.duration > MAX_AUDIO_SECONDS) {
                console.log(`⏭️ ÁUDIO muito longo: ${audioInfo.duration}s (limite: ${MAX_AUDIO_SECONDS}s)`);
                const phoneFinalAudio = telefone.startsWith('55') ? telefone : `55${telefone}`;
                await sendWhatsAppMessage(
                    phoneFinalAudio,
                    `Opa! 😅 Infelizmente só consigo entender áudios de até 2 minutos. Pode mandar um áudio mais curto ou digitar sua mensagem? 👍`
                );
                return { statusCode: 200, body: JSON.stringify({ status: 'ignored', reason: 'audio_too_long' }) };
            }

            // Baixar e transcrever o áudio
            try {
                const audioBuffer = await downloadAudioFromUazapi(audioInfo.messageId, audioInfo.mediaUrl);
                const transcricao = await transcribeAudio(audioBuffer);
                mensagemTexto = `[TRANSCRIÇÃO DE ÁUDIO: ${transcricao}]`;
                console.log(`🎤 Áudio transcrito: "${transcricao.substring(0, 80)}..."`);
            } catch (audioErr) {
                console.error('❌ Erro ao processar áudio:', audioErr.message);
                const phoneFinalAudio = telefone.startsWith('55') ? telefone : `55${telefone}`;
                await sendWhatsAppMessage(
                    phoneFinalAudio,
                    `Desculpa, não consegui ouvir o áudio 😅 Pode digitar sua mensagem ou tentar mandar o áudio de novo?`
                );
                return { statusCode: 200, body: JSON.stringify({ status: 'error', reason: 'audio_failed' }) };
            }
        }

        if (!mensagemTexto) {
            console.log('⏭️ IGNORADO: sem texto e sem áudio');
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
