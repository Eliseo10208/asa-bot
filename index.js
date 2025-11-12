import axios from "axios";
import dotenv from "dotenv";
import { WebhookClient, EmbedBuilder } from "discord.js";

// Cargar variables de entorno
dotenv.config();

// --- CONFIGURACIÓN ---
const WEBHOOK_URL =
  process.env.WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1438062954699427930/836qiy4IxRf5_e9i0FWHGK9ItcPS7Y4OrO_QdeV7YZbiiUDWJr9fE6JtVTs0r3e83m6S";

const WEBHOOK_URL_2 =
  process.env.WEBHOOK_URL_2 ||
  "https://discord.com/api/webhooks/1428545300733366362/98SBvA_WS5MJcDS0YuBPw1MG4jj5e0NPdylOYnwm0AdVoUFEOH6kUGVeTG0SZLdulv57";

const SERVER_IP = process.env.SERVER_IP || "94.242.215.228";
const SERVER_PORT = parseInt(process.env.SERVER_PORT || "7779", 10);
const SERVER_ID = process.env.SERVER_ID || null;

// URL de la API
const API_URL_BY_IP = `https://api.battlemetrics.com/servers?filter[game]=arksa&filter[search]=${SERVER_IP}`;
const API_URL_BY_ID = SERVER_ID ? `https://api.battlemetrics.com/servers/${SERVER_ID}` : null;

// INTERVALOS (Tiempo de espera antes de llamar a la API)
const API_CHECK_INTERVAL_SECONDS = 30; // cada 10 segundos
const MESSAGE_UPDATE_INTERVAL_SECONDS = 1; // Actualizar Discord cada 10 segundos para no saturar

// --- ESTADO GLOBAL ---
const webhook = new WebhookClient({ url: WEBHOOK_URL });
const webhook2 = new WebhookClient({ url: WEBHOOK_URL_2 });

let lastAlert20 = false;
let lastAlert25 = false;
let monitorMessageId = null; 
let lastServerData = null; // Últimos datos del servidor obtenidos (caché)

// 🆕 Nueva variable para la cuenta regresiva y su tiempo de inicio
let countdown = API_CHECK_INTERVAL_SECONDS;
let lastApiCheckTimestamp = 0;

// --- FUNCIONES AUXILIARES (sin cambios significativos) ---

function getStatusEmoji(status) {
  const statusEmojis = {
    online: "🟢",
    offline: "🔴",
    starting: "🟡",
    stopping: "🟠",
  };
  return statusEmojis[status?.toLowerCase()] || "❓";
}

function getStatusColor(status) {
  const colors = {
    online: 0x00ff00,
    offline: 0xff0000,
    starting: 0xffff00,
    stopping: 0xff8800,
  };
  return colors[status?.toLowerCase()] || 0x808080;
}

function formatUptime(uptimeSeconds) {
  if (!uptimeSeconds) return "Desconocido";
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTimeAgo(seconds) {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s ago`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${Math.floor(seconds % 60)}s ago`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m ago`;
  }
}

function formatCountdown(seconds) {
  seconds = Math.max(0, seconds); // Asegura que no sea negativo
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

function formatPlaytime(seconds) {
  if (!seconds || seconds === 0) return "0H:00M";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}H:${minutes.toString().padStart(2, '0')}M`;
}

// --- FUNCIÓN PRINCIPAL DE VERIFICACIÓN (Petición a la API) ---
async function checkServer() {
  // Reinicia el contador AHORA que va a hacer la llamada a la API
  countdown = API_CHECK_INTERVAL_SECONDS;
  lastApiCheckTimestamp = Date.now();
  console.log(`\n⏳ Contadores a cero. HACIENDO PETICIÓN A BATTLEMETRICS...`);

  try {
    let serverData = null;
    let servers = [];
    
    // Búsqueda por ID o IP
    if (SERVER_ID && API_URL_BY_ID) {
      // (Lógica de búsqueda por ID/IP como en tu código original)
      try {
        const { data } = await axios.get(API_URL_BY_ID);
        serverData = data.data;
      } catch (error) { /* Ignorar y buscar por IP */ }
    }
    
    if (!serverData) {
      const { data } = await axios.get(API_URL_BY_IP);
      servers = data.data || [];
      
      for (const server of servers) {
        const attrs = server.attributes;
        const portMatch = attrs.port === SERVER_PORT || parseInt(attrs.port) === SERVER_PORT;
        const ipMatch = attrs.ip === SERVER_IP;
        
        if (ipMatch && portMatch) {
          serverData = server;
          break;
        }
      }
    }
    
    // --- PROCESAMIENTO DE DATOS ---
    if (serverData) {
      const s = serverData;
      const attrs = s.attributes;
      
      const name = attrs.name || "Unknown Server";
      const players = attrs.players || 0;
      const maxPlayers = attrs.maxPlayers || 0;
      const status = attrs.status || "unknown";
      const map = attrs.details?.map || "Unknown";
      const playerList = attrs.playerList || [];

      const playerCount = playerList.length || players;
      const playerPercentage = maxPlayers > 0 ? (playerCount / maxPlayers) * 100 : 0;

      // Obtener info adicional (simulado, ya que BattleMetrics no da toda esta info directamente en el objeto principal)
      const now = Date.now();
      const lastUpdateAll = attrs.updatedAt ? formatTimeAgo((now - new Date(attrs.updatedAt).getTime()) / 1000) : "Unknown";
      const lastUpdateSteam = attrs.updatedAt ? formatTimeAgo((now - new Date(attrs.updatedAt).getTime()) / 1000) : "Unknown";

      // Valores por defecto/simulados que no están en la respuesta estándar
      const pvpOfficialOnline = "N/A"; 
      const pveOfficialOnline = "N/A"; 
      const gameDay = attrs.details?.day || "Unknown";
      const gameTime = attrs.details?.time || "Unknown";

      // Guardar datos del servidor para usar en las actualizaciones del timer
      lastServerData = {
        name,
        status,
        playerCount,
        maxPlayers,
        lastUpdateAll,
        lastUpdateSteam,
        pvpOfficialOnline,
        pveOfficialOnline,
        gameDay,
        gameTime,
        playerList,
        serverId: s.id
      };
      
      // Manejo de alertas (igual que tu código original)
      if (playerCount >= 25 && !lastAlert25) {
        const alert = new EmbedBuilder()
          .setTitle("🚨 ALERT PROBABLY ENEMY IS HERE! 🚨").setDescription(`**${name}** está casi lleno con **${playerCount}/${maxPlayers} jugadores**!`)
          .setColor(0xff0000).setTimestamp().setFooter({ text: "🦖 ARK Server Monitor • Alerta de Población" });
        await webhook.send({ content: "@here", embeds: [alert] });
        lastAlert25 = true; lastAlert20 = true;
      } else if (playerCount >= 20 && !lastAlert20) {
        const alert = new EmbedBuilder()
          .setTitle("⚠️ ALERTA - SERVIDOR LLENANDOSE EXOOO IS HERE !!!!").setDescription(`**${name}** tiene muchos jugadores: **${playerCount}/${maxPlayers}**`)
          .setColor(0xff8800).setTimestamp().setFooter({ text: "🦖 ARK Server Monitor • Alerta de Población" });
        await webhook2.send({ content: "@here", embeds: [alert] });
        lastAlert20 = true;
      }
      if (playerCount < 20) {
        lastAlert20 = false; lastAlert25 = false;
      }

      console.log(`✅ Datos del servidor actualizados: ${name}. Jugadores: ${playerCount}`);
      return true; // Éxito en la verificación
    }
    
    // Si no se encuentra el servidor
    console.log(`❌ Servidor no encontrado. Buscado: ${SERVER_IP}:${SERVER_PORT}`);
    return false;

  } catch (e) {
    console.error("❌ Error al consultar el servidor:", e.message);
    return false;
  }
}

// --- FUNCIÓN PARA CREAR/ACTUALIZAR EL MENSAJE DEL MONITOR ---
async function updateMonitorMessage() {
  // Si no hay datos, mostrar mensaje de "Cargando..."
  if (!lastServerData) {
    const initialEmbed = new EmbedBuilder()
      .setTitle("⏳ Monitor ARK - Cargando Datos...")
      .setDescription("Esperando la primera respuesta de la API.")
      .setColor(0xcccc00)
      .setTimestamp();
    
    try {
      if (monitorMessageId) {
        // Editar el mensaje existente
        await webhook.editMessage(monitorMessageId, { embeds: [initialEmbed] });
      } else {
        // Crear un nuevo mensaje solo si no existe
        const message = await webhook.send({ embeds: [initialEmbed] });
        monitorMessageId = message.id;
        console.log(`📝 ÚNICO mensaje creado (ID: ${monitorMessageId})`);
      }
    } catch (error) {
      if (error.code === 10008) {
        const message = await webhook.send({ embeds: [initialEmbed] });
        monitorMessageId = message.id;
      }
    }
    return; // Salir aquí si no hay datos
  }
  
  const data = lastServerData;
  const now = Date.now();
  
  // Calcular el tiempo transcurrido desde la última ACTUALIZACIÓN DE DATOS del servidor
  const secondsSinceUpdate = (now - lastApiCheckTimestamp) / 1000;
  const timeAgoText = formatTimeAgo(secondsSinceUpdate);
  
  // Calcular el tiempo restante para la próxima LLAMADA A LA API (la cuenta regresiva)
  const nextUpdateIn = countdown;
  const uploadTimer = formatCountdown(nextUpdateIn);

  // ************************************************
  // IMPLEMENTACIÓN DE LA FECHA Y HORA ACTUAL
  // ************************************************
  const currentDate = new Date(now).toLocaleString("en-US", { 
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  
  // Construir el contenido del mensaje
  let messageContent = `**Last Message Update:** ${timeAgoText}\n${currentDate}\n\n**${data.name}**\n\n`;

  const playersNotFound = data.maxPlayers - data.playerCount;
  messageContent += `🌐**Found Players:** ${data.playerCount}/${data.maxPlayers}${playersNotFound > 0 ? `  ${playersNotFound} Players not found` : ""}\n`;

  messageContent += `📶**Last Update All:** ${data.lastUpdateAll}\n`;
  messageContent += `📶**Last Update Steam:** ${data.lastUpdateSteam}\n\n`;

  messageContent += `**PVP Official Online:** ${data.pvpOfficialOnline} | **PVE Official Online:** ${data.pveOfficialOnline}\n`;
  messageContent += `**Day:** ${data.gameDay}, **Time:** ${data.gameTime}\n`;
  messageContent += `**Upload Timer:** ${uploadTimer} (API Check)\n\n`; // Usamos el COUNTDOWN aquí

  // ************************************************
  // IMPLEMENTACIÓN DE LA TABLA DE JUGADORES
  // ************************************************
  if (data.playerList && data.playerList.length > 0) {
    messageContent += "```markdown\n";
    messageContent += "| NAME                         | PLATFORM | PLAYTIME |\n";
    messageContent += "| ---------------------------- | -------- | -------- |\n";

    const steamPlayers = data.playerList.filter(p => !p.platform || p.platform.toLowerCase() === "steam" || !p.platform);
    const otherPlayers = data.playerList.filter(p => p.platform && p.platform.toLowerCase() !== "steam");

    const generateRow = (player, platformName) => {
      const name = (player.name || "Unknown").padEnd(28).substring(0, 28);
      const platform = platformName.padEnd(8);
      const playtime = formatPlaytime(player.sessionPlaytime || 0);
      return `| ${name} | ${platform} | ${playtime} |\n`;
    };

    otherPlayers.forEach((player) => { messageContent += generateRow(player, player.platform || "Unknown"); });

    if (steamPlayers.length > 0 && otherPlayers.length > 0) { messageContent += "| ---------------------------- | -------- | -------- |\n"; }

    steamPlayers.forEach((player) => { messageContent += generateRow(player, "STEAM"); });

    messageContent += "```";
  } else {
    messageContent += "**Server Empty**"; 
  }

  const embed = new EmbedBuilder()
    .setTitle(`${getStatusEmoji(data.status)} ${data.name}`)
    .setDescription(messageContent)
    .setColor(getStatusColor(data.status))
    .setTimestamp()
    .setFooter({ text: "🦖 ARK Server Monitor • Actualizado" });

  try {
    if (monitorMessageId) {
      await webhook.editMessage(monitorMessageId, { embeds: [embed] });
    } else {
      const message = await webhook.send({ embeds: [embed] });
      monitorMessageId = message.id;
      console.log(`📝 Nuevo mensaje de monitor creado (ID: ${monitorMessageId})`);
    }
  } catch (error) {
    // Manejo de errores de ID no válido (mensaje borrado)
    if (error.code === 10008) {
      console.log(`⚠️ Mensaje de monitor no encontrado, creando uno nuevo...`);
      const message = await webhook.send({ embeds: [embed] });
      monitorMessageId = message.id;
    } else {
      console.error("❌ Error al actualizar mensaje de monitor:", error.message);
    }
  }
}

// --- LÓGICA DEL BUCLE PRINCIPAL (El corazón de la cuenta regresiva) ---
async function mainLoop() {
  // 1. Verificar si es tiempo de llamar a la API
  if (countdown <= 0) {
    await checkServer(); // Llama a la API y reinicia 'countdown'
  }

  // 2. Actualizar el mensaje de Discord (solo si el contador es múltiplo de 10)
  // Esto mantiene el contador en Discord actualizado cada 10s, no cada 1s
  if (countdown % MESSAGE_UPDATE_INTERVAL_SECONDS === 0 || countdown === API_CHECK_INTERVAL_SECONDS) {
    await updateMonitorMessage();
    console.log(`[Timer Tick] Próxima API en: ${formatCountdown(countdown)}`);
  }
  
  // 3. Decrementar la cuenta regresiva
  countdown--;

  // Esto es para la ejecución inicial y si la API falló y no reinició el contador
  if (countdown < 0) {
      countdown = API_CHECK_INTERVAL_SECONDS - 1;
  }
}

// --- INICIO ---
console.log("🦖 Iniciando monitor de servidor ARK...");
console.log(`📡 Monitoreando: ${SERVER_IP}:${SERVER_PORT}`);
console.log(`⏰ Intervalo de actualización del servidor (API): ${API_CHECK_INTERVAL_SECONDS} segundos`);
console.log(`⏱️ Intervalo de actualización del timer (Discord): ${MESSAGE_UPDATE_INTERVAL_SECONDS} segundos`);
console.log("📊 Monitor: Cuenta Regresiva Sincronizada");
console.log("🔄 Presiona Ctrl+C para detener\n");

// Ejecutar la primera verificación de datos inmediatamente y crear el mensaje inicial
(async () => {
  // Crear mensaje inicial de "Cargando..."
  await updateMonitorMessage();
  // Luego hacer la primera verificación
  await checkServer();
  // Actualizar el mensaje con los datos obtenidos
  await updateMonitorMessage();
})();

// Ejecutar el bucle principal cada 1 segundo
setInterval(mainLoop, 1000);