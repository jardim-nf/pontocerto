const { schedule } = require('@netlify/functions');
const { getStore } = require('@netlify/blobs');

// ENVIAR MENSAGEM VIA UAZAPI
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

// Handler Agendado - TESTE: Roda a cada 1 minuto
exports.handler = schedule("* * * * *", async (event) => {
    console.log("🚀 INICIANDO JOB DE PÓS-VENDA (CSAT)...");
    
    try {
        const posVendaStore = getStore({ name: 'pos_venda', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_API_TOKEN });
        const listResult = await posVendaStore.list();
        
        let disparos = 0;
        
        for (const blob of listResult.blobs) {
            const agendamento = await posVendaStore.getJSON(blob.key);
            
            // Verifica se as 48 horas já se passaram
            if (Date.now() >= agendamento.dataDisparo) {
                console.log(`⏳ Disparando Pós-venda para ${agendamento.telefone}...`);
                
                const pushName = agendamento.pushName || 'cliente';
                const mensagemCSAT = `Oi! Aqui é a equipe da *Ponto Certo Informática*, tudo bom? 🚀\n\nPassando pra saber como ficou o seu aparelho que consertamos dia desses? Está tudo 100%?\n\nSe você gostou do nosso trabalho, te convidamos a avaliar nossa loja gratuitamente pelo Google acessando o link abaixo:\n📍 [LINK DO GOOGLE AQUI]\n\nSe precisar de algo ou tiver qualquer dúvida, é só dar um grito! Abaixo de Deus, estamos às ordens! 🙏`;
                
                // Dispara a mensagem
                await sendWhatsAppMessage(agendamento.telefone, mensagemCSAT);
                
                // Remove o registro para não disparar novamente
                await posVendaStore.delete(blob.key);
                
                disparos++;
                console.log(`✅ Pós-venda enviado com sucesso para ${agendamento.telefone}!`);
            } else {
                 const horasRestantes = Math.round((agendamento.dataDisparo - Date.now()) / (1000 * 60 * 60));
                 console.log(`⏭️ Aguardando mais ${horasRestantes}h para disparar pesquisa de ${agendamento.telefone}.`);
            }
        }
        
        console.log(`🏁 JOB CONCLUÍDO. Total de mensagens enviadas hoje: ${disparos}`);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Job concluido. Disparos: ${disparos}` }),
        };
        
    } catch (e) {
        console.error("❌ ERRO NO JOB DE PÓS-VENDA:", e.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: e.message }),
        };
    }
});
