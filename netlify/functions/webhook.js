/**
 * ============================================
 *  CHATBOT PONTO CERTO INFORMÁTICA
 *  Netlify Function: Uazapi Webhook → OpenAI → WhatsApp
 *  Suporte: Texto + Áudio (até 2 minutos)
 * ============================================
 */

const OpenAI = require('openai');
const { toFile } = require('openai');
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

async function carregarSessao(phone) {
    try {
        // Tenta carregar da memória local primeiro
        const local = memoriaLocal.get(phone);
        if (local) {
            const minutosPassados = (Date.now() - (local.ultimaMensagem || 0)) / 60000;
            if (minutosPassados > TEMPO_EXPIRACAO_MIN) {
                console.log(`🕐 Sessão expirada para ${phone} (${Math.round(minutosPassados)}min)`);
                memoriaLocal.delete(phone);
                return { historico: [] };
            }
            console.log(`💾 Sessão LOCAL carregada: ${local.historico?.length || 0} msgs`);
            return local;
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
                    console.log(`💾 Sessão BLOBS carregada: ${sessao.historico?.length || 0} msgs`);
                    // Cache local também
                    memoriaLocal.set(phone, sessao);
                    return sessao;
                }
            }
        } catch (blobErr) {
            console.warn('⚠️ Blobs indisponível, usando memória local:', blobErr.message);
        }

        return { historico: [] };
    } catch (e) {
        console.warn('⚠️ Erro ao carregar sessão:', e.message);
        return { historico: [] };
    }
}

async function salvarSessao(phone, sessao) {
    if (!sessao.historico) sessao.historico = [];
    sessao.historico = sessao.historico.slice(-MAX_MENSAGENS);
    sessao.ultimaMensagem = Date.now();

    // Sempre salva na memória local (instantâneo)
    memoriaLocal.set(phone, sessao);
    console.log(`💾 Sessão LOCAL salva: ${sessao.historico.length} msgs`);

    // Tenta salvar nos Blobs também (persistência)
    try {
        const { getStore } = require('@netlify/blobs');
        const store = getStore('conversas');
        await store.set(phone, JSON.stringify(sessao));
        console.log(`💾 Sessão BLOBS salva`);
    } catch (blobErr) {
        console.warn('⚠️ Blobs save falhou (usando só memória local):', blobErr.message);
    }
}

// ============================================
// PROMPfunction getSystemPrompt() {
    const agoraStr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const diaSemana = agora.getDay();
    const tempoAtual = agora.getHours() + agora.getMinutes() / 60;
    
    let lojaAberta = false;
    if (diaSemana !== 0) {
        if (diaSemana === 6) lojaAberta = tempoAtual >= 9 && tempoAtual < 12; // Sábado
        else lojaAberta = tempoAtual >= 8.5 && tempoAtual < 18.5; // Seg-Sex
    }

    return `Você é o Matheus, assistente de atendimento da Ponto Certo Informática pelo WhatsApp.
Aja como um humano prestativo, rápido e 100% focado em resolver o problema do cliente de forma informal mas educada.

INFORMAÇÃO IMPORTANTE DE CONTEXTO:
- Data e hora atual: ${agoraStr} (Horário de Brasília)
- Status da loja no momento: ${lojaAberta ? 'ABERTA' : 'FECHADA'}

REGRAS ESTRITAS DE MENSAGENS NO WHATSAPP:
1. NA PRIMEIRA MENSAGEM DO CLIENTE (por exemplo, quando ele disser um "Oi" limpo), VOCÊ DEVE SEMPRE responder com uma saudação adequada para o HORÁRIO ATUAL (Bom dia, Boa tarde ou Boa noite) e APRESENTAR A LOJA: "Somos da Ponto Certo Informática!". Depois pergunte como pode ajudar.
2. NUNCA (JAMAIS) fique repetindo essa saudação ("Somos da...") a cada mensagem. Fale APENAS na primeira mensagem. Fique atento ao histórico!
3. NUNCA envie listas enormes de opções a menos que o cliente pergunte "o que vocês fazem?".
4. VÁ DIRETO AO PONTO. Tente extrair o máximo de informações do cliente (modelo do aparelho, defeito, o que deseja comprar) antes de direcionar para um humano.
5. STATUS DE EQUIPAMENTO: Se o cliente perguntar se o equipamento dele (celular, computador, etc.) ficou pronto, você DEVE pedir para ele "mandar a ordem de serviço" para que você possa verificar.
6. Mantenha as mensagens super curtas (1 a 2 parágrafos pequenos, parecendo uma mensagem de WhatsApp real).
7. NUNCA prometa preços ou prazos exatos (avise que precisa de avaliação do técnico na loja).
8. Use emojis de forma muito natural e moderada (tipo 😊 ou 👍).

PAGAMENTOS VIA PIX:
- Se o cliente pedir a chave PIX, envie a chave (CNPJ) ISOLADA em uma linha para que ele possa usar a função "copiar e colar" do WhatsApp. Use EXATAMENTE a seguinte formatação:

A chave PIX (CNPJ) é:
20503845000107
Nome: Luiz f p Bruno

REGRAS DE DIRECIONAMENTO (MUITO IMPORTANTE):
Quando você não puder continuar sozinho ou quando o cliente quiser um orçamento/falar com alguém, você deve avisar que o TÉCNICO RESPONSÁVEL vai assumir.
- Para VENDAS OU DÚVIDAS DE CELULAR, o responsável é o **Luiz Fernando**.
- Para COMPUTADOR E IMPRESSORA, o responsável é o **Rafael**.
- Para VENDA/DISPONIBILIDADE DE ACESSÓRIOS (capinhas, películas, etc.) ou OUTRAS DÚVIDAS gerais, o responsável é o **Robson**. (NUNCA responda se temos ou não o acessório e não passe valores, apenas passe para o Robson verificar).

${lojaAberta 
    ? 'Como a loja está ABERTA, avise o cliente assim: "Anotado! O [Nome do Técnico] já vai te chamar aqui para ver certinho essa questão, um momento!"'
    : 'Como a loja está FECHADA (fora do expediente), você DEVE dar exatamente este aviso: "Nós estamos fora do expediente no momento, mas eu já encaminhei a sua mensagem para o [Nome do Técnico]. Assim que ele estiver disponível no próximo dia útil, ele irá te responder com prioridade, tá bom? Até mais!"'
}

REGRA DO SILÊNCIO (PAUSA DE RESPOSTA):
Se você JÁ avisou que vai passar para o técnico e o cliente continuar perguntando coisas, respondendo perguntas anteriores, OU se o cliente apenas disser "obrigado/valeu/ok/show", OU se ele se despedir com "boa noite", "ótima noite", "bom descanso", VOCÊ NÃO DEVE RESPONDER MAIS NADA. O atendimento humano já assumiu ou o atendimento terminou.
Nesse caso, sua resposta deverá ser EXATAMENTE a palavra: SILENCIO
Não adicione pontuação. Apenas: SILENCIO

SOBRE A LOJA:
- Nome: Ponto Certo Informática
- Serviços: Venda de novos/seminovos, Manutenção de celulares e computadores, Venda de periféricos e acessórios. O orçamento é grátis.
- Horário: Seg-Sex (08:30-18:30) | Sáb (09:00-12:00)
- Endereço: Av. Venâncio Pereira Veloso, 76 - 04 - Centro, Bom Jardim - RJ

SEJA BREVE E CONTINUE O ASSUNTO. NÃO FAÇA APRESENTAÇÕES REPETIDAS.

ÁUDIOS:
Você também entende áudios do cliente (até 2 minutos). O áudio será transcrito e a transcrição chegará como [TRANSCRIÇÃO DE ÁUDIO: ...]. Responda normalmente como se o cliente tivesse digitado aquela mensagem. Não mencione que foi um áudio a menos que não faça sentido.`;
}



const crypto = require('crypto');

// ============================================
// FUNÇÕES DE ÁUDIO E DESCRIPTOGRAFIA
// ============================================

/**
 * Descriptografa mídia E2EE do WhatsApp usando o mediaKey
 * Baseado no algoritmo HKDF / AES-CBC
 */
function decryptWhatsAppMedia(encryptedBuffer, mediaKeyBase64, mediaType = 'audio') {
    const mediaKey = Buffer.from(mediaKeyBase64, 'base64');
    
    const typeConfigs = {
        'audio': 'WhatsApp Audio Keys',
        'image': 'WhatsApp Image Keys',
        'video': 'WhatsApp Video Keys',
        'document': 'WhatsApp Document Keys'
    };
    const info = Buffer.from(typeConfigs[mediaType] || typeConfigs['audio'], 'utf8');

    function hkdfExpand(ikm, info, length) {
        const salt = Buffer.alloc(32, 0);
        const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
        let okm = Buffer.alloc(0);
        let t = Buffer.alloc(0);
        let counter = 1;
        while (okm.length < length) {
            t = crypto.createHmac('sha256', prk).update(Buffer.concat([t, info, Buffer.from([counter])])).digest();
            okm = Buffer.concat([okm, t]);
            counter++;
        }
        return okm.slice(0, length);
    }

    const expanded = hkdfExpand(mediaKey, info, 112);
    const iv = expanded.slice(0, 16);
    const cipherKey = expanded.slice(16, 48);

    const encryptedFile = encryptedBuffer.slice(0, encryptedBuffer.length - 10);
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
    decipher.setAutoPadding(false); 
    
    let decrypted = Buffer.concat([decipher.update(encryptedFile), decipher.final()]);

    const padLength = decrypted[decrypted.length - 1];
    if (padLength > 0 && padLength <= 16) {
        decrypted = decrypted.slice(0, decrypted.length - padLength);
    }

    return decrypted;
}

/**
 * Baixa o áudio da mensagem via API da Uazapi ou via Decrypt
 * Tenta múltiplas estratégias de download
 */
async function downloadAudioFromUazapi(messageId, mediaUrl, instanceName, mediaKey) {
    const endpointsToTry = [
        // Evolution API e Uazapi (com instanceName)
        { method: 'POST', url: `${process.env.UAZAPI_URL}/chat/getBase64/${instanceName || 'pontocerto'}`, body: { messageId } },
        { method: 'POST', url: `${process.env.UAZAPI_URL}/message/getBase64/${instanceName || 'pontocerto'}`, body: { messageId } },
        { method: 'POST', url: `${process.env.UAZAPI_URL}/chat/getBase64Message/${instanceName || 'pontocerto'}`, body: { messageId } },
        { method: 'POST', url: `${process.env.UAZAPI_URL}/downloadMediaMessage/${instanceName || 'pontocerto'}`, body: { messageId } },
        // Fallbacks base
        { method: 'POST', url: `${process.env.UAZAPI_URL}/chat/getBase64`, body: { messageId } },
        { method: 'GET', url: `${process.env.UAZAPI_URL}/chat/getBase64/${instanceName || 'pontocerto'}?messageId=${encodeURIComponent(messageId)}` }
    ];

    for (const ep of endpointsToTry) {
        try {
            console.log(`🎵 Tentando: ${ep.method} ${ep.url}`);
            
            const options = {
                method: ep.method,
                headers: {
                    'Content-Type': 'application/json',
                    'token': process.env.UAZAPI_TOKEN,
                }
            };

            if (ep.method === 'POST') {
                options.body = JSON.stringify(ep.body);
            }

            const response = await fetch(ep.url, options);

            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                
                if (contentType.includes('json')) {
                    const data = await response.json();
                    const base64Data = data.base64 || data.data || data.result || (data.message && data.message.base64);
                    if (base64Data) {
                        console.log(`✅ Áudio baixado via ${ep.url}`);
                        const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
                        return Buffer.from(cleanBase64, 'base64');
                    } else {
                        console.warn(`⚠️ OK, mas sem base64: ${JSON.stringify(data).substring(0,60)}`);
                    }
                } else {
                    // Retornou binário?
                    const arrayBuffer = await response.arrayBuffer();
                    if (arrayBuffer.byteLength > 0) {
                        console.log(`✅ Áudio baixado (binário) via ${ep.url}`);
                        return Buffer.from(arrayBuffer);
                    }
                }
            } else {
                console.warn(`⚠️ Falhou ${response.status}: ${await response.text().catch(()=>'')}`);
            }
        } catch (e) {
            console.warn(`⚠️ Erro na requisição: ${e.message}`);
        }
    }

    // ═══ ESTRATÉGIA FINAL: Decrypt Local ═══
    if (mediaUrl && mediaKey) {
        try {
            console.log(`🎵 Tentando descriptografia local do áudio da URL direta...`);
            const response = await fetch(mediaUrl);
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const encryptedBuffer = Buffer.from(arrayBuffer);
                const decryptedAudio = decryptWhatsAppMedia(encryptedBuffer, mediaKey, 'audio');
                console.log(`✅ Áudio descriptografado localmente com sucesso!`);
                return decryptedAudio;
            } else {
                console.warn(`⚠️ Falha ao baixar da URL direta: ${response.status}`);
            }
        } catch (e) {
            console.warn(`⚠️ Erro na descriptografia local: ${e.message}`);
        }
    }

    throw new Error('Todas as estratégias de download via Uazapi falharam. URL direta não serve (encriptada).');
}

/**
 * Transcreve um buffer de áudio usando OpenAI Whisper
 */
async function transcribeAudio(audioBuffer) {
    console.log(`🎤 Transcrevendo áudio (${Math.round(audioBuffer.length / 1024)}KB)...`);

    // Cria um objeto de arquivo correto para API da OpenAI usando toFile
    const file = await toFile(audioBuffer, 'audio.ogg', { type: 'audio/ogg' });

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
                mediaKey: content.mediaKey || '',
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
                mediaUrl: audioMsg.url || '',
                mediaKey: audioMsg.mediaKey ? Buffer.from(audioMsg.mediaKey).toString('base64') : '',
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
                mediaUrl: audioMsg.url || '',
                mediaKey: audioMsg.mediaKey ? Buffer.from(audioMsg.mediaKey).toString('base64') : '',
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
        let isAutoResponse = false;

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
            // Se foi enviado pela API (o próprio Netlify enviou algo minutos atrás)
            isAutoResponse = (msg?.wasSentByApi === true || body?.message?.wasSentByApi === true);

            console.log('📋 FORMATO A (BaseUrl) detectado');

        } else if (body?.event === 'messages.upsert' || body?.data?.key) {
            // ═══ FORMATO B — evento messages.upsert com wrapper data ═══
            const msgData = body.data || {};

            telefone = msgData?.key?.remoteJid || '';
            mensagemTexto = msgData?.message?.conversation
                || msgData?.message?.extendedTextMessage?.text || '';
            fromMe = msgData?.key?.fromMe || false;
            isAutoResponse = (msgData?.message?.sender_lid === '' || msgData?.message?.wasSentByApi === true || false);

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

        const msgArrForReaction = body.messages || (body.message ? [body.message] : []);
        const msgForReaction = msgArrForReaction[0] || {};
        const isReaction = !!(
            body?.message?.reactionMessage || 
            body?.data?.message?.reactionMessage || 
            msgForReaction?.message?.reactionMessage || 
            msgForReaction?.reactionMessage || 
            body?.type === 'reaction' ||
            body?.data?.messageType === 'reactionMessage'
        );

        if (isReaction) {
            console.log('⏭️ IGNORADO: Reação na mensagem');
            return { statusCode: 200, body: JSON.stringify({ status: 'ignored', reason: 'reaction' }) };
        }

        // Limpar telefone: remover @s.whatsapp.net, @c.us, e caracteres não numéricos
        telefone = String(telefone).replace(/@[\w.]+/g, '').replace(/[^0-9]/g, '');
        mensagemTexto = String(mensagemTexto || '').trim();

        // Detectar grupo
        const isGroup = String(body?.key?.remoteJid || body?.data?.key?.remoteJid || '').includes('@g.us');

        console.log(`🔍 PARSED: fromMe=${fromMe}, isAuto=${isAutoResponse}, telefone=${telefone}, texto="${mensagemTexto}"`);

        // ----------------------------------------------------
        // INTERVENÇÃO HUMANA (Bot Pausado)
        // ----------------------------------------------------
        if (fromMe) {
            const sessaoTemp = await carregarSessao(telefone);
            const historicoTemp = sessaoTemp.historico || [];
            const lastAsst = [...historicoTemp].reverse().find(m => m.role === 'assistant');
            const isBotEcho = (lastAsst && lastAsst.content.trim() === mensagemTexto);

            if (!isAutoResponse && !isBotEcho && telefone) {
                console.log(`👨‍💻 TÉCNICO DETECTADO: Uma pessoa respondeu ao cliente ${telefone}. Msg: "${mensagemTexto.substring(0,30)}"`);
                
                // Pausar o chatbot por 12 horas para esse cliente
                const minutosPausa = 720;
                sessaoTemp.pausadoAte = Date.now() + (minutosPausa * 60000);
                sessaoTemp.historico = []; // Limpa o histórico para quando a IA voltar não estar confusa
                
                await salvarSessao(telefone, sessaoTemp);
                console.log(`⏸️ BOT PAUSADO por ${minutosPausa} minutos para ${telefone}.`);
            } else {
                console.log('⏭️ IGNORADO: fromMe=true (mensagem enviada via API/Bot ou Echo idêntico)');
            }
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

        // ----------------------------------------------------
        // CHECAR SE O BOT ESTÁ PAUSADO
        // ----------------------------------------------------
        const sessao = await carregarSessao(telefone);
        if (sessao.pausadoAte && Date.now() < sessao.pausadoAte) {
            const minutosRestantes = Math.round((sessao.pausadoAte - Date.now()) / 60000);
            console.log(`⏸️ IGNORADO: Bot pausado para ${telefone} (atendimento humano). Volta em ${minutosRestantes} min.`);
            return { statusCode: 200, body: JSON.stringify({ status: 'ignored', reason: 'paused_human_attendance' }) };
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
                const instanceName = body.instanceName || process.env.UAZAPI_INSTANCE || 'pontocerto';
                const audioBuffer = await downloadAudioFromUazapi(audioInfo.messageId, audioInfo.mediaUrl, instanceName, audioInfo.mediaKey);
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

        // Carregar a sessão e o histórico da conversa
        // O `sessao` aqui vem garantido pelo inicio do código (pois foi carregado para ver se estava pausado)
        const historico = sessao.historico || [];
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
        
        sessao.historico = novoHistorico;

        // ================================================================
        // ALERTA AUTOMÁTICO PARA TÉCNICOS (HANDOFF)
        // ================================================================
        const tecnicos = {
            'Luiz Fernando': '5522988669180',
            'Rafael': '5522981495045',
            'Robson': '5522981733439'
        };

        function isHorarioComercial() {
            try {
                const agoraStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
                const agora = new Date(agoraStr);
                const diaSemana = agora.getDay(); // 0 = Domingo, 1 = Segunda ... 6 = Sábado
                const tempoAtual = agora.getHours() + agora.getMinutes() / 60;

                if (diaSemana === 0) return false; // Domingo
                if (diaSemana === 6) return tempoAtual >= 9 && tempoAtual < 12; // Sábado (09:00 - 12:00)
                return tempoAtual >= 8.5 && tempoAtual < 18.5; // Segunda-Sexta (08:30 - 18:30)
            } catch (e) {
                // Fallback de segurança se o timezone der erro
                const backupDate = new Date();
                backupDate.setHours(backupDate.getHours() - 3);
                const tempoAtual = backupDate.getHours() + backupDate.getMinutes() / 60;
                return tempoAtual >= 8 && tempoAtual < 19;
            }
        }

        const lojaAberta = isHorarioComercial();

        if (!sessao.tecnicoNotificado) {
            for (const [nome, numero] of Object.entries(tecnicos)) {
                // Se o bot mencionou o nome do técnico na resposta
                if (reply.includes(nome)) {
                    
                    // Condição de Horário: Somente dono (Luiz Fernando) recebe fora do expediente
                    if (nome !== 'Luiz Fernando' && !lojaAberta) {
                        console.log(`🔇 Alerta ignorado para ${nome}: Fora do horário de expediente da loja.`);
                        break; 
                    }

                    console.log(`🔔 Alertando técnico ${nome} no número ${numero}...`);
                    
                    const msgAlerta = `🚨 *PONTO CERTO - NOVO ATENDIMENTO* 🚨\n\nO robô acabou de encaminhar um cliente para você!\n\n🗣️ *Cliente:* ${pushName}\n📱 *Número:* ${phoneFinal}\n💬 *O cliente disse:* "${mensagemTexto}"\n\n⚠️ _Por favor, responda o cliente no WhatsApp oficial da loja!_`;
                    
                    // Envia o alerta para o WhatsApp pessoal do técnico
                    await sendWhatsAppMessage(numero, msgAlerta).catch(e => console.error(`❌ Erro ao alertar ${nome}:`, e.message));
                    
                    // Marca na sessão para não ficar floodando o técnico se o cliente mandar mais mensagens
                    sessao.tecnicoNotificado = true; 
                    sessao.pausadoAte = Date.now() + (720 * 60000); // Pausa automaticamente por 12 horas após encaminhar
                    
                    break;
                }
            }
        }
        // ================================================================

        await salvarSessao(phoneFinal, sessao);
        console.log(`💾 Histórico salvo: ${novoHistorico.length} mensagens`);

        if (reply.trim() === 'SILENCIO') {
            console.log(`🤫 Bot omitido (retornou SILENCIO) para ${phoneFinal}`);
            return { statusCode: 200, body: JSON.stringify({ status: 'ok', message: 'silenced' }) };
        }

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
