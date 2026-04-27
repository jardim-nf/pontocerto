/* ============================================
   CHATBOT ENGINE — PONTO CERTO INFORMÁTICA
   ============================================ */

(function () {
    'use strict';

    // --- Store Config ---
    const STORE = {
        name: 'Ponto Certo Informática',
        phone: '(22) 98817-9813',
        whatsapp: '5522988179813',
        instagram: '@pontocertoinformaticabj',
        instagramUrl: 'https://www.instagram.com/pontocertoinformaticabj',
        address: 'Av. Venâncio Pereira Veloso, 76 - 04 - Centro, Bom Jardim - RJ, 28660-000',
        hours: {
            weekdays: '08:30 às 18:30',
            saturday: '09:00 às 12:00',
            sunday: 'Fechado'
        }
    };

    // --- DOM Elements ---
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearChat');
    const typingEl = document.getElementById('chatTyping');

    // --- State ---
    let currentFlow = null;
    let flowStep = 0;
    let customerData = {};
    let isProcessing = false;

    // --- Greeting based on time ---
    function getGreeting() {
        const h = new Date().getHours();
        if (h >= 6 && h < 12) return 'Bom dia! ☀️';
        if (h >= 12 && h < 18) return 'Boa tarde! 👋';
        if (h >= 18 && h <= 23) return 'Boa noite! 🌙';
        return 'Olá! 😊';
    }

    function getTimeContext() {
        const h = new Date().getHours();
        if (h >= 0 && h < 6) {
            return '\n\nNosso atendimento presencial é de segunda a sexta, das 08:30 às 18:30, e sábado das 09:00 às 12:00. Mas pode me contar o que precisa que já vou anotando!';
        }
        return '';
    }

    function getFarewellTime() {
        const h = new Date().getHours();
        if (h >= 6 && h < 12) return 'dia';
        if (h >= 12 && h < 18) return 'tarde';
        return 'noite';
    }

    // --- Message Rendering ---
    function createMessageEl(text, type) {
        const msg = document.createElement('div');
        msg.className = `message ${type}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = type === 'bot' ? '✓' : '👤';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        msg.appendChild(avatar);
        msg.appendChild(bubble);

        return { msg, bubble };
    }

    function addMessage(text, type, quickReplies) {
        const { msg, bubble } = createMessageEl(text, type);

        // Parse text: convert newlines to <br> and bold markers
        const formatted = text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        bubble.innerHTML = formatted;

        // Quick reply buttons
        if (quickReplies && quickReplies.length > 0) {
            const container = document.createElement('div');
            container.className = 'quick-replies';

            quickReplies.forEach(reply => {
                const btn = document.createElement('button');
                btn.className = 'quick-reply-btn';
                btn.textContent = reply.label;
                btn.addEventListener('click', () => {
                    handleQuickReply(reply);
                });
                container.appendChild(btn);
            });

            bubble.appendChild(container);
        }

        chatMessages.appendChild(msg);
        scrollToBottom();
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    function showTyping() {
        typingEl.classList.add('active');
        scrollToBottom();
    }

    function hideTyping() {
        typingEl.classList.remove('active');
    }

    async function botReply(text, quickReplies, delay) {
        if (isProcessing) return;
        isProcessing = true;

        showTyping();
        const d = delay || Math.min(800 + text.length * 12, 2500);
        await wait(d);
        hideTyping();

        addMessage(text, 'bot', quickReplies);
        isProcessing = false;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- Quick Reply Handler ---
    function handleQuickReply(reply) {
        // Show user message
        addMessage(reply.label, 'user');

        // Remove all quick reply buttons from previous messages
        document.querySelectorAll('.quick-replies').forEach(el => el.remove());

        // Process
        if (reply.action) {
            reply.action();
        }
    }

    // --- Main Menu ---
    function showMainMenu() {
        currentFlow = null;
        flowStep = 0;

        const quickReplies = [
            { label: '🖥️ Comprar aparelho', action: () => startFlow('buy') },
            { label: '🔧 Manutenção', action: () => startFlow('repair') },
            { label: '🎮 Periféricos', action: () => startFlow('peripherals') },
            { label: '🆓 Orçamento grátis', action: () => startFlow('quote') },
            { label: '💬 Falar com vendedor', action: () => startFlow('human') },
            { label: '📍 Localização', action: () => startFlow('location') },
        ];

        botReply('Como posso te ajudar? 😊', quickReplies);
    }

    // --- Flow: Buy ---
    function startFlow(flow) {
        currentFlow = flow;
        flowStep = 0;

        switch (flow) {
            case 'buy':
                flowBuy();
                break;
            case 'repair':
                flowRepair();
                break;
            case 'peripherals':
                flowPeripherals();
                break;
            case 'quote':
                flowQuote();
                break;
            case 'human':
                flowHuman();
                break;
            case 'location':
                flowLocation();
                break;
        }
    }

    // --- FLOW: COMPRA ---
    function flowBuy() {
        botReply('Ótima escolha! Trabalhamos com aparelhos novos e seminovos. 🖥️\n\nQual tipo de aparelho você procura?', [
            { label: '📱 Celular', action: () => flowBuyType('Celular') },
            { label: '💻 Notebook', action: () => flowBuyType('Notebook') },
            { label: '🖥️ PC / Desktop', action: () => flowBuyType('PC / Desktop') },
            { label: '📲 Tablet', action: () => flowBuyType('Tablet') },
            { label: '↩️ Voltar ao menu', action: () => showMainMenu() },
        ]);
    }

    function flowBuyType(type) {
        customerData.deviceType = type;

        botReply(`Perfeito! E você prefere ${type}:`, [
            { label: '🆕 Novo', action: () => flowBuyCondition(type, 'novo') },
            { label: '🔄 Seminovo', action: () => flowBuyCondition(type, 'seminovo') },
            { label: '↩️ Voltar', action: () => flowBuy() },
        ]);
    }

    function flowBuyCondition(type, condition) {
        customerData.condition = condition;

        if (condition === 'seminovo') {
            botReply(`Nossos seminovos passam por uma avaliação técnica completa! ✅\nTestamos tudo: bateria, tela, processador, memória, armazenamento...\nSó vendemos o que está em perfeito funcionamento.\n\nPra eu te indicar o melhor ${type}, me conta:\n- Qual o uso principal? (trabalho, estudo, jogos, básico)\n- Tem alguma marca de preferência?\n- Qual a faixa de valor?\n\nDigita aí que eu te ajudo! 💪`, null, 1500);
        } else {
            botReply(`Show! Temos diversas opções de ${type} novos! 🆕\n\nPra eu te indicar o melhor, me conta:\n- Qual o uso principal? (trabalho, estudo, jogos, básico)\n- Tem alguma marca de preferência?\n- Qual a faixa de valor que você está pensando?\n\nDigita aí! 💪`, null, 1500);
        }

        currentFlow = 'buy_details';
    }

    // --- FLOW: MANUTENÇÃO ---
    function flowRepair() {
        botReply('Claro, estamos aqui pra resolver! 🔧\n\nQual aparelho precisa de manutenção?', [
            { label: '🖥️ Computador / Notebook', action: () => flowRepairDevice('computer') },
            { label: '📱 Celular / Tablet', action: () => flowRepairDevice('phone') },
            { label: '↩️ Voltar ao menu', action: () => showMainMenu() },
        ]);
    }

    function flowRepairDevice(device) {
        customerData.repairDevice = device;

        if (device === 'computer') {
            botReply('Entendi! Qual o problema que está enfrentando? 🖥️', [
                { label: 'Lento / travando', action: () => flowRepairProblem('Computador lento / travando') },
                { label: 'Não liga / tela preta', action: () => flowRepairProblem('Não liga / tela preta') },
                { label: 'Vírus / malware', action: () => flowRepairProblem('Vírus / programas indesejados') },
                { label: 'Formatar', action: () => flowRepairProblem('Precisa formatar') },
                { label: 'Upgrade (RAM, SSD...)', action: () => flowRepairProblem('Upgrade de hardware') },
                { label: 'Tela quebrada', action: () => flowRepairProblem('Tela com defeito') },
                { label: 'Outro problema', action: () => flowRepairProblem('Outro problema') },
            ]);
        } else {
            botReply('Entendi! Qual o problema? 📱', [
                { label: 'Tela quebrada', action: () => flowRepairProblem('Tela quebrada / trincada') },
                { label: 'Bateria ruim', action: () => flowRepairProblem('Bateria viciada / não carrega') },
                { label: 'Não liga', action: () => flowRepairProblem('Não liga') },
                { label: 'Microfone / som', action: () => flowRepairProblem('Problema microfone/alto-falante') },
                { label: 'Câmera', action: () => flowRepairProblem('Câmera com defeito') },
                { label: 'Conector de carga', action: () => flowRepairProblem('Entrada de carregamento') },
                { label: 'Outro problema', action: () => flowRepairProblem('Outro problema') },
            ]);
        }
    }

    function flowRepairProblem(problem) {
        customerData.problem = problem;

        botReply(`Entendi o problema: **${problem}** 📋\n\nPra eu já adiantar o seu atendimento, me conta:\n- Qual a **marca e modelo** do aparelho?\n- Há **quanto tempo** está com esse problema?\n\nNosso orçamento é **GRATUITO**! 🆓\nVocê pode trazer o aparelho na loja que fazemos a avaliação técnica na hora.`, null, 1500);

        currentFlow = 'repair_details';
    }

    // --- FLOW: PERIFÉRICOS ---
    function flowPeripherals() {
        botReply('Temos uma variedade enorme de periféricos! 🎮\n\nO que você está procurando?', [
            { label: '⌨️ Teclado', action: () => flowPeripheralType('Teclado') },
            { label: '🖱️ Mouse', action: () => flowPeripheralType('Mouse') },
            { label: '🎧 Headset / Fone', action: () => flowPeripheralType('Headset / Fone') },
            { label: '🔌 Cabos / Adaptadores', action: () => flowPeripheralType('Cabos e adaptadores') },
            { label: '🔋 Fontes / Carregadores', action: () => flowPeripheralType('Fontes e carregadores') },
            { label: '💾 Pen drive / HD / SSD', action: () => flowPeripheralType('Armazenamento') },
            { label: '📱 Acessórios celular', action: () => flowPeripheralType('Acessórios de celular') },
            { label: '↩️ Voltar ao menu', action: () => showMainMenu() },
        ]);
    }

    function flowPeripheralType(type) {
        customerData.peripheralType = type;

        botReply(`Boa escolha! 👍\nTemos várias opções de **${type}**.\n\nPra te indicar o melhor:\n- É pra uso **profissional, gamer ou básico**?\n- Tem preferência de **marca**?\n- Qual sua **faixa de preço**?\n\nMe conta que eu te ajudo a encontrar o ideal!`, null, 1200);

        currentFlow = 'peripheral_details';
    }

    // --- FLOW: ORÇAMENTO ---
    function flowQuote() {
        flowStep = 0;
        botReply('Vamos lá! Nosso orçamento é **GRATUITO**! 🆓\n\nPra começar, me diz seu **nome**:', null, 1000);
        currentFlow = 'quote_collect';
    }

    // --- FLOW: FALAR COM VENDEDOR ---
    function flowHuman() {
        const whatsappLink = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent('Olá! Gostaria de falar com um vendedor.')}`;

        botReply(`Sem problemas! Vou te conectar com um dos nossos vendedores! 🤝\n\n📱 **WhatsApp**: ${STORE.phone}\n\nClique no botão abaixo para falar diretamente:`, [
            { label: '📱 Abrir WhatsApp', action: () => window.open(whatsappLink, '_blank') },
            { label: '↩️ Voltar ao menu', action: () => showMainMenu() },
        ]);
    }

    // --- FLOW: LOCALIZAÇÃO ---
    function flowLocation() {
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(STORE.address)}`;

        botReply(`📍 **${STORE.name}**\n\n🕐 **Horário de funcionamento:**\nSegunda a Sexta: ${STORE.hours.weekdays}\nSábado: ${STORE.hours.saturday}\nDomingo: ${STORE.hours.sunday}\n\n📍 **Endereço:** ${STORE.address}\n\n📱 **WhatsApp:** ${STORE.phone}\n📸 **Instagram:** ${STORE.instagram}\n\n💳 **Formas de pagamento:** Dinheiro, Pix, Cartão (crédito/débito), Boleto, Parcelamento\n\nNosso atendimento online funciona **24 horas**! 😊`, [
            { label: '📍 Abrir no Maps', action: () => window.open(mapsLink, '_blank') },
            { label: '📸 Instagram', action: () => window.open(STORE.instagramUrl, '_blank') },
            { label: '↩️ Voltar ao menu', action: () => showMainMenu() },
        ]);
    }

    // --- Free Text Handler ---
    function handleFreeText(text) {
        const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Handle ongoing flows
        if (currentFlow === 'buy_details') {
            botReply(`Ótimo, anotei suas preferências! 📝\n\nVou encaminhar para nosso vendedor te apresentar as melhores opções.\n\n📱 **WhatsApp**: ${STORE.phone}\n\nQuer falar direto com ele?`, [
                { label: '📱 Falar com vendedor', action: () => { flowHuman(); } },
                { label: '↩️ Voltar ao menu', action: () => showMainMenu() },
            ]);
            currentFlow = null;
            return;
        }

        if (currentFlow === 'repair_details') {
            botReply(`Perfeito, anotado! 📋\n\nVou passar essas informações pra nossa equipe técnica. Traga o aparelho na loja para o orçamento **gratuito**!\n\n📍 **Endereço:** ${STORE.address}\n🕐 Seg-Sex: ${STORE.hours.weekdays} | Sáb: ${STORE.hours.saturday}\n\nQuer agendar ou tem mais alguma dúvida?`, [
                { label: '📱 Chamar no WhatsApp', action: () => flowHuman() },
                { label: '↩️ Voltar ao menu', action: () => showMainMenu() },
            ]);
            currentFlow = null;
            return;
        }

        if (currentFlow === 'peripheral_details') {
            botReply(`Anotei! 📝\n\nVou verificar a disponibilidade com nossa equipe. Pra agilizar, fala direto com nosso vendedor:\n\n📱 **WhatsApp**: ${STORE.phone}\n\nEle te manda fotos e preços na hora! 📸`, [
                { label: '📱 Falar com vendedor', action: () => flowHuman() },
                { label: '↩️ Voltar ao menu', action: () => showMainMenu() },
            ]);
            currentFlow = null;
            return;
        }

        if (currentFlow === 'quote_collect') {
            if (flowStep === 0) {
                customerData.name = text;
                flowStep = 1;
                botReply(`Prazer, ${text}! 😊\n\nAgora me diz: qual o **aparelho** (marca e modelo)?`, null, 800);
                return;
            }
            if (flowStep === 1) {
                customerData.device = text;
                flowStep = 2;
                botReply(`Beleza! E o que você precisa? (compra, conserto, upgrade, etc.)`, null, 800);
                return;
            }
            if (flowStep === 2) {
                customerData.need = text;
                botReply(`Perfeito, ${customerData.name}! ✅\n\n📋 **Resumo do seu pedido:**\n👤 Nome: ${customerData.name}\n📱 Aparelho: ${customerData.device}\n🔧 Necessidade: ${customerData.need}\n\nVou encaminhar para nossa equipe técnica! Em breve um especialista vai te retornar com o orçamento completo.\n\nTem mais alguma dúvida? 😊`, [
                    { label: '📱 WhatsApp direto', action: () => {
                        const msg = `Olá! Meu nome é ${customerData.name}. Preciso de orçamento para ${customerData.device}: ${customerData.need}`;
                        window.open(`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
                    }},
                    { label: '↩️ Voltar ao menu', action: () => showMainMenu() },
                ]);
                currentFlow = null;
                return;
            }
        }

        // --- FAQ / Keyword detection ---
        
        // Greeting
        if (/^(oi|ola|hey|eai|e ai|bom dia|boa tarde|boa noite|salve|fala)/.test(lower)) {
            const greeting = getGreeting();
            botReply(`${greeting} Somos da Ponto Certo Informática! Como posso te ajudar hoje?${getTimeContext()}`, null, 800);
            setTimeout(() => showMainMenu(), 1500);
            return;
        }

        // Price / how much
        if (/(preco|valor|quanto custa|quanto e|quanto fica|quanto sai)/.test(lower)) {
            botReply('Os valores variam conforme o produto e serviço! Para te passar o preço certinho, preciso saber mais detalhes. 😊\n\nNosso orçamento é **GRATUITO**! O que você está procurando?', [
                { label: '🖥️ Comprar aparelho', action: () => startFlow('buy') },
                { label: '🔧 Manutenção', action: () => startFlow('repair') },
                { label: '🎮 Periféricos', action: () => startFlow('peripherals') },
                { label: '🆓 Pedir orçamento', action: () => startFlow('quote') },
            ]);
            return;
        }

        // Format
        if (/(formatar|formatacao|formatação|formato)/.test(lower)) {
            botReply('O valor da formatação depende do serviço completo (backup, instalação de programas, drivers, etc.).\n\nNosso orçamento é **GRATUITO**! 🆓\nTraga seu computador/notebook na loja que fazemos a avaliação na hora.\n\n📍 **Endereço:** ' + STORE.address, [
                { label: '🔧 Solicitar orçamento', action: () => startFlow('quote') },
                { label: '↩️ Menu principal', action: () => showMainMenu() },
            ]);
            return;
        }

        // Warranty
        if (/(garantia)/.test(lower)) {
            botReply('Todos os nossos produtos possuem garantia! ✅\n\n🆕 **Novos:** Garantia de fábrica\n🔄 **Seminovos:** Garantia da loja + avaliação técnica completa\n\nCada componente é testado individualmente antes da venda. Você leva com segurança! 🔒', [
                { label: '🖥️ Ver aparelhos', action: () => startFlow('buy') },
                { label: '↩️ Menu principal', action: () => showMainMenu() },
            ]);
            return;
        }

        // Trade-in
        if (/(troca|trocar|aceita|usado como)/.test(lower)) {
            botReply('Sim! Aceitamos seu aparelho usado como parte do pagamento! 🔄\n\nFazemos uma **avaliação técnica** do seu aparelho e damos um valor justo.\n\nQuer trazer o seu pra gente avaliar?', [
                { label: '📱 Agendar avaliação', action: () => flowHuman() },
                { label: '↩️ Menu principal', action: () => showMainMenu() },
            ]);
            return;
        }

        // Payment
        if (/(pagamento|parcela|parcelar|pix|cartao|cartão|boleto|dinheiro)/.test(lower)) {
            botReply('Aceitamos **todas** as formas de pagamento! 💳\n\n💵 Dinheiro\n💳 Cartão de crédito (todas as bandeiras)\n💳 Cartão de débito\n📱 Pix\n📋 Boleto\n🔄 Parcelamento no cartão\n\nFacilitamos pra você! 😊', [
                { label: '↩️ Menu principal', action: () => showMainMenu() },
            ]);
            return;
        }

        // Home service
        if (/(domicilio|domicílio|casa|residencia|residência|vem aqui|vao ate|vão até)/.test(lower)) {
            botReply(`No momento nosso atendimento é exclusivamente na loja. 🏪\nMas pode trazer seu aparelho que resolvemos rapidinho!\n\n📍 **Endereço:** ${STORE.address}\n🕐 Seg-Sex: ${STORE.hours.weekdays} | Sáb: ${STORE.hours.saturday}`, [
                { label: '📍 Abrir no Maps', action: () => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(STORE.address)}`, '_blank') },
                { label: '↩️ Menu principal', action: () => showMainMenu() },
            ]);
            return;
        }

        // Hours
        if (/(horario|horário|abre|fecha|funciona|expediente|aberto)/.test(lower)) {
            startFlow('location');
            return;
        }

        // Address
        if (/(endereco|endereço|onde fica|localizacao|localização|como chegar|mapa)/.test(lower)) {
            startFlow('location');
            return;
        }

        // Thanks
        if (/(obrigado|obrigada|valeu|vlw|brigado|agradeco|agradeço)/.test(lower)) {
            botReply(`Foi um prazer te atender! 😊\nSe precisar de mais alguma coisa, é só chamar.\n\nPonto Certo Informática — seu parceiro em tecnologia! 💪🖥️\n\nTenha um ótimo ${getFarewellTime()}! 👋`, [
                { label: '↩️ Voltar ao menu', action: () => showMainMenu() },
            ]);
            return;
        }

        // Bye
        if (/(tchau|ate mais|até mais|falou|flw|bye|adeus)/.test(lower)) {
            botReply(`Valeu! Qualquer coisa, estamos à disposição! 😊👋\nTenha um ótimo ${getFarewellTime()}!\n\nPonto Certo Informática — seu parceiro em tecnologia! 💪`, null);
            return;
        }

        // Buy intent
        if (/(comprar|quero comprar|to procurando|procurando|preciso de um|quero um)/.test(lower)) {
            // Check for specific device mentions
            if (/(celular|smartphone|iphone|samsung|xiaomi|motorola)/.test(lower)) {
                flowBuyType('Celular');
            } else if (/(notebook|laptop|note)/.test(lower)) {
                flowBuyType('Notebook');
            } else if (/(computador|pc|desktop)/.test(lower)) {
                flowBuyType('PC / Desktop');
            } else if (/(tablet|ipad)/.test(lower)) {
                flowBuyType('Tablet');
            } else {
                startFlow('buy');
            }
            return;
        }

        // Repair intent
        if (/(conserto|consertar|arruma|arrumar|quebrou|quebrado|estragou|defeito|nao liga|não liga|nao funciona|não funciona|travando|lento|virus|vírus)/.test(lower)) {
            if (/(celular|smartphone|telefone)/.test(lower)) {
                flowRepairDevice('phone');
            } else if (/(computador|notebook|pc|desktop)/.test(lower)) {
                flowRepairDevice('computer');
            } else {
                startFlow('repair');
            }
            return;
        }

        // Peripherals intent
        if (/(periferico|periférico|teclado|mouse|headset|fone|webcam|cabo|hd|ssd|pen drive|impressora|carregador|fonte|pelicula|película|capinha)/.test(lower)) {
            startFlow('peripherals');
            return;
        }

        // Budget/quote
        if (/(orcamento|orçamento|avaliacao|avaliação|diagnostico|diagnóstico)/.test(lower)) {
            startFlow('quote');
            return;
        }

        // Vendor
        if (/(vendedor|atendente|humano|pessoa|alguem|alguém|falar com)/.test(lower)) {
            startFlow('human');
            return;
        }

        // Instagram
        if (/(instagram|insta|rede social)/.test(lower)) {
            botReply(`Segue a gente no Instagram! 📸\n\n${STORE.instagram}\n\nLá postamos novidades, promoções e dicas de tecnologia!`, [
                { label: '📸 Abrir Instagram', action: () => window.open(STORE.instagramUrl, '_blank') },
                { label: '↩️ Menu principal', action: () => showMainMenu() },
            ]);
            return;
        }

        // Default - didn't understand
        botReply('Entendi! 🤔 Pra te ajudar melhor, escolhe uma das opções abaixo:', [
            { label: '🖥️ Comprar aparelho', action: () => startFlow('buy') },
            { label: '🔧 Manutenção', action: () => startFlow('repair') },
            { label: '🎮 Periféricos', action: () => startFlow('peripherals') },
            { label: '🆓 Orçamento grátis', action: () => startFlow('quote') },
            { label: '💬 Falar com vendedor', action: () => startFlow('human') },
            { label: '📍 Localização', action: () => startFlow('location') },
        ]);
    }

    // --- Send Message ---
    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || isProcessing) return;

        addMessage(text, 'user');
        chatInput.value = '';

        // Process after small delay
        setTimeout(() => handleFreeText(text), 300);
    }

    // --- Event Listeners ---
    sendBtn.addEventListener('click', sendMessage);

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    clearBtn.addEventListener('click', () => {
        chatMessages.innerHTML = '';
        currentFlow = null;
        flowStep = 0;
        customerData = {};
        initChat();
    });

    // --- Init ---
    function initChat() {
        const greeting = getGreeting();
        const timeCtx = getTimeContext();

        setTimeout(() => {
            botReply(`${greeting} Somos da Ponto Certo Informática! Como posso te ajudar hoje?${timeCtx}`, null, 600);
            setTimeout(() => showMainMenu(), 1800);
        }, 500);
    }

    // --- Info Card Animations ---
    function animateCards() {
        const cards = document.querySelectorAll('.info-card');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry, i) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }, i * 100);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        cards.forEach(card => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            observer.observe(card);
        });
    }

    // --- Boot ---
    document.addEventListener('DOMContentLoaded', () => {
        animateCards();
        initChat();
    });

})();
