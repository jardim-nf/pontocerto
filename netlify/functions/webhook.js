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
// PROMPT DE SISTEMA
// ============================================
function getSystemPrompt() {
    const now = new Date();
    // Ajusta para horário de Brasília (UTC-3)
    const brHour = (now.getUTCHours() - 3 + 24) % 24;

    let greeting;
    if (brHour >= 6 && brHour < 12) greeting = 'Bom dia! ☀️';
    else if (brHour >= 12 && brHour < 18) greeting = 'Boa tarde! 👋';
    else if (brHour >= 18 && brHour <= 23) greeting = 'Boa noite! 🌙';
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
Na PRIMEIRA mensagem (quando o cliente mandar "oi", "olá", etc), use essa saudação seguida de "Somos da Ponto Certo Informática! Como posso te ajudar hoje?"

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
Quando o cliente quiser orçamento, colete TUDO em uma única pergunta de forma natural:
"Pra eu adiantar seu orçamento, me passa seu nome, a marca/modelo do aparelho, e o que está acontecendo com ele! 📋"

## TRANSFERÊNCIA PARA HUMANO
Quando pedirem vendedor: "Vou te conectar com um dos nossos especialistas! Um momento! 🤝"

## CLIENTE IRRITADO
Empatia, não discuta, encaminhe para atendente humano.

## FORA DO CONTEXTO
Redirecione: "Essa está fora da minha área! 😅 Sou especialista em tecnologia e informática."`;
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

        // Processa com OpenAI
        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: getSystemPrompt() },
                { role: 'user', content: `O nome do cliente é ${pushName}. A mensagem dele é: ${mensagemTexto}` },
            ],
            max_tokens: 500,
            temperature: 0.7,
        });

        const reply = completion.choices[0]?.message?.content
            || 'Desculpe, tive um problema técnico. Pode repetir? 😊';

        console.log(`🤖 Resposta: ${reply.substring(0, 100)}...`);

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
