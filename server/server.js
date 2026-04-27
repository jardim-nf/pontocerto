/**
 * ============================================
 *  CHATBOT PONTO CERTO INFORMÁTICA
 *  Servidor Webhook: Uazapi → OpenAI → WhatsApp
 * ============================================
 * 
 *  Fluxo:
 *  1. Uazapi envia webhook com mensagem do cliente
 *  2. Servidor filtra (ignora grupos, mensagens próprias)
 *  3. Envia mensagem + prompt de sistema para OpenAI
 *  4. Recebe resposta da IA
 *  5. Envia resposta de volta pelo Uazapi para o WhatsApp
 */

const express = require('express');
const OpenAI = require('openai');
const { Readable } = require('stream');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ============================================
// CONFIGURAÇÃO — PREENCHA SEUS DADOS AQUI
// ============================================
const CONFIG = {
    // Porta do servidor
    PORT: process.env.PORT || 3000,

    // Uazapi
    UAZAPI_URL: process.env.UAZAPI_URL || 'https://meunumero.uazapi.com',
    UAZAPI_TOKEN: process.env.UAZAPI_TOKEN || 'SEU_TOKEN_AQUI',

    // OpenAI 
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'SUA_CHAVE_OPENAI_AQUI',
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',

    // Áudio
    MAX_AUDIO_SECONDS: 120, // 2 minutos
};

// ============================================
// CLIENTE OPENAI
// ============================================
const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });

// ============================================
// HISTÓRICO DE CONVERSAS (em memória)
// ============================================
const conversations = new Map();
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 minutos de inatividade = reseta conversa

function getConversation(phone) {
    const conv = conversations.get(phone);
    if (conv && Date.now() - conv.lastActivity < CONVERSATION_TTL) {
        conv.lastActivity = Date.now();
        return conv;
    }
    // Nova conversa ou expirou
    const newConv = {
        messages: [],
        lastActivity: Date.now(),
    };
    conversations.set(phone, newConv);
    return newConv;
}

// Limpa conversas antigas a cada 10 minutos
setInterval(() => {
    const now = Date.now();
    for (const [phone, conv] of conversations) {
        if (now - conv.lastActivity > CONVERSATION_TTL) {
            conversations.delete(phone);
        }
    }
}, 10 * 60 * 1000);

// ============================================
// PROMPT DE SISTEMA (TREINAMENTO DA IA)
// ============================================
function getSystemPrompt() {
    const hour = new Date().getHours();
    let greeting;
    if (hour >= 6 && hour < 12) greeting = 'Bom dia! ☀️';
    else if (hour >= 12 && hour < 18) greeting = 'Boa tarde! 👋';
    else if (hour >= 18 && hour <= 23) greeting = 'Boa noite! 🌙';
    else greeting = 'Olá! 😊';

    return `Você é o assistente virtual da Ponto Certo Informática. Seu gênero é masculino. Sempre se identifique como "Somos da Ponto Certo Informática".

## PERSONALIDADE
- Seja simpático, objetivo e profissional, mas acessível
- Use "você" (informal educado)
- Use emojis com moderação (máximo 2 por mensagem)
- Seja direto — nada de enrolação
- Sempre trate o cliente com respeito e cordialidade
- Nunca use linguagem excessivamente formal ou robotizada
- Responda SEMPRE em português brasileiro

## REGRAS ABSOLUTAS
1. NUNCA invente preços — sempre direcione para orçamento ou vendedor
2. NUNCA prometa prazo de conserto sem consultar a equipe
3. NUNCA diga que não tem um produto — diga "vou verificar a disponibilidade"
4. SEMPRE tente coletar o nome do cliente no início da conversa
5. Se não souber algo, diga: "Vou verificar com nossa equipe e já te retorno!"
6. SEMPRE finalize perguntando se pode ajudar com mais alguma coisa
7. NÃO responda perguntas que não tenham relação com informática, tecnologia ou a loja
8. Mantenha respostas CURTAS e DIRETAS — máximo 3-4 parágrafos por mensagem
9. NÃO use markdown (negrito, itálico, listas com *). Use texto simples com emojis.
10. Formate a mensagem pensando que será lida no WhatsApp — use quebras de linha para separar ideias.

## SAUDAÇÃO
A saudação atual baseada no horário é: "${greeting}"
Na PRIMEIRA mensagem de cada conversa, use essa saudação seguida de "Somos da Ponto Certo Informática! Como posso te ajudar hoje?"

Após a saudação, apresente as opções:
1 - Comprar aparelho (novo ou seminovo)
2 - Manutenção / Conserto
3 - Periféricos e acessórios
4 - Solicitar orçamento (é GRÁTIS!)
5 - Falar com um vendedor
6 - Localização e horário

## SOBRE A LOJA
- Nome: Ponto Certo Informática
- Horário: Segunda a Sexta 08:30-18:30 | Sábado 09:00-12:00 | Domingo fechado
- Atendimento online: 24 horas
- Endereço: Av. Venâncio Pereira Veloso, 76 - 04 - Centro, Bom Jardim - RJ, 28660-000
- WhatsApp: (22) 98817-9813
- Instagram: @pontocertoinformaticabj

## SERVIÇOS

### Venda de Aparelhos
- Notebooks, PCs/Desktops, Celulares, Tablets — NOVOS e SEMINOVOS
- Todas as marcas: Samsung, Apple, Motorola, Xiaomi, LG, Dell, Lenovo, HP, Acer, Asus
- Seminovos passam por avaliação técnica completa antes da venda
- Aceitamos aparelho usado como parte do pagamento (com avaliação técnica)

### Manutenção de Computadores
- Formatação e instalação de sistema
- Limpeza de vírus e malware
- Upgrade de hardware (RAM, SSD, processador)
- Troca de tela, teclado, touchpad
- Diagnóstico de problemas
- Manutenção preventiva

### Manutenção de Celulares
- Troca de tela/display
- Troca de bateria
- Reparo de placa
- Software
- Conector de carga
- Câmera, microfone, alto-falante

### Periféricos e Acessórios
- Teclados, mouses, headsets, webcams
- Cabos, adaptadores, fontes, carregadores
- Cases, capinhas, películas
- Pen drives, HDs, SSDs
- Impressoras e suprimentos

## INFORMAÇÕES CHAVE
- Orçamento: 100% GRATUITO e sem compromisso
- Troca: Aceitamos aparelho usado com avaliação técnica
- Pagamento: Dinheiro, cartão crédito/débito (todas bandeiras), Pix, boleto, parcelamento
- Atendimento domiciliar: NÃO fazemos. Somente na loja.
- Garantia seminovos: Garantia da loja + avaliação técnica completa
- Prazo conserto: varia, NUNCA prometa prazo, diga que ao trazer o aparelho informamos junto com o orçamento

## COLETA DE DADOS PARA ORÇAMENTO
Quando o cliente quiser orçamento, colete de forma natural:
1. Nome
2. Aparelho (marca e modelo)
3. Problema ou necessidade

## TRANSFERÊNCIA PARA HUMANO
Quando pedirem vendedor: "Vou te conectar com um dos nossos especialistas! Um momento! 🤝"

## CLIENTE IRRITADO
Empatia, não discuta, encaminhe para atendente humano.

## FORA DO CONTEXTO
Redirecione: "Essa está fora da minha área! 😅 Sou especialista em tecnologia e informática."

## ÁUDIOS
Você também consegue entender áudios do cliente (até 2 minutos). O áudio será transcrito e a transcrição chegará como [TRANSCRIÇÃO DE ÁUDIO: ...]. Responda normalmente como se o cliente tivesse digitado aquela mensagem. Não mencione que foi um áudio a menos que não faça sentido.`;
}

// ============================================
// PROCESSAR MENSAGEM COM OPENAI
// ============================================
async function processMessage(phone, pushName, userMessage) {
    const conv = getConversation(phone);

    // Adiciona mensagem do usuário ao histórico
    conv.messages.push({
        role: 'user',
        content: `[Cliente: ${pushName}] ${userMessage}`,
    });

    // Limita histórico a últimas 20 mensagens para economizar tokens
    if (conv.messages.length > 20) {
        conv.messages = conv.messages.slice(-20);
    }

    try {
        const response = await openai.chat.completions.create({
            model: CONFIG.OPENAI_MODEL,
            messages: [
                { role: 'system', content: getSystemPrompt() },
                ...conv.messages,
            ],
            max_tokens: 500,
            temperature: 0.7,
        });

        const botReply = response.choices[0]?.message?.content || 'Desculpe, tive um problema. Pode repetir?';

        // Salva resposta do bot no histórico
        conv.messages.push({
            role: 'assistant',
            content: botReply,
        });

        return botReply;
    } catch (error) {
        console.error('Erro OpenAI:', error.message);
        return 'Desculpe, estou com um problema técnico no momento. Tente novamente em alguns instantes! 😊';
    }
}

// ============================================
// FUNÇÕES DE ÁUDIO
// ============================================

async function downloadAudioFromUazapi(messageId) {
    const url = `${CONFIG.UAZAPI_URL}/chat/getBase64`;
    console.log(`🎵 Baixando áudio via: ${url} (msgId: ${messageId})`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'token': CONFIG.UAZAPI_TOKEN,
        },
        body: JSON.stringify({ messageId }),
    });

    if (!response.ok) {
        throw new Error(`Uazapi download error ${response.status}`);
    }

    const data = await response.json();
    const base64Data = data.base64 || data.data || data.result;
    if (!base64Data) throw new Error('Nenhum dado base64 retornado');

    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    return Buffer.from(cleanBase64, 'base64');
}

async function transcribeAudio(audioBuffer) {
    console.log(`🎤 Transcrevendo áudio (${Math.round(audioBuffer.length / 1024)}KB)...`);
    const file = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });
    const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: file,
        language: 'pt',
    });
    console.log(`✅ Transcrição: "${transcription.text.substring(0, 80)}..."`);
    return transcription.text;
}

function detectAudioMessage(body) {
    const key = body?.key || body?.data?.key || {};
    const messageData = body?.message || body?.data?.message || {};
    const audioMsg = messageData?.audioMessage;
    if (audioMsg) {
        return {
            isAudio: true,
            duration: audioMsg.seconds || 0,
            messageId: key?.id || '',
        };
    }
    return { isAudio: false };
}

// ============================================
// ENVIAR MENSAGEM VIA UAZAPI
// ============================================
async function sendWhatsAppMessage(phone, message) {
    try {
        const response = await fetch(`${CONFIG.UAZAPI_URL}/send/text`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': CONFIG.UAZAPI_TOKEN,
            },
            body: JSON.stringify({
                phone: phone,
                message: message,
            }),
        });

        const data = await response.json();
        console.log(`✅ Mensagem enviada para ${phone}`);
        return data;
    } catch (error) {
        console.error(`❌ Erro ao enviar mensagem para ${phone}:`, error.message);
        throw error;
    }
}

// ============================================
// WEBHOOK — RECEBE MENSAGENS DA UAZAPI
// ============================================
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        // Extrai dados da mensagem (formato Uazapi)
        const key = body?.key || body?.data?.key || {};
        const messageData = body?.message || body?.data?.message || {};

        // Verifica se é mensagem válida
        const fromMe = key.fromMe;
        const remoteJid = key.remoteJid || '';
        const isGroup = remoteJid.includes('@g.us');

        // Ignora: mensagens próprias e grupos
        if (fromMe || isGroup) {
            return res.json({ status: 'ignored', reason: fromMe ? 'own_message' : 'group' });
        }

        // Extrai telefone e nome
        const phone = remoteJid.replace('@s.whatsapp.net', '');
        const pushName = body.pushName || body.data?.pushName || 'Cliente';

        // ================================================================
        // DETECÇÃO DE ÁUDIO
        // ================================================================
        const audioInfo = detectAudioMessage(body);
        let text = '';

        if (audioInfo.isAudio) {
            console.log(`🎵 ÁUDIO de ${pushName} (${phone}): ${audioInfo.duration}s`);

            // Verificar limite de 2 minutos
            if (audioInfo.duration > CONFIG.MAX_AUDIO_SECONDS) {
                await sendWhatsAppMessage(phone, 
                    `Opa! 😅 Infelizmente só consigo entender áudios de até 2 minutos. Pode mandar um áudio mais curto ou digitar sua mensagem? 👍`
                );
                return res.json({ status: 'ignored', reason: 'audio_too_long' });
            }

            // Baixar e transcrever
            try {
                const audioBuffer = await downloadAudioFromUazapi(audioInfo.messageId);
                const transcription = await transcribeAudio(audioBuffer);
                text = `[TRANSCRIÇÃO DE ÁUDIO: ${transcription}]`;
            } catch (audioErr) {
                console.error('❌ Erro ao processar áudio:', audioErr.message);
                await sendWhatsAppMessage(phone,
                    `Desculpa, não consegui ouvir o áudio 😅 Pode digitar sua mensagem ou tentar mandar o áudio de novo?`
                );
                return res.json({ status: 'error', reason: 'audio_failed' });
            }
        } else {
            // Extrai texto da mensagem
            text = messageData.conversation
                || messageData.extendedTextMessage?.text
                || messageData.buttonsResponseMessage?.selectedButtonId
                || messageData.listResponseMessage?.singleSelectReply?.selectedRowId
                || '';
        }

        if (!text.trim()) {
            return res.json({ status: 'ignored', reason: 'no_text' });
        }

        console.log(`📩 Mensagem de ${pushName} (${phone}): ${text.substring(0, 100)}`);

        // Processa com IA
        const reply = await processMessage(phone, pushName, text);

        // Envia resposta
        await sendWhatsAppMessage(phone, reply);

        res.json({ status: 'ok' });
    } catch (error) {
        console.error('❌ Erro no webhook:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ============================================
// ROTA DE SAÚDE (para o Render verificar)
// ============================================
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: 'Ponto Certo Informática',
        uptime: Math.floor(process.uptime()) + 's',
        conversations: conversations.size,
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(CONFIG.PORT, () => {
    console.log('');
    console.log('🤖 ========================================');
    console.log('   PONTO CERTO INFORMÁTICA — CHATBOT IA');
    console.log('🤖 ========================================');
    console.log(`📡 Servidor rodando na porta ${CONFIG.PORT}`);
    console.log(`🔗 Uazapi: ${CONFIG.UAZAPI_URL}`);
    console.log(`🧠 Modelo: ${CONFIG.OPENAI_MODEL}`);
    console.log('⏰ Atendimento: 24 horas');
    console.log('');
    console.log('Aguardando mensagens do WhatsApp...');
    console.log('');
});
